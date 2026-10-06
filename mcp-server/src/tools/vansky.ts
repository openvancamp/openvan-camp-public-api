import { z } from "zod";
import { apiGet } from "../client.js";

const ForecastDaySchema = z.object({
  date: z.string(),
  van_score: z.number(),
  sleep_score: z.number(),
  temp_day: z.number().nullable().optional(),
  temp_night: z.number().nullable().optional(),
  solar_kwh: z.number().nullable().optional(),
  score_label: z.string().optional(),
  drive_score: z.number().optional(),
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
    })
    .optional(),
  forecast: z.array(ForecastDaySchema).optional(),
  fetched_at: z.string().nullable().optional(),
});

export const getVanSkyWeatherInput = {
  country_code: z
    .string()
    .length(2)
    .describe("ISO 3166-1 alpha-2 country code, e.g. DE."),
};

export async function getVanSkyWeather({ country_code }: { country_code: string }) {
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

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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

  return {
    content: [
      {
        type: "text" as const,
        text: `Top ${sorted.length} countries for vanlife today:\n\n${rows}`,
      },
    ],
  };
}
