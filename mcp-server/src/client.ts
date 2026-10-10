import { BASE_URL, SOURCE_TAG, USER_AGENT } from "./config.js";

export class OpenVanApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = "OpenVanApiError";
  }
}

/**
 * Thin fetch wrapper for OpenVan.camp public API.
 * - Always appends ?source=<SOURCE_TAG> for attribution tracking.
 * - Sets a descriptive User-Agent so server logs can segment MCP traffic.
 * - Returns parsed JSON or throws OpenVanApiError on non-2xx.
 */
export async function apiGet<T = unknown>(
  path: string,
  query: Record<string, string | number | undefined | null> = {}
): Promise<T> {
  const url = new URL(path, BASE_URL);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  if (!url.searchParams.has("source")) {
    url.searchParams.set("source", SOURCE_TAG);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    // Тело ошибки сохраняем: в нём понятное сообщение API («Place not found: …»), которое
    // тул может передать агенту вместо голого «HTTP 422».
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new OpenVanApiError(
      `HTTP ${response.status} from ${url.pathname}`,
      response.status,
      url.toString(),
      body
    );
  }

  return (await response.json()) as T;
}

/** POST с JSON-телом — для расчётов, которые API принимает только так (/api/route-cost). */
export async function apiPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = new URL(path, BASE_URL);
  url.searchParams.set("source", SOURCE_TAG);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let err: unknown = null;
    try {
      err = await response.json();
    } catch {
      err = null;
    }
    throw new OpenVanApiError(`HTTP ${response.status} from ${url.pathname}`, response.status, url.toString(), err);
  }

  return (await response.json()) as T;
}
