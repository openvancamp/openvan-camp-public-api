import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * Праздники, школьные каникулы и пиковые дни на дорогах — /api/holidays/*.
 *
 * Страна без данных отвечает 404 с covered=false: это «нет данных», а не «праздников нет» —
 * агент обязан сказать человеку именно так, иначе пустой ответ читается как свободные даты.
 */

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const getHolidaysInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. FR."),
  from: IsoDate.optional().describe("Start of the period, YYYY-MM-DD. Defaults to today."),
  to: IsoDate.optional().describe("End of the period, YYYY-MM-DD. Defaults to from + 90 days; at most 400 days after from."),
  kind: z
    .enum(["public", "school", "traffic"])
    .optional()
    .describe("Only one kind: public holidays, school holidays (often regional), or traffic = official peak traffic days (France, Bison Futé). Omit for all."),
  locale: z.string().optional().describe("Language of names: en, ru, de, fr, es, pt, tr."),
};

type HolidayItem = {
  kind: string;
  start: string;
  end: string;
  name: string;
  name_local: string | null;
  nationwide: boolean;
  regions: Array<{ code: string; name: string }>;
  details: Record<string, string> | null;
  source_url: string;
};

type HolidaysResponse = {
  country_code: string;
  name: string;
  from: string;
  to: string;
  covered: boolean;
  count: number;
  items: HolidayItem[];
};

export async function getHolidays({
  country_code,
  from,
  to,
  kind,
  locale,
}: {
  country_code: string;
  from?: string;
  to?: string;
  kind?: "public" | "school" | "traffic";
  locale?: string;
}) {
  const cc = country_code.toUpperCase();
  let data: HolidaysResponse;
  try {
    data = await apiGet<HolidaysResponse>(`/api/holidays/countries/${cc}`, { from, to, kind, locale });
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status === 404) {
      return text(`No holiday data for ${cc} — this means no data, not "no holidays". Do not tell the user the dates are free.`, true);
    }
    if (e instanceof OpenVanApiError && e.status === 422) {
      const body = (e.body ?? {}) as { error?: string; message?: string };
      return text(body.error ?? body.message ?? "Invalid period: use YYYY-MM-DD, to >= from, at most 400 days.", true);
    }
    throw e;
  }

  const lines = data.items.map((i) => {
    const dates = i.start === i.end ? i.start : `${i.start} – ${i.end}`;
    const local = i.name_local && i.name_local !== i.name ? ` (${i.name_local})` : "";
    const where = i.nationwide ? "" : ` — regions: ${i.regions.map((r) => r.name || r.code).join(", ")}`;
    const traffic = i.kind === "traffic" && i.details
      ? ` — departures ${i.details.departure ?? "?"}, returns ${i.details.return ?? "?"}`
      : "";
    return `- ${dates} [${i.kind}] ${i.name}${local}${where}${traffic}`;
  });

  const card = {
    mode: "holidays",
    country_code: data.country_code,
    name: data.name,
    from: data.from,
    to: data.to,
    items: data.items.map((i) => ({ kind: i.kind, start: i.start, end: i.end, name: i.name, category: (i as { category?: string }).category ?? null, nationwide: i.nationwide, regions: i.regions.map((r) => r.code), details: i.details })),
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp (CC BY 4.0): Nager.Date, OpenHolidays API, Bison Futé",
  };
  return {
    ...text(
    `Holidays in ${data.name} (${data.country_code}) ${data.from} – ${data.to}: ${data.count} entries.\n` +
      (lines.length ? lines.join("\n") : "Nothing in this period for the requested kinds.") +
      `\n\nTraffic colours (Bison Futé): green normal, orange heavy, red very heavy, black extremely heavy.` +
      ` Sources: Nager.Date (public), OpenHolidays API (school), Bison Futé (traffic).${ATTRIBUTION_FOOTER}`
    ),
    structuredContent: card,
  };
}
