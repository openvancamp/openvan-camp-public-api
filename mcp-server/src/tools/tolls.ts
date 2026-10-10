import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * Toll roads — /api/tolls/*.
 *
 * Цифры отдаём как есть, вместе с датой проверки и источником: тариф без даты
 * агент подаст как вечный. Оценка маршрута — диапазон, и флаг partial обязан
 * дойти до человека, иначе неполная сумма выглядит полной.
 */

const VehicleClass = z
  .enum(["car", "van", "heavy"])
  .default("van")
  .describe("car; van = campervan/motorhome up to 3.5 t (default); heavy = over 3.5 t.");

/** Результат с данными для карточки. */
function withCard<T extends object>(card: Record<string, unknown>, result: T): T & { structuredContent: Record<string, unknown> } {
  return { ...result, structuredContent: card };
}

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

export const getTollRatesInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. FR."),
  locale: z.string().optional().describe("Language of names: en, ru, de, fr, es, pt, tr."),
};

export async function getTollRates({ country_code, locale }: { country_code: string; locale?: string }) {
  const cc = country_code.toUpperCase();
  try {
    const data = await apiGet<Record<string, unknown>>(`/api/tolls/countries/${cc}`, { locale });
    delete data._attribution;

    const card = { mode: "country", ...data, country_code: cc, url: `${SITE}/${locale ?? "en"}/roadbook`, locale: locale ?? null, source: "OpenVan.camp (CC BY 4.0)" };
    return withCard(card, text(
      `Toll roads in ${cc} (system_type: closed = ticket, open = pay on the road, free_flow = no barriers, vignette = pay for time, free = no tolls). ` +
        `Prices in local currency, *_eur at today's rate:\n\n${JSON.stringify(data, null, 2)}${ATTRIBUTION_FOOTER}`
    ));
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status === 404) {
      return text(`No toll data for ${cc} yet — do not assume the roads are free.`, true);
    }
    throw e;
  }
}

export const estimateRouteTollsInput = {
  waypoints: z
    .array(z.string().min(1).max(120))
    .min(2)
    .max(10)
    .describe('2-10 place names in travel order: cities or countries (a country means its capital), e.g. ["Rome", "Paris"].'),
  vehicle_class: VehicleClass,
  locale: z.string().optional().describe("Language of bridge/section names: en, ru, de, fr, es, pt, tr."),
};

type RouteTolls = {
  waypoints: string[];
  points?: Array<{ name: string; country_code: string | null }>;
  unchecked_countries?: string[];
  distance_km: number;
  vehicle_class: string;
  total_eur: number | null;
  range_eur: { min: number; max: number } | null;
  partial: boolean;
  unknown_countries: string[];
  items: Array<{ type: string; country: string; amount_local: number; currency: string; amount_eur: number | null; meta: Record<string, unknown> }>;
};

export async function estimateRouteTolls({
  waypoints,
  vehicle_class = "van",
  locale,
}: {
  waypoints: string[];
  vehicle_class?: "car" | "van" | "heavy";
  locale?: string;
}) {
  let data: RouteTolls;
  try {
    data = await apiGet<RouteTolls>("/api/tolls/route", { waypoints: waypoints.join("|"), vehicle_class, locale });
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status !== 429) {
      const body = (e.body ?? {}) as { message?: string; error?: string; points?: Array<{ name: string; country_code?: string | null }> };
      const where = body.points?.length
        ? ` Places were resolved as: ${body.points.map((p) => `${p.name} (${p.country_code ?? "?"})`).join(", ")} — add a country to a name if one landed in the wrong place.`
        : "";
      const fallback = e.status >= 500 ? "Routing is temporarily unavailable, retry in a minute." : "The route could not be built.";
      return text(`${body.message ?? fallback}${where}`, true);
    }
    throw e;
  }

  // Плата за километры приходит кусками по участкам маршрута — агенту нужна одна строка
  // на страну. Мосты, тоннели и виньетки остаются поштучно: у них есть имя и срок.
  const grouped = new Map<string, { label: string; local: number; currency: string; eur: number | null }>();
  for (const i of data.items) {
    const label = (i.meta?.name as string | undefined) ?? (i.type === "per_km" ? "motorways per km" : i.type);
    const key = i.type === "per_km" ? `${i.country}|per_km|${i.currency}` : `${i.country}|${label}|${grouped.size}`;
    const row = grouped.get(key) ?? { label, local: 0, currency: i.currency, eur: 0 };
    row.local += i.amount_local;
    row.eur = row.eur === null || i.amount_eur === null ? null : row.eur + i.amount_eur;
    grouped.set(key, row);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const lines = [...grouped.entries()].map(([key, r]) => {
    const eur = r.eur === null ? "" : ` (≈ €${round(r.eur)})`;
    return `- ${key.split("|")[0]} ${r.label}: ${round(r.local)} ${r.currency}${eur}`;
  });

  const range = data.range_eur ? `€${data.range_eur.min}–${data.range_eur.max}` : "n/a";
  const reasons: string[] = [];
  if (data.unknown_countries.length) reasons.push(`no toll data for ${data.unknown_countries.join(", ")}`);
  if (data.unchecked_countries?.length) reasons.push(`per-km tolls not measured on this route in ${data.unchecked_countries.join(", ")}`);
  const partial = data.partial
    ? `\n\nPARTIAL: not all tolls are included${reasons.length ? ` — ${reasons.join("; ")}` : ""}. Tell the user the real total may be higher.`
    : "";
  const resolved = data.points?.length
    ? data.points.map((p) => `${p.name} (${p.country_code ?? "?"})`).join(" → ")
    : data.waypoints.join(" → ");

  const card = {
    mode: "route",
    points: data.points?.length ? data.points.map((p) => ({ name: p.name, country_code: p.country_code })) : data.waypoints.map((w) => ({ name: w, country_code: null })),
    distance_km: data.distance_km,
    vehicle_class: data.vehicle_class,
    total_eur: data.total_eur,
    range_eur: data.range_eur,
    partial: data.partial,
    unknown_countries: data.unknown_countries,
    unchecked_countries: data.unchecked_countries ?? [],
    items: [...grouped.entries()].map(([key, r]) => ({
      country: key.split("|")[0],
      label: key.split("|")[1] === "per_km" ? "per_km" : r.label,
      amount_local: round(r.local),
      currency: r.currency,
      amount_eur: r.eur === null ? null : round(r.eur),
    })),
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp (CC BY 4.0)",
  };

  return withCard(card, text(
    `Tolls ${resolved} (${data.distance_km} km, vehicle_class=${data.vehicle_class}): about €${data.total_eur ?? 0}, range ${range}.\n` +
      (lines.length ? lines.join("\n") : "No toll sections, vignettes or toll bridges found on this route.") +
      partial +
      `\n\nEstimate, not a quote: in ticket systems the price depends on the exits used.${ATTRIBUTION_FOOTER}`
  ));
}
