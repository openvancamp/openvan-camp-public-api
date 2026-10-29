import { z } from "zod";
import { apiGet, OpenVanApiError } from "../client.js";
import { SITE } from "../ui/bridge.js";

/**
 * Паромы и речные переправы — /api/ferries*: линии OSM (ODbL), сайты перевозчиков, проверенные
 * вручную, и сводка расписания из открытых GTFS. Окно карты отдаёт до 1400 объектов с геометрией —
 * агенту оставляем только линии, без геометрии, с фильтрами.
 */

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

const LIMIT = 20;

/** Линии — производная база OSM, поэтому кроме нашего CC BY называем ODbL. */
const ATTRIBUTION_FOOTER =
  "\n\n_Data: OpenVan.camp (CC BY 4.0); ferry lines © OpenStreetMap contributors (ODbL); timetables from open GTFS feeds under their own licenses. https://openvan.camp_";

type FerryProps = {
  id: string;
  kind: "route" | "terminal";
  name?: string;
  from?: string;
  to?: string;
  operator?: string;
  route_countries?: string;
  motorcar?: string;
  motor_vehicle?: string;
  hgv?: string;
  duration?: string;
  seasonal?: string;
  "operator:website"?: string;
  website?: string;
  website_verified?: boolean;
  booking_url?: string;
  schedule_refs?: unknown[];
};

type WindowResponse = { features: Array<{ properties: FerryProps }>; truncated?: boolean };

/** OSM: motorcar важнее общего motor_vehicle; нет тега — неизвестно, а не «нельзя». */
function cars(p: FerryProps): "yes" | "no" | "unknown" {
  const v = p.motorcar ?? p.motor_vehicle;
  if (v === "no") return "no";
  if (v === "yes" || v === "designated") return "yes";
  return "unknown";
}

function crossing(p: FerryProps) {
  return {
    id: p.id,
    name: p.name ?? ([p.from, p.to].filter(Boolean).join(" – ") || p.id),
    operator: p.operator ?? null,
    countries: p.route_countries ? p.route_countries.split(",") : [],
    cars: cars(p),
    duration: p.duration ?? null,
    seasonal: p.seasonal ?? null,
    operator_website: p.website_verified ? (p["operator:website"] ?? p.website ?? null) : null,
    booking_url: p.booking_url ?? null,
    has_timetable: Array.isArray(p.schedule_refs) && p.schedule_refs.length > 0,
    osm_url: p.id ? `https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[p.id[0]]}/${p.id.slice(1)}` : null,
  };
}

export const findFerriesInput = {
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "west,south,east,north")
    .describe("Bounding box west,south,east,north in degrees, longitude first, e.g. 8,38,16,42 (Tyrrhenian Sea: Sardinia, Corsica, Italy)."),
  query: z.string().optional().describe("Keep only crossings whose name, ports or operator contain this text, e.g. Olbia or Moby."),
  country_code: z.string().length(2).optional().describe("Keep only crossings that touch this country (ISO 3166-1 alpha-2), e.g. GR."),
  cars_only: z.boolean().optional().describe("Default true: drop crossings OpenStreetMap marks as closed to cars. Unknown access is kept."),
};

export async function findFerries({ bbox, query, country_code, cars_only, locale }: { bbox: string; query?: string; country_code?: string; cars_only?: boolean; locale?: string }) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  const span = Math.max(e >= w ? e - w : e + 360 - w, n - s);
  const zoom = span > 20 ? 5 : span > 8 ? 6 : span > 3 ? 7 : 8;
  const data = await apiGet<WindowResponse>("/api/ferries", { bbox, zoom });

  const q = query?.toLowerCase();
  const cc = country_code?.toUpperCase();
  const all = data.features
    .map((f) => f.properties)
    .filter((p) => p.kind === "route")
    .map(crossing)
    .filter((c) => (cars_only ?? true ? c.cars !== "no" : true))
    .filter((c) => !cc || c.countries.includes(cc))
    .filter((c) => !q || `${c.name} ${c.operator ?? ""}`.toLowerCase().includes(q));
  const items = all.slice(0, LIMIT);

  const card = {
    mode: "ferries",
    bbox,
    query: query ?? null,
    total: all.length,
    items,
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp (ODbL, © OpenStreetMap contributors)",
  };
  const lines = items.map(
    (c) =>
      `- ${c.name} [id ${c.id}]${c.operator ? `, ${c.operator}` : ""}${c.countries.length ? ` (${c.countries.join(", ")})` : ""}; cars: ${c.cars}` +
      `${c.duration ? `; crossing ${c.duration} (h:mm)` : ""}${c.seasonal && c.seasonal !== "no" ? `; seasonal: ${c.seasonal}` : ""}` +
      `${c.operator_website ? `; operator site (checked) ${c.operator_website}` : ""}${c.booking_url ? `; booking ${c.booking_url}` : ""}` +
      `${c.has_timetable ? "; open timetable available" : ""}`
  );
  return {
    ...text(
      (items.length
        ? `${all.length} ferry and river crossings in ${bbox}${q ? ` matching "${query}"` : ""}${all.length > LIMIT ? `, the ${LIMIT} most important shown` : ""}:\n${lines.join("\n")}`
        : `No ferry crossings found in ${bbox}${q ? ` matching "${query}"` : ""}${cc ? ` touching ${cc}` : ""}. That means OpenStreetMap has none mapped here — not that no ferry runs; try a wider box or no filter.`) +
        (data.truncated ? "\nThe box holds more objects than one answer carries: narrow it for small crossings." : "") +
        `\n\ncars: unknown means OpenStreetMap has no access tag, not that cars are refused. ` +
        `Lines come from OpenStreetMap and are not a timetable: call get_ferry_schedule with an id for departures, then link the operator site — fares and bookings live there.${ATTRIBUTION_FOOTER}`
    ),
    structuredContent: card,
  };
}

export const getFerryScheduleInput = {
  id: z.string().regex(/^[nwr][0-9]+$/, "n, w or r followed by digits").describe("Ferry line id from find_ferries, e.g. r5958961."),
};

type Endpoint = { name?: string; cc?: string; near_city?: { name?: string; name_en?: string } | null };
type DetailResponse = FerryProps & { endpoints?: Endpoint[]; endpoint_status?: string; opening_hours?: string; interval?: string };
type Direction = {
  from: string;
  to: string;
  next: string[];
  tomorrow_first: string | null;
  weekdays: number[];
  count: number;
  first: string | null;
  last: string | null;
  day_every: number | null;
  night_every: number | null;
  travel: number | null;
  trips: Array<{ dep: string; arr?: string }>;
};
type ScheduleResponse = {
  available: boolean;
  date?: string;
  timezone?: string;
  now?: string;
  operator?: string;
  sources?: Array<{ name: string; license: string; url: string }>;
  directions?: Direction[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function getFerrySchedule({ id, locale }: { id: string; locale?: string }) {
  let detail: DetailResponse;
  try {
    detail = await apiGet<DetailResponse>(`/api/ferries/${id}`);
  } catch (e) {
    if (e instanceof OpenVanApiError && e.status === 404) {
      return text(`No ferry line ${id} in OpenVan.camp. Find ids with find_ferries.`, true);
    }
    throw e;
  }
  const schedule = await apiGet<ScheduleResponse>(`/api/ferries/${id}/schedule`);
  delete (detail as Record<string, unknown>)._attribution;

  const c = crossing(detail);
  c.operator ??= schedule.operator ?? null;
  const ends = (detail.endpoints ?? []).map((p) => ({
    name: p.name ?? null,
    country: p.cc || null,
    near_town: p.near_city?.name_en ?? p.near_city?.name ?? null,
  }));
  if (!c.countries.length) c.countries = [...new Set(ends.map((p) => p.country?.toUpperCase()).filter((x): x is string => !!x))];
  const directions = (schedule.directions ?? []).map((d) => ({
    from: d.from,
    to: d.to,
    next: d.next,
    tomorrow_first: d.tomorrow_first,
    weekdays: d.weekdays,
    count: d.count,
    first: d.first,
    last: d.last,
    day_every: d.day_every,
    night_every: d.night_every,
    travel: d.travel,
    trips: d.trips.slice(0, 6),
  }));

  const card = {
    mode: "ferry",
    ...c,
    ends,
    available: schedule.available,
    date: schedule.date ?? null,
    timezone: schedule.timezone ?? null,
    now: schedule.now ?? null,
    directions,
    timetable_sources: schedule.sources ?? [],
    url: `${SITE}/${locale ?? "en"}/roadbook`,
    locale: locale ?? null,
    source: "OpenVan.camp: OpenStreetMap (ODbL)" + (schedule.sources?.length ? `, ${schedule.sources.map((s) => `${s.name} (${s.license})`).join(", ")}` : ""),
  };

  const head =
    `${c.name} [${id}]${c.operator ? `, operator ${c.operator}` : ""}; cars: ${c.cars}` +
    (ends.length === 2 ? `; ends: ${ends.map((p) => `${p.name ?? "?"}${p.country ? ` (${p.country})` : ""}`).join(" – ")}` : "") +
    (c.operator_website ? `; operator site (checked) ${c.operator_website}` : "") +
    (c.booking_url ? `; booking ${c.booking_url}` : "");
  const body = schedule.available
    ? `Timetable for ${schedule.date}, local time ${schedule.timezone} (now ${schedule.now}):\n` +
      directions
        .map(
          (d) =>
            `- ${d.from} → ${d.to}: next ${d.next.length ? d.next.join(", ") : d.tomorrow_first ? `none today, first tomorrow ${d.tomorrow_first}` : "none in the next days"}; ` +
            `${d.count} sailings today${d.first ? `, ${d.first}–${d.last}` : ""}` +
            `${d.day_every ? `, every ${d.day_every} min by day` : ""}${d.night_every ? `, every ${d.night_every} min at night` : ""}` +
            `${d.travel ? `; crossing ${d.travel} min` : ""}; runs ${d.weekdays.map((i) => DAYS[i]).join(" ")} over the next 8 days` +
            (d.trips.length ? `; sailings ${d.trips.map((t) => (t.arr ? `${t.dep}→${t.arr}` : t.dep)).join(", ")}` : "")
        )
        .join("\n") +
      `\nFrom open GTFS feeds: ${(schedule.sources ?? []).map((s) => `${s.name} (${s.license})`).join(", ")}. Confirm on the operator site before travelling.`
    : `No open timetable is matched to this line — that does not mean it does not run.${detail.opening_hours ? ` OpenStreetMap: opening hours ${detail.opening_hours}.` : ""}${detail.interval ? ` Interval ${detail.interval}.` : ""}${c.duration ? ` Crossing ${c.duration} (h:mm).` : ""} Send the user to the operator site for departures and fares.`;

  return {
    ...text(`${head}\n\n${body}${ATTRIBUTION_FOOTER}`),
    structuredContent: card,
  };
}
