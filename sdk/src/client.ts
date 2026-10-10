import type { OpenVanClientOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://openvan.camp";
const SDK_VERSION = "1.2.0";

export class OpenVanError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = "OpenVanError";
  }
}

export class OpenVanClient {
  readonly baseUrl: string;
  private readonly source: string;
  private readonly _fetch: typeof fetch;

  constructor(options: OpenVanClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.source = options.source ?? "openvan-sdk";
    this._fetch = options.fetch ?? globalThis.fetch;
  }

  /** Build an absolute API URL with query parameters and the attribution tag. */
  url(
    path: string,
    query: Record<string, string | number | boolean | undefined | null> = {}
  ): string {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    url.searchParams.set("source", this.source);
    return url.toString();
  }

  async get<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined | null> = {}
  ): Promise<T> {
    return this.request<T>(this.url(path, query), { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.url(path), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this._fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        "User-Agent": `@openvancamp/sdk/${SDK_VERSION}`,
      },
    });

    if (!response.ok) {
      // The API explains most errors in the body ("Place not found: …"); keep that message.
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const apiMessage =
        body && typeof body === "object"
          ? ((body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error)
          : null;
      throw new OpenVanError(
        typeof apiMessage === "string" ? apiMessage : `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        url,
        body
      );
    }

    return response.json() as Promise<T>;
  }
}
