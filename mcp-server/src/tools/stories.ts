import { z } from "zod";
import { apiGet } from "../client.js";
import { SITE } from "../ui/bridge.js";

const StorySummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  category: z.object({ slug: z.string(), name: z.string() }).optional(),
  countries: z.array(z.object({ code: z.string(), name: z.string() })).optional(),
  first_published_at: z.string().nullable().optional(),
  articles_count: z.number().optional(),
  url: z.string().optional(),
});

const StoriesResponseSchema = z.object({
  stories: z.array(StorySummarySchema),
  pagination: z
    .object({ total: z.number(), page: z.number(), limit: z.number() })
    .optional(),
});

const SUMMARY_MAX = 300;

/** Короткое резюме: до SUMMARY_MAX знаков, по границе предложения или слова. */
function shortSummary(summary: string | null | undefined): string {
  const text = (summary ?? "").trim();
  if (text.length <= SUMMARY_MAX) return text;
  const cut = text.slice(0, SUMMARY_MAX);
  const sentenceEnd = cut.lastIndexOf(". ");
  if (sentenceEnd > SUMMARY_MAX / 2) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export const searchStoriesInput = {
  search: z.string().max(100).optional().describe("Words to look for in story headlines."),
  category: z
    .enum(["law", "ban", "opening", "closing", "incident", "industry", "lifestyle", "builds", "festival", "expo", "review", "other"])
    .optional()
    .describe("Story category."),
  country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code."),
  locale: z
    .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
    .default("en")
    .describe("Language of headlines and summaries."),
  limit: z.number().int().min(1).max(20).default(10),
};

export async function searchStories(args: {
  search?: string;
  category?: string;
  country?: string;
  locale: string;
  limit: number;
}) {
  const raw = await apiGet("/api/stories", {
    search: args.search,
    category: args.category,
    country: args.country,
    locale: args.locale,
    limit: args.limit,
  });

  const parsed = StoriesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      content: [{ type: "text" as const, text: "Stories endpoint returned unexpected data." }],
      isError: true,
    };
  }

  const { stories, pagination } = parsed.data;
  if (stories.length === 0) {
    return { content: [{ type: "text" as const, text: "No stories match the filter." }] };
  }

  const lines = stories.map(
    (s) =>
      `• ${s.title}\n    ${s.category?.name ?? ""} · ${(s.countries ?? []).map((c) => c.code).join(", ")} · ${s.first_published_at ?? ""}\n    ${shortSummary(s.summary)}\n    ${s.url ?? ""}`
  );

  const header = pagination
    ? `${stories.length} of ${pagination.total} stories:`
    : `${stories.length} stories:`;

  return {
    content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n\n")}` }],
    // В карточке — наша OG-картинка сюжета, а не фото источника: превью кешируют и
    // индексируют, чужое фото там — риск по авторским правам (см. CLAUDE.md, Open Graph).
    structuredContent: {
      query: args.search ?? null,
      total: pagination?.total ?? stories.length,
      stories: stories.map((s) => ({
        title: s.title,
        summary: shortSummary(s.summary).slice(0, 180) || null,
        category: s.category?.name ?? null,
        countries: (s.countries ?? []).map((c) => c.code.toUpperCase()),
        date: s.first_published_at ?? null,
        sources: s.articles_count ?? null,
        image: `${SITE}/storage/og-images/stories/${s.slug}-${args.locale}.png`,
        url: s.url ?? `${SITE}/${args.locale}/news`,
      })),
      url: `${SITE}/${args.locale}/news`,
      locale: args.locale,
      source: "OpenVan.camp (CC BY 4.0)",
    },
  };
}
