/**
 * Поток, в котором считается план роудбука для plan_road_trip.
 *
 * Расчёт — buildPlan из resources/js/roadbook/plan.js, тот же модуль, что на странице
 * роудбука. У каждого потока свой кеш модулей, поэтому файлы движка читаются заново
 * при каждом вызове: правка роудбука сразу доходит до MCP, без перезапуска сервера.
 *
 * Своего здесь только форматирование строк — копия fmt() и distParam() из
 * resources/js/roadbook/page.js (там они живут внутри Alpine-компонента). Меняете их на
 * странице — повторите здесь.
 */
import { parentPort, workerData } from "node:worker_threads";

type Dict = Record<string, unknown>;

// Движок рассчитан на браузер: пара мест читает window.VanlifeUnits / пишет window.FuelCalc.
(globalThis as Dict).window ??= {};

const { enginePath, payload, inputs, visa, texts, locale, currency } = workerData as {
  enginePath: string;
  payload: Dict & { countries: Record<string, { name?: string; in?: string; from?: string }>; passports?: Array<{ value: string; label: string }>; rates?: Record<string, number> };
  inputs: Dict;
  visa: Dict;
  texts: Record<string, unknown> & { days_forms?: Record<string, string> };
  locale: string;
  currency: string;
};

/** Копия distParam() из page.js: числа в шаблонах получают подпись единицы. */
function distParam(name: string, value: unknown): unknown {
  if (typeof value !== "number") return value;
  if (name === "m") return `${Math.round(value)} m`;
  if (name === "cons") return `${value} l/100 km`;
  if (name === "speed") return `${Math.round(value)} km/h`;
  if (name === "liters") return `${Math.round(value)} l`;
  if (name !== "km" && name !== "off") return value;
  return `${Math.round(value)} km`;
}

function t(key: string, params: Record<string, unknown> = {}): string {
  let text = String(texts[key] ?? key);
  Object.keys(params)
    .sort((a, b) => b.length - a.length)
    .forEach((name) => {
      text = text.split(`:${name}`).join(String(distParam(name, params[name])));
    });
  return text;
}

function countryName(cc: string): string {
  return payload.countries[cc]?.name || (payload.passports || []).find((p) => p.value === cc)?.label || cc;
}

/** Копия fmt() из page.js. */
function makeFmt() {
  const plural = new Intl.PluralRules(locale);
  const num = new Intl.NumberFormat(locale);
  const thisYear = new Date().getFullYear();
  const dm = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" });
  const dmy = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const rate = currency === "EUR" ? 1 : payload.rates?.[currency] || null;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: rate ? currency : "EUR", maximumFractionDigits: 0 });

  return {
    t,
    locale,
    num: (n: number) => num.format(n),
    days: (n: number) => `${n} ${(texts.days_forms || {})[plural.select(n)] || texts.days_forms?.other || ""}`.trim(),
    date: (d: Date) => (d.getFullYear() === thisYear ? dm : dmy).format(d),
    dateShort: (d: Date) => dm.format(d),
    dateWd: (d: Date) => `${wd.format(d)} ${dm.format(d)}`,
    money: (eur: number | null | undefined) => (eur === null || eur === undefined ? "—" : money.format(eur * (rate || 1))),
    countryName,
    countryIn: (cc: string) => payload.countries[cc]?.in || countryName(cc),
    countryFrom: (cc: string) => payload.countries[cc]?.from || countryName(cc),
  };
}

/** Дата движка — местная полночь (parseLocalDate), поэтому без перевода в UTC: иначе «вчера». */
const iso = (d: unknown): string | null => {
  if (!(d instanceof Date)) return typeof d === "string" ? d.slice(0, 10) : null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const round = (n: unknown, k = 0): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** k) / 10 ** k : null);

try {
  const { buildPlan } = await import(enginePath);
  const vm = buildPlan(payload, inputs, visa, { today: new Date(), journal: null, fmt: makeFmt(), moneyCurrency: currency });

  // Из модели страницы — только то, что нужно карточке и модели: тексты уже готовые,
  // на языке разговора, теми же словами, что в роудбуке.
  const rate = currency === "EUR" ? 1 : payload.rates?.[currency] || 1;
  const toCur = (eur: unknown) => (typeof eur === "number" ? Math.round(eur * rate) : null);
  type Row = { key: string; s: string; big?: string; lines?: string[] };
  type Card = { cc: string; name: string; km: number; hours: number; transit?: boolean; rows: Row[] };

  const summary = {
    distance_km: round(vm.total),
    hours: round(vm.totalH, 1),
    drive_days: vm.nDrive ?? null,
    trip_days: vm.tripDays ?? null,
    start: vm.startName ?? null,
    end: vm.endName ?? null,
    round_trip: Boolean(vm.round),
    first_day: iso(vm.days?.[0]?.date),
    end_date: iso(vm.end),
    currency: rate ? currency : "EUR",
    totals: vm.totals
      ? {
          fuel: toCur(vm.totals.fuel),
          tolls: toCur(vm.totals.toll),
          vignettes: toCur(vm.totals.vg),
          ferries: toCur(vm.totals.ferry),
          fees: toCur(vm.totals.fees),
          total: toCur(vm.totals.total),
          fuel_unknown: Boolean(vm.totals.fuelUnknown),
          roads_unknown: vm.totals.roadsUnknown ?? [],
        }
      : null,
    alert: vm.alert ? { s: vm.alert.s, title: vm.alert.title, text: vm.alert.text } : null,
    countries: ((vm.cards ?? []) as Card[]).map((c) => {
      const b = (vm.budget ?? []).find((x: { cc: string; total?: number }) => x.cc === c.cc);
      return {
        cc: c.cc,
        name: c.name,
        km: round(c.km),
        hours: round(c.hours, 1),
        transit: Boolean(c.transit),
        cost: b ? toCur(b.total) : null,
        rows: (c.rows ?? [])
          .filter((r) => ["visa", "car", "roads", "holidays", "hazards", "power", "customs"].includes(r.key) && r.s !== "none")
          .map((r) => ({ key: r.key, s: r.s, big: r.big ?? null, lines: (r.lines ?? []).slice(0, 2) })),
      };
    }),
    nights: ((vm.days ?? []) as Array<{ d: number; city?: string; cc?: string; km?: number; date?: unknown; last?: boolean }>)
      .filter((d) => !d.last)
      .map((d) => ({ day: d.d, city: d.city ?? null, cc: d.cc ?? null, km: round(d.km), date: iso(d.date) })),
    schengen: vm.schengen ? { used: vm.schengen.used, left: vm.schengen.left, over: Boolean(vm.schengen.over) } : null,
    terms: ((vm.terms ?? []) as Array<Dict>).map((x) => ({ names: x.names, you: x.youText, car: x.carText, you_bad: Boolean(x.youBad), car_bad: Boolean(x.carBad) })),
    checklist: ((vm.groups ?? []) as Array<{ id: string; items: Array<{ t: string; s: string }> }>).map((g) => ({
      id: g.id,
      items: g.items.map((i) => ({ t: i.t, s: i.s })),
    })),
    weather_window: vm.weatherWindow?.best ? { date: vm.weatherWindow.best.iso ?? iso(vm.weatherWindow.best.date), t: vm.weatherWindow.best.t ?? null } : null,
  };

  parentPort!.postMessage({ ok: true, summary });
} catch (e) {
  parentPort!.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
}
