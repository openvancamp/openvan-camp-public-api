import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

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
    const result = await handler(...args);
    const r = result as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    if (r?.isError || !Array.isArray(r?.content)) return result;
    const last = [...r.content].reverse().find((c) => c.type === "text" && typeof c.text === "string");
    if (last && !last.text!.includes("OpenVan.camp (CC BY 4.0)")) {
      last.text += ATTRIBUTION_FOOTER;
    }
    return result;
  };
}

/**
 * Factory shared between stdio (dist/index.js) and HTTP (dist/sse.js) entry points.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "openvan-mcp",
    version: VERSION,
  });

  // Fuel prices
  server.registerTool(
    "get_fuel_prices",
    {
      title: "Get Fuel Prices",
      description:
        "Current retail fuel prices for all API-supported countries. Supports the same price keys as /api/fuel/prices, including gasoline, diesel, LPG, CNG, E85, kerosene and grade variants. Pass country_code to get one country in detail; omit it for a summary list.",
      inputSchema: getFuelPricesInput,
      annotations: readOnlyAnnotations("Get Fuel Prices"),
    },
    withAttribution(getFuelPrices)
  );
  server.registerTool(
    "compare_fuel_prices",
    {
      title: "Compare Fuel Prices",
      description:
        "Compare current prices for one fuel type across 2-10 countries. Returns sorted table cheapest-first.",
      inputSchema: compareFuelPricesInput,
      annotations: readOnlyAnnotations("Compare Fuel Prices"),
    },
    withAttribution(compareFuelPrices)
  );
  server.registerTool(
    "find_cheapest_fuel",
    {
      title: "Find Cheapest Fuel",
      description:
        "Find the cheapest countries for a given fuel type in a region (or worldwide). Useful for route planning.",
      inputSchema: findCheapestFuelInput,
      annotations: readOnlyAnnotations("Find Cheapest Fuel"),
    },
    withAttribution(findCheapestFuel)
  );

  // VanSky weather
  server.registerTool(
    "get_vansky_weather",
    {
      title: "Get VanSky Weather Score",
      description:
        "Get VanSky vanlife weather suitability score (0-100) for a country: van_score, sleep_score, solar yield, driving conditions, awning safety, condensation risk, 7-day forecast.",
      inputSchema: getVanSkyWeatherInput,
      annotations: readOnlyAnnotations("Get VanSky Weather Score"),
    },
    withAttribution(getVanSkyWeather)
  );
  server.registerTool(
    "list_vansky_top",
    {
      title: "List Top VanSky Countries",
      description:
        "List the top N countries with the highest VanSky van-travel suitability score today.",
      inputSchema: listVanSkyTopInput,
      annotations: readOnlyAnnotations("List Top VanSky Countries"),
    },
    withAttribution(listVanSkyTop)
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
    },
    withAttribution(getEvent)
  );

  // Stories (news)
  server.registerTool(
    "search_stories",
    {
      title: "Search Vanlife News",
      description:
        "Search aggregated vanlife news stories (7 languages, 400+ sources). Filter by search query, category, country, locale.",
      inputSchema: searchStoriesInput,
      annotations: readOnlyAnnotations("Search Vanlife News"),
    },
    withAttribution(searchStories)
  );

  // VanBasket (food price index)
  server.registerTool(
    "compare_vanbasket",
    {
      title: "Compare Food Prices",
      description:
        "Compare food price index between two countries (world average = 100). Higher number = more expensive food.",
      inputSchema: compareVanBasketInput,
      annotations: readOnlyAnnotations("Compare Food Prices"),
    },
    withAttribution(compareVanBasket)
  );
  server.registerTool(
    "get_vanbasket",
    {
      title: "Get Food Price Index",
      description:
        "Get VanBasket food price index details for one country.",
      inputSchema: getVanBasketInput,
      annotations: readOnlyAnnotations("Get Food Price Index"),
    },
    withAttribution(getVanBasket)
  );

  // Currency
  server.registerTool(
    "get_currency_rate",
    {
      title: "Convert Currency",
      description:
        "Convert an amount between two currencies using live rates (150+ currencies, daily updates).",
      inputSchema: getCurrencyRateInput,
      annotations: readOnlyAnnotations("Convert Currency"),
    },
    withAttribution(getCurrencyRate)
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
    },
    withAttribution(getVehicleImportRules)
  );

  // Toll roads
  server.registerTool(
    "get_toll_rates",
    {
      title: "Toll Road Rates By Country",
      description:
        "Toll reference for one country: payment system, per-km rates by vehicle class (car, campervan up to 3.5 t, over 3.5 t), vignette prices for every duration, concession sections and toll bridges/tunnels, each with verification date and source.",
      inputSchema: getTollRatesInput,
      annotations: readOnlyAnnotations("Toll Road Rates By Country"),
    },
    withAttribution(getTollRates)
  );
  server.registerTool(
    "estimate_route_tolls",
    {
      title: "Estimate Tolls For A Route",
      description:
        "Estimate toll cost for a road trip from 2-10 place names: per-km tolls, vignettes, bridges and tunnels, as a EUR range with a per-country breakdown. Flags partial results when a country on the route has no data.",
      inputSchema: estimateRouteTollsInput,
      annotations: readOnlyAnnotations("Estimate Tolls For A Route"),
    },
    withAttribution(estimateRouteTolls)
  );

  // Holidays & peak traffic
  server.registerTool(
    "get_holidays",
    {
      title: "Holidays And Peak Traffic Days",
      description:
        "Public holidays, school holidays (often regional, with ISO 3166-2 region codes) and official peak traffic days (France, Bison Futé) in one country for a period of up to 400 days. A country without data returns an error saying so — never present that as \"no holidays\".",
      inputSchema: getHolidaysInput,
      annotations: readOnlyAnnotations("Holidays And Peak Traffic Days"),
    },
    withAttribution(getHolidays)
  );

  // Travel hazards
  server.registerTool(
    "get_travel_hazards",
    {
      title: "Travel Hazards In A Country",
      description:
        "Situation now in one country: UK FCDO travel advice level and current GDACS natural disasters (flood, earthquake, tropical cyclone, wildfire, drought, volcano) with alert level green/orange/red. Not a forecast.",
      inputSchema: getTravelHazardsInput,
      annotations: readOnlyAnnotations("Travel Hazards In A Country"),
    },
    withAttribution(getTravelHazards)
  );
  server.registerTool(
    "get_active_fires",
    {
      title: "Active Fires In An Area",
      description:
        "NASA FIRMS VIIRS satellite fire detections of the last 48 hours in a bounding box up to 10°×10°, strongest first, with fire radiative power in MW.",
      inputSchema: getActiveFiresInput,
      annotations: readOnlyAnnotations("Active Fires In An Area"),
    },
    withAttribution(getActiveFires)
  );

  // Power plugs & electricity
  server.registerTool(
    "get_power_plugs",
    {
      title: "Power Plugs And Voltage",
      description:
        "Plug types (IEC A–N), mains voltage and frequency for one country, with the source of the value, plus the campsite hook-up connector in Europe (CEE17).",
      inputSchema: getPowerPlugsInput,
      annotations: readOnlyAnnotations("Power Plugs And Voltage"),
    },
    withAttribution(getPowerPlugs)
  );

  // Customs
  server.registerTool(
    "get_customs_rules",
    {
      title: "Customs Rules On Entry By Car",
      description:
        "Customs rules when driving into a country, optionally from a given country: food bans, cash declaration, alcohol and tobacco limits, goods value, fuel in a canister. Each rule carries a verbatim official quote and source link. A country without data returns an error saying so — never present that as \"nothing is restricted\".",
      inputSchema: getCustomsRulesInput,
      annotations: readOnlyAnnotations("Customs Rules On Entry By Car"),
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
    },
    withAttribution(listLicensePlateCountries)
  );
  server.registerTool(
    "get_license_plate_country",
    {
      title: "License Plate Format And Region Codes",
      description:
        "How a country's license plate looks and reads (standard, size, format), its plate types (standard, diplomatic, police, taxi…) with example numbers, and every region code on its plates, grouped by region — e.g. which region is 77 or 199 on Russian plates.",
      inputSchema: getLicensePlateCountryInput,
      annotations: readOnlyAnnotations("License Plate Format And Region Codes"),
    },
    withAttribution(getLicensePlateCountry)
  );
  server.registerTool(
    "check_license_plate",
    {
      title: "Check A License Plate",
      description:
        "Validate a plate number against the country's format (look-alike letters are normalized) and say which region its code belongs to. Pass type for special plates (e.g. Russian diplomatic, police). Never identifies the owner or the vehicle's location.",
      inputSchema: checkLicensePlateInput,
      annotations: readOnlyAnnotations("Check A License Plate"),
    },
    withAttribution(checkLicensePlate)
  );
  server.registerTool(
    "get_license_plate_image",
    {
      title: "License Plate Image",
      description:
        "Draw a license plate as an image (PNG shown inline, plus SVG/PNG links) exactly as openvan.camp renders it. type picks the plate kind, e.g. diplomatic (red), police (blue), military (black), taxi_bus (yellow) on Russian plates; each type has its own number format. custom=true draws any text, e.g. a name, in the plate layout.",
      inputSchema: getLicensePlateImageInput,
      annotations: readOnlyAnnotations("License Plate Image"),
    },
    withAttribution(getLicensePlateImage)
  );

  return server;
}
