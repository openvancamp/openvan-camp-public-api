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
      content: [{ type: "text" as const, text: `No VanSky data for country code "${country_code}".` }],
      isError: true,
    };
  }

  const d = parsed.data.data;
  const lines = [
    `VanSky suitability for ${d.code.toUpperCase()} — ${d.score_label}`,
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

export const listVanSkyTopInput = {
  limit: z.number().int().min(1).max(20).default(10).describe("How many top-scoring countries to return."),
};

export async function listVanSkyTop({ limit }: { limit: number }) {
  const raw = await apiGet("/api/vansky/weather");
  const parsed = z
    .object({ data: z.array(VanSkyCountrySchema), count: z.number().optional() })
    .safeParse(raw);

  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "VanSky weather data unavailable." }],
      isError: true,
    };
  }

  const sorted = [...parsed.data.data].sort((a, b) => b.van_score - a.van_score).slice(0, limit);
  const rows = sorted
    .map((d, i) => `  ${i + 1}. ${d.code.toUpperCase()}  score=${d.van_score}  ${d.score_label}  sleep=${d.sleep_score}  solar=${d.solar_kwh?.toFixed(1) ?? "—"}`)
    .join("\n");

  const countries = await Promise.all(
    sorted.map(async (d) => {
      const ref = await countryRef(d.code);
      return {
        code: d.code.toUpperCase(),
        name: ref?.name ?? d.code.toUpperCase(),
        score: d.van_score,
        label: d.score_label,
        temp_day: d.weather?.temp_day ?? null,
        temp_night: d.weather?.temp_night ?? null,
        weather_code: d.weather?.weather_code ?? null,
        url: vanskyUrl(ref),
      };
    })
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `Top ${sorted.length} countries for vanlife today:\n\n${rows}`,
      },
    ],
    structuredContent: { countries, url: `${SITE}/en/vansky`, units: { temperature: "°C" }, source: SOURCE },
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
    week_score: z.number().nullable().optional(),
    sleep_score: z.number().nullable().optional(),
    drive_score: z.number().nullable().optional(),
    solar_kwh: z.number().nullable().optional(),
    weather: z
      .object({
        temp_day: z.number().nullable().optional(),
        temp_night: z.number().nullable().optional(),
        weather_code: z.number().nullable().optional(),
        wind_gusts_max: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    marine: z.preprocess((v) => (Array.isArray(v) ? null : v), z.object({ sea_temp: z.number().nullable().optional() }).passthrough().nullable().optional()),
    forecast: z.array(z.object({ van_score: z.number(), temp_day: z.number().nullable().optional() }).passthrough()).optional(),
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
      content: [{ type: "text" as const, text: `No VanSky data for a city called "${city}"${country_code ? ` in ${country_code.toUpperCase()}` : ""}. Use get_country_travel_weather for the country.` }],
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
  const today = new Date();
  const forecast = (d.forecast ?? []).slice(0, 7).map((f, i) => {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    return { date: day.toISOString().slice(0, 10), score: f.van_score, label: labelOf(f.van_score), temp_day: f.temp_day ?? null, temp_night: null, weather_code: null };
  });
  const others = cities.filter((r) => r !== pick).slice(0, 3).map((r) => `${r.name} (${r.sub ?? r.flag})`);

  const lines = [
    `VanSky travel weather for ${d.city_name}, ${d.country_name ?? d.country_code} — ${labelOf(d.van_score)}`,
    `  Today:       ${d.van_score}/100`,
    d.week_score != null ? `  Next 7 days: ${d.week_score}/100` : null,
    d.sleep_score != null ? `  Sleep score: ${d.sleep_score}/100` : null,
    d.drive_score != null ? `  Drive score: ${d.drive_score}/100` : null,
    w.temp_day != null ? `  Day / night: ${Math.round(w.temp_day)}°C / ${w.temp_night != null ? Math.round(w.temp_night) + "°C" : "—"}` : null,
    d.marine?.sea_temp != null ? `  Sea:         ${Math.round(d.marine.sea_temp)}°C` : null,
    forecast.length ? `  Daily scores: ${forecast.map((f) => f.score).join(", ")}` : null,
    others.length ? `\nOther places with a similar name: ${others.join("; ")}` : null,
    `\nDetails: ${d.url}`,
  ].filter(Boolean);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: {
      city: { name: d.city_name, slug: d.code },
      country: { code: d.country_code, name: d.country_name ?? d.country_code, slug: null },
      score: d.van_score,
      week_score: d.week_score ?? null,
      label: labelOf(d.van_score),
      sleep_score: d.sleep_score ?? null,
      drive_score: d.drive_score ?? null,
      solar_kwh: d.solar_kwh ?? null,
      sea_temp: d.marine?.sea_temp ?? null,
      awning: null,
      condensation: null,
      today: { temp_day: w.temp_day ?? null, temp_night: w.temp_night ?? null, precip_prob: null, wind_gusts: w.wind_gusts_max ?? null, weather_code: w.weather_code ?? null },
      forecast,
      updated_at: parsed.data.updated_at ?? null,
      locale: locale ?? null,
      units: { temperature: "°C", wind: "km/h" },
      url: d.url,
      source: "OpenVan.camp (CC BY 4.0), weather: Open-Meteo",
    },
  };
}
