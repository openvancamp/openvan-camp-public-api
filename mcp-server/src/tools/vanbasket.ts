import { z } from "zod";
import { apiGet } from "../client.js";
import { countryRef } from "../countries.js";
import { SITE } from "../ui/bridge.js";

const SOURCE = "OpenVan.camp (CC BY 4.0), based on ICP 2021 and IMF CPI";

type FoodCountry = { country_code?: string; country_name?: string; vanbasket_index?: number };

async function foodPageUrl(code?: string, locale = "en"): Promise<string> {
  const ref = code ? await countryRef(code) : null;
  return ref ? `${SITE}/${locale}/tools/vanbasket/${ref.slug}` : `${SITE}/${locale}/tools/vanbasket`;
}

/** API отдаёт названия только по-английски — переводим по коду, чтобы ответ шёл на языке пользователя. */
function countryName(code: string | undefined, fallback: string | undefined, locale = "en"): string {
  const cc = String(code ?? "").toUpperCase();
  if (locale !== "en" && /^[A-Z]{2}$/.test(cc)) {
    try {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(cc);
      if (name && name.toUpperCase() !== cc) return name;
    } catch {
      // нет данных ICU для языка — оставляем английское
    }
  }
  return fallback ?? cc;
}

const ref = (c: FoodCountry | undefined, fallback: string, locale?: string) => ({
  code: (c?.country_code ?? fallback).toUpperCase(),
  name: countryName(c?.country_code ?? fallback, c?.country_name ?? fallback.toUpperCase(), locale),
  index: c?.vanbasket_index ?? null,
});

export const compareVanBasketInput = {
  from: z.string().length(2).describe("Home country ISO alpha-2 code."),
  to: z.string().length(2).describe("Destination country ISO alpha-2 code."),
};

export async function compareVanBasket({ from, to, locale }: { from: string; to: string; locale?: string }) {
  const raw = await apiGet("/api/vanbasket/compare", { from, to });
  // Shape is loose in the public API — we pass through with light formatting.
  const wrapper = raw as { data?: Record<string, unknown>; success?: boolean };
  const data = (wrapper.data ?? raw) as Record<string, unknown>;

  return {
    content: [
      {
        type: "text" as const,
        text: `Food price comparison ${from.toUpperCase()} → ${to.toUpperCase()}:\n\n${JSON.stringify(data, null, 2)}\n\nIndex is relative to world average = 100. Higher = more expensive food.`,
      },
    ],
    ...(typeof data.diff_percent === "number"
      ? {
          structuredContent: {
            mode: "compare",
            from: ref(data.from as FoodCountry, from, locale),
            to: ref(data.to as FoodCountry, to, locale),
            diff_percent: data.diff_percent,
            budget_100: data.budget_100 ?? null,
            cheaper: Boolean(data.cheaper),
            url: await foodPageUrl(to, locale),
            source: SOURCE,
          },
        }
      : {}),
  };
}

export const getVanBasketInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code."),
};

export async function getVanBasket({ country_code, locale }: { country_code: string; locale?: string }) {
  const cc = country_code.toLowerCase();
  const raw = await apiGet(`/api/vanbasket/countries/${cc}`);
  const wrapper = raw as { data?: Record<string, unknown> };
  const data = wrapper.data ?? raw;
  const country = (data as { country?: FoodCountry & { pct_vs_world?: number; data_quality?: string; last_updated_at?: string } }).country;

  return {
    content: [
      {
        type: "text" as const,
        text: `Food price index for ${country_code.toUpperCase()}:\n\n${JSON.stringify(data, null, 2)}\n\nIndex is relative to world average = 100.`,
      },
    ],
    ...(country && typeof country.vanbasket_index === "number"
      ? {
          structuredContent: {
            mode: "country",
            country: ref(country, country_code, locale),
            index: country.vanbasket_index,
            pct_vs_world: country.pct_vs_world ?? country.vanbasket_index - 100,
            data_quality: country.data_quality ?? null,
            updated_at: country.last_updated_at ?? null,
            url: await foodPageUrl(country_code, locale),
            source: SOURCE,
          },
        }
      : {}),
  };
}


// ------------------------------------------------------------------
// rank_food_prices — где продукты дешевле / дороже всего (регион или мир)
// ------------------------------------------------------------------

export const rankFoodPricesInput = {
  region: z
    .enum(["world", "europe", "asia", "africa", "north_america", "south_america", "oceania"])
    .default("world")
    .describe("Only countries of this region. Default: world."),
  order: z
    .enum(["cheapest", "most_expensive"])
    .default("cheapest")
    .describe("cheapest first (default) or most_expensive first."),
  limit: z
    .preprocess((v) => (typeof v === "number" ? Math.min(Math.max(Math.round(v), 1), 20) : v), z.number().int().min(1).max(20))
    .default(10)
    .describe("How many countries to return."),
};

type RankedFood = FoodCountry & { pct_vs_world?: number; region?: string };

export async function rankFoodPrices({ region = "world", order = "cheapest", limit = 10, locale }: {
  region?: string; order?: "cheapest" | "most_expensive"; limit?: number; locale?: string;
}) {
  const raw = (await apiGet("/api/vanbasket/countries")) as { data?: RankedFood[] | Record<string, RankedFood> };
  const pricey = order === "most_expensive";
  // API отдаёт страны объектом с ключами-кодами (иногда списком) — принимаем оба вида.
  const all = Array.isArray(raw.data) ? raw.data : Object.values(raw.data ?? {});
  const rows = all
    .filter((c) => typeof c.vanbasket_index === "number" && (region === "world" || c.region === region))
    .sort((a, b) => (pricey ? b.vanbasket_index! - a.vanbasket_index! : a.vanbasket_index! - b.vanbasket_index!))
    .slice(0, limit);
  if (rows.length === 0) {
    return { content: [{ type: "text" as const, text: `No food price data for region "${region}".` }], isError: true };
  }
  const table = rows
    .map((c, i) => `  ${i + 1}. ${c.country_code}  ${countryName(c.country_code, c.country_name, locale).padEnd(24)}  index ${c.vanbasket_index}`)
    .join("\n");
  return {
    content: [{
      type: "text" as const,
      text: `${pricey ? "Most expensive" : "Cheapest"} food in ${region} (food price index, world average = 100):\n\n${table}`,
    }],
    structuredContent: {
      mode: "ranking",
      order,
      region,
      rows: rows.map((c) => ({
        code: String(c.country_code).toUpperCase(),
        name: countryName(c.country_code, c.country_name, locale),
        index: c.vanbasket_index,
        pct_vs_world: typeof c.pct_vs_world === "number" ? c.pct_vs_world : null,
      })),
      url: await foodPageUrl(undefined, locale),
      source: SOURCE,
    },
  };
}
