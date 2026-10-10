import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * Опасности для поездки — /api/hazards/*: уровень угрозы МИД Великобритании, бедствия GDACS,
 * очаги пожаров NASA FIRMS. Всё — обстановка сейчас, не прогноз; так и подаём агенту.
 */

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

const EVENT_TYPES: Record<string, string> = {
  FL: "flood",
  EQ: "earthquake",
  TC: "tropical cyclone",
  WF: "wildfire",
  DR: "drought",
  VO: "volcano",
};

export const getTravelHazardsInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. TR."),
  locale: z.string().optional().describe("Language of the country name: en, ru, de, fr, es, pt, tr."),
};

type HazardsResponse = {
  country_code: string;
  name: string;
  advisory: { level: string; severity: number; url: string; updated_at: string; summary: string | null } | null;
  events: Array<{ type: string; alert_level: string; name: string; starts_at: string; ends_at: string | null; severity: string | null; url: string }>;
};

export async function getTravelHazards({ country_code, locale }: { country_code: string; locale?: string }) {
  const cc = country_code.toUpperCase();
  const data = await apiGet<HazardsResponse>(`/api/hazards/countries/${cc}`, { locale });

  const advisory = data.advisory
    ? `UK FCDO travel advice: ${data.advisory.level.replace(/_/g, " ")} (severity ${data.advisory.severity} of 4, updated ${data.advisory.updated_at}). ${data.advisory.url}`
    : "UK FCDO travel advice: no data for this country.";
  const events = data.events.map(
    (e) =>
      `- ${EVENT_TYPES[e.type] ?? e.type}, alert ${e.alert_level}: ${e.name} (${e.starts_at.slice(0, 10)}${e.ends_at ? ` – ${e.ends_at.slice(0, 10)}` : ""})${e.severity ? `, ${e.severity.trim()}` : ""} ${e.url}`
  );

  const card = {
    mode: "hazards",
    country_code: data.country_code,
    name: data.name,
    advisory: data.advisory,
    events: data.events.map((e) => ({ type: e.type, alert_level: e.alert_level, name: e.name, starts_at: e.starts_at, url: e.url })),
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp (CC BY 4.0): UK FCDO, GDACS",
  };
  return {
    ...text(
    `Travel hazards in ${data.name} (${data.country_code}) — situation now, not a forecast.\n${advisory}\n\n` +
      (events.length ? `Current GDACS disasters:\n${events.join("\n")}` : "No current GDACS disasters in this country.") +
      `\n\nThe advisory level is the UK government's view; other governments may differ — link the user to the source.${ATTRIBUTION_FOOTER}`
    ),
    structuredContent: card,
  };
}

export const getActiveFiresInput = {
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "west,south,east,north")
    .describe("Bounding box west,south,east,north in degrees, at most 10° on each side, e.g. 29,36,33,38 (around Antalya)."),
};

type FiresResponse = {
  bbox: number[];
  count: number;
  fires: Array<{ lat: number; lng: number; frp: number; seen_at: string; confidence: string }>;
};

export async function getActiveFires({ bbox }: { bbox: string }) {
  let data: FiresResponse;
  try {
    data = await apiGet<FiresResponse>("/api/hazards/fires", { bbox });
  } catch (e) {
    if (e instanceof OpenVanApiError && (e.status === 422 || e.status === 503)) {
      const body = (e.body ?? {}) as { error?: string };
      return text(body.error ?? (e.status === 503 ? "NASA FIRMS is not responding, try later." : "Invalid bbox."), true);
    }
    throw e;
  }

  // Тысячи точек агенту не нужны: самые мощные очаги + общая картина.
  const top = [...data.fires].sort((a, b) => b.frp - a.frp).slice(0, 25);
  const big = data.fires.filter((f) => f.frp >= 10).length;
  const lines = top.map((f) => `- ${f.lat.toFixed(4)},${f.lng.toFixed(4)} — ${f.frp} MW, seen ${f.seen_at}`);

  const [w, s, e, n] = data.bbox;
  const card = {
    mode: "fires",
    count: data.count,
    strong: big,
    top: top.slice(0, 8).map((f) => ({ lat: f.lat, lng: f.lng, frp: f.frp, seen_at: f.seen_at })),
    center: [Math.round(((w + e) / 2) * 1000) / 1000, Math.round(((s + n) / 2) * 1000) / 1000],
    source: "NASA FIRMS via OpenVan.camp (CC BY 4.0)",
  };
  return {
    ...text(
    `Active fires (NASA FIRMS VIIRS, last 48 h) in bbox ${data.bbox.join(",")}: ${data.count} detections, ${big} with power ≥ 10 MW.\n` +
      (lines.length ? `Strongest:\n${lines.join("\n")}` : "No fire detections in this box.") +
      `\n\nfrp = fire radiative power: single-digit MW is usually a small fire or a gas flare, tens and hundreds — a real wildfire. Satellite detections, not confirmed fires.${ATTRIBUTION_FOOTER}`
    ),
    structuredContent: card,
  };
}
