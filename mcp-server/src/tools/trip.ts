import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { z } from "zod";

import { apiGet, apiPost, OpenVanApiError } from "../client.js";
import { ATTRIBUTION_FOOTER } from "../config.js";
import { SITE } from "../ui/bridge.js";

/**
 * plan_road_trip — сводка поездки = роудбук OpenVan.
 *
 * Своего расчёта здесь нет. Инструмент делает то же, что человек в мастере роудбука:
 *  1. POST /api/roadbook/from-places — сайт находит места и создаёт роудбук
 *     (RoadbookFactory, одинаковый маршрут переиспользуется);
 *  2. ждёт, пока очередь достроит маршрут (/status);
 *  3. берёт данные роудбука (/payload) и визовые правила тем же запросом, что страница;
 *  4. запускает buildPlan из resources/js/roadbook/plan.js — тот же модуль, что на
 *     странице, — в отдельном потоке (src/engine/plan-worker.ts).
 * Поэтому любая правка логики роудбука сразу меняет и ответ инструмента.
 */

const LOCALE = z.enum(["en", "ru", "de", "fr", "es", "pt", "tr"]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** Сколько ждём сборку маршрута; дольше — отдаём ссылку, повторный вызов заберёт готовое. */
const BUILD_WAIT_MS = 45_000;

export const planRoadTripInput = {
  waypoints: z
    .array(z.string().min(1).max(120))
    .min(2)
    .max(10)
    .describe('2-10 places in travel order: cities or countries (a country means its capital), e.g. ["Munich", "Venice"].'),
  passports: z
    .string()
    .optional()
    .describe("Passports of the travellers, comma separated ISO alpha-2 codes, e.g. RU or DE,RU. Enables visa terms and the Schengen counter."),
  plates: z.string().length(2).optional().describe("Country of the vehicle's plates, ISO alpha-2 (entry bans and green card depend on it)."),
  weight: z.enum(["le35", "gt35"]).optional().describe("Vehicle weight: le35 (up to 3.5 t) or gt35."),
  vehicle_class: z
    .enum(["car", "van", "heavy"])
    .default("van")
    .describe("car; van = campervan/motorhome up to 3.5 t (default); heavy = over 3.5 t."),
  fuel: z.string().optional().describe("Fuel, e.g. diesel, gasoline, lpg."),
  consumption: z.number().min(1).max(60).optional().describe("Consumption, litres per 100 km."),
  tank: z.number().min(10).max(2000).optional().describe("Tank volume, litres."),
  start_date: IsoDate.optional().describe("Departure date, YYYY-MM-DD. Enables holidays, weather by day and visa deadlines."),
  hours_per_day: z.number().int().min(3).max(12).optional().describe("Driving hours per day for the day-by-day plan. Default 6."),
  round_trip: z.boolean().optional().describe("Return to the start along the same route."),
  avoid_tolls: z.boolean().optional().describe("Route avoiding toll roads."),
  currency: z.string().length(3).optional().describe("Currency of the budget, ISO 4217. Default EUR."),
  locale: LOCALE.optional().describe("Language of the conversation with the user. Pass it whenever the user writes in one of these languages."),
};

type Args = {
  waypoints: string[];
  passports?: string;
  plates?: string;
  weight?: "le35" | "gt35";
  vehicle_class: "car" | "van" | "heavy";
  fuel?: string;
  consumption?: number;
  tank?: number;
  start_date?: string;
  hours_per_day?: number;
  round_trip?: boolean;
  avoid_tolls?: boolean;
  currency?: string;
  locale?: string;
};

/**
 * Движок плана: живой модуль из репозитория сайта (развёрнутый сервер), иначе копия,
 * собранная в пакет (npm run sync-engine). OPENVAN_ROADBOOK_ENGINE — явный путь.
 */
function enginePath(): string {
  const candidates = [
    process.env.OPENVAN_ROADBOOK_ENGINE,
    fileURLToPath(new URL("../../../resources/js/roadbook/plan.js", import.meta.url)),
    fileURLToPath(new URL("../../engine/roadbook/plan.js", import.meta.url)),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Roadbook engine not found");
  return found;
}

type RoadbookTextsResponse = {
  texts: Record<string, unknown>;
  typical_cons?: number;
  typical_fuel?: string;
  build_steps?: Record<string, string>;
  building_title?: string;
};
const textsCache = new Map<string, { at: number; data: RoadbookTextsResponse }>();

/** Тексты роудбука и «типичный кемпер» сайта (RoadbookShowcase::TYPICAL_CONS) — один запрос, кеш на час. */
async function roadbookTexts(locale: string): Promise<RoadbookTextsResponse> {
  const hit = textsCache.get(locale);
  if (hit && Date.now() - hit.at < 3600_000) return hit.data;
  const data = await apiGet<RoadbookTextsResponse>(`/api/roadbook/texts/${locale}`);
  textsCache.set(locale, { at: Date.now(), data });
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function runPlan(data: Record<string, unknown>): Promise<{ ok: boolean; summary?: Summary; error?: string }> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("../engine/plan-worker.js", import.meta.url), { workerData: data });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: "plan timeout" });
    }, 15_000);
    worker.once("message", (m) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(m);
    });
    worker.once("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
  });
}

type Summary = {
  distance_km: number | null;
  hours: number | null;
  drive_days: number | null;
  trip_days: number | null;
  first_day: string | null;
  end_date: string | null;
  currency: string;
  totals: { fuel: number | null; tolls: number | null; vignettes: number | null; ferries: number | null; total: number | null; fuel_unknown: boolean; roads_unknown: string[] } | null;
  alert: { s: string; title: string; text: string } | null;
  countries: Array<{ cc: string; name: string; km: number | null; cost: number | null; rows: Array<{ key: string; s: string; big: string | null; lines: string[] }> }>;
  nights: Array<{ day: number; city: string | null; cc: string | null; km: number | null; date: string | null }>;
  schengen: { used: number; left: number; over: boolean } | null;
  terms: Array<{ names: string[]; you: string; car: string; you_bad: boolean; car_bad: boolean }>;
  checklist: Array<{ id: string; items: Array<{ t: string; s: string }> }>;
  weather_window: { date: string | null; t: number | null } | null;
};

/**
 * Входные данные роудбука из аргументов инструмента. Одна функция для plan_road_trip и
 * для опроса хода сборки из карточки: одинаковые входы → тот же роудбук (inputs_hash),
 * поэтому карточка показывает ход сборки ровно того роудбука, который ждёт инструмент.
 * Машина не указана — как мастер и витрина роудбука: «типичный кемпер» сайта.
 */
function tripInputs(args: Args, rb: RoadbookTextsResponse, currency: string) {
  const travelers = (args.passports ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
  const assumed = { cons: args.consumption == null, fuel: args.fuel == null };
  const fuel = args.fuel ?? rb.typical_fuel ?? "diesel";
  const consumption = args.consumption ?? rb.typical_cons ?? 10;
  const inputs: Record<string, unknown> = {
    travelers,
    plates: args.plates?.toUpperCase(),
    weight: args.weight ?? (args.vehicle_class === "heavy" ? "gt35" : undefined),
    vehicle_class: args.vehicle_class ?? "van",
    fuel,
    cons: consumption,
    tank: args.tank,
    date: args.start_date,
    hpd: args.hours_per_day,
    round: args.round_trip,
    avoid_tolls: args.avoid_tolls,
    currency,
  };
  return { inputs, fuel, consumption, assumed };
}

/** Статус сборки: один запрос к API на роудбук раз в секунду, сколько бы его ни опрашивали. */
const statusCache = new Map<string, { at: number; p: Promise<{ status: string; progress?: Record<string, unknown> | null }> }>();
function roadbookStatus(code: string) {
  const hit = statusCache.get(code);
  if (hit && Date.now() - hit.at < 1000) return hit.p;
  const p = apiGet<{ status: string; progress?: Record<string, unknown> | null }>(`/api/roadbook/${code}/status`);
  statusCache.set(code, { at: Date.now(), p });
  if (statusCache.size > 500) statusCache.clear();
  return p;
}

const createRoadbook = (args: Args, locale: string, inputs: Record<string, unknown>) =>
  apiPost<{ code: string; url: string; status: string; points: Array<{ name: string; country_code: string | null }> }>(
    "/api/roadbook/from-places",
    { places: args.waypoints, name: args.waypoints.join(" — ").slice(0, 80), locale, inputs }
  );

// ------------------------------------------------------------------
// get_roadbook_build_status — только для карточки: ход сборки, как экран роудбука
// ------------------------------------------------------------------

export const roadbookBuildStatusInput = {
  ...planRoadTripInput,
  waypoints: planRoadTripInput.waypoints.optional(),
  code: z.string().regex(/^[a-z0-9]{5}$/).optional().describe("Roadbook code from a previous call."),
};

export async function getRoadbookBuildStatus(args: Partial<Args> & { code?: string }) {
  const locale = args.locale ?? "en";
  const rb = await roadbookTexts(locale);
  let code = args.code;
  let url: string | null = null;
  if (!code) {
    if (!args.waypoints?.length) {
      return { content: [{ type: "text" as const, text: "Pass code or waypoints." }], isError: true };
    }
    const full = { vehicle_class: "van", ...args } as Args;
    const { inputs } = tripInputs(full, rb, (args.currency ?? "EUR").toUpperCase());
    const created = await createRoadbook(full, locale, inputs);
    code = created.code;
    url = `${SITE}${created.url}`;
  }
  const st = await roadbookStatus(code).catch(() => ({ status: "pending", progress: null }));
  return {
    content: [{ type: "text" as const, text: `Roadbook ${code}: ${st.status}` }],
    structuredContent: {
      mode: "building",
      code,
      url,
      status: st.status,
      progress: st.progress ?? null,
      steps: rb.build_steps ?? null,
      title: rb.building_title ?? null,
    },
  };
}

export async function planRoadTrip(args: Args) {
  const locale = args.locale ?? "en";
  const currency = (args.currency ?? "EUR").toUpperCase();
  const rb = await roadbookTexts(locale);
  const { inputs, fuel, consumption, assumed } = tripInputs(args, rb, currency);

  // 1. Роудбук — тем же путём, что мастер на сайте.
  let created: { code: string; url: string; status: string; points: Array<{ name: string; country_code: string | null }> };
  try {
    created = await createRoadbook(args, locale, inputs);
  } catch (e) {
    const body = (e instanceof OpenVanApiError ? e.body : null) as { message?: string; error?: string } | null;
    return { content: [{ type: "text" as const, text: `The trip could not be planned: ${body?.message ?? body?.error ?? "error"}. Add a country to an ambiguous place name.` }], isError: true };
  }
  const roadbookUrl = `${SITE}${created.url}`;

  // 2. Сборка маршрута идёт в очереди.
  let status = created.status;
  const deadline = Date.now() + BUILD_WAIT_MS;
  while (status !== "ready" && status !== "failed" && Date.now() < deadline) {
    await sleep(1500);
    status = (await roadbookStatus(created.code).catch(() => ({ status }))).status;
  }
  if (status === "failed") {
    return { content: [{ type: "text" as const, text: `No road route between these places (sea crossing, closed border or no road network). Roadbook: ${roadbookUrl}` }], isError: true };
  }
  if (status !== "ready") {
    return {
      content: [{ type: "text" as const, text: `The roadbook is still being built (long routes take up to a minute): ${roadbookUrl}. Call plan_road_trip again with the same arguments in a minute — it will return the finished plan.` }],
    };
  }

  // 3. Данные роудбука, тексты и визовые правила — те же, что получает страница.
  const [resp, texts, hazards] = await Promise.all([
    apiGet<{ payload: Record<string, unknown> & { route: { countries?: Array<{ cc: string }> }; visaPreload?: { key: string; data: unknown } } }>(`/api/roadbook/${created.code}/payload/${locale}`),
    Promise.resolve(rb.texts),
    // Обстановка у маршрута меняется каждый час — страница тоже берёт её отдельно (page.js).
    apiGet<Record<string, unknown>>(`/api/roadbook/${created.code}/hazards`).catch(() => ({ failed: true })),
  ]);
  const payload = resp.payload;
  payload.hazards = hazards;
  const norm = (payload.roadbook as { inputs?: Record<string, unknown> } | undefined)?.inputs ?? inputs;

  // Ключ визового запроса — в том же порядке, что loadVisa() на странице: совпал с visaPreload → готовый ответ.
  const params = new URLSearchParams({ t: [...new Set((payload.route.countries ?? []).map((c) => c.cc))].join(","), locale });
  if (norm.weight) params.set("w", String(norm.weight));
  if (Array.isArray(norm.travelers) && norm.travelers.length) params.set("p", norm.travelers.join(","));
  if (norm.plates) params.set("plate", String(norm.plates));
  let visa: unknown = { legs: [] };
  if (payload.visaPreload && payload.visaPreload.key === params.toString()) {
    visa = payload.visaPreload.data;
  } else {
    const v = await apiGet<{ success?: boolean; data?: unknown }>(`/api/visa/route?${params.toString()}`).catch(() => null);
    if (v?.success && v.data) visa = v.data;
  }

  // 4. План — движком роудбука.
  const result = await runPlan({ enginePath: enginePath(), payload, inputs: norm, visa, texts, locale, currency });
  if (!result.ok || !result.summary) {
    return { content: [{ type: "text" as const, text: `The roadbook is ready, but the plan could not be computed here (${result.error}). Open it: ${roadbookUrl}` }] };
  }
  const s = result.summary;

  // --- текст для модели ---
  const money = (n: number | null) => (n == null ? "—" : `${n} ${s.currency}`);
  const lines: string[] = [
    `Road trip ${args.waypoints.join(" → ")}${args.round_trip ? " and back" : ""}: ${s.distance_km} km, ~${s.hours} h of driving, ${s.drive_days} driving day(s)${s.trip_days ? `, ${s.trip_days} day(s) in total` : ""}${s.first_day ? `, ${s.first_day} – ${s.end_date}` : ""}.`,
  ];
  if (s.totals) {
    lines.push(
      `Budget: fuel ${s.totals.fuel_unknown ? "unknown" : money(s.totals.fuel)}${assumed.cons ? ` (ASSUMED typical camper: ${fuel}, ${consumption} l/100 km — ask the user for their vehicle's consumption and call again)` : ""}, tolls ${money(s.totals.tolls)}, vignettes ${money(s.totals.vignettes)}, ferries ${money(s.totals.ferries)} — total ${s.totals.fuel_unknown ? "without fuel " : ""}${money(s.totals.total)}${s.totals.roads_unknown.length ? ` (no toll data for ${s.totals.roads_unknown.join(", ")})` : ""}.`
    );
  }
  if (s.alert) lines.push("", `MAIN WARNING: ${s.alert.title}. ${s.alert.text}`);
  lines.push("", "Countries:");
  for (const c of s.countries) {
    lines.push(`- ${c.name} (${c.cc}): ${c.km} km${c.cost != null ? `, ≈ ${money(c.cost)}` : ""}`);
    for (const r of c.rows) lines.push(`    ${r.key}: ${r.big ?? ""}${r.lines.length ? ` — ${r.lines.join(" ")}` : ""}`);
  }
  if (s.terms.length) {
    lines.push("", "Time limits:");
    for (const x of s.terms) lines.push(`- ${x.names.join(", ")}: you — ${x.you}; vehicle — ${x.car}`);
  }
  if (s.schengen) lines.push(`Schengen: ${s.schengen.used} of 90 days used by this trip, ${s.schengen.left} left${s.schengen.over ? " — OVER THE LIMIT" : ""}.`);
  if (s.nights.length) lines.push("", `Overnights: ${s.nights.map((n) => `day ${n.day} ${n.city ?? "?"} (${n.km} km)`).join("; ")}.`);
  for (const g of s.checklist) {
    const bad = g.items.filter((i) => i.s === "bad" || i.s === "warn");
    if (bad.length) lines.push(`${g.id}: ${bad.map((i) => i.t).join("; ")}`);
  }
  lines.push("", `Full roadbook (map, day by day, edit and share): ${roadbookUrl}`, "Estimates; visa data is reference only — verify with the consulate.");

  return {
    content: [{ type: "text" as const, text: lines.join("\n") + ATTRIBUTION_FOOTER }],
    structuredContent: {
      mode: "trip",
      title: created.points.map((p) => p.name).join(" → "),
      round_trip: Boolean(args.round_trip),
      ...s,
      vehicle: { fuel, consumption, assumed },
      // Аргументы вызова — карточка повторяет его с другим расходом/топливом (кнопка «Пересчитать»).
      args: { ...args, fuel, consumption },
      url: roadbookUrl,
      locale: args.locale ?? null,
      source: "OpenVan.camp roadbook (CC BY 4.0)",
    },
  };
}
