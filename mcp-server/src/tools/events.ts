import { z } from "zod";
import { apiGet } from "../client.js";
import { SITE } from "../ui/bridge.js";
import { cardImage } from "../ui/widgets.js";

const EventSchema = z.object({
  slug: z.string(),
  event_name: z.string(),
  event_type: z.string().optional(),
  event_type_label: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  venue_name: z.string().nullable().optional(),
  official_url: z.string().nullable().optional(),
  status: z.string().optional(),
  url: z.string().optional(),
  image_url: z.string().nullable().optional(),
  country: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
});

type EventRow = z.infer<typeof EventSchema>;

/** Событие для карточки: только то, что она рисует. */
function cardEvent(e: EventRow) {
  return {
    slug: e.slug,
    name: e.event_name,
    type: e.event_type ?? null,
    type_label: e.event_type_label ?? null,
    start: e.start_date ?? null,
    end: e.end_date ?? null,
    city: e.city ?? null,
    country_code: e.country_code ?? null,
    country_name: e.country?.name ?? null,
    venue: e.venue_name ?? null,
    image: cardImage(e.image_url),
    url: e.url ?? `${SITE}/en/event/${e.slug}`,
  };
}

const SOURCE = "OpenVan.camp (CC BY 4.0)";

const EventsResponseSchema = z.object({
  events: z.array(EventSchema),
  pagination: z
    .object({ total: z.number(), page: z.number(), limit: z.number() })
    .optional(),
});

export const listEventsInput = {
  status: z
    .enum(["upcoming", "ongoing", "past", "all"])
    .default("upcoming")
    .describe("Event time status."),
  type: z
    .enum(["expo", "festival", "forum", "meetup", "roadtrip"])
    .optional()
    .describe("Event type filter."),
  country: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 country code."),
  search: z
    .string()
    .optional()
    .describe("Free-text search in event name."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .default("en")
    .describe("Language for localized fields."),
  limit: z.number().int().min(1).max(50).default(15),
};

export async function listEvents(args: {
  status: string;
  type?: string;
  country?: string;
  search?: string;
  locale: string;
  limit: number;
}) {
  const raw = await apiGet("/api/events", {
    status: args.status,
    type: args.type,
    country: args.country,
    search: args.search,
    locale: args.locale,
    limit: args.limit,
  });
  const parsed = EventsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "Events endpoint returned unexpected data." }],
      isError: true,
    };
  }

  const { events, pagination } = parsed.data;
  if (events.length === 0) {
    return {
      content: [{ type: "text" as const, text: `No ${args.status} events match the filter.` }],
    };
  }

  const lines = events.map(
    (e) =>
      `• ${e.event_name}\n    ${formatWhen(e.start_date, e.end_date)} · ${[e.city, e.country_code].filter(Boolean).join(", ")} · ${e.event_type_label ?? e.event_type ?? ""}\n    ${e.url ?? e.official_url ?? ""}`
  );

  const header = pagination
    ? `${events.length} of ${pagination.total} ${args.status} events:`
    : `${events.length} ${args.status} events:`;

  return {
    content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n\n")}` }],
    structuredContent: {
      status: args.status,
      total: pagination?.total ?? events.length,
      events: events.map(cardEvent),
      source: SOURCE,
    },
  };
}

function formatWhen(start?: string | null, end?: string | null): string {
  if (!start) return "TBA";
  if (!end || end === start) return start;
  return `${start} → ${end}`;
}

// ------------------------------------------------------------------
// get_event — single event details
// ------------------------------------------------------------------

export const getEventInput = {
  slug: z.string().describe("Event slug, e.g. caravan-salon-duesseldorf-2026."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .default("en"),
};

export async function getEvent({ slug, locale }: { slug: string; locale: string }) {
  try {
    const raw = await apiGet(`/api/event/${encodeURIComponent(slug)}`, { locale });
    const parsed = EventSchema.extend({
      description: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      organizer: z.string().nullable().optional(),
      admission_price: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    }).safeParse(raw);

    if (!parsed.success) {
      return {
        content: [{ type: "text" as const, text: `Unexpected shape for event "${slug}".` }],
        isError: true,
      };
    }

    const e = parsed.data;
    const lines = [
      `${e.event_name}`,
      `Type: ${e.event_type_label ?? e.event_type ?? "—"}`,
      `When: ${formatWhen(e.start_date, e.end_date)}`,
      `Where: ${[e.venue_name, e.city, e.country_code].filter(Boolean).join(", ")}`,
      e.organizer ? `Organizer: ${e.organizer}` : null,
      e.admission_price ? `Price: ${e.admission_price}` : null,
      e.official_url ? `Official: ${e.official_url}` : null,
      e.url ? `On OpenVan: ${e.url}` : null,
      e.summary ? `\n${e.summary}` : null,
      e.description && !e.summary ? `\n${e.description}` : null,
    ].filter(Boolean);

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      structuredContent: {
        event: {
          ...cardEvent(e),
          organizer: e.organizer ?? null,
          price: e.admission_price ?? null,
          official_url: e.official_url ?? null,
          summary: (e.summary ?? e.description ?? "").slice(0, 600) || null,
        },
        source: SOURCE,
      },
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Event "${slug}" not found.` }],
      isError: true,
    };
  }
}
