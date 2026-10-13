import { LOG_TOKEN, LOG_URL } from "./config.js";

export interface ToolCallEvent {
  tool: string;
  arguments?: unknown;
  client_ua?: string;
  ip?: string;
  ok?: boolean;
  /** ok — данные, nodata — «нет данных», error — инструмент вернул isError, exception — ошибка JSON-RPC/сервера. */
  outcome?: "ok" | "nodata" | "error" | "exception";
  /** Текст ошибки или «нет данных» — чтобы в админке было видно, почему. */
  error?: string;
  duration_ms?: number;
}

/**
 * Fire-and-forget логирование вызова инструмента в openvan.camp.
 *
 * Никогда не блокирует и не бросает в путь MCP-ответа: ошибки сети/таймауты
 * глотаются. Если токен не сконфигурирован — no-op (например, на stdio-клиентах
 * у пользователей, где telemetry.token отсутствует).
 */
export function logToolCall(event: ToolCallEvent): void {
  if (!LOG_TOKEN || !LOG_URL) {
    return;
  }

  void fetch(LOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOG_TOKEN}`,
      "User-Agent": "openvan-mcp-telemetry",
    },
    body: JSON.stringify({
      tool: event.tool,
      arguments: event.arguments ?? null,
      client_ua: event.client_ua ?? null,
      ip: event.ip ?? null,
      ok: event.ok ?? true,
      outcome: event.outcome ?? null,
      error: event.error ? event.error.slice(0, 2000) : null,
      duration_ms:
        typeof event.duration_ms === "number"
          ? Math.min(Math.max(0, Math.round(event.duration_ms)), 65535)
          : null,
    }),
  })
    .then((r) => {
      if (!r.ok) process.stderr.write(`[openvan-mcp] telemetry rejected (HTTP ${r.status}) for ${event.tool}\n`);
    })
    .catch((e) => {
      // Ответ клиенту не трогаем, но потерю записи журнала видно в логе сервиса.
      process.stderr.write(`[openvan-mcp] telemetry lost for ${event.tool}: ${e instanceof Error ? e.message : String(e)}\n`);
    });
}

/**
 * Достаёт вызовы инструментов из тела JSON-RPC запроса (одиночного или batch).
 */
export function extractToolCalls(
  body: unknown
): Array<{ tool: string; args: unknown; id: unknown }> {
  const messages = Array.isArray(body) ? body : [body];
  const calls: Array<{ tool: string; args: unknown; id: unknown }> = [];

  for (const message of messages) {
    if (
      message &&
      typeof message === "object" &&
      (message as { method?: unknown }).method === "tools/call"
    ) {
      const params = (message as { params?: { name?: unknown; arguments?: unknown } })
        .params;
      if (params && typeof params.name === "string") {
        calls.push({ tool: params.name, args: params.arguments, id: (message as { id?: unknown }).id });
      }
    }
  }

  return calls;
}

type Outcome = { outcome: NonNullable<ToolCallEvent["outcome"]>; error?: string };

/**
 * Результат каждого tools/call из тела ответа (JSON или SSE), по id запроса.
 * Так видны и ошибки, которые SDK отдаёт сам, не вызывая инструмент: неверные аргументы,
 * неизвестный инструмент, сбой сервера.
 */
export function outcomesFromResponse(body: string): Map<string, Outcome> {
  const out = new Map<string, Outcome>();
  const chunks = body.trim().startsWith("{") || body.trim().startsWith("[")
    ? [body]
    : body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5));
  for (const chunk of chunks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(chunk);
    } catch {
      continue;
    }
    for (const m of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!m || typeof m !== "object" || !("id" in m)) continue;
      const msg = m as { id: unknown; error?: { message?: string }; result?: { isError?: boolean; content?: Array<{ type: string; text?: string }>; structuredContent?: { nodata?: boolean; message?: string } } };
      const text = msg.result?.content?.find((c) => c.type === "text")?.text;
      out.set(
        String(msg.id),
        msg.error ? { outcome: "exception", error: msg.error.message ?? "JSON-RPC error" }
        : msg.result?.isError ? { outcome: "error", error: text ?? "isError" }
        : msg.result?.structuredContent?.nodata ? { outcome: "nodata", error: msg.result.structuredContent.message ?? text }
        : { outcome: "ok" }
      );
    }
  }
  return out;
}


/**
 * Сбои служебных JSON-RPC запросов (не tools/call): resources/read, tools/list, initialize…
 * Для журнала: имя «[метод]», аргумент — что запрашивали (адрес карточки), причина.
 */
export function rpcFailures(
  requestBody: unknown,
  responseBody: string,
  status: number
): Array<{ tool: string; args: unknown; error: string }> {
  const requests = (Array.isArray(requestBody) ? requestBody : [requestBody]).filter(
    (m): m is { method: string; id?: unknown; params?: Record<string, unknown> } =>
      !!m && typeof m === "object" && typeof (m as { method?: unknown }).method === "string"
  );
  let parsed: unknown = null;
  try {
    parsed = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    parsed = null;
  }
  const errors = new Map<string, string>();
  for (const msg of Array.isArray(parsed) ? parsed : parsed ? [parsed] : []) {
    const m = msg as { id?: unknown; error?: { message?: string } };
    if (m && m.error) errors.set(String(m.id), m.error.message ?? "JSON-RPC error");
  }
  const out: Array<{ tool: string; args: unknown; error: string }> = [];
  for (const r of requests) {
    if (r.method.startsWith("notifications/")) continue;
    const err = errors.get(String(r.id)) ?? (status >= 400 ? `HTTP ${status}` : null);
    if (!err) continue;
    const p = r.params ?? {};
    out.push({ tool: `[${r.method}]`.slice(0, 64), args: p.uri ? { uri: p.uri } : p.name ? { name: p.name } : null, error: err });
  }
  if (out.length === 0 && status >= 400) out.push({ tool: "[http]", args: null, error: `HTTP ${status}` });
  return out;
}
