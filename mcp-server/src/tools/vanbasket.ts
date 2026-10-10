import { z } from "zod";
import { apiGet } from "../client.js";
import { countryRef } from "../countries.js";
import { SITE } from "../ui/bridge.js";

const SOURCE = "OpenVan.camp (CC BY 4.0), based on ICP 2021 and IMF CPI";

type FoodCountry = { country_code?: string; country_name?: string; vanbasket_index?: number };

async function foodPageUrl(code?: string): Promise<string> {
  const ref = code ? await countryRef(code) : null;
  return ref ? `${SITE}/en/tools/vanbasket/${ref.slug}` : `${SITE}/en/tools/vanbasket`;
}

const ref = (c: FoodCountry | undefined, fallback: string) => ({
  code: (c?.country_code ?? fallback).toUpperCase(),
  name: c?.country_name ?? fallback.toUpperCase(),
  index: c?.vanbasket_index ?? null,
});

export const compareVanBasketInput = {
  from: z.string().length(2).describe("Home country ISO alpha-2 code."),
  to: z.string().length(2).describe("Destination country ISO alpha-2 code."),
};

export async function compareVanBasket({ from, to }: { from: string; to: string }) {
  const raw = await apiGet("/api/vanbasket/compare", { from, to });
  // Shape is loose in the public API — we pass through with light formatting.
  const wrapper = raw as { data?: Record<string, unknown>; success?: boolean };
  const data = (wrapper.data ?? raw) as Record<string, unknown>;

  return {
    content: [
      {
        type: "text" as const,
        text: `VanBasket comparison ${from.toUpperCase()} → ${to.toUpperCase()}:\n\n${JSON.stringify(data, null, 2)}\n\nIndex is relative to world average = 100. Higher = more expensive food.`,
      },
    ],
    ...(typeof data.diff_percent === "number"
      ? {
          structuredContent: {
            mode: "compare",
            from: ref(data.from as FoodCountry, from),
            to: ref(data.to as FoodCountry, to),
            diff_percent: data.diff_percent,
            budget_100: data.budget_100 ?? null,
            cheaper: Boolean(data.cheaper),
            url: await foodPageUrl(to),
            source: SOURCE,
          },
        }
      : {}),
  };
}

export const getVanBasketInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code."),
};

export async function getVanBasket({ country_code }: { country_code: string }) {
  const cc = country_code.toLowerCase();
  const raw = await apiGet(`/api/vanbasket/countries/${cc}`);
  const wrapper = raw as { data?: Record<string, unknown> };
  const data = wrapper.data ?? raw;
  const country = (data as { country?: FoodCountry & { pct_vs_world?: number; data_quality?: string; last_updated_at?: string } }).country;

  return {
    content: [
      {
        type: "text" as const,
        text: `VanBasket food index for ${country_code.toUpperCase()}:\n\n${JSON.stringify(data, null, 2)}\n\nIndex is relative to world average = 100.`,
      },
    ],
    ...(country && typeof country.vanbasket_index === "number"
      ? {
          structuredContent: {
            mode: "country",
            country: ref(country, country_code),
            index: country.vanbasket_index,
            pct_vs_world: country.pct_vs_world ?? country.vanbasket_index - 100,
            data_quality: country.data_quality ?? null,
            updated_at: country.last_updated_at ?? null,
            url: await foodPageUrl(country_code),
            source: SOURCE,
          },
        }
      : {}),
  };
}
