import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { OpenVanApiError } from "./client.js";
import { ATTRIBUTION_FOOTER, VERSION } from "./config.js";
import {
  getFuelPrices,
  getFuelPricesInput,
  compareFuelPrices,
  compareFuelPricesInput,
  findCheapestFuel,
  findCheapestFuelInput,
} from "./tools/fuel.js";
import {
  getCityClimate,
  getCityClimateInput,
  getCityWeather,
  getCityWeatherInput,
  getVanSkyWeather,
  getVanSkyWeatherInput,
  listVanSkyTop,
  listVanSkyTopInput,
} from "./tools/vansky.js";
import {
  listEvents,
  listEventsInput,
  getEvent,
  getEventInput,
} from "./tools/events.js";
import { searchStories, searchStoriesInput } from "./tools/stories.js";
import {
  compareVanBasket,
  compareVanBasketInput,
  getVanBasket,
  getVanBasketInput,
  rankFoodPrices,
  rankFoodPricesInput,
} from "./tools/vanbasket.js";
import { getCurrencyRate, getCurrencyRateInput } from "./tools/currency.js";
import {
  checkVisaRules,
  checkVisaRulesInput,
  getRouteVisaRules,
  getRouteVisaRulesInput,
  getVehicleImportRules,
  getVehicleImportRulesInput,
} from "./tools/visa.js";
import {
  checkLicensePlate,
  checkLicensePlateInput,
  getLicensePlateCountry,
  getLicensePlateCountryInput,
  getLicensePlateImage,
  getLicensePlateImageInput,
  listLicensePlateCountries,
  listLicensePlateCountriesInput,
} from "./tools/plates.js";
import {
  estimateRouteTolls,
  estimateRouteTollsInput,
  getTollRates,
  getTollRatesInput,
} from "./tools/tolls.js";
import { getHolidays, getHolidaysInput } from "./tools/holidays.js";
import {
  getActiveFires,
  getActiveFiresInput,
  getTravelHazards,
  getTravelHazardsInput,
} from "./tools/hazards.js";
import { getPowerPlugs, getPowerPlugsInput } from "./tools/electricity.js";
import { getCustomsRules, getCustomsRulesInput } from "./tools/customs.js";
import { getRoadbookBuildStatus, planRoadTrip, planRoadTripInput, roadbookBuildStatusInput } from "./tools/trip.js";
import { registerWidgets, toolUiMeta, WIDGETS } from "./ui/widgets.js";
import { countryBriefInput, getCountryBrief } from "./tools/brief.js";

// Все 25 tools — read-only HTTP GET к openvan.camp. Ни один не меняет состояние,
// не пишет данные, не удаляет записи. Annotations транслируются в UI хостов
// (ChatGPT: DEV > Приложения, Claude Desktop, Cursor) — без них SDK проставляет
// MCP defaults (destructiveHint=true), и хосты помечают нас как "разрушительные".
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true, // вызываем удалённый API openvan.camp
};

const readOnlyAnnotations = (title: string): ToolAnnotations => ({
  ...READ_ONLY,
  title,
});

/**
 * CC BY 4.0 требует атрибуции, а 11 из 20 тулов её не ставили — агент пересказывал
 * данные без источника. Подпись добавляется здесь, одним местом: новый тул получит её
 * сам, без правки своего файла. Ошибки и ответы, где подпись уже есть, не трогаем.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withAttribution<A extends any[], R>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const locale = (args[0] as { locale?: string } | undefined)?.locale;
    let result: R;
    try {
      result = await handler(...args);
    } catch (e) {
      // Ошибка API — понятным текстом, а не «HTTP 404 from /api/…» (его видит человек в карточке).
      if (!(e instanceof OpenVanApiError)) throw e;
      const body = (e.body ?? {}) as { message?: string; error?: string };
      const reason = typeof body.message === "string" ? body.message : typeof body.error === "string" && body.error.length > 12 ? body.error : null;
      const text =
        e.status === 404 ? `No data for this request${reason ? `: ${reason}` : ""}. It means OpenVan.camp has no data for it, not that nothing applies.`
        : e.status === 429 ? "Too many requests right now — retry in a minute."
        : e.status >= 500 ? "OpenVan.camp is temporarily unavailable — retry in a minute."
        : reason ?? "The request could not be completed — check the arguments.";
      if (e.status === 404) return noData(text, locale) as R;
      return { content: [{ type: "text", text }], isError: true } as R;
    }
    const r = result as { isError?: boolean; content?: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> };
    if (!Array.isArray(r?.content)) return result;
    if (r.isError) {
      const msg = r.content.find((c) => c.type === "text")?.text ?? "";
      if (NO_DATA.test(msg)) return noData(msg, locale) as R;
      return result;
    }
    // С outputSchema SDK требует structuredContent у каждого успешного ответа.
    if (!r.structuredContent) r.structuredContent = { message: r.content.find((c) => c.type === "text")?.text ?? "" };
    const last = [...r.content].reverse().find((c) => c.type === "text" && typeof c.text === "string");
    if (last && !last.text!.includes("OpenVan.camp (CC BY 4.0)")) {
      last.text += ATTRIBUTION_FOOTER;
    }
    return result;
  };
}

/**
 * «Данных нет» — обычный ответ, а не сбой: каталог Claude считает долю isError и при >2%
 * ставит коннектору «Worth a look». Ошибкой остаются только 429/5xx и неверные аргументы.
 */
const NO_DATA = /^(No |Event ".*" not found|Currency ".*" not found)/;

function noData(message: string, locale?: string) {
  return { content: [{ type: "text" as const, text: message }], structuredContent: { nodata: true, message, ...(locale ? { locale } : {}) } };
}

/** Схема ответа: у всех инструментов объект с произвольными полями (форму описывает карточка). */
const LOOSE_OUTPUT = z.object({}).passthrough();

/** Подсказки модели на весь коннектор (InitializeResult.instructions). */
const INSTRUCTIONS = [
  "OpenVan.camp: road-trip and vanlife travel data for 200+ countries, with interactive cards in Claude and ChatGPT.",
  "Always pass locale = the language the user writes in (en, ru, de, fr, es, pt, tr): answers, cards, place names and units follow it.",
  "When the user describes a trip from A to B (or several stops), call plan_road_trip first: it returns the whole trip (route, days, budget, visas, vehicle stay, road rules, holidays, hazards) in one call. Use the single-topic tools only for follow-up questions.",
  "Weather: get_city_travel_weather for a city, get_country_travel_weather for a country (it also names the best and worst cities for the coming week), list_best_weather_countries to choose where to go. These cover today and the coming 7 days; for a later date or 'when is the best time to go', get_city_climate gives the typical weather (climate, 2021–2025) on any day of the year and the best month.",
  "A 'no data' answer means OpenVan.camp has no data for it, not that nothing applies: never tell the user a border is open, a road is free or a date has no holidays because data is missing.",
  "Prices in the cards are converted with fresh exchange rates; quote them as approximate and give the source link.",
].join("\n");

/**
 * Язык разговора для карточки. У инструментов, где своего locale нет, он добавлен
 * сверху: модель передаёт язык, на котором пишет человек, и карточка говорит на нём,
 * даже если интерфейс Claude/ChatGPT у человека на другом языке.
 */
const LOCALE_HINT =
  "Language the user writes in (en, ru, de, fr, es, pt, tr). Set it on every call: the answer and the interactive card are shown in this language and units; without it the card falls back to the app's interface language.";

const CARD_LOCALE = z
  .enum(["en", "ru", "de", "fr", "es", "pt", "tr"])
  .optional()
  .describe("Language of the conversation with the user, for the interactive card. Pass it whenever the user writes in one of these languages.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCardLocale<A extends any[], R>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await handler(...args);
    const locale = (args[0] as { locale?: string } | undefined)?.locale;
    const r = result as { structuredContent?: Record<string, unknown> };
    if (locale && r?.structuredContent) r.structuredContent.locale = locale;
    return result;
  };
}

/**
 * Старые имена инструментов (до 0.7.0) → новые. В tools/list их нет: имена с внутренними
 * брендами (VanSky, VanBasket) модель не понимает, и ревью ChatGPT Apps их отклонило.
 * Скрипты, где имя записано жёстко, продолжают работать — sse.ts подменяет имя на входе.
 */
export const LEGACY_TOOL_NAMES: Record<string, string> = {
  get_vansky_weather: "get_country_travel_weather",
  list_vansky_top: "list_best_weather_countries",
  get_vanbasket: "get_country_food_prices",
  compare_vanbasket: "compare_food_prices",
};

/**
 * Factory shared between stdio (dist/index.js) and HTTP (dist/sse.js) entry points.
 */
export type HostKind = "chatgpt" | "claude" | "other";

/** Хост по User-Agent запроса: ChatGPT ходит как openai-mcp/*, Claude — Claude-User. */
export function hostFromUserAgent(ua: string | undefined): HostKind {
  if (!ua) return "other";
  if (/openai-mcp|chatgpt/i.test(ua)) return "chatgpt";
  if (/claude/i.test(ua)) return "claude";
  return "other";
}

/** Убирает инструмент из ответа tools/list, не мешая его вызывать по имени. */
function hideFromToolList(server: McpServer, name: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (server.server as any)._requestHandlers as Map<string, (req: unknown, extra: unknown) => Promise<{ tools: { name: string }[] }>>;
  const list = handlers.get("tools/list");
  if (!list) return;
  handlers.set("tools/list", async (req, extra) => {
    const result = await list(req, extra);
    return { ...result, tools: result.tools.filter((t) => t.name !== name) };
  });
}

/** Языки, которые знают карточки и сайт. */
const LOCALES = new Set(["en", "ru", "de", "fr", "es", "pt", "tr"]);

export function createServer(host: HostKind = "other"): McpServer {
  const server = new McpServer(
    {
      name: "openvan-mcp",
      version: VERSION,
      title: "OpenVan.camp Travel",
      websiteUrl: "https://openvan.camp",
      icons: [
        { src: "https://openvan.camp/icon/android-chrome-192x192.png", mimeType: "image/png", sizes: ["192x192"] },
        { src: "https://openvan.camp/icon/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
      ],
    },
    { instructions: INSTRUCTIONS }
  );

  // locale — первым параметром и с одним описанием у всех инструментов. Без него карточка
  // говорит на языке интерфейса хоста: 11.10.2026 Claude с английским интерфейсом показал
  // русскоязычному человеку карточку на английском и в °F. Обязательным не делаем: скрипты,
  // которые зовут инструменты без locale, сломались бы.
  const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: { inputSchema?: Record<string, z.ZodTypeAny>; outputSchema?: unknown }, cb: (args: any, extra: any) => unknown) => {
    const shape = config.inputSchema;
    if (shape && shape.locale) {
      const { locale, ...rest } = shape;
      config = { ...config, inputSchema: { locale: locale.describe(LOCALE_HINT), ...rest } };
      // Модель забыла locale — берём язык человека, который ChatGPT шлёт в _meta запроса.
      const inner = cb;
      cb = (args, extra) => {
        if (args && !args.locale) {
          const hostLocale = String(extra?._meta?.["openai/locale"] ?? "").slice(0, 2).toLowerCase();
          if (LOCALES.has(hostLocale)) args = { ...args, locale: hostLocale };
        }
        return inner(args, extra);
      };
    }
    if (!config.outputSchema) config = { ...config, outputSchema: LOOSE_OUTPUT };
    return register(name, config, cb);
  };

  // Сводка по поездке — первым в списке: это самый частый живой вопрос («едем из A в B»).
  server.registerTool(
    "plan_road_trip",
    {
      title: "Plan A Road Trip",
      description:
        "Plan a road trip by campervan or car between 2-10 places with the OpenVan.camp roadbook: distance, driving time and a day-by-day plan with overnights, budget (fuel, tolls, vignettes, ferries), and for every country on the way the entry rule for the given passports, residence permit and plates, how long you and the vehicle may stay (Schengen 90/180), road rules and city access (low-emission zones and stickers such as Umweltplakette and Crit'Air, Italian ZTL), holidays on the trip dates, safety and power plugs, plus the main warning and a checklist. Returns a link to the full roadbook the user can open, edit and share. Use this first when the user describes a trip from A to B.",
      inputSchema: planRoadTripInput,
      annotations: readOnlyAnnotations("Plan A Road Trip"),
      _meta: toolUiMeta(WIDGETS.trip, "Planning the trip…", "Trip summary ready", true),
    },
    withAttribution(planRoadTrip)
  );

  // Справка по стране — второй по частоте живой вопрос («что стоит знать про Испанию»).
  server.registerTool(
    "get_country_travel_brief",
    {
      title: "Country Road-Trip Briefing",
      description:
        "Everything to know before driving into one country by campervan or car, in one call: entry rule and how long the person and the vehicle may stay (with passport), travel weather now and this week, fuel prices, tolls and vignettes, public holidays in the next 30 days, safety advice, power plugs, customs limits and food prices. Use it when someone asks what to know about a country, the nuances or a guide for travelling there, or is preparing a trip to it; use the single-topic tools for one narrow question.",
      inputSchema: countryBriefInput,
      annotations: readOnlyAnnotations("Country Road-Trip Briefing"),
      _meta: toolUiMeta(WIDGETS.brief, "Gathering the country briefing…", "Country briefing ready"),
    },
    withAttribution(getCountryBrief)
  );

  // Ход сборки роудбука — только для карточки plan_road_trip (модель его не видит):
  // пока Claude ждёт план, карточка показывает этапы, как экран «Роудбук собирается».
  server.registerTool(
    "get_roadbook_build_status",
    {
      title: "Roadbook Build Progress",
      description:
        "Internal helper for the plan_road_trip card: progress of the roadbook build (route, tolls, borders and cities, campsites, weather, news). Not for direct use — call plan_road_trip.",
      inputSchema: roadbookBuildStatusInput,
      annotations: readOnlyAnnotations("Roadbook Build Progress"),
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    getRoadbookBuildStatus
  );
  // Пометку visibility:["app"] понимают только хосты с карточками (Claude, ChatGPT). Остальные
  // клиенты и каталоги (Glama) показывали служебный инструмент модели и в списке. Убираем его
  // из tools/list для них, но вызов оставляем: карточка в Claude Desktop через npx (host
  // "other") продолжает опрашивать ход сборки.
  if (host === "other") hideFromToolList(server, "get_roadbook_build_status");

  // Fuel prices
  server.registerTool(
    "get_fuel_prices",
    {
      title: "Get Fuel Prices",
      description:
        "Current retail fuel prices for all API-supported countries. Covers gasoline, diesel, LPG, CNG, E85, kerosene and grade variants. Pass country_code to get one country in detail; omit it for a summary list. Use it for the price of petrol, diesel, LPG/autogas/propane or CNG in one country; without a country it gives an overview.",
      inputSchema: { ...getFuelPricesInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Get Fuel Prices"),
      _meta: toolUiMeta(WIDGETS.fuel, "Checking fuel prices…", "Fuel prices ready"),
    },
    withAttribution(withCardLocale(getFuelPrices))
  );
  server.registerTool(
    "compare_fuel_prices",
    {
      title: "Compare Fuel Prices",
      description:
        "Compare current prices for one fuel type across 2-10 countries. Returns sorted table cheapest-first. Use it when someone asks which of two or more named countries has cheaper or more expensive fuel.",
      inputSchema: { ...compareFuelPricesInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Compare Fuel Prices"),
      _meta: toolUiMeta(WIDGETS.fuel, "Comparing fuel prices…", "Comparison ready"),
    },
    withAttribution(withCardLocale(compareFuelPrices))
  );
  server.registerTool(
    "find_cheapest_fuel",
    {
      title: "Find Cheapest Fuel",
      description:
        "Rank countries by the price of a fuel type in a region (or worldwide): the cheapest first, or with order=most_expensive the most expensive first. Useful for route planning. Use it for «where is fuel cheapest» and, with order=most_expensive, «where is fuel the most expensive», in a region or worldwide.",
      inputSchema: { ...findCheapestFuelInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Find Cheapest Fuel"),
      _meta: toolUiMeta(WIDGETS.fuel, "Looking for the cheapest fuel…", "Cheapest fuel ready"),
    },
    withAttribution(withCardLocale(findCheapestFuel))
  );

  // Travel weather
  server.registerTool(
    "get_country_travel_weather",
    {
      title: "Travel Weather In A Country",
      description:
        "How suitable the weather in a whole country is for travelling and sleeping in a campervan, as a 0-100 score: overall travel score, sleep score, solar panel yield, driving conditions, awning safety, condensation risk, a 7-day forecast, and the 3 best and 3 toughest cities for the coming week. Country-level: for a named city use get_city_travel_weather. Use it when someone asks what the weather is like in a country, where in a country it is warmer, colder or sunnier, which of its cities are best or worst this week, or whether it is too cold or rainy to sleep in a van there now.",
      inputSchema: getVanSkyWeatherInput,
      annotations: readOnlyAnnotations("Travel Weather In A Country"),
      _meta: toolUiMeta(WIDGETS.weather, "Checking travel weather…", "Travel weather ready"),
    },
    withAttribution(getVanSkyWeather)
  );
  server.registerTool(
    "get_city_travel_weather",
    {
      title: "Travel Weather In A City",
      description:
        "How suitable the weather in one city or town is for travelling and sleeping in a campervan, as a 0-100 score for today and for the coming 7 days, with sleep, driving and solar scores and daily scores. Use this, not get_country_travel_weather, when the user names a place (Barcelona, Málaga, Alicante). Use it for the weather in one named city, town or place today, tomorrow or this week.",
      inputSchema: getCityWeatherInput,
      annotations: readOnlyAnnotations("Travel Weather In A City"),
      _meta: toolUiMeta(WIDGETS.weather, "Checking travel weather…", "Travel weather ready"),
    },
    withAttribution(getCityWeather)
  );
  server.registerTool(
    "get_city_climate",
    {
      title: "Typical Weather On Any Date",
      description:
        "What the weather is usually like in a city or at any point on a given day of the year, from the ERA5 climate archive 2021–2025 (median of 35 archive days: the date ±3 days over five years): day and night temperature, on how many of the 35 days there was precipitation, the usual sky, sea or large-lake water temperature, solar radiation for panels and the VanSky climate index; plus all 12 months and the best month to travel. Climate, not a forecast. Use it for dates beyond the coming week (\"weather in Batumi in mid-September\", \"is the sea warm in Antalya in May\") and for \"when is the best time to go\"; for today and this week use get_city_travel_weather. Omit date to get the month overview.",
      inputSchema: getCityClimateInput,
      annotations: readOnlyAnnotations("Typical Weather On Any Date"),
      _meta: toolUiMeta(WIDGETS.climate, "Looking up the typical weather…", "Typical weather ready"),
    },
    withAttribution(getCityClimate)
  );
  server.registerTool(
    "list_best_weather_countries",
    {
      title: "Countries With The Best Travel Weather",
      description:
        "List the N countries where today's weather is best for travelling by campervan, highest 0-100 travel score first. Use it when no country is named and someone asks where to go for warm or good weather right now — worldwide or in a region (region=europe…); with sort=warmest only when they literally ask where it is warmest or hottest (it ranks by temperature alone, so deserts come first; «warm and pleasant», «warm and dry» → the default score). These are today's conditions and the coming days, not a forecast for a later month: for «in November» say so.",
      inputSchema: { ...listVanSkyTopInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Countries With The Best Travel Weather"),
      _meta: toolUiMeta(WIDGETS.bestWeather, "Ranking countries by weather…", "Best travel weather ready"),
    },
    withAttribution(withCardLocale(listVanSkyTop))
  );

  // Events
  server.registerTool(
    "list_events",
    {
      title: "List Vanlife Events",
      description:
        "List vanlife events: expos (Caravan Salon), festivals, meetups, forums, road trips. Filter by status, type, country, or free-text search.",
      inputSchema: listEventsInput,
      annotations: readOnlyAnnotations("List Vanlife Events"),
      _meta: toolUiMeta(WIDGETS.events, "Finding vanlife events…", "Events ready"),
    },
    withAttribution(listEvents)
  );
  server.registerTool(
    "get_event",
    {
      title: "Get Event Details",
      description:
        "Get full details for a single vanlife event by its slug.",
      inputSchema: getEventInput,
      annotations: readOnlyAnnotations("Get Event Details"),
      _meta: toolUiMeta(WIDGETS.events, "Loading the event…", "Event ready"),
    },
    withAttribution(getEvent)
  );

  // Stories (news)
  server.registerTool(
    "search_stories",
    {
      title: "Search Vanlife News",
      description:
        "Search recent news about campervans, motorhomes and road travel collected by OpenVan.camp from public news sources. Returns for each story only a headline, a short summary of up to 300 characters, date, category, countries and a link to the story page on openvan.camp, which credits the original publishers. Never returns full article text. Filter by words in the headline, category, country and language.",
      inputSchema: searchStoriesInput,
      annotations: readOnlyAnnotations("Search Vanlife News"),
      _meta: toolUiMeta(WIDGETS.news, "Searching vanlife news…", "News ready"),
    },
    withAttribution(searchStories)
  );

  // Food price index
  server.registerTool(
    "compare_food_prices",
    {
      title: "Compare Food Prices",
      description:
        "Compare food price index between two countries (world average = 100). Higher number = more expensive food. Use it when someone asks where food is cheaper between two countries.",
      inputSchema: { ...compareVanBasketInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Compare Food Prices"),
      _meta: toolUiMeta(WIDGETS.food, "Comparing food prices…", "Comparison ready"),
    },
    withAttribution(withCardLocale(compareVanBasket))
  );
  server.registerTool(
    "get_country_food_prices",
    {
      title: "Get Food Price Index",
      description:
        "Food price index for one country (world average = 100): how expensive groceries are there, with its yearly history. Use it when someone asks how expensive food, groceries or living is in a country.",
      inputSchema: { ...getVanBasketInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Get Food Price Index"),
      _meta: toolUiMeta(WIDGETS.food, "Checking food prices…", "Food prices ready"),
    },
    withAttribution(withCardLocale(getVanBasket))
  );
  server.registerTool(
    "rank_food_prices",
    {
      title: "Rank Countries By Food Prices",
      description:
        "Rank countries by food price index (world average = 100) in a region or worldwide: the cheapest first, or with order=most_expensive the most expensive first. Use it when someone asks where food or groceries are cheapest or most expensive.",
      inputSchema: { ...rankFoodPricesInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Rank Countries By Food Prices"),
      _meta: toolUiMeta(WIDGETS.food, "Ranking food prices…", "Food price ranking ready"),
    },
    withAttribution(withCardLocale(rankFoodPrices))
  );

  // Currency
  server.registerTool(
    "get_currency_rate",
    {
      title: "Convert Currency",
      description:
        "Convert an amount between two currencies using live rates (150+ currencies, daily updates). Use it for exchange rates and converting an amount between currencies.",
      inputSchema: { ...getCurrencyRateInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Convert Currency"),
      _meta: toolUiMeta(WIDGETS.currency, "Converting…", "Conversion ready"),
    },
    withAttribution(withCardLocale(getCurrencyRate))
  );

  // Visa & border rules
  server.registerTool(
    "check_visa_rules",
    {
      title: "Check Visa Rules",
      description:
        "Entry rules for one passport and destination: entry mode, allowed length of stay, how the days are counted (per entry or in a rolling window), whether a visa run resets the counter, and temporary vehicle import. Answers carry a confidence level and source — pass those on instead of stating a rule as certain.",
      inputSchema: checkVisaRulesInput,
      annotations: readOnlyAnnotations("Check Visa Rules"),
      _meta: toolUiMeta(WIDGETS.visa, "Checking visa rules…", "Visa rules ready"),
    },
    withAttribution(checkVisaRules)
  );
  server.registerTool(
    "get_route_visa_rules",
    {
      title: "Visa Rules For A Route",
      description:
        "Visa rules for every country of a route in one call, for up to 10 passports at once, plus the tightest leg of the route.",
      inputSchema: getRouteVisaRulesInput,
      annotations: readOnlyAnnotations("Visa Rules For A Route"),
      _meta: toolUiMeta(WIDGETS.visa, "Checking visas along the route…", "Route visa rules ready"),
    },
    withAttribution(getRouteVisaRules)
  );
  server.registerTool(
    "get_vehicle_import_rules",
    {
      title: "Temporary Vehicle Import Rules",
      description:
        "Temporary admission rules for a foreign-plated vehicle in one country: allowed days, per entry or per window, carnet requirement, green card. A country without a rule we can stand behind returns nothing rather than a guess.",
      inputSchema: getVehicleImportRulesInput,
      annotations: readOnlyAnnotations("Temporary Vehicle Import Rules"),
      _meta: toolUiMeta(WIDGETS.visa, "Checking vehicle import rules…", "Vehicle rules ready"),
    },
    withAttribution(getVehicleImportRules)
  );

  // Toll roads
  server.registerTool(
    "get_toll_rates",
    {
      title: "Toll Road Rates By Country",
      description:
        "Toll reference for one country: payment system, per-km rates by vehicle class (car, campervan up to 3.5 t, over 3.5 t), vignette prices for every duration, concession sections and toll bridges/tunnels, each with verification date and source. Use it for toll roads, motorway fees, whether a vignette is needed and what it costs in one country.",
      inputSchema: getTollRatesInput,
      annotations: readOnlyAnnotations("Toll Road Rates By Country"),
      _meta: toolUiMeta(WIDGETS.tolls, "Checking toll roads…", "Toll roads ready"),
    },
    withAttribution(getTollRates)
  );
  server.registerTool(
    "estimate_route_tolls",
    {
      title: "Estimate Tolls For A Route",
      description:
        "Estimate toll cost for a road trip from 2-10 place names: per-km tolls, vignettes, bridges and tunnels, as a EUR range with a per-country breakdown. Flags partial results when a country on the route has no data. Use it only for the toll cost between named places when no other trip details are asked; for a whole trip use plan_road_trip.",
      inputSchema: estimateRouteTollsInput,
      annotations: readOnlyAnnotations("Estimate Tolls For A Route"),
      _meta: toolUiMeta(WIDGETS.tolls, "Estimating tolls…", "Toll estimate ready"),
    },
    withAttribution(estimateRouteTolls)
  );

  // Holidays & peak traffic
  server.registerTool(
    "get_holidays",
    {
      title: "Holidays And Peak Traffic Days",
      description:
        "Public holidays, school holidays (often regional, with ISO 3166-2 region codes) and official peak traffic days (France, Bison Futé) in one country for a period of up to 400 days. A country without data returns an error saying so — never present that as \"no holidays\". Use it for public holidays, days off, school holidays and peak traffic days.",
      inputSchema: getHolidaysInput,
      annotations: readOnlyAnnotations("Holidays And Peak Traffic Days"),
      _meta: toolUiMeta(WIDGETS.country, "Checking holidays…", "Holidays ready"),
    },
    withAttribution(getHolidays)
  );

  // Travel hazards
  server.registerTool(
    "get_travel_hazards",
    {
      title: "Travel Hazards In A Country",
      description:
        "Situation now in one country: UK FCDO travel advice level and current GDACS natural disasters (flood, earthquake, tropical cyclone, wildfire, drought, volcano) with alert level green/orange/red. Not a forecast. Use it when someone asks whether it is safe to go to a country now, about travel warnings or natural disasters.",
      inputSchema: getTravelHazardsInput,
      annotations: readOnlyAnnotations("Travel Hazards In A Country"),
      _meta: toolUiMeta(WIDGETS.country, "Checking travel hazards…", "Hazards ready"),
    },
    withAttribution(getTravelHazards)
  );
  server.registerTool(
    "get_active_fires",
    {
      title: "Active Fires In An Area",
      description:
        "NASA FIRMS VIIRS satellite fire detections of the last 48 hours in a bounding box up to 10°×10°, strongest first, with fire radiative power in MW. Use it for wildfires right now near a place or in a country: bbox is west,south,east,north in degrees — longitude first (Portugal ≈ -9.6,36.9,-6.1,42.2).",
      inputSchema: { ...getActiveFiresInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("Active Fires In An Area"),
      _meta: toolUiMeta(WIDGETS.country, "Checking active fires…", "Fires ready"),
    },
    withAttribution(withCardLocale(getActiveFires))
  );

  // Power plugs & electricity
  server.registerTool(
    "get_power_plugs",
    {
      title: "Power Plugs And Voltage",
      description:
        "Plug types (IEC A–N), mains voltage and frequency for one country, with the source of the value, plus the campsite hook-up connector in Europe (CEE17). Use it for socket and plug types, adapters, mains voltage and campsite hook-ups.",
      inputSchema: getPowerPlugsInput,
      annotations: readOnlyAnnotations("Power Plugs And Voltage"),
      _meta: toolUiMeta(WIDGETS.country, "Checking power plugs…", "Power plugs ready"),
    },
    withAttribution(getPowerPlugs)
  );

  // Customs
  server.registerTool(
    "get_customs_rules",
    {
      title: "Customs Rules On Entry By Car",
      description:
        "Customs rules when driving into a country, optionally from a given country: food bans, cash declaration, alcohol and tobacco limits, goods value, fuel in a canister. Each rule carries a verbatim official quote and source link. A country without data returns an error saying so — never present that as \"nothing is restricted\". Use it for what you may bring in by car: alcohol, tobacco, cash, meat and other food, goods limits.",
      inputSchema: getCustomsRulesInput,
      annotations: readOnlyAnnotations("Customs Rules On Entry By Car"),
      _meta: toolUiMeta(WIDGETS.country, "Checking customs rules…", "Customs rules ready"),
    },
    withAttribution(getCustomsRules)
  );

  // License plates of the world
  server.registerTool(
    "list_license_plate_countries",
    {
      title: "License Plate Countries",
      description: "Countries whose license plates are available: international code, number of regions and an example plate.",
      inputSchema: listLicensePlateCountriesInput,
      annotations: readOnlyAnnotations("License Plate Countries"),
      _meta: toolUiMeta(WIDGETS.plates, "Loading plate countries…", "Plate countries ready"),
    },
    withAttribution(listLicensePlateCountries)
  );
  server.registerTool(
    "get_license_plate_country",
    {
      title: "License Plate Format And Region Codes",
      description:
        "How a country's license plate looks and reads (standard, size, format), its plate types (standard, diplomatic, police, taxi…) with example numbers, and every region code on its plates, grouped by region — e.g. which region is 77 or 199 on Russian plates. Use it for what a plate region code means (77, 777, AA…) and a country's plate format.",
      inputSchema: getLicensePlateCountryInput,
      annotations: readOnlyAnnotations("License Plate Format And Region Codes"),
      _meta: toolUiMeta(WIDGETS.plates, "Loading plate formats…", "Plate formats ready"),
    },
    withAttribution(getLicensePlateCountry)
  );
  server.registerTool(
    "check_license_plate",
    {
      title: "Check A License Plate",
      description:
        "Validate a plate number against the country's format (look-alike letters are normalized) and say which region its code belongs to. Pass type to check against a specific plate type's format. Never identifies the owner or the vehicle's location. Use it to check a specific plate number.",
      inputSchema: checkLicensePlateInput,
      annotations: readOnlyAnnotations("Check A License Plate"),
      _meta: toolUiMeta(WIDGETS.plates, "Checking the plate…", "Plate checked"),
    },
    withAttribution(checkLicensePlate)
  );
  server.registerTool(
    "get_license_plate_image",
    {
      title: "License Plate Image",
      description:
        "Draw an illustrative image of a country's standard civilian license plate (PNG shown inline, plus SVG/PNG links). The number must match the country's standard format. Official, police, military and diplomatic plates are not drawn. Use it to draw or show a picture of a plate.",
      inputSchema: { ...getLicensePlateImageInput, locale: CARD_LOCALE },
      annotations: readOnlyAnnotations("License Plate Image"),
      _meta: toolUiMeta(WIDGETS.plates, "Drawing the plate…", "Plate ready"),
    },
    withAttribution(withCardLocale(getLicensePlateImage))
  );

  // Интерактивные карточки (MCP Apps) для погоды и событий
  registerWidgets(server, host);

  return server;
}
