#!/usr/bin/env node
/**
 * OpenVan.camp MCP Server — Streamable HTTP entry point.
 *
 * Hosts the same createServer() over Express + StreamableHTTPServerTransport
 * at POST/GET/DELETE /mcp. Runs stateless (session-less) so each request
 * is an independent JSON-RPC exchange — simplest mode for public hosting
 * behind a reverse proxy.
 *
 * Intended for:
 *   - ChatGPT Apps SDK (chatgpt.com/apps)
 *   - Remote MCP hosts (web-based, serverless)
 *   - Anyone on the internet who wants to call our tools without installing npx
 *
 * Public URL: https://mcp.openvan.camp/mcp
 * Binds to 127.0.0.1:<PORT> by default; nginx terminates TLS and proxies.
 */
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { VERSION } from "./config.js";
import { createServer, hostFromUserAgent, LEGACY_TOOL_NAMES } from "./server.js";
import { extractToolCalls, logToolCall, outcomesFromResponse, rpcFailures } from "./telemetry.js";
import { normalizeToolCallBody } from "./normalize.js";

const HOST = process.env.OPENVAN_MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.OPENVAN_MCP_PORT ?? 4800);

/** Старое имя инструмента в tools/call → новое (см. LEGACY_TOOL_NAMES). Телеметрия видит исходное. */
function renameLegacyToolCalls(body: unknown): void {
  for (const message of Array.isArray(body) ? body : [body]) {
    const params = (message as { method?: unknown; params?: { name?: unknown } } | null)?.params;
    if ((message as { method?: unknown })?.method === "tools/call" && params && typeof params.name === "string") {
      params.name = LEGACY_TOOL_NAMES[params.name] ?? params.name;
      // null у необязательного аргумента = «не задан»: так шлют многие клиенты (строгий режим
      // OpenAI, Python-обёртки), а схема его отвергала («expected 'en' | 'ru'…, received null»).
      const args = (params as { arguments?: unknown }).arguments;
      if (args && typeof args === "object" && !Array.isArray(args)) {
        for (const [k, v] of Object.entries(args)) if (v === null) delete (args as Record<string, unknown>)[k];
      }
    }
  }
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.disable("x-powered-by");

  // Healthcheck — used by nginx /healthz and uptime monitors.
  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok", version: VERSION, name: "openvan-mcp" });
  });

  // Human-readable root — anyone who opens mcp.openvan.camp in a browser.
  app.get("/", (_req, res) => {
    res.type("text/plain").send(
      [
        `OpenVan.camp MCP Server ${VERSION}`,
        "",
        "Endpoint (Streamable HTTP):",
        "  POST https://mcp.openvan.camp/mcp",
        "  GET  https://mcp.openvan.camp/mcp   (SSE stream)",
        "",
        "Local install (stdio):",
        "  npx -y @openvancamp/mcp-server",
        "",
        "Docs: https://openvan.camp/ai",
        "Data: CC BY 4.0 — attribute OpenVan.camp",
        "",
      ].join("\n")
    );
  });

  // Main MCP transport. Stateless: each request gets a fresh transport +
  // server instance. Fine for read-only tools with no per-session state.
  const handleMcp = async (req: express.Request, res: express.Response) => {
    const server = createServer(hostFromUserAgent(req.headers["user-agent"]));
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode — no session tracking.
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Telemetry — какие инструменты вызвал клиент (имя + аргументы), кто он
    // (User-Agent) и откуда (IP). Снимаем ДО handleRequest, логируем ПОСЛЕ.
    const toolCalls = extractToolCalls(req.body);
    const clientUa = req.headers["user-agent"];
    const forwardedFor = req.headers["x-forwarded-for"];
    const clientIp =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
        ?.split(",")[0]
        ?.trim() || req.socket.remoteAddress || undefined;
    const startedAt = Date.now();
    renameLegacyToolCalls(req.body);
    normalizeToolCallBody(req.body);
    // Спецификация требует от клиента Accept с обоими типами, иначе SDK отвечает 406. Простые
    // клиенты шлют только application/json (журнал 13.10.2026: get_fuel_prices → HTTP 406).
    // Ответ у нас всё равно JSON (enableJsonResponse), так что заголовок дополняем.
    if (req.method === "POST") {
      const accept = String(req.headers.accept ?? "");
      if (!accept.includes("text/event-stream") || !accept.includes("application/json")) {
        const value = "application/json, text/event-stream";
        req.headers.accept = value;
        // SDK строит Web Request через @hono/node-server — тот читает rawHeaders, а не req.headers.
        const raw = req.rawHeaders;
        const i = raw.findIndex((h, k) => k % 2 === 0 && h.toLowerCase() === "accept");
        if (i >= 0) raw[i + 1] = value;
        else raw.push("Accept", value);
      }
    }

    // Копия тела ответа — по ней телеметрия узнаёт результат вызова (данные, «нет данных», ошибка и почему).
    const responseBody: string[] = [];
    if (req.method === "POST") {
      const capture = (chunk: unknown, encoding?: unknown) => {
        if (chunk == null || typeof chunk === "function") return;
        responseBody.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString(typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8"));
      };
      const write = res.write.bind(res) as (...a: unknown[]) => boolean;
      const end = res.end.bind(res) as (...a: unknown[]) => express.Response;
      (res as unknown as { write: (...a: unknown[]) => boolean }).write = (...a: unknown[]) => { capture(a[0], a[1]); return write(...a); };
      (res as unknown as { end: (...a: unknown[]) => express.Response }).end = (...a: unknown[]) => { capture(a[0], a[1]); return end(...a); };
    }

    let recorded = false;
    const recordToolCalls = (ok: boolean, aborted = false): void => {
      if (recorded) {
        return;
      }
      recorded = true;
      const durationMs = Date.now() - startedAt;
      const body = responseBody.join("");
      if (toolCalls.length === 0) {
        // Служебные запросы (resources/read — HTML карточки, tools/list, initialize) раньше не
        // логировались вовсе: их сбой — пустая карточка у человека, а в журнале тишина.
        for (const f of rpcFailures(req.body, body, res.statusCode)) {
          logToolCall({ tool: f.tool, arguments: f.args, client_ua: clientUa, ip: clientIp, ok: false,
            outcome: "exception", error: f.error, duration_ms: durationMs });
        }
        return;
      }
      const outcomes = outcomesFromResponse(body);
      for (const call of toolCalls) {
        const o = aborted
          ? { outcome: "exception" as const, error: `Client disconnected before the answer (${durationMs} ms)` }
          : outcomes.get(String(call.id)) ?? (ok ? undefined : { outcome: "exception" as const, error: `HTTP ${res.statusCode}` });
        logToolCall({
          tool: call.tool,
          arguments: call.args,
          client_ua: clientUa,
          ip: clientIp,
          ok,
          outcome: o?.outcome,
          error: o?.error,
          duration_ms: durationMs,
        });
      }
    };

    // Clean up server/transport when the client disconnects.
    res.on("close", () => {
      // Клиент ушёл, не дождавшись ответа (долгий plan_road_trip, таймаут хоста): раньше такой
      // вызов не попадал в журнал совсем — запись делалась только по «finish».
      if (!res.writableFinished) recordToolCalls(false, true);
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      // Пишем, когда ответ ушёл целиком: тогда в копии тела есть результат вызова.
      res.on("finish", () => recordToolCalls(res.statusCode < 400));
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      recordToolCalls(false);
      process.stderr.write(
        `[openvan-mcp-sse] handler error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  app.post("/mcp", handleMcp);
  app.get("/mcp", handleMcp);
  app.delete("/mcp", handleMcp);

  // Generate a startup nonce so systemd logs show a restart cleanly.
  const nonce = randomUUID().slice(0, 8);

  app.listen(PORT, HOST, () => {
    process.stdout.write(
      `openvan-mcp-sse/${VERSION} listening on http://${HOST}:${PORT} (nonce=${nonce})\n`
    );
  });
}

main().catch((err) => {
  process.stderr.write(
    `[openvan-mcp-sse] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});
