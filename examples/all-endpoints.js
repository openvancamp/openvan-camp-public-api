/**
 * OpenVan.camp Public API — JavaScript Examples
 * https://openvan.camp/en/developers
 * License: CC BY 4.0 — attribution required
 */

const API = "https://openvan.camp";

// ─── FUEL PRICES ─────────────────────────────────────────────────────────────

// Top 5 cheapest diesel in Europe
async function cheapestDieselEurope() {
  const { data } = await fetch(`${API}/api/fuel/prices`).then((r) => r.json());

  return Object.values(data)
    .filter((c) => c.region === "europe" && c.prices.diesel !== null)
    .sort((a, b) => a.prices.diesel - b.prices.diesel)
    .slice(0, 5)
    .map((c) => ({
      country: c.country_name,
      diesel: c.prices.diesel,
      currency: c.currencies?.diesel ?? c.currency,
    }));
}

// Convert any fuel price to USD/liter
async function fuelPriceInUSD(countryCode) {
  const [{ data }, { rates }] = await Promise.all([
    fetch(`${API}/api/fuel/prices`).then((r) => r.json()),
    fetch(`${API}/api/currency/rates`).then((r) => r.json()),
  ]);

  const country = data[countryCode];
  if (!country) throw new Error(`Country ${countryCode} not found`);

  function toUSD(price, currency, unit) {
    if (price === null) return null;
    let usd = (price / rates[currency]) * rates["USD"];
    return unit === "gallon" ? usd / 3.78541 : usd; // normalize to per liter
  }

  return {
    country: country.country_name,
    gasoline_usd_per_liter: toUSD(country.prices.gasoline, country.currencies?.gasoline ?? country.currency, country.unit),
    diesel_usd_per_liter: toUSD(country.prices.diesel, country.currencies?.diesel ?? country.currency, country.unit),
  };
}

// Countries with LPG, sorted cheapest first, converted to EUR/liter
async function countriesWithLPG() {
  const [{ data }, { rates }] = await Promise.all([
    fetch(`${API}/api/fuel/prices`).then((r) => r.json()),
    fetch(`${API}/api/currency/rates`).then((r) => r.json()),
  ]);

  return Object.values(data)
    .filter((c) => c.prices.lpg !== null)
    .map((c) => {
      // A grade can have its own currency (Venezuela: diesel in USD, gasoline in VES)
      const rate = rates[c.currencies?.lpg ?? c.currency];
      const eurPerLiter = c.unit === "gallon" ? c.prices.lpg / rate / 3.78541 : c.prices.lpg / rate;
      return { country: c.country_name, eur_per_liter: +eurPerLiter.toFixed(3) };
    })
    .sort((a, b) => a.eur_per_liter - b.eur_per_liter);
}

// ─── VANBASKET ────────────────────────────────────────────────────────────────

// Top 10 cheapest countries for food
async function cheapestCountriesForFood() {
  const { data } = await fetch(`${API}/api/vanbasket/countries`).then((r) => r.json());

  return Object.values(data)
    .sort((a, b) => a.vanbasket_index - b.vanbasket_index)
    .slice(0, 10)
    .map((c) => ({
      country: c.country_name,
      index: c.vanbasket_index,
      vs_world: `${c.pct_vs_world > 0 ? "+" : ""}${c.pct_vs_world}%`,
    }));
}

// How much does the same food basket cost in two countries (in EUR)?
async function compareFoodCost(fromCode, toCode, budgetEUR = 100) {
  const { data: comparison } = await fetch(
    `${API}/api/vanbasket/compare?from=${fromCode}&to=${toCode}`
  ).then((r) => r.json());

  const { from, to, diff_percent, budget_100 } = comparison;
  return {
    from_country: from.country_name,
    to_country: to.country_name,
    budget_from: `€${budgetEUR}`,
    budget_to: `€${((budgetEUR * budget_100) / 100).toFixed(0)}`,
    saving_pct: diff_percent,
    cheaper: diff_percent < 0,
  };
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────

// Upcoming festivals in Germany
async function upcomingFestivalsDE() {
  const { events } = await fetch(
    `${API}/api/events?country=DE&status=upcoming&type=festival&locale=en`
  ).then((r) => r.json());

  return events.map((e) => ({
    name: e.event_name,
    city: e.city,
    dates: `${e.start_date} → ${e.end_date}`,
    url: e.url,
  }));
}

// Get event with all source articles
async function eventWithSources(slug, locale = "en") {
  const [event, articles] = await Promise.all([
    fetch(`${API}/api/event/${slug}?locale=${locale}`).then((r) => r.json()),
    fetch(`${API}/api/event/${slug}/articles?locale=${locale}`).then((r) => r.json()),
  ]);

  return {
    name: event.event_name,
    dates: `${event.start_date} → ${event.end_date}`,
    location: `${event.city}, ${event.country?.name}`,
    official_url: event.official_url,
    sources: articles.map((a) => ({
      title: a.title,
      source: a.source_name,
      url: a.original_url,
      lang: a.language,
    })),
  };
}

// ─── STORIES ─────────────────────────────────────────────────────────────────

// Latest vanlife news in English
async function latestStories(locale = "en", limit = 10) {
  const { stories, pagination } = await fetch(
    `${API}/api/stories?locale=${locale}&limit=${limit}`
  ).then((r) => r.json());

  console.log(`Total stories: ${pagination.total}`);
  return stories.map((s) => ({
    title: s.title,
    category: s.category.name,
    countries: s.countries.map((c) => `${c.flag_emoji} ${c.name}`).join(", "),
    published: s.first_published_at,
    url: s.url,
  }));
}

// Get story with all original publisher links
async function storyWithSources(slug, locale = "en") {
  const story = await fetch(`${API}/api/story/${slug}?locale=${locale}`).then((r) => r.json());

  return {
    title: story.title,
    summary: story.summary,
    sources: story.sources.map((s) => ({
      publisher: s.source_name,
      language: s.language,
      url: s.original_url,
      published: s.published_at,
    })),
  };
}

// News about motorhomes in Germany, in German
async function germanVanlifeNews() {
  const { stories } = await fetch(
    `${API}/api/stories?locale=de&country=DE&limit=10`
  ).then((r) => r.json());

  return stories.map((s) => ({ title: s.title, url: s.url }));
}

// ─── COMBINED: Road trip planner ─────────────────────────────────────────────

// Given a list of countries, return fuel and food costs in EUR, sorted cheapest first
async function roadTripCostComparison(countryCodes) {
  const [{ data: fuel }, { rates }, { data: vanbasket }] = await Promise.all([
    fetch(`${API}/api/fuel/prices`).then((r) => r.json()),
    fetch(`${API}/api/currency/rates`).then((r) => r.json()),
    fetch(`${API}/api/vanbasket/countries`).then((r) => r.json()),
  ]);

  return countryCodes
    .map((code) => {
      const f = fuel[code];
      const v = vanbasket[code];
      if (!f || !v) return null;

      const dieselEUR =
        f.prices.diesel !== null
          ? (f.prices.diesel / rates[f.currencies?.diesel ?? f.currency]) * (f.unit === "gallon" ? 1 / 3.78541 : 1)
          : null;

      return {
        country: f.country_name,
        diesel_eur_per_liter: dieselEUR ? +dieselEUR.toFixed(3) : null,
        food_index: v.vanbasket_index,
        food_vs_world: `${v.pct_vs_world > 0 ? "+" : ""}${v.pct_vs_world}%`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.diesel_eur_per_liter ?? 999) - (b.diesel_eur_per_liter ?? 999));
}

// ─── ROUTE FUEL COST & TOLL ROADS ────────────────────────────────────────────

// Fuel cost for 2–10 place names, with prices of every country on the way
async function routeFuelCost(waypoints, cons = 10, fuel = "diesel") {
  const r = await fetch(`${API}/api/route-cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ waypoints, cons, fuel }),
  }).then((r) => r.json());
  return { distance_km: r.distance_km, liters: r.liters, cost: `${r.fuel_cost} ${r.currency}` };
}

// Toll estimate in EUR. vehicleClass: car | van (up to 3.5 t) | heavy (over 3.5 t).
// partial = true: a country in unknown_countries has no data — it is not free.
async function routeTolls(waypoints, vehicleClass = "van") {
  const q = new URLSearchParams({ waypoints: waypoints.join("|"), vehicle_class: vehicleClass });
  const r = await fetch(`${API}/api/tolls/route?${q}`).then((r) => r.json());
  return { total_eur: r.total_eur, range_eur: r.range_eur, partial: r.partial, unknown: r.unknown_countries };
}

// ─── ROADBOOK (WHOLE TRIP) ───────────────────────────────────────────────────

// The same roadbook people build at openvan.camp/en/roadbook: create, wait, open the page.
// Identical requests return the same roadbook.
async function roadbook(places, inputs = {}, locale = "en") {
  const created = await fetch(`${API}/api/roadbook/from-places`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ places, locale, name: places.join(" — "), inputs }),
  }).then((r) => r.json());
  let status = created.status;
  for (let i = 0; i < 40 && status !== "ready" && status !== "failed"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    status = (await fetch(`${API}/api/roadbook/${created.code}/status`).then((r) => r.json())).status;
  }
  return { status, url: `${API}${created.url}`, points: created.points.map((p) => `${p.name} (${p.country_code})`) };
}

// VanSky weather of one city: today and the coming 7 days
async function cityWeather(country, citySlug) {
  const { data } = await fetch(`${API}/api/vansky/weather/${country}/${citySlug}`).then((r) => r.json());
  return { city: data.city_name, today: data.van_score, week: data.week_score };
}

// ─── VISA ────────────────────────────────────────────────────────────────────

async function visaCheck(passport, destination) {
  const { data } = await fetch(
    `${API}/api/visa/check?passport=${passport}&destination=${destination}`
  ).then((r) => r.json());
  return {
    entry_mode: data.entry_mode,
    max_continuous_days: data.stay.max_continuous,
    max_total_days: data.stay.max_total,
    window_days: data.stay.window_days,
    source: data.stay.source_url,
  };
}

// ─── LICENSE PLATES ──────────────────────────────────────────────────────────

async function plateRegion(country, number, region) {
  const q = new URLSearchParams({ number, region });
  const { data } = await fetch(`${API}/api/plates/${country}/validate?${q}`).then((r) => r.json());
  return { valid: data.valid, region: data.region_name, iso: data.region_iso3166_2 };
}

// Ready plate image for <img src> — no request needed
const plateImageUrl = (country, number, region = "") =>
  `${API}/api/plates/${country}/plate.svg?${new URLSearchParams({ number, region })}`;

// ─── HOLIDAYS, HAZARDS, POWER PLUGS, CUSTOMS ─────────────────────────────────

// kind: public | school | traffic. A country without data answers with an error, not "no holidays".
async function holidays(country, from, to, kind) {
  const q = new URLSearchParams({ from, to, ...(kind ? { kind } : {}) });
  const r = await fetch(`${API}/api/holidays/countries/${country}?${q}`);
  if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
  const { items } = await r.json();
  return items.map((h) => ({ kind: h.kind, name: h.name, start: h.start, end: h.end, regions: h.regions.map((x) => x.code) }));
}

// FCDO advice level + current GDACS disasters (the situation now, not a forecast)
async function travelHazards(country) {
  const d = await fetch(`${API}/api/hazards/countries/${country}`).then((r) => r.json());
  return { advisory: d.advisory?.level ?? null, events: d.events.map((e) => `${e.name} (${e.alert_level})`) };
}

// NASA FIRMS fires of the last 48 h, box up to 10°×10°. 503 = area is loading, retry in a minute.
async function activeFires([minLon, minLat, maxLon, maxLat]) {
  const r = await fetch(`${API}/api/hazards/fires?bbox=${minLon},${minLat},${maxLon},${maxLat}`);
  if (r.status === 503) return null;
  return (await r.json()).fires;
}

async function powerPlugs(country) {
  const d = await fetch(`${API}/api/electricity/countries/${country}`).then((r) => r.json());
  return { plugs: d.plugs, voltage: d.voltage, frequency: d.frequency };
}

// Customs rules on entry by car, each with an official quote and source link
async function customsRules(country, from) {
  const d = await fetch(`${API}/api/customs/countries/${country}${from ? `?from=${from}` : ""}`).then((r) => r.json());
  return d.items.map((i) => ({ topic: i.topic, summary: i.summary, source: i.source_url }));
}

// ─── Usage examples ───────────────────────────────────────────────────────────

(async () => {
  console.log("=== Top 5 cheapest diesel in Europe ===");
  console.table(await cheapestDieselEurope());

  console.log("\n=== Fuel prices in Turkey (USD/liter) ===");
  console.log(await fuelPriceInUSD("TR"));

  console.log("\n=== Food cost comparison DE → TR ===");
  console.log(await compareFoodCost("DE", "TR", 100));

  console.log("\n=== Latest stories in English ===");
  const stories = await latestStories("en", 3);
  stories.forEach((s) => console.log(`• ${s.title} [${s.category}]`));

  console.log("\n=== Road trip: Germany, Turkey, Georgia ===");
  console.table(await roadTripCostComparison(["DE", "TR", "GE", "CZ", "PL"]));

  console.log("\n=== Berlin → Prague: fuel and tolls ===");
  console.log(await routeFuelCost(["Berlin", "Prague"]), await routeTolls(["Berlin", "Prague"]));

  console.log("\n=== Roadbook Munich → Venice (German passport, 10 l/100 km diesel) ===");
  console.log(await roadbook(["Munich", "Venice"], { travelers: ["DE"], cons: 10, fuel: "diesel" }));

  console.log("\n=== Weather in Málaga for a campervan ===");
  console.log(await cityWeather("ES", "malaga"));

  console.log("\n=== Visa: Russian passport → Turkey ===");
  console.log(await visaCheck("RU", "TR"));

  console.log("\n=== Plate А123ВС 799 ===");
  console.log(await plateRegion("ru", "A123BC", "799"), plateImageUrl("ru", "A123BC", "799"));

  console.log("\n=== France: peak traffic days, October–November ===");
  console.table(await holidays("FR", "2026-10-01", "2026-11-15", "traffic"));

  console.log("\n=== Turkey: hazards and plugs ===");
  console.log(await travelHazards("TR"), await powerPlugs("TR"));

  console.log("\n=== Customs Germany → Norway ===");
  console.table(await customsRules("NO", "DE"));
})();
