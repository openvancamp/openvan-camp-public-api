export const VERSION = "0.12.1";

export const BASE_URL = process.env.OPENVAN_API_URL ?? "https://openvan.camp";

/**
 * Telemetry — логирование вызовов инструментов в openvan.camp (mcp_tool_calls).
 * Включается только на боевом сервере OpenVan.camp: токен приходит в env
 * OPENVAN_LOG_TOKEN из systemd (EnvironmentFile). Пакет сам ничего не читает с диска;
 * без токена логирование тихо отключается (no-op). URL по умолчанию выводится из
 * BASE_URL, переопределяется через OPENVAN_LOG_URL.
 */
export const LOG_TOKEN = (process.env.OPENVAN_LOG_TOKEN ?? "").trim();

export const LOG_URL =
  process.env.OPENVAN_LOG_URL ?? `${BASE_URL}/api/internal/mcp-log`;

// Attribution source sent on every request. Propagates to api_request_logs
// so OpenVan.camp can track MCP adoption separately from web/bot traffic.
export const SOURCE_TAG = process.env.OPENVAN_SOURCE ?? "mcp-server";

export const USER_AGENT = `openvan-mcp/${VERSION} (+https://openvan.camp/ai)`;

export const ATTRIBUTION_FOOTER = "\n\n_Data: OpenVan.camp (CC BY 4.0). https://openvan.camp_";
