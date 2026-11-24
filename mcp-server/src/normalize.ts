/**
 * Название страны → ISO-код до проверки схемы инструмента.
 *
 * Схемы требуют ISO 3166-1 alpha-2, но модели и боты то и дело присылают названия
 * («Armenia», «Турция», «Deutschland»): вызов падал «Input validation error» (журнал
 * MCP, 13.10.2026), хотя страна понятна. Чиним на входе для всех клиентов сразу —
 * Claude, ChatGPT, бот, сторонние агенты. Код остаётся кодом; непонятное не трогаем,
 * пусть схема скажет, что не так.
 */
const LOCALES = ["en", "ru", "de", "fr", "es", "pt", "tr", "it", "uk"];

// Ходовые имена, которых нет в CLDR (там «Türkiye», «Czechia»…).
const ALIASES: Record<string, string> = {
  turkey: "TR", turkiye: "TR", "czech republic": "CZ", holland: "NL", uk: "GB", england: "GB",
  britain: "GB", "great britain": "GB", usa: "US", america: "US", "south korea": "KR",
  macedonia: "MK", "north macedonia": "MK", russia: "RU", россия: "RU", рф: "RU",
};

let names: Map<string, string> | null = null;

function nameIndex(): Map<string, string> {
  if (names) return names;
  names = new Map(Object.entries(ALIASES));
  const A = "A".charCodeAt(0);
  for (const locale of LOCALES) {
    let display: Intl.DisplayNames;
    try {
      display = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      continue;
    }
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j);
        // Устаревшие коды (DD, SU, YU, BU) ICU называет как нынешние: «Germany» → DD.
        // Берём только канонические, иначе Германия превращалась бы в ГДР.
        if (new Intl.Locale(`und-${code}`).region !== code || code === "ZZ" || code === "EU") continue;
        const name = display.of(code);
        if (name && name !== code && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), code);
      }
    }
  }
  return names;
}

function toIso2(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return nameIndex().get(v.toLowerCase()) ?? value;
}

/** Аргументы-страны у всех инструментов. from/to — только у сравнения продуктов: у валют и праздников это не страны. */
const COUNTRY_KEYS = ["country", "country_code", "passport", "destination", "residence", "plates"];
const COUNTRY_LIST_KEYS = ["country_codes", "countries", "passports"];
const FROM_TO_COUNTRY_TOOLS = new Set(["compare_food_prices"]);

export function normalizeCountryArgs(tool: string, args: Record<string, unknown>): void {
  for (const key of COUNTRY_KEYS) {
    if (key in args) args[key] = toIso2(args[key]);
  }
  for (const key of COUNTRY_LIST_KEYS) {
    const v = args[key];
    if (Array.isArray(v)) args[key] = v.map(toIso2);
    else if (typeof v === "string") args[key] = v.split(/\s*[,;]\s*/).map((p) => toIso2(p)).join(",");
  }
  if (FROM_TO_COUNTRY_TOOLS.has(tool)) {
    for (const key of ["from", "to"]) {
      if (key in args) args[key] = toIso2(args[key]);
    }
  }
}

/**
 * Имена и значения аргументов, которые агенты угадывают вместо наших. Python-агент 23–24.11.2026
 * (журнал MCP) каждый день повторял одно и то же: countries, fuel, from_currency, «petrol»,
 * «Europe», «Exhibition» — и не получал ответа. Каноническое имя, если пришло, главнее синонима.
 */
const ARG_ALIASES: Record<string, Record<string, string>> = {
  compare_fuel_prices: { countries: "country_codes", fuel: "fuel_type" },
  find_cheapest_fuel: { fuel: "fuel_type" },
  get_currency_rate: { from_currency: "from", to_currency: "to" },
};
const FUEL_ALIASES: Record<string, string> = {
  petrol: "gasoline", gas: "gasoline", benzin: "gasoline", benzine: "gasoline", unleaded: "gasoline",
};
const FUEL_TOOLS = new Set(["compare_fuel_prices", "find_cheapest_fuel"]);
const REGION_TOOLS = new Set(["find_cheapest_fuel", "rank_food_prices", "list_best_weather_countries"]);
const EVENT_TYPE_ALIASES: Record<string, string> = {
  exhibition: "expo", exhibitions: "expo", expos: "expo", fair: "expo", trade_show: "expo", show: "expo",
  festivals: "festival", forums: "forum", meetups: "meetup", meet_up: "meetup", road_trip: "roadtrip", roadtrips: "roadtrip",
};

const slug = (v: string): string => v.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function normalizeArgAliases(tool: string, args: Record<string, unknown>): void {
  for (const [alias, name] of Object.entries(ARG_ALIASES[tool] ?? {})) {
    if (alias in args) {
      if (!(name in args)) args[name] = args[alias];
      delete args[alias];
    }
  }
  if (tool === "compare_fuel_prices" && typeof args.country_codes === "string") {
    args.country_codes = args.country_codes.split(/\s*[,;]\s*/).filter(Boolean);
  }
  if (FUEL_TOOLS.has(tool) && typeof args.fuel_type === "string") {
    const v = slug(args.fuel_type);
    args.fuel_type = FUEL_ALIASES[v] ?? v;
  }
  if (REGION_TOOLS.has(tool) && typeof args.region === "string") args.region = slug(args.region);
  if (tool === "list_events" && typeof args.type === "string") {
    const v = slug(args.type);
    args.type = EVENT_TYPE_ALIASES[v] ?? v;
  }
}

/** Применить к телу запроса (одиночный JSON-RPC или пачка) до того, как SDK проверит схему. */
export function normalizeToolCallBody(body: unknown): void {
  for (const message of Array.isArray(body) ? body : [body]) {
    const m = message as { method?: unknown; params?: { name?: unknown; arguments?: unknown } } | null;
    if (m?.method !== "tools/call" || typeof m.params?.name !== "string") continue;
    const args = m.params.arguments;
    if (args && typeof args === "object" && !Array.isArray(args)) {
      normalizeArgAliases(m.params.name, args as Record<string, unknown>);
      normalizeCountryArgs(m.params.name, args as Record<string, unknown>);
    }
  }
}
