import { z } from "zod";
import { apiGet } from "../client.js";
import { SITE } from "../ui/bridge.js";

const RatesResponseSchema = z.object({
  success: z.boolean().optional(),
  rates: z.record(z.string(), z.number()),
  updated_at: z.string().optional(),
  meta: z.object({ updated_at: z.string().optional() }).passthrough().optional(),
});

export const getCurrencyRateInput = {
  from: z
    .string()
    .length(3)
    .describe("Source currency ISO 4217 code, e.g. EUR."),
  to: z
    .string()
    .length(3)
    .describe("Target currency ISO 4217 code, e.g. USD."),
  amount: z
    .number()
    .positive()
    .default(1)
    .describe("Amount to convert. Default 1."),
};

export async function getCurrencyRate({
  from,
  to,
  amount,
}: {
  from: string;
  to: string;
  amount: number;
}) {
  const raw = await apiGet("/api/currency/rates");
  const parsed = RatesResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "Currency rates unavailable." }],
      isError: true,
    };
  }

  const rates = parsed.data.rates;
  const updatedAt = parsed.data.meta?.updated_at ?? parsed.data.updated_at;
  // API returns rates relative to EUR. Compute cross-rate via EUR.
  const upperFrom = from.toUpperCase();
  const upperTo = to.toUpperCase();
  const fromRate = upperFrom === "EUR" ? 1 : rates[upperFrom];
  const toRate = upperTo === "EUR" ? 1 : rates[upperTo];

  if (!fromRate || !toRate) {
    const missing = !fromRate ? upperFrom : upperTo;
    return {
      content: [{ type: "text" as const, text: `Currency "${missing}" not found in rates table.` }],
      isError: true,
    };
  }

  const converted = (amount / fromRate) * toRate;
  const rate = toRate / fromRate;

  return {
    content: [
      {
        type: "text" as const,
        text: `${amount.toFixed(2)} ${upperFrom} = ${converted.toFixed(2)} ${upperTo}\n(1 ${upperFrom} = ${rate.toFixed(6)} ${upperTo}, updated ${updatedAt ?? "recently"})`,
      },
    ],
    structuredContent: {
      from: upperFrom,
      to: upperTo,
      amount,
      rate,
      converted,
      updated_at: updatedAt ?? null,
      url: `${SITE}/en/tools/currency-converter`,
      source: "OpenVan.camp (CC BY 4.0)",
    },
  };
}
