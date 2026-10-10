import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * Розетки и электросеть — /api/electricity/*. Отдаём с источником значения и ответом Wikidata,
 * чтобы агент видел, где справочники расходятся.
 */

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

export const getPowerPlugsInput = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. GB."),
  locale: z.string().optional().describe("Language of the country name: en, ru, de, fr, es, pt, tr."),
};

export async function getPowerPlugs({ country_code, locale }: { country_code: string; locale?: string }) {
  const cc = country_code.toUpperCase();
  try {
    const data = await apiGet<Record<string, unknown>>(`/api/electricity/countries/${cc}`, { locale });
    delete data._attribution;

    const src = data.source as { name?: string } | undefined;
    const card = { mode: "plugs", ...data, source_name: src?.name ?? null, url: `${SITE}/${locale ?? "en"}/roadbook`, locale: locale ?? null, source: "OpenVan.camp (CC BY 4.0)" };
    return {
      ...text(
      `Power plugs and mains electricity in ${cc}. plugs = IEC plug type letters (A–N), voltage in V, frequency in Hz. ` +
        `campsites = hook-up at European campsites (CEE17, the blue three-pin 16 A socket); applies only to the listed countries:\n\n` +
        `${JSON.stringify(data, null, 2)}${ATTRIBUTION_FOOTER}`
      ),
      structuredContent: card,
    };
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status === 404) {
      return text(`No electricity data for ${cc}.`, true);
    }
    throw e;
  }
}
