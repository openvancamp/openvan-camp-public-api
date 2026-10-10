import { OpenVanClient } from "./client.js";
import type {
  RoadbookCreated,
  RoadbookOptions,
  OpenVanClientOptions,
  FuelPricesResponse,
  FuelCountry,
  VanBasketListResponse,
  VanBasketCountryResponse,
  VanBasketCompareResponse,
  EventsListOptions,
  StoriesListOptions,
  VanSkyTopOptions,
  Locale,
  RouteCostOptions,
  TollVehicleClass,
  VisaCheckOptions,
  VisaRouteOptions,
  PlateImageOptions,
  HolidaysOptions,
} from "./types.js";

const LITERS_PER_GALLON = 3.78541;

/**
 * OpenVan.camp SDK — free vanlife/RV travel data.
 *
 * @example
 * ```ts
 * import { OpenVan } from "@openvancamp/sdk";
 *
 * const ov = new OpenVan();
 *
 * const de = await ov.fuel.country("DE");
 * const weather = await ov.weather.score("FR");
 * const basket = await ov.basket.compare("DE", "TR");
 * const visa = await ov.visa.check("RU", "TR");
 * const tolls = await ov.tolls.route(["Rome", "Paris"]);
 * const trip = await ov.roadbook.plan(["Munich", "Venice"], { inputs: { travelers: ["DE"], cons: 10 } });
 * ```
 *
 * Docs: https://openvan.camp/docs
 * License: CC BY 4.0
 */
export class OpenVan {
  private readonly client: OpenVanClient;

  readonly fuel: FuelResource;
  readonly currency: CurrencyResource;
  readonly basket: BasketResource;
  readonly weather: WeatherResource;
  readonly events: EventsResource;
  readonly stories: StoriesResource;
  readonly tolls: TollsResource;
  readonly visa: VisaResource;
  readonly plates: PlatesResource;
  readonly holidays: HolidaysResource;
  readonly hazards: HazardsResource;
  readonly electricity: ElectricityResource;
  readonly customs: CustomsResource;
  readonly roadbook: RoadbookResource;

  constructor(options: OpenVanClientOptions = {}) {
    this.client = new OpenVanClient(options);
    this.fuel = new FuelResource(this.client);
    this.currency = new CurrencyResource(this.client);
    this.basket = new BasketResource(this.client);
    this.weather = new WeatherResource(this.client);
    this.events = new EventsResource(this.client);
    this.stories = new StoriesResource(this.client);
    this.tolls = new TollsResource(this.client);
    this.visa = new VisaResource(this.client);
    this.plates = new PlatesResource(this.client);
    this.holidays = new HolidaysResource(this.client);
    this.hazards = new HazardsResource(this.client);
    this.electricity = new ElectricityResource(this.client);
    this.customs = new CustomsResource(this.client);
    this.roadbook = new RoadbookResource(this.client);
  }
}

// ─── Fuel ────────────────────────────────────────────────────────────────────

class FuelResource {
  constructor(private readonly client: OpenVanClient) {}

  /** All countries fuel prices. Returns a map of ISO country code → FuelCountry. */
  async prices(): Promise<Record<string, FuelCountry>> {
    const res = await this.client.get<FuelPricesResponse>("/api/fuel/prices");
    return res.data;
  }

  /** Fuel prices for a single country. */
  async country(code: string): Promise<FuelCountry> {
    const all = await this.prices();
    const entry = all[code.toUpperCase()];
    if (!entry) throw new Error(`No fuel data for country code "${code}"`);
    return entry;
  }

  /**
   * Cheapest countries by fuel type, sorted cheapest-first in EUR per liter.
   * Each grade is converted with its own currency (`currencies`), gallon prices are
   * normalized to liters, and countries whose currency has no rate are left out.
   */
  async cheapest(
    fuelType: "gasoline" | "diesel" | "lpg" | "cng" = "diesel",
    limit = 10
  ): Promise<FuelCountry[]> {
    const [prices, rates] = await Promise.all([
      this.prices(),
      this.client
        .get<{ rates: Record<string, number> }>("/api/currency/rates")
        .then((r) => r.rates)
        .catch(() => ({} as Record<string, number>)),
    ]);

    const eurPerLiter = (c: FuelCountry): number => {
      const p = c.prices[fuelType];
      if (p == null) return NaN;
      const currency = (c.currencies?.[fuelType] ?? c.currency).toUpperCase();
      const rate = currency === "EUR" ? 1 : rates[currency];
      if (!rate) return NaN;
      const eur = p / rate;
      return c.unit.toLowerCase().includes("gal") ? eur / LITERS_PER_GALLON : eur;
    };

    return Object.values(prices)
      .map((c) => ({ c, eur: eurPerLiter(c) }))
      .filter((x) => !isNaN(x.eur))
      .sort((a, b) => a.eur - b.eur)
      .slice(0, limit)
      .map((x) => x.c);
  }

  /** Fuel cost for a route of 2–10 place names, with per-country prices along the way. */
  async routeCost(waypoints: string[], options: RouteCostOptions = {}): Promise<unknown> {
    return this.client.post("/api/route-cost", { waypoints, ...options });
  }
}

// ─── Currency ────────────────────────────────────────────────────────────────

class CurrencyResource {
  constructor(private readonly client: OpenVanClient) {}

  /** EUR-based exchange rates for 150+ currencies.
   * API returns { success, rates, cached, updated_at } — rates are at root level.
   */
  async rates(): Promise<Record<string, number>> {
    const res = await this.client.get<{ rates: Record<string, number> }>("/api/currency/rates");
    return res.rates;
  }

  /** Convert amount from one currency to another via EUR. */
  async convert(amount: number, from: string, to: string): Promise<number> {
    const rates = await this.rates();
    const fromRate = from.toUpperCase() === "EUR" ? 1 : rates[from.toUpperCase()];
    const toRate = to.toUpperCase() === "EUR" ? 1 : rates[to.toUpperCase()];
    if (!fromRate) throw new Error(`Unknown currency: ${from}`);
    if (!toRate) throw new Error(`Unknown currency: ${to}`);
    return (amount / fromRate) * toRate;
  }
}

// ─── VanBasket ───────────────────────────────────────────────────────────────

class BasketResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Food cost index for all 92 countries (world baseline = 100). */
  async list(): Promise<VanBasketListResponse["data"]> {
    const res = await this.client.get<VanBasketListResponse>("/api/vanbasket/countries");
    return res.data;
  }

  /** Food cost index for a single country with historical snapshots. */
  async country(code: string): Promise<VanBasketCountryResponse["data"]> {
    const res = await this.client.get<VanBasketCountryResponse>(
      `/api/vanbasket/countries/${code.toUpperCase()}`
    );
    return res.data;
  }

  /** Compare food cost between two countries. ratio = to.index / from.index */
  async compare(from: string, to: string): Promise<VanBasketCompareResponse["data"]> {
    const res = await this.client.get<VanBasketCompareResponse>("/api/vanbasket/compare", {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
    });
    return res.data;
  }
}

// ─── VanSky Weather ──────────────────────────────────────────────────────────

class WeatherResource {
  constructor(private readonly client: OpenVanClient) {}

  /**
   * Vanlife weather for one country: `van_score` 0–100, `score_label`, 7-day `forecast`,
   * sleep / drive / solar / sea scores.
   */
  async score(countryCode: string): Promise<Record<string, unknown>> {
    const res = await this.client.get<{ data: Record<string, unknown> }>(
      `/api/vansky/weather/${countryCode.toUpperCase()}`
    );
    return res.data;
  }

  /**
   * Vanlife weather for one city: score today and for the coming 7 days, sleep / drive / solar.
   * `citySlug` is the last part of the VanSky URL, e.g. "barcelona".
   */
  async city(countryCode: string, citySlug: string, locale?: Locale): Promise<Record<string, unknown>> {
    const res = await this.client.get<{ data: Record<string, unknown> }>(
      `/api/vansky/weather/${countryCode.toUpperCase()}/${encodeURIComponent(citySlug)}`,
      { locale }
    );
    return res.data;
  }

  /** All countries with weather data (one request, ~1 MB). */
  async all(): Promise<Record<string, unknown>[]> {
    const res = await this.client.get<{ data: Record<string, unknown>[] }>("/api/vansky/weather");
    return res.data;
  }

  /** Top N countries by vanlife weather suitability today, best first. */
  async top(options: VanSkyTopOptions = {}): Promise<Record<string, unknown>[]> {
    const all = await this.all();
    return [...all]
      .sort((a, b) => Number(b.van_score ?? 0) - Number(a.van_score ?? 0))
      .slice(0, options.limit ?? 10);
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

class EventsResource {
  constructor(private readonly client: OpenVanClient) {}

  /**
   * List vanlife/RV events.
   * API returns { events: [...], pagination: {}, _attribution } — events at root level.
   */
  async list(options: EventsListOptions = {}): Promise<{
    events: Record<string, unknown>[];
    pagination: Record<string, unknown>;
  }> {
    const res = await this.client.get<{
      events: Record<string, unknown>[];
      pagination: Record<string, unknown>;
    }>("/api/events", {
      locale: options.locale,
      status: options.status,
      type: options.type,
      country: options.country,
      search: options.search,
      page: options.page,
      limit: options.limit,
    });
    return { events: res.events, pagination: res.pagination };
  }

  /** Get a single event by slug. */
  async get(slug: string): Promise<unknown> {
    return this.client.get(`/api/event/${slug}`);
  }
}

// ─── Stories ─────────────────────────────────────────────────────────────────

class StoriesResource {
  constructor(private readonly client: OpenVanClient) {}

  /**
   * List news stories.
   * API returns { stories: [...], pagination: {}, _attribution } — stories at root level.
   */
  async list(options: StoriesListOptions = {}): Promise<{
    stories: Record<string, unknown>[];
    pagination: Record<string, unknown>;
  }> {
    const res = await this.client.get<{
      stories: Record<string, unknown>[];
      pagination: Record<string, unknown>;
    }>("/api/stories", {
      locale: options.locale,
      category: options.category,
      country: options.country,
      search: options.search,
      page: options.page,
      limit: options.limit,
    });
    return { stories: res.stories, pagination: res.pagination };
  }

  /** Get a single story with all source articles. */
  async get(slug: string): Promise<unknown> {
    return this.client.get(`/api/story/${slug}`);
  }
}

// ─── Toll roads ──────────────────────────────────────────────────────────────

class TollsResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Countries with toll data: payment system, per-km rates by vehicle class, vignettes. */
  async countries(locale?: Locale): Promise<unknown> {
    return this.client.get("/api/tolls/countries", { locale });
  }

  /** Toll reference for one country: rates, vignettes, concession sections, bridges and tunnels. */
  async country(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/tolls/countries/${code.toUpperCase()}`, { locale });
  }

  /**
   * Toll cost for a route of 2–10 place names as a EUR range.
   * Check `partial` and `unknown_countries`: a country without data is not a free country.
   */
  async route(
    waypoints: string[],
    vehicleClass: TollVehicleClass = "van",
    locale?: Locale
  ): Promise<unknown> {
    return this.client.get("/api/tolls/route", {
      waypoints: waypoints.join("|"),
      vehicle_class: vehicleClass,
      locale,
    });
  }
}

// ─── Visa ────────────────────────────────────────────────────────────────────

class VisaResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Entry rules for one passport and destination: entry mode, length of stay, how days are counted. */
  async check(passport: string, destination: string, options: VisaCheckOptions = {}): Promise<unknown> {
    return this.client.get("/api/visa/check", {
      passport: passport.toUpperCase(),
      destination: destination.toUpperCase(),
      weight: options.weight,
      plate: options.plate,
      locale: options.locale,
    });
  }

  /** Visa rules for a whole route (up to 12 countries in travel order) and up to 10 passports. */
  async route(countries: string[], options: VisaRouteOptions = {}): Promise<unknown> {
    return this.client.get("/api/visa/route", {
      t: countries.join(","),
      p: options.passports?.join(","),
      w: options.weight,
      plate: options.plate,
      locale: options.locale,
    });
  }

  /** All destinations for one passport. */
  async passport(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/visa/passport/${code.toUpperCase()}`, { locale });
  }

  /** Temporary import rules for a foreign-plated vehicle in a country. */
  async vehicle(place: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/visa/vehicle/${encodeURIComponent(place)}`, { locale });
  }
}

// ─── License plates ──────────────────────────────────────────────────────────

class PlatesResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Countries with license plate data: international code, regions, example plate. */
  async list(locale?: Locale): Promise<unknown> {
    return this.client.get("/api/plates", { locale });
  }

  /** Plate format and every region code of one country. */
  async country(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/plates/${code.toLowerCase()}`, { locale });
  }

  /** Plate types (private, taxi, diplomatic…). Empty for countries without a breakdown. */
  async types(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/plates/${code.toLowerCase()}/types`, { locale });
  }

  /** Validate a plate number and resolve its region code. */
  async validate(
    code: string,
    number: string,
    options: { region?: string; type?: string; locale?: Locale } = {}
  ): Promise<unknown> {
    return this.client.get(`/api/plates/${code.toLowerCase()}/validate`, { number, ...options });
  }

  /** A random valid plate with image URLs. */
  async random(code: string, type?: string): Promise<unknown> {
    return this.client.get(`/api/plates/${code.toLowerCase()}/random`, { type });
  }

  /** URL of a ready plate image — put it straight into `<img src>`. No request is made. */
  imageUrl(code: string, number: string, options: PlateImageOptions = {}): string {
    const format = options.format ?? "svg";
    return this.client.url(`/api/plates/${code.toLowerCase()}/plate.${format}`, {
      number,
      region: options.region,
      type: options.type,
      custom: options.custom ? 1 : undefined,
      width: format === "png" ? options.width : undefined,
    });
  }
}

// ─── Holidays ────────────────────────────────────────────────────────────────

class HolidaysResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Countries with holiday data. */
  async countries(locale?: Locale): Promise<unknown> {
    return this.client.get("/api/holidays/countries", { locale });
  }

  /**
   * Public holidays, school holidays (with ISO 3166-2 regions) and peak traffic days.
   * A country without data throws — that is not the same as "no holidays".
   */
  async country(code: string, options: HolidaysOptions = {}): Promise<unknown> {
    return this.client.get(`/api/holidays/countries/${code.toUpperCase()}`, { ...options });
  }
}

// ─── Travel hazards ──────────────────────────────────────────────────────────

class HazardsResource {
  constructor(private readonly client: OpenVanClient) {}

  /** UK FCDO travel advice level and current GDACS natural disasters in a country. Not a forecast. */
  async country(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/hazards/countries/${code.toUpperCase()}`, { locale });
  }

  /**
   * NASA FIRMS fire detections of the last 48 hours in a bounding box up to 10°×10°.
   * A new area may answer 503 "being loaded, retry in a minute".
   */
  async fires(bbox: [minLon: number, minLat: number, maxLon: number, maxLat: number]): Promise<unknown> {
    return this.client.get("/api/hazards/fires", { bbox: bbox.join(",") });
  }
}

// ─── Power plugs ─────────────────────────────────────────────────────────────

class ElectricityResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Plug types and mains voltage of every country. */
  async countries(locale?: Locale): Promise<unknown> {
    return this.client.get("/api/electricity/countries", { locale });
  }

  /** Plug types (IEC A–N), voltage, frequency and campsite hook-up connector of one country. */
  async country(code: string, locale?: Locale): Promise<unknown> {
    return this.client.get(`/api/electricity/countries/${code.toUpperCase()}`, { locale });
  }
}

// ─── Customs ─────────────────────────────────────────────────────────────────

class CustomsResource {
  constructor(private readonly client: OpenVanClient) {}

  /** Customs jurisdictions and blocs. */
  async countries(locale?: Locale): Promise<unknown> {
    return this.client.get("/api/customs/countries", { locale });
  }

  /**
   * Customs rules on entry by car, optionally from a given country, each with an official quote.
   * A country without data throws — that is not the same as "nothing is restricted".
   */
  async country(code: string, options: { from?: string; locale?: Locale } = {}): Promise<unknown> {
    return this.client.get(`/api/customs/countries/${code.toUpperCase()}`, {
      from: options.from?.toUpperCase(),
      locale: options.locale,
    });
  }
}

// ─── Roadbook ────────────────────────────────────────────────────────────────

class RoadbookResource {
  constructor(private readonly client: OpenVanClient) {}

  /**
   * Create a roadbook from 2–10 place names — the same trip plan as the OpenVan roadbook
   * wizard. Identical requests return the same roadbook. The route is built in the
   * background: use `status()` or `plan()` to wait for it.
   */
  async create(places: string[], options: RoadbookOptions = {}): Promise<RoadbookCreated> {
    return this.client.post("/api/roadbook/from-places", {
      places,
      locale: options.locale ?? "en",
      name: options.name ?? places.join(" — ").slice(0, 80),
      inputs: options.inputs ?? {},
    });
  }

  /** Build status of a roadbook: pending, building, ready or failed. */
  async status(code: string): Promise<{ status: "pending" | "building" | "ready" | "failed"; error: string | null }> {
    return this.client.get(`/api/roadbook/${encodeURIComponent(code)}/status`);
  }

  /**
   * Create a roadbook and wait until its route is built (default up to 60 s).
   * Resolves with the roadbook; open `https://openvan.camp${url}` for the full plan.
   */
  async plan(places: string[], options: RoadbookOptions & { timeoutMs?: number } = {}): Promise<RoadbookCreated> {
    const created = await this.create(places, options);
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    let status = created.status;
    while (status !== "ready" && status !== "failed" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      status = (await this.status(created.code)).status;
    }
    return { ...created, status };
  }
}
