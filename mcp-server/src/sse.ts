#!/usr/bin/env node
/**
 * OpenVan MCP Server — Streamable HTTP entry point.
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
import { createServer, LEGACY_TOOL_NAMES } from "./server.js";
import { extractToolCalls, logToolCall } from "./telemetry.js";

const HOST = process.env.OPENVAN_MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.OPENVAN_MCP_PORT ?? 4800);

/** Старое имя инструмента в tools/call → новое (см. LEGACY_TOOL_NAMES). Телеметрия видит исходное. */
function renameLegacyToolCalls(body: unknown): void {
  for (const message of Array.isArray(body) ? body : [body]) {
    const params = (message as { method?: unknown; params?: { name?: unknown } } | null)?.params;
    if ((message as { method?: unknown })?.method === "tools/call" && params && typeof params.name === "string") {
      params.name = LEGACY_TOOL_NAMES[params.name] ?? params.name;
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
        `OpenVan MCP Server ${VERSION}`,
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
    const server = createServer();
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

    const recordToolCalls = (ok: boolean): void => {
      if (toolCalls.length === 0) {
        return;
      }
      const durationMs = Date.now() - startedAt;
      for (const call of toolCalls) {
        logToolCall({
          tool: call.tool,
          arguments: call.args,
          client_ua: clientUa,
          ip: clientIp,
          ok,
          duration_ms: durationMs,
        });
      }
    };

    // Clean up server/transport when the client disconnects.
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      recordToolCalls(res.statusCode < 400);
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
