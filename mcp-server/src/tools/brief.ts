import { z } from "zod";
import { getVanSkyWeather } from "./vansky.js";
import { getFuelPrices } from "./fuel.js";
import { getTollRates } from "./tolls.js";
import { getHolidays } from "./holidays.js";
import { getTravelHazards } from "./hazards.js";
import { getPowerPlugs } from "./electricity.js";
import { getCustomsRules } from "./customs.js";
import { checkVisaRules } from "./visa.js";
import { getVanBasket } from "./vanbasket.js";
import { getLicensePlateCountry } from "./plates.js";
import { countryRef } from "../countries.js";
import { SITE } from "../ui/bridge.js";

/**
 * Справка по стране для автопутешествия — самый частый живой вопрос («что стоит знать про
 * Испанию», «нюансы поездки в Болгарию»). Своих данных нет: тот же ответ, что дали бы
 * инструменты по отдельности, одним вызовом. Упавший раздел не роняет справку — его нет.
 */
export const countryBriefInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 code of the country, e.g. ES."),
  passport: z
    .string()
    .length(2)
    .optional()
    .describe("Traveller's passport, ISO alpha-2 — adds the entry rule and how long the person and the vehicle may stay. Only if the user gave it."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .optional()
    .describe("Language of the conversation: names and the card come in it."),
};

type ToolResult = { content?: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function safe(p: Promise<unknown>): Promise<ToolResult | null> {
  try {
    const r = (await p) as ToolResult;
    return r && !r.isError ? r : null;
  } catch {
    return null;
  }
}

const textOf = (r: ToolResult | null, max = 900) =>
  (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").replace(/_Data: OpenVan\.camp[^\n]*/g, "").trim().slice(0, max);

type Dict = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Из ответа каждого инструмента — только то, что нужно карточке и короткому ответу. */
function compact(sc: Dict | undefined, key: string): Dict | null {
  if (!sc) return null;
  switch (key) {
    case "weather":
      return { score: sc.score, week_score: sc.week_score, label: sc.label, today: sc.today, sea_temp: sc.sea_temp,
        best: (sc.cities?.best ?? []).slice(0, 3).map((c: Dict) => ({ name: c.name, temp_day: c.temp_day, score: c.score })),
        worst: (sc.cities?.worst ?? []).slice(0, 2).map((c: Dict) => ({ name: c.name, temp_day: c.temp_day, score: c.score })) };
    case "fuel":
      return { local_currency: sc.local_currency, rates: sc.rates, updated_at: sc.updated_at,
        grades: (sc.grades ?? []).filter((g: Dict) => ["gasoline", "diesel", "lpg"].includes(g.type)) };
    case "tolls":
      return { system_type: sc.system_type, vignettes: (sc.vignettes ?? []).slice(0, 4),
        van: (sc.rates ?? []).find((r: Dict) => r.vehicle_class === "van") ?? null, sections_count: sc.sections_count };
    case "holidays":
      return { items: (sc.items ?? []).slice(0, 5).map((h: Dict) => ({ name: h.name, start: h.start, end: h.end, kind: h.kind, nationwide: h.nationwide })) };
    case "hazards":
      return { advisory: sc.advisory ? { level: sc.advisory.level, severity: sc.advisory.severity } : null,
        events: (sc.events ?? []).slice(0, 3).map((e: Dict) => ({ type: e.type, name: e.name, alert: e.alert ?? e.alert_level })) };
    case "plugs":
      return { plugs: sc.plugs, voltage: sc.voltage, frequency: sc.frequency, campsite: sc.campsites?.connector ?? null };
    case "customs":
      return { items: (sc.items ?? []).slice(0, 6).map((i: Dict) => ({ topic: i.topic, severity: i.severity, summary: i.summary })) };
    case "visa":
      return { passport: sc.passport, entry_mode: sc.entry_mode, counted_against: sc.counted_against, stay: sc.stay ? {
        visa_type: sc.stay.visa_type, max_continuous: sc.stay.max_continuous, max_total: sc.stay.max_total,
        window_days: sc.stay.window_days, note: sc.stay.note } : null, vehicle: sc.vehicle ?? null };
    case "food":
      return { index: sc.index, pct_vs_world: sc.pct_vs_world };
    case "plates":
      return sc.example_svg ? { example: sc.example, svg: sc.example_svg, intl: sc.intl, url: sc.url } : null;
  }
  return null;
}

export async function getCountryBrief({ country_code, passport, locale }: { country_code: string; passport?: string; locale?: string }) {
  const cc = country_code.toUpperCase();
  const lang = locale ?? "en";
  const today = new Date();
  const month = new Date(today.getTime() + 30 * 86400000);

  const [weather, fuel, tolls, holidays, hazards, plugs, customs, visa, food, plates] = await Promise.all([
    safe(getVanSkyWeather({ country_code: cc, locale: lang })),
    safe(getFuelPrices({ country_code: cc })),
    safe(getTollRates({ country_code: cc, locale: lang })),
    safe(getHolidays({ country_code: cc, from: iso(today), to: iso(month), locale: lang })),
    safe(getTravelHazards({ country_code: cc, locale: lang })),
    safe(getPowerPlugs({ country_code: cc, locale: lang })),
    safe(getCustomsRules({ country_code: cc, locale: lang })),
    passport ? safe(checkVisaRules({ passport: passport.toUpperCase(), destination: cc, locale: lang })) : Promise.resolve(null),
    safe(getVanBasket({ country_code: cc })),
    safe(getLicensePlateCountry({ country: cc, locale: lang })),
  ]);

  const ref = await countryRef(cc);
  const name =
    (hazards?.structuredContent?.name as string) ?? (tolls?.structuredContent?.name as string) ?? ref?.name ?? cc;
  const sections: Array<[string, ToolResult | null]> = [
    ["Entry and allowed stay", visa],
    ["Travel weather", weather],
    ["Fuel prices", fuel],
    ["Tolls and vignettes", tolls],
    ["Holidays in the next 30 days", holidays],
    ["Safety now", hazards],
    ["Power plugs", plugs],
    ["Customs by car", customs],
    ["Food prices", food],
    ["License plates", plates],
  ];
  const present = sections.filter(([, r]) => r);
  // Безопасность отвечает «нет данных» и для несуществующего кода — по ней одной справку не строим.
  if (!present.some(([title]) => title !== "Safety now")) {
    return { content: [{ type: "text" as const, text: `No data for ${cc} yet — this means OpenVan.camp has no data for this country, not that nothing applies.` }], isError: true };
  }

  const text = [
    `Road-trip briefing for ${name} (${cc})${passport ? `, passport ${passport.toUpperCase()}` : ""}:`,
    ...present.map(([title, r]) => `\n## ${title}\n${textOf(r)}`),
    passport ? "" : "\n(Pass passport to add the entry rule and how long the person and the vehicle may stay.)",
  ].join("\n");

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      mode: "brief",
      country: { code: cc, name },
      passport: passport?.toUpperCase() ?? null,
      weather: compact(weather?.structuredContent, "weather"),
      fuel: compact(fuel?.structuredContent, "fuel"),
      tolls: compact(tolls?.structuredContent, "tolls"),
      holidays: compact(holidays?.structuredContent, "holidays"),
      hazards: compact(hazards?.structuredContent, "hazards"),
      plugs: compact(plugs?.structuredContent, "plugs"),
      customs: compact(customs?.structuredContent, "customs"),
      visa: compact(visa?.structuredContent, "visa"),
      food: compact(food?.structuredContent, "food"),
      plates: compact(plates?.structuredContent, "plates"),
      url: ref ? `${SITE}/${lang}/vansky/${ref.slug}` : `${SITE}/${lang}`,
      locale: lang,
      source: "OpenVan.camp (CC BY 4.0)",
    },
  };
}
