import { z } from "zod";
import { apiGet } from "../client.js";
import { countryRef, type CountryRef } from "../countries.js";
import { SITE } from "../ui/bridge.js";

const ForecastDaySchema = z.object({
  date: z.string(),
  van_score: z.number(),
  sleep_score: z.number(),
  temp_day: z.number().nullable().optional(),
  temp_night: z.number().nullable().optional(),
  solar_kwh: z.number().nullable().optional(),
  score_label: z.string().optional(),
  drive_score: z.number().optional(),
  weather_code: z.number().nullable().optional(),
});

const VanSkyCountrySchema = z.object({
  code: z.string(),
  region: z.string().optional(),
  is_coastal: z.boolean().optional(),
  van_score: z.number(),
  sleep_score: z.number(),
  solar_kwh: z.number().nullable().optional(),
  drive_score: z.number().nullable().optional(),
  score_label: z.string(),
  condensation_risk: z.string().optional(),
  awning_status: z.string().optional(),
  weather: z
    .object({
      temp_day: z.number().nullable().optional(),
      temp_night: z.number().nullable().optional(),
      precip_prob_max: z.number().nullable().optional(),
      wind_gusts_max: z.number().nullable().optional(),
      humidity: z.number().nullable().optional(),
      weather_code: z.number().nullable().optional(),
    })
    .optional(),
  // У стран без моря PHP отдаёт пустой массив вместо объекта.
  marine: z.preprocess(
    (v) => (Array.isArray(v) ? null : v),
    z.object({ sea_temp: z.number().nullable().optional() }).passthrough().nullable().optional()
  ),
  week_score: z.number().nullable().optional(),
  forecast: z.array(ForecastDaySchema).optional(),
  fetched_at: z.string().nullable().optional(),
});

const RecommendCitySchema = z.object({
  name: z.string(),
  url: z.string(),
  score: z.number(),
  temp: z.number().nullable().optional(),
  wind: z.number().nullable().optional(),
  clear: z.boolean().optional(),
});

const RecommendSchema = z.object({
  show: z.boolean(),
  cities: z.array(RecommendCitySchema).optional(),
  worst: z.array(RecommendCitySchema).optional(),
});

type CardCity = { name: string; score: number; temp_day: number | null; wind: number | null; clear: boolean; url: string };

/**
 * Лучшие и худшие города страны на ближайшую неделю — тот же расчёт, что блок
 * «Где комфортнее на этой неделе» на сайте (/api/vansky/home-recommend?cc=…):
 * ранжирование по недельному индексу, названия городов на языке разговора.
 * Ошибка здесь не должна ломать карточку страны — тогда городов просто нет.
 */
async function weekBestAndWorst(code: string, locale: string): Promise<{ best: CardCity[]; worst: CardCity[] }> {
  const toCard = (c: z.infer<typeof RecommendCitySchema>): CardCity => ({
    name: c.name,
    score: c.score,
    temp_day: c.temp ?? null,
    wind: c.wind ?? null,
    clear: c.clear ?? false,
    url: c.url,
  });
  try {
    const r = RecommendSchema.parse(await apiGet("/api/vansky/home-recommend", { cc: code.toUpperCase(), locale }));
    if (!r.show) return { best: [], worst: [] };
    return { best: (r.cities ?? []).map(toCard), worst: (r.worst ?? []).map(toCard) };
  } catch {
    return { best: [], worst: [] };
  }
}

function vanskyUrl(ref: CountryRef | null): string {
  return ref ? `${SITE}/en/vansky/${ref.slug}` : `${SITE}/en/vansky`;
}

const SOURCE = "OpenVan.camp (CC BY 4.0), weather: Open-Meteo";

export const getVanSkyWeatherInput = {
  country_code: z
    .string()
    .length(2)
    .describe("ISO 3166-1 alpha-2 country code, e.g. DE."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .optional()
    .describe("Language of the conversation with the user, for city names and the card. Pass it whenever the user writes in one of these languages."),
};

export async function getVanSkyWeather({ country_code, locale }: { country_code: string; locale?: string }) {
  const cc = country_code.toLowerCase();
  const raw = await apiGet(`/api/vansky/weather/${cc}`);
  const parsed = z.object({ data: VanSkyCountrySchema }).safeParse(raw);

  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: `No travel weather data for country code "${country_code}".` }],
      isError: true,
    };
  }

  const d = parsed.data.data;
  const lines = [
    `OpenVan.camp travel weather for ${d.code.toUpperCase()} — ${d.score_label} (campervan travel score)`,
    `  Van score:   ${d.van_score}/100`,
    `  Sleep score: ${d.sleep_score}/100`,
    d.drive_score != null ? `  Drive score: ${d.drive_score}/100` : null,
    d.solar_kwh != null ? `  Solar yield: ${d.solar_kwh.toFixed(1)} kWh/day (per 1kW panel)` : null,
    d.awning_status ? `  Awning:      ${d.awning_status}` : null,
    d.condensation_risk ? `  Condensation risk: ${d.condensation_risk}` : null,
  ].filter(Boolean);

  if (d.weather) {
    const w = d.weather;
    lines.push("", "Weather today:");
    if (w.temp_day != null) lines.push(`  Day:   ${w.temp_day.toFixed(1)}°C`);
    if (w.temp_night != null) lines.push(`  Night: ${w.temp_night.toFixed(1)}°C`);
    if (w.precip_prob_max != null) lines.push(`  Rain prob: ${w.precip_prob_max}%`);
    if (w.wind_gusts_max != null) lines.push(`  Wind gusts: ${w.wind_gusts_max} km/h`);
  }

  if (d.forecast?.length) {
    lines.push("", "7-day forecast:");
    for (const day of d.forecast.slice(0, 7)) {
      lines.push(`  ${day.date}  score=${day.van_score}  ${day.score_label ?? ""}  ${day.temp_day != null ? day.temp_day.toFixed(0) + "°C day" : ""}`);
    }
  }

  const ref = await countryRef(d.code);
  const url = vanskyUrl(ref);
  const cities = await weekBestAndWorst(d.code, locale ?? "en");
  const cityLine = (c: CardCity) => `  ${c.name} — week score ${c.score}/100${c.temp_day != null ? `, ${Math.round(c.temp_day)}°C today` : ""} — ${c.url}`;
  if (cities.best.length) lines.push("", "Best places for the coming 7 days:", ...cities.best.map(cityLine));
  if (cities.worst.length) lines.push("", "Toughest places for the coming 7 days:", ...cities.worst.map(cityLine));
  lines.push("", `Details: ${url}`);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: {
      country: { code: d.code.toUpperCase(), name: ref?.name ?? d.code.toUpperCase(), slug: ref?.slug ?? null },
      score: d.van_score,
      week_score: d.week_score ?? null,
      label: d.score_label,
      sleep_score: d.sleep_score,
      drive_score: d.drive_score ?? null,
      solar_kwh: d.solar_kwh ?? null,
      sea_temp: d.marine?.sea_temp ?? null,
      awning: d.awning_status ?? null,
      condensation: d.condensation_risk ?? null,
      today: {
        temp_day: d.weather?.temp_day ?? null,
        temp_night: d.weather?.temp_night ?? null,
        precip_prob: d.weather?.precip_prob_max ?? null,
        wind_gusts: d.weather?.wind_gusts_max ?? null,
        weather_code: d.weather?.weather_code ?? null,
      },
      forecast: (d.forecast ?? []).slice(0, 7).map((f) => ({
        date: f.date,
        score: f.van_score,
        label: f.score_label ?? null,
        temp_day: f.temp_day ?? null,
        temp_night: f.temp_night ?? null,
        weather_code: f.weather_code ?? null,
      })),
      cities: { period: "week", best: cities.best, worst: cities.worst },
      locale: locale ?? null,
      updated_at: d.fetched_at ?? null,
      units: { temperature: "°C", wind: "km/h" },
      url,
      source: SOURCE,
    },
  };
}

// ------------------------------------------------------------------
// list_best_weather_countries — top N countries by van_score today
// ------------------------------------------------------------------

/** Южная Америка внутри региона americas API (остальное americas — Северная и Центральная Америка, Карибы). */
const SOUTH_AMERICA = new Set(["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PE", "PY", "SR", "UY", "VE", "GF", "FK"]);

const REGIONS = ["world", "europe", "asia", "middle_east", "cis", "africa", "north_america", "south_america", "oceania"] as const;
type Region = (typeof REGIONS)[number];

export const listVanSkyTopInput = {
  limit: z.preprocess((v) => (typeof v === "number" ? Math.min(Math.max(Math.round(v), 1), 20) : v), z.number().int().min(1).max(20)).default(10).describe("How many top-scoring countries to return."),
  region: z
    .preprocess((v) => (v === "americas" ? "north_america" : v), z.enum(REGIONS))
    .default("world")
    .describe("Only countries of this region — «best weather in Europe». asia includes the Middle East; cis = Russia, the Caucasus and Central Asia. Default: world."),
  period: z
    .enum(["today", "week"])
    .default("today")
    .describe("today = today's score (default, «right now»); week = the score of the coming 7 days, the ranking used on OpenVan.camp — for «this week», «the coming days», «where to go next week»."),
  sort: z
    .enum(["score", "warmest"])
    .default("score")
    .describe("score = best overall travel weather (default, also for «warm and pleasant»); warmest = highest daytime temperature today — only for a literal «where is it warmest/hottest»."),
};

const RankingSchema = z.object({
  data: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      url: z.string().nullable().optional(),
      region: z.string().nullable().optional(),
      van_score: z.number(),
      score_label: z.string(),
      week_score: z.number(),
      week_label: z.string(),
      temp_day: z.number().nullable().optional(),
      temp_night: z.number().nullable().optional(),
      weather_code: z.number().nullable().optional(),
    })
  ),
});

function inRegion(region: Region, apiRegion: string | null | undefined, code: string): boolean {
  if (region === "world") return true;
  if (region === "north_america") return apiRegion === "americas" && !SOUTH_AMERICA.has(code);
  if (region === "south_america") return apiRegion === "americas" && SOUTH_AMERICA.has(code);
  if (region === "asia") return apiRegion === "asia" || apiRegion === "middle_east";
  return apiRegion === region;
}

export async function listVanSkyTop({ limit, region = "world", period = "today", sort = "score", locale }: { limit: number; region?: Region; period?: "today" | "week"; sort?: "score" | "warmest"; locale?: string }) {
  const parsed = RankingSchema.safeParse(await apiGet("/api/vansky/ranking", { by: period, limit: 250, locale: locale ?? "en" }).catch(() => null));

  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "Travel weather data unavailable." }],
      isError: true,
    };
  }

  const week = period === "week";
  const sorted = parsed.data.data
    .filter((d) => inRegion(region, d.region, d.code.toUpperCase()))
    .filter((d) => sort !== "warmest" || d.temp_day != null)
    .sort((a, b) => (sort === "warmest" ? (b.temp_day ?? 0) - (a.temp_day ?? 0) : 0))
    .slice(0, limit);
  const rows = sorted
    .map((d, i) => `  ${i + 1}. ${d.name} (${d.code.toUpperCase()}): ${week ? "week" : "today"} ${week ? d.week_score : d.van_score}/100 (${week ? d.week_label : d.score_label}), ${week ? `today ${d.van_score}/100` : `week ${d.week_score}/100`}, daytime ${d.temp_day ?? "—"}°C, night ${d.temp_night ?? "—"}°C`)
    .join("\n");

  const countries = sorted.map((d) => ({
    code: d.code.toUpperCase(),
    name: d.name,
    score: week ? d.week_score : d.van_score,
    label: week ? d.week_label : d.score_label,
    today_score: d.van_score,
    week_score: d.week_score,
    temp_day: d.temp_day ?? null,
    temp_night: d.temp_night ?? null,
    weather_code: d.weather_code ?? null,
    url: d.url ?? `${SITE}/en/vansky`,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: `Top ${sorted.length} countries ${sort === "warmest" ? "by daytime temperature today" : week ? "for vanlife weather over the coming 7 days (the OpenVan.camp ranking)" : "for vanlife weather today"}${region === "world" ? "" : ` in ${region}`}:\n\n${rows}\n\nHow the score is calculated: ${SITE}/api/vansky/methodology`,
      },
    ],
    structuredContent: { countries, region, period, sort, url: `${SITE}/en/vansky`, units: { temperature: "°C" }, source: SOURCE },
  };
}

// ------------------------------------------------------------------
// get_city_travel_weather — один город (Барселона, Малага…)
// ------------------------------------------------------------------

const SearchSchema = z.object({
  results: z.array(z.object({ type: z.string(), name: z.string(), sub: z.string().nullable().optional(), url: z.string(), flag: z.string().nullable().optional() })),
});

const CityWeatherSchema = z.object({
  data: z.object({
    code: z.string(),
    city_name: z.string(),
    country_code: z.string(),
    country_name: z.string().nullable().optional(),
    url: z.string(),
    van_score: z.number(),
    score_label: z.string().nullable().optional(),
    week_score: z.number().nullable().optional(),
    week_label: z.string().nullable().optional(),
    rank: z.object({ position: z.number(), total: z.number() }).nullable().optional(),
    comfortable_days: z.number().nullable().optional(),
    worst_day: z.object({ date: z.string(), van_score: z.number() }).nullable().optional(),
    best_window: z.object({ from: z.string(), to: z.string(), avg_score: z.number() }).nullable().optional(),
    sleep_score: z.number().nullable().optional(),
    drive_score: z.number().nullable().optional(),
    solar_kwh: z.number().nullable().optional(),
    awning_status: z.string().nullable().optional(),
    condensation_risk: z.string().nullable().optional(),
    weather: z
      .object({
        temp_day: z.number().nullable().optional(),
        temp_night: z.number().nullable().optional(),
        weather_code: z.number().nullable().optional(),
        wind_gusts_max: z.number().nullable().optional(),
        precip_prob_max: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    marine: z.preprocess((v) => (Array.isArray(v) ? null : v), z.object({ sea_temp: z.number().nullable().optional() }).passthrough().nullable().optional()),
    recommendations: z.array(z.object({ type: z.string().nullable().optional(), text: z.string().nullable().optional() }).passthrough()).nullable().optional(),
    forecast: z
      .array(
        z
          .object({
            date: z.string().optional(),
            van_score: z.number(),
            temp_day: z.number().nullable().optional(),
            temp_night: z.number().nullable().optional(),
            weather_code: z.number().nullable().optional(),
            precip_sum: z.number().nullable().optional(),
            precip_prob_max: z.number().nullable().optional(),
            wind_gusts_max: z.number().nullable().optional(),
            sub_scores: z.object({ thermal: z.number(), sunshine: z.number(), precipitation: z.number(), wind: z.number() }).nullable().optional(),
            weighted_score: z.number().nullable().optional(),
            adjustments: z.number().nullable().optional(),
          })
          .passthrough()
      )
      .optional(),
  }),
  updated_at: z.string().nullable().optional(),
});

/** Метка уровня по шкале индекса (как на сайте): 80+ идеально, 60+ комфортно, 40+ приемлемо, 20+ сложно. */
function labelOf(score: number): string {
  return score >= 80 ? "ideal" : score >= 60 ? "comfortable" : score >= 40 ? "acceptable" : score >= 20 ? "hard" : "extreme";
}

export const getCityWeatherInput = {
  city: z.string().min(2).describe("City or town name in any language, e.g. Barcelona, Málaga, Alicante."),
  country_code: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 country code to disambiguate (Barcelona ES vs Barcelona VE)."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .optional()
    .describe("Language of the conversation with the user. Pass it whenever the user writes in one of these languages."),
};

export async function getCityWeather({ city, country_code, locale }: { city: string; country_code?: string; locale?: string }) {
  const lang = locale ?? "en";
  const found = SearchSchema.safeParse(await apiGet("/api/vansky/search", { q: city, locale: lang }));
  const cities = found.success ? found.data.results.filter((r) => r.type === "city") : [];
  const pick = cities.find((r) => !country_code || r.flag?.toUpperCase() === country_code.toUpperCase());
  if (!pick || !pick.flag) {
    return {
      content: [{ type: "text" as const, text: `No travel weather data for a city called "${city}"${country_code ? ` in ${country_code.toUpperCase()}` : ""}. Use get_country_travel_weather for the country.` }],
      isError: true,
    };
  }

  const slug = pick.url.split("/").filter(Boolean).pop()!;
  const parsed = CityWeatherSchema.safeParse(await apiGet(`/api/vansky/weather/${pick.flag}/${slug}`, { locale: lang }).catch(() => null));
  if (!parsed.success) {
    return { content: [{ type: "text" as const, text: `No weather data for ${pick.name} yet.` }], isError: true };
  }

  const d = parsed.data.data;
  const w = d.weather ?? {};
  const forecast = (d.forecast ?? []).slice(0, 7).map((f, i) => ({
    date: f.date ?? new Date(Date.now() + i * 86400000).toISOString().slice(0, 10),
    score: f.van_score,
    label: labelOf(f.van_score),
    temp_day: f.temp_day ?? null,
    temp_night: f.temp_night ?? null,
    weather_code: f.weather_code ?? null,
    precip_mm: f.precip_sum ?? null,
    precip_prob: f.precip_prob_max ?? null,
    sub_scores: f.sub_scores ?? null,
  }));
  const others = cities.filter((r) => r !== pick).slice(0, 3).map((r) => `${r.name} (${r.sub ?? r.flag})`);
  const today = d.forecast?.[0];
  const tips = (d.recommendations ?? []).map((r) => r.text).filter((t): t is string => !!t).slice(0, 5);
  const c = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}°C`);

  const lines = [
    `OpenVan.camp travel weather for ${d.city_name}, ${d.country_name ?? d.country_code}`,
    `  Today:       ${d.van_score}/100 (${d.score_label ?? labelOf(d.van_score)})`,
    d.week_score != null ? `  Next 7 days: ${d.week_score}/100 (${d.week_label ?? labelOf(d.week_score)})` : null,
    d.rank ? `  Place in the country this week: ${d.rank.position} of ${d.rank.total} cities` : null,
    d.comfortable_days != null ? `  Comfortable days (60+): ${d.comfortable_days} of ${forecast.length}` : null,
    d.best_window ? `  Best stretch: ${d.best_window.from} – ${d.best_window.to} (avg ${d.best_window.avg_score})` : null,
    d.worst_day ? `  Worst day: ${d.worst_day.date} (${d.worst_day.van_score}/100)` : null,
    today?.sub_scores
      ? `  Today's breakdown: thermal ${today.sub_scores.thermal}, sunshine ${today.sub_scores.sunshine}, precipitation ${today.sub_scores.precipitation}, wind ${today.sub_scores.wind} → weighted ${today.weighted_score ?? "—"}, adjustments ${today.adjustments != null && today.adjustments >= 0 ? "+" : ""}${today.adjustments ?? "—"}`
      : null,
    d.sleep_score != null ? `  Sleep score: ${d.sleep_score}/100` : null,
    d.drive_score != null ? `  Drive score: ${d.drive_score}/100` : null,
    d.solar_kwh != null ? `  Solar:       ${d.solar_kwh} kWh/day` : null,
    d.marine?.sea_temp != null ? `  Sea:         ${Math.round(d.marine.sea_temp)}°C` : null,
    forecast.length
      ? `\nForecast:\n${forecast.map((f) => `  ${f.date}: ${f.score}/100 (${f.label}), day ${c(f.temp_day)}, night ${c(f.temp_night)}${f.precip_mm ? `, rain ${f.precip_mm} mm` : ""}`).join("\n")}`
      : null,
    tips.length ? `\nAdvice:\n${tips.map((t) => `  - ${t}`).join("\n")}` : null,
    others.length ? `\nOther places with a similar name: ${others.join("; ")}` : null,
    `\nDetails: ${d.url}\nHow the score is calculated: ${SITE}/api/vansky/methodology`,
  ].filter(Boolean);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: {
      city: { name: d.city_name, slug: d.code },
      country: { code: d.country_code, name: d.country_name ?? d.country_code, slug: null },
      score: d.van_score,
      week_score: d.week_score ?? null,
      label: d.score_label ?? labelOf(d.van_score),
      week_label: d.week_label ?? (d.week_score != null ? labelOf(d.week_score) : null),
      rank: d.rank ? { position: d.rank.position, total: d.rank.total } : null,
      comfortable_days: d.comfortable_days ?? null,
      worst_day: d.worst_day ?? null,
      best_window: d.best_window ?? null,
      sleep_score: d.sleep_score ?? null,
      drive_score: d.drive_score ?? null,
      solar_kwh: d.solar_kwh ?? null,
      sea_temp: d.marine?.sea_temp ?? null,
      awning: d.awning_status ?? null,
      condensation: d.condensation_risk ?? null,
      today: { temp_day: w.temp_day ?? null, temp_night: w.temp_night ?? null, precip_prob: w.precip_prob_max ?? null, wind_gusts: w.wind_gusts_max ?? null, weather_code: w.weather_code ?? null },
      forecast,
      advice: tips,
      updated_at: parsed.data.updated_at ?? null,
      locale: locale ?? null,
      units: { temperature: "°C", wind: "km/h" },
      url: d.url,
      methodology: `${SITE}/api/vansky/methodology`,
      source: "OpenVan.camp (CC BY 4.0), weather: Open-Meteo",
    },
  };
}

// ------------------------------------------------------------------
// get_city_climate — какая погода обычно в любой день года (ERA5, 2021–2025)
// ------------------------------------------------------------------

const ClimateMonthSchema = z.object({
  month: z.number(),
  temp_day_c: z.number().nullable(),
  temp_night_c: z.number().nullable(),
  water_c: z.number().nullable(),
  vansky_index: z.number().nullable(),
  avg_days: z.object({ clear: z.number(), cloudy: z.number(), overcast: z.number(), precipitation: z.number() }).nullable(),
});

const ClimateSchema = z.object({
  location: z.object({ lat: z.number(), lng: z.number() }),
  city: z.object({ name: z.string(), slug: z.string(), country_code: z.string(), country_name: z.string().nullable().optional(), url: z.string() }).optional(),
  period: z.string(),
  day: z
    .object({
      date: z.string(),
      temp_day_c: z.number().nullable(),
      temp_night_c: z.number().nullable(),
      precipitation_days_pct: z.number().nullable(),
      precipitation_days_of_35: z.number().nullable(),
      sky: z.string().nullable(),
      water_c: z.number().nullable(),
      solar_kwh_m2: z.object({ p25: z.number(), median: z.number(), p75: z.number() }).nullable(),
      vansky_index: z.number().nullable(),
    })
    .optional(),
  months: z.array(ClimateMonthSchema),
  best_month: z.object({ month: z.number(), vansky_index: z.number() }).nullable(),
  good_months: z.array(z.number()),
});

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const getCityClimateInput = {
  city: z
    .string()
    .min(2)
    .optional()
    .describe("City or town name in any language, e.g. Batumi, Antalya. Omit when passing lat and lng."),
  country_code: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 country code to disambiguate the city (Barcelona ES vs Barcelona VE)."),
  lat: z.number().min(-90).max(90).optional().describe("Latitude of any point, instead of a city."),
  lng: z.number().min(-180).max(180).optional().describe("Longitude of any point, instead of a city."),
  date: z
    .string()
    .regex(/^(\d{4}-)?\d{2}-\d{2}$/)
    .optional()
    .describe("Day of the year, MM-DD or YYYY-MM-DD (the year is ignored), e.g. 09-18. Omit for an overview of all 12 months and the best month."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .optional()
    .describe("Language of the conversation with the user. Pass it whenever the user writes in one of these languages."),
};

export async function getCityClimate({
  city,
  country_code,
  lat,
  lng,
  date,
  locale,
}: {
  city?: string;
  country_code?: string;
  lat?: number;
  lng?: number;
  date?: string;
  locale?: string;
}) {
  const lang = locale ?? "en";
  let raw: unknown;
  let others: string[] = [];

  if (lat != null && lng != null) {
    raw = await apiGet("/api/vansky/climate", { lat, lng, ...(date ? { date } : {}) }).catch(() => null);
  } else if (city) {
    const found = SearchSchema.safeParse(await apiGet("/api/vansky/search", { q: city, locale: lang }));
    const cities = found.success ? found.data.results.filter((r) => r.type === "city") : [];
    const pick = cities.find((r) => !country_code || r.flag?.toUpperCase() === country_code.toUpperCase());
    if (!pick || !pick.flag) {
      return {
        content: [{ type: "text" as const, text: `No city called "${city}"${country_code ? ` in ${country_code.toUpperCase()}` : ""} in OpenVan.camp. Pass lat and lng of the place instead: the climate covers any point on Earth.` }],
        isError: true,
      };
    }
    const slug = pick.url.split("/").filter(Boolean).pop()!;
    others = cities.filter((r) => r !== pick).slice(0, 3).map((r) => `${r.name} (${r.sub ?? r.flag})`);
    raw = await apiGet(`/api/vansky/climate/${pick.flag}/${slug}`, { locale: lang, ...(date ? { date } : {}) }).catch(() => null);
  } else {
    return { content: [{ type: "text" as const, text: "Pass a city, or lat and lng." }], isError: true };
  }

  const parsed = ClimateSchema.safeParse(raw);
  if (!parsed.success) {
    return { content: [{ type: "text" as const, text: "OpenVan.camp has no climate data for this place." }] };
  }

  const d = parsed.data;
  const place = d.city ? `${d.city.name}, ${d.city.country_name ?? d.city.country_code}` : `${d.location.lat}, ${d.location.lng}`;
  const url = d.city?.url ?? `${SITE}/${lang}/vansky`;
  const c = (v: number | null) => (v == null ? "—" : `${v}°C`);
  const lines: (string | null)[] = [`OpenVan.camp typical weather (climate, not a forecast) for ${place}: median of 35 archive days, the date ±3 days over ${d.period} (ERA5).`];

  if (d.day) {
    const x = d.day;
    lines.push(
      `  ${x.date}: day ${c(x.temp_day_c)}, night ${c(x.temp_night_c)}, usual sky ${x.sky ?? "—"}`,
      x.precipitation_days_of_35 != null ? `  Precipitation (≥ 1.5 mm) on ${x.precipitation_days_of_35} of 35 days` : null,
      x.water_c != null ? `  Water (sea or large lake): ${x.water_c}°C` : null,
      x.solar_kwh_m2 ? `  Solar radiation: ${x.solar_kwh_m2.median} kWh/m² a day (p25–p75 ${x.solar_kwh_m2.p25}–${x.solar_kwh_m2.p75}); panel output ≈ kWh/m² × panel kW × 0.8` : null,
      x.vansky_index != null ? `  VanSky climate index: ${x.vansky_index}/100 (${labelOf(x.vansky_index)})` : null
    );
  }

  lines.push("  Month: day/night °C, water, index, average days clear/cloudy/overcast/precipitation");
  for (const m of d.months) {
    const a = m.avg_days;
    lines.push(
      `  ${MONTHS_EN[m.month - 1].slice(0, 3)}: ${c(m.temp_day_c)}/${c(m.temp_night_c)}${m.water_c != null ? `, water ${m.water_c}°C` : ""}${m.vansky_index != null ? `, index ${m.vansky_index}` : ""}${a ? `, days ${a.clear}/${a.cloudy}/${a.overcast}/${a.precipitation}` : ""}`
    );
  }
  if (d.best_month) {
    lines.push(`  Best month: ${MONTHS_EN[d.best_month.month - 1]} (index ${d.best_month.vansky_index}); index 60+ in ${d.good_months.map((m) => MONTHS_EN[m - 1]).join(", ") || "no month"}`);
  }
  if (others.length) {
    lines.push(`\nOther places with a similar name: ${others.join("; ")}`);
  }
  lines.push(`\nDetails: ${url}`);

  return {
    content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }],
    structuredContent: {
      city: d.city ? { name: d.city.name, slug: d.city.slug } : null,
      country: d.city ? { code: d.city.country_code, name: d.city.country_name ?? d.city.country_code } : null,
      location: d.location,
      period: d.period,
      day: d.day ?? null,
      months: d.months,
      best_month: d.best_month,
      good_months: d.good_months,
      locale: locale ?? null,
      units: { temperature: "°C", solar: "kWh/m² per day" },
      url,
      source: "OpenVan.camp (CC BY 4.0); climate: ERA5, Copernicus Climate Change Service (C3S)",
    },
  };
}
