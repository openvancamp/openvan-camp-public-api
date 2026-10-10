import { readFileSync } from "node:fs";

export const VERSION = "0.8.0";

export const BASE_URL = process.env.OPENVAN_API_URL ?? "https://openvan.camp";

/**
 * Telemetry — логирование вызовов инструментов в openvan.camp (mcp_tool_calls).
 * Токен берётся из env OPENVAN_LOG_TOKEN или из файла mcp-server/telemetry.token
 * (gitignored). Без токена логирование тихо отключается (no-op). URL по умолчанию
 * выводится из BASE_URL, переопределяется через OPENVAN_LOG_URL.
 */
function resolveLogToken(): string {
  if (process.env.OPENVAN_LOG_TOKEN) {
    return process.env.OPENVAN_LOG_TOKEN.trim();
  }
  // dist/config.js → ../telemetry.token = mcp-server/telemetry.token.
  try {
    return readFileSync(new URL("../telemetry.token", import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}

export const LOG_TOKEN = resolveLogToken();

export const LOG_URL =
  process.env.OPENVAN_LOG_URL ?? `${BASE_URL}/api/internal/mcp-log`;

// Attribution source sent on every request. Propagates to api_request_logs
// so OpenVan.camp can track MCP adoption separately from web/bot traffic.
export const SOURCE_TAG = process.env.OPENVAN_SOURCE ?? "mcp-server";

export const USER_AGENT = `openvan-mcp/${VERSION} (+https://openvan.camp/ai)`;

export const ATTRIBUTION_FOOTER = "\n\n_Data: OpenVan.camp (CC BY 4.0). https://openvan.camp_";
