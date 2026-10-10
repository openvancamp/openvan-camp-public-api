import { z } from "zod";
import { apiGet } from "../client.js";
import { countryRef } from "../countries.js";
import { SITE } from "../ui/bridge.js";

const FuelCountrySchema = z.object({
  country_code: z.string(),
  country_name: z.string(),
  region: z.string().nullable().optional(),
  currency: z.string(),
  // Валюта каждого грейда: страновая currency — валюта первой строки, а в Венесуэле
  // дизель в USD, бензин в VES. Без этой карты 428 VES считались как 428 USD.
  currencies: z.record(z.string(), z.string()).optional(),
  unit: z.string(),
  // Единица каждого грейда: страновая unit — запасная. В Колумбии страна «liter», а бензин
  // и дизель за галлон; газ бывает за kg или m3. Без этой карты цена за галлон шла как литровая.
  units: z.record(z.string(), z.string()).optional(),
  prices: z
    .record(z.string(), z.number().nullable())
    .optional(),
  fetched_at: z.string().nullable().optional(),
  sources: z.array(z.string()).optional(),
});

const FuelResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.record(z.string(), FuelCountrySchema),
});

const RatesResponseSchema = z.object({
  rates: z.record(z.string(), z.number()),
  updated_at: z.string().optional(),
  meta: z.object({ updated_at: z.string().optional() }).passthrough().optional(),
});

type FuelCountry = z.infer<typeof FuelCountrySchema>;

/** Валюта конкретного грейда, со страновой как запасной. */
function currencyOf(c: FuelCountry, fuelType: string): string {
  return c.currencies?.[fuelType] ?? c.currency;
}

/** Единица конкретного грейда (liter, gallon, imperial_gallon, kg, m3), со страновой как запасной. */
function unitOf(c: FuelCountry, fuelType: string): string {
  return c.units?.[fuelType] ?? c.unit;
}

const FUEL_TYPES = [
  "gasoline_regular",
  "gasoline",
  "gasoline_premium",
  "gasoline_super",
  "diesel_regular",
  "diesel",
  "diesel_premium",
  "lpg",
  "cng",
  "e85",
  "kerosene",
  "premium",
] as const;

type FuelType = (typeof FUEL_TYPES)[number];

const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  gasoline_regular: "Gasoline regular",
  gasoline: "Gasoline",
  gasoline_premium: "Gasoline premium",
  gasoline_super: "Gasoline super",
  diesel_regular: "Diesel regular",
  diesel: "Diesel",
  diesel_premium: "Diesel premium",
  lpg: "LPG",
  cng: "CNG",
  e85: "E85",
  kerosene: "Kerosene",
  premium: "Premium",
};

// ------------------------------------------------------------------
// Currency normalization (shared by compare_* and find_cheapest_*)
// ------------------------------------------------------------------

/**
 * Convert a price in local currency to EUR using openvan.camp currency rates.
 * Rates are quoted as "units of CCC per 1 EUR", so:
 *   price_eur = price_local / rate[CCC]
 *
 * Returns NaN if the currency isn't in the rates table — caller decides
 * whether to fall back to raw sort or drop the row.
 */
function toEur(
  priceLocal: number | null | undefined,
  currency: string,
  rates: Record<string, number>
): number {
  if (priceLocal == null) return NaN;
  const cc = currency.toUpperCase();
  if (cc === "EUR") return priceLocal;
  const rate = rates[cc];
  if (!rate || rate <= 0) return NaN;
  return priceLocal / rate;
}

/**
 * Liters per volume unit. Mirrors FuelGradeCatalog::literFactors() on the server.
 * The imperial gallon (Grenada, Cayman Islands…) is 20% larger than the US one.
 * kg and m3 (LPG/CNG in some countries) are not volume units and are absent.
 */
const LITERS_PER_UNIT: Record<string, number> = {
  liter: 1,
  gallon: 3.78541,
  imperial_gallon: 4.54609,
};

/** Whether the unit is a volume unit (price comparable per liter). */
function isVolumetric(unit: string): boolean {
  return LITERS_PER_UNIT[unit] !== undefined;
}

/**
 * Normalize an EUR price (expressed in the grade's native unit) to EUR per
 * liter, so gallon-priced and liter-priced countries can be sorted and
 * compared on the same scale. Returns NaN if the input is NaN or the unit is
 * not a volume unit (gas priced per kg or m3 cannot be compared per liter).
 */
function toEurPerLiter(priceEur: number, unit: string): number {
  if (isNaN(priceEur) || !isVolumetric(unit)) return NaN;
  return priceEur / LITERS_PER_UNIT[unit];
}

async function fetchFuelAndRates() {
  const [fuelRaw, ratesRaw] = await Promise.all([
    apiGet("/api/fuel/prices"),
    apiGet("/api/currency/rates"),
  ]);
  const fuel = FuelResponseSchema.parse(fuelRaw);
  const rates = RatesResponseSchema.safeParse(ratesRaw);
  return {
    fuel,
    rates: rates.success ? rates.data.rates : {},
    ratesUpdatedAt: rates.success ? (rates.data.meta?.updated_at ?? rates.data.updated_at) : undefined,
  };
}

// ------------------------------------------------------------------
// Данные для карточки (structuredContent)
// ------------------------------------------------------------------

const SOURCE = "OpenVan.camp (CC BY 4.0)";

/** Курсы «единиц за 1 EUR» только для нужных карточке валют: она пересчитывает сама. */
function ratesFor(currencies: string[], rates: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { EUR: 1 };
  for (const c of new Set([...currencies.map((x) => x.toUpperCase()), "USD"])) {
    if (rates[c]) out[c] = rates[c];
  }
  return out;
}

const finite = (v: number): number | null => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null);

async function fuelPageUrl(code?: string): Promise<string> {
  const ref = code ? await countryRef(code) : null;
  return ref ? `${SITE}/en/tools/fuel-prices/${ref.slug}` : `${SITE}/en/tools/fuel-prices`;
}

// ------------------------------------------------------------------
// get_fuel_prices
// ------------------------------------------------------------------

export const getFuelPricesInput = {
  country_code: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 country code, e.g. DE. If omitted, returns all countries."),
};

export async function getFuelPrices({
  country_code,
}: {
  country_code?: string;
}) {
  const { fuel, rates } = await fetchFuelAndRates();

  if (country_code) {
    const upper = country_code.toUpperCase();
    const entry = fuel.data[upper];
    if (!entry) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No fuel price data for country code "${upper}". Try one of: ${Object.keys(fuel.data).slice(0, 10).join(", ")}...`,
          },
        ],
        isError: true,
      };
    }
    const grades = FUEL_TYPES.filter((ft) => entry.prices?.[ft] != null).map((ft) => ({
      type: ft,
      price: entry.prices![ft] as number,
      currency: currencyOf(entry, ft),
      unit: unitOf(entry, ft),
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: formatCountry(entry, rates),
        },
      ],
      structuredContent: {
        mode: "country",
        country: { code: entry.country_code, name: entry.country_name },
        local_currency: entry.currency,
        grades,
        rates: ratesFor(grades.map((g) => g.currency), rates),
        updated_at: entry.fetched_at ?? null,
        sources: entry.sources ?? [],
        url: await fuelPageUrl(entry.country_code),
        source: SOURCE,
      },
    };
  }

  const perLiter = (c: FuelCountry, ft: string) => finite(toEurPerLiter(toEur(c.prices?.[ft], currencyOf(c, ft), rates), unitOf(c, ft)));
  const overview = Object.values(fuel.data)
    .slice(0, 20)
    .map((c) => ({ code: c.country_code, name: c.country_name, diesel_eur_per_liter: perLiter(c, "diesel"), gasoline_eur_per_liter: perLiter(c, "gasoline") }));
  const summary = Object.values(fuel.data)
    .slice(0, 20)
    .map((c) => formatCountryRow(c, rates))
    .join("\n");
  return {
    content: [
      {
        type: "text" as const,
        text: `Fuel prices (showing 20 of ${Object.keys(fuel.data).length} countries, local units; ≈ EUR per liter in brackets):\n\n${summary}\n\nPass country_code to get detailed data for one country.`,
      },
    ],
    structuredContent: { mode: "overview", rows: overview, rates: ratesFor([], rates), url: await fuelPageUrl(), source: SOURCE },
  };
}

function formatCountry(c: FuelCountry, rates: Record<string, number>): string {
  const prices = c.prices ?? {};
  const used = new Set(Object.values(c.currencies ?? {}));
  const headerCurrency = used.size > 1 ? "mixed currencies" : c.currency;
  const isEur = headerCurrency.toUpperCase() === "EUR";
  const lines = [
    `${c.country_name} (${c.country_code}) — prices in local units, ${headerCurrency}${isEur ? "" : " (≈ EUR per liter shown in brackets)"}`,
  ];
  FUEL_TYPES.forEach((fuelType) => {
    const cur = currencyOf(c, fuelType);
    lines.push(`  ${FUEL_TYPE_LABELS[fuelType].padEnd(17)} ${fmtPair(prices[fuelType], cur, unitOf(c, fuelType), rates, cur.toUpperCase() === "EUR")}`);
  });
  if (c.fetched_at) lines.push(`  Updated:  ${c.fetched_at}`);
  if (c.sources?.length) lines.push(`  Sources:  ${c.sources.join(", ")}`);
  return lines.join("\n");
}

function formatCountryRow(c: FuelCountry, rates: Record<string, number>): string {
  const p = c.prices ?? {};
  const pair = (t: string) => {
    const cur = currencyOf(c, t);
    return fmtPair(p[t], cur, unitOf(c, t), rates, cur.toUpperCase() === "EUR");
  };
  const diesel = pair("diesel");
  const gasoline = pair("gasoline");
  const lpg = pair("lpg");
  return `${c.country_code}  ${c.country_name.padEnd(25)}  diesel=${diesel}  gas=${gasoline}  lpg=${lpg}`;
}

function fmtPair(
  v: number | null | undefined,
  currency: string,
  unit: string,
  rates: Record<string, number>,
  isEur: boolean
): string {
  if (v == null) return "—";
  const local = `${v.toFixed(3)} ${currency}/${unit}`;
  if (!isVolumetric(unit)) {
    const eurPerUnit = toEur(v, currency, rates);
    return isEur || isNaN(eurPerUnit) ? local : `${local} (≈${eurPerUnit.toFixed(3)} EUR/${unit})`;
  }
  if (isEur && unit === "liter") return local;
  const eurPerLiter = toEurPerLiter(toEur(v, currency, rates), unit);
  if (isNaN(eurPerLiter)) return local;
  return `${local} (≈${eurPerLiter.toFixed(3)} EUR/liter)`;
}

function fmt(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(3);
}

// ------------------------------------------------------------------
// compare_fuel_prices — sorts by EUR-normalized price
// ------------------------------------------------------------------

export const compareFuelPricesInput = {
  country_codes: z
    .array(z.string().length(2))
    .min(2)
    .max(10)
    .describe("Array of 2-10 ISO 3166-1 alpha-2 country codes to compare."),
  fuel_type: z
    .enum(FUEL_TYPES)
    .default("diesel")
    .describe("Fuel type to compare. e.g. gasoline, diesel, lpg, cng, e85."),
};

export async function compareFuelPrices({
  country_codes,
  fuel_type,
}: {
  country_codes: string[];
  fuel_type: FuelType;
}) {
  const { fuel, rates, ratesUpdatedAt } = await fetchFuelAndRates();

  type Row = {
    c: FuelCountry;
    cur: string;
    priceLocal: number | null | undefined;
    priceEur: number; // EUR in the country's native unit; NaN if conversion unavailable
    unit: string; // native unit of this grade (liter, gallon, imperial_gallon, kg, m3)
    priceEurPerLiter: number; // EUR per liter — normalized basis for sorting/comparison; NaN for kg/m3
  };

  const rows: Row[] = country_codes
    .map((cc) => fuel.data[cc.toUpperCase()])
    .filter((c): c is FuelCountry => Boolean(c))
    .map((c) => {
      const priceLocal = c.prices?.[fuel_type];
      const cur = currencyOf(c, fuel_type);
      const priceEur = toEur(priceLocal, cur, rates);
      return {
        c,
        cur,
        priceLocal,
        priceEur,
        unit: unitOf(c, fuel_type),
        priceEurPerLiter: toEurPerLiter(priceEur, unitOf(c, fuel_type)),
      };
    })
    .filter((r) => r.priceLocal != null);

  if (rows.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "None of the requested country codes have data for this fuel type.",
        },
      ],
      isError: true,
    };
  }

  // Sort by EUR-per-liter so gallon-priced countries (US, EC, DO, HN, SV)
  // compare on the same scale as liter-priced ones. Rows with NaN (currency
  // not in rates table) go to the bottom and are flagged.
  rows.sort((a, b) => {
    const aBad = isNaN(a.priceEurPerLiter);
    const bBad = isNaN(b.priceEurPerLiter);
    if (aBad && !bBad) return 1;
    if (!aBad && bBad) return -1;
    if (aBad && bBad) return 0;
    return a.priceEurPerLiter - b.priceEurPerLiter;
  });

  const table = rows
    .map((r) => {
      const isEur = r.cur.toUpperCase() === "EUR";
      const local = `${fmt(r.priceLocal)} ${r.cur}/${r.unit}`;
      if (isEur && r.unit === "liter") {
        return `  ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ${local}`;
      }
      if (isNaN(r.priceEur)) {
        return `  ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ${local}  (⚠️ currency not in rates table)`;
      }
      if (!isVolumetric(r.unit)) {
        return `  ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ${local}  (priced per ${r.unit} — not comparable per liter)`;
      }
      return `  ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ${local}  ≈ ${r.priceEurPerLiter.toFixed(3)} EUR/liter`;
    })
    .join("\n");

  const cheapest = rows[0];
  const cheapestLine = isNaN(cheapest.priceEurPerLiter)
    ? `Cheapest (by local price only, EUR conversion unavailable): ${cheapest.c.country_name} at ${fmt(cheapest.priceLocal)} ${cheapest.cur}/${cheapest.unit}.`
    : `Cheapest: ${cheapest.c.country_name} at ≈ ${cheapest.priceEurPerLiter.toFixed(3)} EUR/liter${cheapest.cur.toUpperCase() !== "EUR" ? ` (${fmt(cheapest.priceLocal)} ${cheapest.cur}/${cheapest.unit})` : ""}.`;

  const footer = ratesUpdatedAt ? `\nCurrency rates: openvan.camp (updated ${ratesUpdatedAt}).` : "";

  return {
    content: [
      {
        type: "text" as const,
        text: `${fuel_type} price comparison (cheapest first, sorted by EUR per liter):\n\n${table}\n\n${cheapestLine}${footer}`,
      },
    ],
    structuredContent: {
      mode: "ranking",
      kind: "compare",
      fuel_type,
      rows: rows.map(rankingRow),
      rates: ratesFor([], rates),
      updated_at: ratesUpdatedAt ?? null,
      url: await fuelPageUrl(),
      source: SOURCE,
    },
  };
}

// ------------------------------------------------------------------
// find_cheapest_fuel — sorts by EUR-normalized price across a region
// ------------------------------------------------------------------

export const findCheapestFuelInput = {
  region: z
    .enum(["europe", "asia", "africa", "north_america", "south_america", "oceania", "world"])
    .default("world")
    .describe("Region to search. Default: world (all countries)."),
  fuel_type: z
    .enum(FUEL_TYPES)
    .default("diesel")
    .describe("Fuel type. e.g. gasoline, diesel, lpg, cng, e85."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("How many cheapest countries to return."),
};

export async function findCheapestFuel({
  region,
  fuel_type,
  limit,
}: {
  region: "europe" | "asia" | "africa" | "north_america" | "south_america" | "oceania" | "world";
  fuel_type: FuelType;
  limit: number;
}) {
  const { fuel, rates, ratesUpdatedAt } = await fetchFuelAndRates();

  const rows = Object.values(fuel.data)
    .filter((c) => region === "world" || c.region === region)
    .map((c) => {
      const priceLocal = c.prices?.[fuel_type];
      const cur = currencyOf(c, fuel_type);
      const priceEur = toEur(priceLocal, cur, rates);
      return {
        c,
        cur,
        priceLocal,
        priceEur,
        unit: unitOf(c, fuel_type),
        priceEurPerLiter: toEurPerLiter(priceEur, unitOf(c, fuel_type)),
      };
    })
    .filter((r) => r.priceLocal != null && !isNaN(r.priceEurPerLiter))
    .sort((a, b) => a.priceEurPerLiter - b.priceEurPerLiter)
    .slice(0, limit);

  if (rows.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No ${fuel_type} data available for region "${region}" (or all matching countries use currencies not in the rates table).`,
        },
      ],
      isError: true,
    };
  }

  const table = rows
    .map((r, i) => {
      const isEur = r.cur.toUpperCase() === "EUR";
      const local = `${fmt(r.priceLocal)} ${r.cur}/${r.unit}`;
      if (isEur && r.unit === "liter") {
        return `  ${i + 1}. ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ${local}`;
      }
      return `  ${i + 1}. ${r.c.country_code}  ${r.c.country_name.padEnd(25)}  ≈ ${r.priceEurPerLiter.toFixed(3)} EUR/liter  (${local})`;
    })
    .join("\n");

  const footer = ratesUpdatedAt ? `\n\nSorted by EUR per liter. Currency rates: openvan.camp (updated ${ratesUpdatedAt}).` : "";

  return {
    content: [
      {
        type: "text" as const,
        text: `Cheapest ${fuel_type} in ${region}:\n\n${table}${footer}`,
      },
    ],
    structuredContent: {
      mode: "ranking",
      kind: "cheapest",
      fuel_type,
      region,
      rows: rows.map(rankingRow),
      rates: ratesFor([], rates),
      updated_at: ratesUpdatedAt ?? null,
      url: await fuelPageUrl(),
      source: SOURCE,
    },
  };
}

/** Строка рейтинга для карточки: местная цена + EUR за литр (null — газ за кг/м³ или нет курса). */
function rankingRow(r: { c: FuelCountry; cur: string; priceLocal: number | null | undefined; unit: string; priceEurPerLiter: number }) {
  return {
    code: r.c.country_code,
    name: r.c.country_name,
    price: r.priceLocal ?? null,
    currency: r.cur,
    unit: r.unit,
    eur_per_liter: finite(r.priceEurPerLiter),
  };
}
