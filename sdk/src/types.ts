// ─── Shared ────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  _attribution?: { source: string; license: string };
}

// ─── Fuel Prices ────────────────────────────────────────────────────────────

export interface FuelPrices {
  /** Prices per liter (or gallon for US/Ecuador) in local currency */
  gasoline?: number | null;
  diesel?: number | null;
  lpg?: number | null;
  e85?: number | null;
  premium?: number | null;
  cng?: number | null;
}

export interface FuelCountry {
  country_code: string;
  country_name: string;
  region?: string | null;
  currency: string;
  /**
   * Currency of each grade when it differs from `currency`
   * (Venezuela: diesel in USD, gasoline in VES). Always prefer it over `currency`.
   */
  currencies?: Record<string, string>;
  /** "liter" or "gallon" */
  unit: string;
  prices: FuelPrices;
  fetched_at?: string | null;
  sources?: string[];
}

export type FuelPricesResponse = ApiResponse<Record<string, FuelCountry>>;

// ─── Currency Rates ──────────────────────────────────────────────────────────

export interface CurrencyRatesData {
  /** Units of currency per 1 EUR */
  rates: Record<string, number>;
  base: string;
  updated_at: string;
}

export type CurrencyRatesResponse = ApiResponse<CurrencyRatesData>;

// ─── VanBasket ───────────────────────────────────────────────────────────────

export interface VanBasketSnapshot {
  year: number;
  index: number;
}

export interface VanBasketCountry {
  country_code: string;
  country_name: string;
  /** Cost-of-living index vs world baseline (100 = world average) */
  index: number;
  currency: string;
  data_quality?: string;
  snapshots?: VanBasketSnapshot[];
}

export type VanBasketListResponse = ApiResponse<VanBasketCountry[]>;
export type VanBasketCountryResponse = ApiResponse<VanBasketCountry>;

export interface VanBasketCompareData {
  from: VanBasketCountry;
  to: VanBasketCountry;
  /** to.index / from.index */
  ratio: number;
}

export type VanBasketCompareResponse = ApiResponse<VanBasketCompareData>;

// ─── VanSky Weather ──────────────────────────────────────────────────────────

export interface VanSkyDay {
  date: string;
  /** Overall vanlife suitability 0-100 */
  score: number;
  van_comfort?: number;
  sleep_score?: number;
  solar_yield?: number;
  driving_safety?: number;
  awning_safety?: number;
  condensation_risk?: number;
  summary?: string;
}

export interface VanSkyCountry {
  country_code: string;
  country_name: string;
  /** Overall 7-day suitability score 0-100 */
  score: number;
  forecast: VanSkyDay[];
}

export type VanSkyResponse = ApiResponse<VanSkyCountry>;

export interface VanSkyTopEntry {
  country_code: string;
  country_name: string;
  score: number;
}

export type VanSkyTopResponse = ApiResponse<VanSkyTopEntry[]>;

// ─── Events ──────────────────────────────────────────────────────────────────

export type EventStatus = "upcoming" | "ongoing" | "past";
export type EventType = "expo" | "festival" | "forum" | "meetup" | "roadtrip";

export interface VanEvent {
  slug: string;
  title: string;
  description?: string;
  type: EventType;
  status: EventStatus;
  country_code?: string;
  country_name?: string;
  city?: string;
  venue?: string;
  lat?: number;
  lng?: number;
  starts_at?: string;
  ends_at?: string;
  url?: string;
  article_count?: number;
}

export interface EventsListData {
  events: VanEvent[];
  pagination: PaginationMeta;
}

export type EventsListResponse = ApiResponse<EventsListData>;
export type EventResponse = ApiResponse<VanEvent>;

// ─── Stories ─────────────────────────────────────────────────────────────────

export type StoryCategory =
  | "camping"
  | "travel"
  | "gear"
  | "incident"
  | "lifestyle"
  | "opening"
  | "other";

export interface SourceArticle {
  url: string;
  title: string;
  published_at?: string;
  source_name?: string;
}

export interface VanStory {
  slug: string;
  title: string;
  summary?: string;
  category?: StoryCategory;
  country_code?: string;
  country_name?: string;
  image_url?: string;
  published_at?: string;
  article_count?: number;
  articles?: SourceArticle[];
}

export interface StoriesListData {
  stories: VanStory[];
  pagination: PaginationMeta;
}

export type StoriesListResponse = ApiResponse<StoriesListData>;
export type StoryResponse = ApiResponse<VanStory>;

// ─── Shared pagination ───────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total?: number;
  has_more?: boolean;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface OpenVanClientOptions {
  /** Default: "https://openvan.camp" */
  baseUrl?: string;
  /** Appended as ?source= for attribution tracking */
  source?: string;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

export interface EventsListOptions {
  locale?: string;
  status?: EventStatus | "all";
  type?: EventType;
  country?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface StoriesListOptions {
  locale?: string;
  category?: StoryCategory;
  country?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface VanSkyTopOptions {
  limit?: number;
  locale?: string;
}

// ─── Shared options ──────────────────────────────────────────────────────────

/** Languages the API translates names into. */
export type Locale = "en" | "ru" | "de" | "fr" | "es" | "pt" | "tr";

// ─── Route fuel cost ─────────────────────────────────────────────────────────

export interface RouteCostOptions {
  /** Tank volume, litres. */
  tank?: number;
  /** Consumption, litres per 100 km. */
  cons?: number;
  fuel?: "diesel" | "gasoline" | "lpg";
  /** ISO 4217 code for the total. */
  currency?: string;
  locale?: Locale;
}

// ─── Toll roads ──────────────────────────────────────────────────────────────

/** car; van = campervan/motorhome up to 3.5 t (default); heavy = over 3.5 t. */
export type TollVehicleClass = "car" | "van" | "heavy";

// ─── Visa ────────────────────────────────────────────────────────────────────

export interface VisaCheckOptions {
  /** Vehicle weight class: le35 or gt35. */
  weight?: "le35" | "gt35";
  /** Vehicle plate origin for the vehicle rule. */
  plate?: "eu" | "non_eu" | "eaeu" | "third";
  locale?: Locale;
}

export interface VisaRouteOptions extends VisaCheckOptions {
  /** Passports to answer for, up to 10. Defaults to the set matching locale. */
  passports?: string[];
}

// ─── License plates ──────────────────────────────────────────────────────────

export interface PlateImageOptions {
  region?: string;
  /** Plate type key from `plates.types()`. */
  type?: string;
  /** Draw any text, not only a number valid for the country. */
  custom?: boolean;
  format?: "svg" | "png";
  /** PNG width, 200–2000 px. */
  width?: number;
}

// ─── Holidays ────────────────────────────────────────────────────────────────

export interface HolidaysOptions {
  /** YYYY-MM-DD; the period is up to 400 days. */
  from?: string;
  to?: string;
  kind?: "public" | "school" | "traffic";
  locale?: Locale;
}

// ─── Roadbook ────────────────────────────────────────────────────────────────

export interface RoadbookInputs {
  /** Passports of the travellers, ISO alpha-2. */
  travelers?: string[];
  /** Country of the vehicle plates, ISO alpha-2. */
  plates?: string;
  weight?: "le35" | "gt35";
  vehicle_class?: "car" | "van" | "heavy";
  fuel?: string;
  /** Consumption, litres per 100 km. */
  cons?: number;
  /** Tank volume, litres. */
  tank?: number;
  /** Departure date, YYYY-MM-DD. */
  date?: string;
  /** Driving hours per day, 3–12. */
  hpd?: number;
  round?: boolean;
  avoid_tolls?: boolean;
  /** ISO 4217 code for the budget. */
  currency?: string;
}

export interface RoadbookOptions {
  locale?: Locale;
  name?: string;
  inputs?: RoadbookInputs;
}

export interface RoadbookCreated {
  code: string;
  /** Path of the roadbook page, e.g. /en/roadbook/wqhk8-munich-venice. */
  url: string;
  status: "pending" | "building" | "ready" | "failed";
  points: Array<{ name: string; lat: number; lng: number; country_code: string | null }>;
}

