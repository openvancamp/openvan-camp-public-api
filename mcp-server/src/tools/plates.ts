import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { BASE_URL, SOURCE_TAG, USER_AGENT, ATTRIBUTION_FOOTER } from "../config.js";

/**
 * License plates of the world — /api/plates/*.
 *
 * Картинку номера рисует openvan.camp тем же движком, что на сайте; инструмент отдаёт
 * и ссылки (SVG/PNG), и саму PNG как image-content — хосты показывают номер прямо в чате.
 */

const PlateSchema = z.object({
  number: z.string(),
  region: z.string().nullish(),
  formatted: z.string().nullish(),
  image: z.object({ svg: z.string(), png: z.string() }).nullish(),
});

const CountrySummarySchema = z.object({
  country_code: z.string(),
  country_name: z.string().nullish(),
  intl_code: z.string().nullish(),
  region_marking: z.string().nullish(),
  size_mm: z.array(z.number()).nullish(),
  example: PlateSchema.nullish(),
  regions_count: z.number().nullish(),
  glyphs_license: z.string().nullish(),
  url: z.string().nullish(),
});

const RegionSchema = z.object({
  name: z.string(),
  iso3166_2: z.string().nullish(),
  codes: z.array(z.string()),
  legacy_codes: z.array(z.string()).nullish(),
  note: z.string().nullish(),
});

const CatalogResponseSchema = z.object({ data: z.array(CountrySummarySchema) });

const TypeSchema = z.object({
  key: z.string(),
  name: z.string().nullish(),
  is_default: z.boolean().nullish(),
  example: PlateSchema.nullish(),
});

const CountryResponseSchema = z.object({
  data: CountrySummarySchema.extend({
    standard: z.string().nullish(),
    description: z.string().nullish(),
    regions: z.array(RegionSchema).nullish(),
    types: z.array(TypeSchema).nullish(),
  }),
});

const ValidateResponseSchema = z.object({
  data: z.object({
    valid: z.boolean(),
    number: z.string().nullish(),
    region: z.string().nullish(),
    region_name: z.string().nullish(),
    region_iso3166_2: z.string().nullish(),
    type: z.string().nullish(),
    image: z.object({ svg: z.string(), png: z.string() }).nullish(),
  }),
});

const countryCode = z.string().length(2).describe("ISO 3166-1 alpha-2 country code, e.g. RU.");
const plateType = z
  .string()
  .optional()
  .describe(
    "Plate type key from get_license_plate_country, e.g. on Russian plates diplomatic (red), police (blue), military (black), taxi_bus (yellow). Default: the country's standard plate."
  );
const locale = z
  .enum(["en", "ru", "de", "es", "fr", "pt", "tr"])
  .optional()
  .describe("Language of country and region names. Default en.");

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

/** 422 invalid_type from the API — tell the agent where the valid keys are. */
function unknownType(country: string, type: string) {
  return text(`Unknown plate type "${type}" for ${country.toUpperCase()}. Call get_license_plate_country to see the type keys.`, true);
}

function unreadable(what: string, url: string) {
  // «Не разобрал ответ» — не то же, что «данных нет»: отдаём ссылку для проверки.
  return text(`Could not read the ${what}. Check ${url} directly.`, true);
}

export const listLicensePlateCountriesInput = { locale };

export async function listLicensePlateCountries({ locale }: { locale?: string }) {
  const raw = await apiGet("/api/plates", { locale: locale ?? "en" });
  const parsed = CatalogResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return unreadable("license plate country list", `${BASE_URL}/api/plates`);
  }

  const lines = parsed.data.data.map(
    (c) => `- ${c.country_name ?? c.country_code} (${c.country_code}${c.intl_code ? `, ${c.intl_code}` : ""}) — ${c.regions_count ?? 0} regions, example ${c.example?.formatted ?? "—"}`
  );

  return text(`License plates available for ${lines.length} countries:\n${lines.join("\n")}${ATTRIBUTION_FOOTER}`);
}

export const getLicensePlateCountryInput = { country: countryCode, locale };

export async function getLicensePlateCountry({ country, locale }: { country: string; locale?: string }) {
  const code = country.toLowerCase();
  const raw = await apiGet(`/api/plates/${code}`, { locale: locale ?? "en" });
  const parsed = CountryResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return unreadable(`license plate data for ${country}`, `${BASE_URL}/api/plates/${code}`);
  }

  const c = parsed.data.data;
  const types = (c.types ?? []).map(
    (t) => `- ${t.key}${t.is_default ? " (default)" : ""}: ${t.name ?? t.key}${t.example?.formatted ? `, e.g. ${t.example.formatted}` : ""}`
  );
  const regions = (c.regions ?? []).map(
    (r) => `- ${r.name}: ${r.codes.join(", ") || "—"}${r.legacy_codes?.length ? ` (former: ${r.legacy_codes.join(", ")})` : ""}`
  );

  return text(
    [
      `${c.country_name ?? c.country_code} license plates${c.intl_code ? ` (international code ${c.intl_code})` : ""}`,
      c.standard ? `Standard: ${c.standard}` : null,
      c.size_mm ? `Size: ${c.size_mm.join(" × ")} mm` : null,
      c.description ?? null,
      c.example?.image ? `Example ${c.example.formatted}: ${c.example.image.svg}` : null,
      types.length > 1 ? `Plate types (pass the key as type to check_license_plate / get_license_plate_image):\n${types.join("\n")}` : null,
      regions.length ? `Region codes (${regions.length} regions):\n${regions.join("\n")}` : "The region is not shown on plates of this country.",
      c.url ? `More: ${c.url}` : null,
    ]
      .filter(Boolean)
      .join("\n") + ATTRIBUTION_FOOTER
  );
}

export const checkLicensePlateInput = {
  country: countryCode,
  number: z.string().describe("Plate number without the region, e.g. A123BC. Look-alike Latin letters are normalized."),
  region: z.string().optional().describe("Region code if the country shows one, e.g. 77."),
  type: plateType,
  locale,
};

export async function checkLicensePlate({
  country,
  number,
  region,
  type,
  locale,
}: {
  country: string;
  number: string;
  region?: string;
  type?: string;
  locale?: string;
}) {
  const code = country.toLowerCase();
  let raw: unknown;
  try {
    raw = await apiGet(`/api/plates/${code}/validate`, { number, region, type, locale: locale ?? "en" });
  } catch (error) {
    if (type && error instanceof OpenVanApiError && (error.body as { error?: string } | null)?.error === "invalid_type") {
      return unknownType(country, type);
    }
    throw error;
  }
  const parsed = ValidateResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return unreadable("plate validation", `${BASE_URL}/api/plates/${code}/validate`);
  }

  const v = parsed.data.data;
  const plate = [v.number, v.region].filter(Boolean).join(" ");

  return text(
    [
      v.valid
        ? `${plate} is a valid ${country.toUpperCase()} plate format${v.type ? ` (type ${v.type})` : ""}.`
        : `${plate} does not match the ${country.toUpperCase()} plate format${v.type ? ` for type ${v.type}` : ""}.`,
      v.region_name ? `Region code ${v.region} = ${v.region_name}${v.region_iso3166_2 ? ` (${v.region_iso3166_2})` : ""}. The code shows where the vehicle was registered, not the owner or where it is now.` : null,
      v.image ? `Image: ${v.image.svg}` : null,
    ]
      .filter(Boolean)
      .join("\n") + ATTRIBUTION_FOOTER
  );
}

export const getLicensePlateImageInput = {
  country: countryCode,
  number: z.string().describe("Plate number without the region, or any text with custom=true."),
  region: z.string().optional().describe("Region code if the country shows one."),
  type: plateType,
  custom: z.boolean().optional().describe("Draw any text (e.g. a name) in the plate layout instead of requiring a real format."),
};

export async function getLicensePlateImage({
  country,
  number,
  region,
  type,
  custom,
}: {
  country: string;
  number: string;
  region?: string;
  type?: string;
  custom?: boolean;
}) {
  const base = new URL(`/api/plates/${country.toLowerCase()}/`, BASE_URL);
  const query = new URLSearchParams({ number, source: SOURCE_TAG });
  if (region) query.set("region", region);
  if (type) query.set("type", type);
  if (custom) query.set("custom", "1");

  const svgUrl = new URL(`plate.svg?${query}`, base).toString();
  const pngUrl = new URL(`plate.png?${query}&width=800`, base).toString();
  const response = await fetch(pngUrl, { headers: { "User-Agent": USER_AGENT } });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (type && body?.error === "invalid_type") return unknownType(country, type);

    const reason =
      response.status === 422
        ? `The number does not match the country format${type ? ` for type ${type} (each type has its own format; get_license_plate_country shows an example)` : ""} — pass custom=true to draw any text.`
        : response.status === 403
          ? "Plate images of this country are not available (typeface license)."
          : `HTTP ${response.status}.`;

    return text(`No plate image: ${reason}`, true);
  }

  const png = Buffer.from(await response.arrayBuffer()).toString("base64");

  return {
    content: [
      { type: "image" as const, data: png, mimeType: "image/png" },
      { type: "text" as const, text: `SVG: ${svgUrl}\nPNG: ${pngUrl}${ATTRIBUTION_FOOTER}` },
    ],
  };
}
