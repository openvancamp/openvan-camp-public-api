import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * Таможня при въезде на машине — /api/customs/countries/{code}. Каждый пункт — с дословной
 * цитатой официального источника: её и ссылку агент должен передать, а не пересказ.
 * Страна без данных = 404 covered=false: «нет данных», а не «ничего не запрещено».
 */

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

export const getCustomsRulesInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 code of the country you enter, e.g. PL."),
  from: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 code of the country you come from, e.g. UA. Matters: no customs inside the EU, and some bans have exemptions by origin."),
  locale: z.string().optional().describe("Language of the summaries: en, ru, de, fr, es, pt, tr."),
};

type CustomsResponse = {
  country_code: string;
  name: string;
  from: string | null;
  blocs: string[];
  covered: boolean;
  items: Array<{
    jurisdiction: string;
    topic: string;
    severity: string;
    summary: string;
    quote: string;
    source_name: string;
    source_url: string;
    checked: string;
  }>;
};

export async function getCustomsRules({ country_code, from, locale }: { country_code: string; from?: string; locale?: string }) {
  const cc = country_code.toUpperCase();
  let data: CustomsResponse;
  try {
    data = await apiGet<CustomsResponse>(`/api/customs/countries/${cc}`, { from: from?.toUpperCase(), locale });
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status === 404) {
      return text(`No customs data for ${cc} yet — this means no data, not "nothing is restricted".`, true);
    }
    throw e;
  }

  const origin = data.from ? ` from ${data.from}` : "";
  const card = {
    mode: "customs",
    country_code: data.country_code,
    name: data.name,
    from: data.from,
    blocs: data.blocs,
    items: data.items,
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp (CC BY 4.0)",
  };
  if (!data.items.length) {
    return {
      ...text(
        `Customs on entry into ${data.name} (${data.country_code})${origin}: no rules apply on this crossing` +
          `${data.blocs.length ? ` (same customs bloc: ${data.blocs.join(", ")})` : ""}.${ATTRIBUTION_FOOTER}`
      ),
      structuredContent: card,
    };
  }
  const lines = data.items.map(
    (i) =>
      `- [${i.severity}] ${i.topic} (${i.jurisdiction}): ${i.summary}\n  Official: "${i.quote}" — ${i.source_name}, ${i.source_url} (checked ${i.checked})`
  );

  return {
    ...text(
    `Customs on entry by car into ${data.name} (${data.country_code})${origin}` +
      `${data.blocs.length ? `, bloc ${data.blocs.join(", ")}` : ""}:\n${lines.join("\n")}` +
      (data.from ? "" : "\n\nNo `from` given: rules shown for entry from outside the bloc; pass from=<country> for the exact crossing.") +
      `\n\nQuote the official text and link when advising — summaries are ours.${ATTRIBUTION_FOOTER}`
    ),
    structuredContent: card,
  };
}
