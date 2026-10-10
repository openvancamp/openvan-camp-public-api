import { z } from "zod";

import { apiGet } from "./client.js";

/**
 * Код страны → slug и английское название. Нужен, чтобы карточка вела на страницу
 * страны на сайте (/{locale}/vansky/{slug}, /tools/fuel-prices/{slug} …).
 * Источник — список стран навигации VanSky (164 страны). Меняется редко,
 * держим в памяти процесса 12 часов; страны вне списка ведут на страницу раздела.
 */
export type CountryRef = { slug: string; name: string };

let cache: { at: number; map: Map<string, CountryRef> } | null = null;

export async function countryRef(code: string): Promise<CountryRef | null> {
  if (!cache || Date.now() - cache.at > 12 * 3600 * 1000) {
    try {
      const raw = await apiGet("/api/vansky/nav-countries", { locale: "en" });
      const list = z.array(z.object({ slug: z.string(), name: z.string(), flag: z.string() })).parse(raw);
      cache = { at: Date.now(), map: new Map(list.map((c) => [c.flag.toUpperCase(), { slug: c.slug, name: c.name }])) };
    } catch {
      return cache?.map.get(code.toUpperCase()) ?? null;
    }
  }
  return cache.map.get(code.toUpperCase()) ?? null;
}
