# @openvancamp/sdk

Official JavaScript/TypeScript SDK for [OpenVan.camp](https://openvan.camp) — free vanlife/RV travel data API.

- **Fuel prices** — retail prices for 160+ countries (gasoline, diesel, LPG, E85), plus fuel cost for a route
- **Weather scores** — vanlife-specific suitability (0–100): van comfort, sleep conditions, solar yield, driving safety
- **Food cost index** — cost-of-living comparison across 92 countries vs. a world baseline
- **Currency rates** — 150+ currencies, EUR-based, updated daily
- **Events** — 1,100+ vanlife/RV events with geo-coordinates
- **News stories** — 31,000+ aggregated stories in 7 languages
- **Toll roads** — per-km rates by vehicle class, vignettes, bridges and tunnels for 85 countries; toll estimate for a route
- **Visa rules** — entry mode, length of stay, how days are counted, temporary vehicle import (199 destinations)
- **License plates** — formats, region codes, validation, ready plate images (199 countries)
- **Holidays** — public, school (regional) and peak traffic days (212 countries)
- **Travel hazards** — FCDO advice level, GDACS disasters, NASA FIRMS active fires
- **Power plugs** — plug types, voltage, campsite hook-up (229 countries)
- **Customs** — what you may bring in by car, with official quotes

**No API key. No registration. CC BY 4.0.**

## Install

```bash
npm install @openvancamp/sdk
# or
pnpm add @openvancamp/sdk
# or
yarn add @openvancamp/sdk
```

## Quick start

```ts
import { OpenVan } from "@openvancamp/sdk";

const ov = new OpenVan();

// Fuel prices for Germany
const de = await ov.fuel.country("DE");
console.log(de.prices.diesel); // e.g. 1.729 (EUR/liter)

// Cheapest diesel in Europe (top 5)
const cheap = await ov.fuel.cheapest("diesel", 5);
cheap.forEach(c => console.log(c.country_name, c.prices.diesel, c.currency));

// Vanlife weather scores — top 10 countries right now
const top = await ov.weather.top({ limit: 10 });
top.forEach(c => console.log(c.country_name, c.score));

// Is Portugal cheaper than Germany for van living?
const comp = await ov.basket.compare("DE", "PT");
console.log(`Portugal is ${Math.abs(comp.diff_percent)}% cheaper (€100 in DE ≈ €${comp.budget_100} in PT)`);

// Currency conversion
const usd = await ov.currency.convert(100, "EUR", "USD");

// Upcoming vanlife events
const { events } = await ov.events.list({ status: "upcoming", limit: 10 });

// Latest vanlife news in Spanish
const { stories } = await ov.stories.list({ locale: "es", limit: 20 });

// Can a Russian passport holder stay in Turkey, and how long?
const visa = await ov.visa.check("RU", "TR");

// Tolls for a campervan, Munich → Venice
const tolls = await ov.tolls.route(["Munich", "Venice"], "van");

// Peak traffic days in France, plugs in the UK, customs Germany → Norway
const traffic = await ov.holidays.country("FR", { from: "2026-10-01", to: "2026-11-15", kind: "traffic" });
const plugs = await ov.electricity.country("GB");
const customs = await ov.customs.country("NO", { from: "DE" });
```

## API reference

### `new OpenVan(options?)`

```ts
const ov = new OpenVan({
  baseUrl: "https://openvan.camp", // default
  source: "my-app",                // attribution tag (optional)
  fetch: customFetch,              // custom fetch implementation (optional)
});
```

---

### `ov.fuel`

| Method | Returns |
|---|---|
| `.prices()` | `Record<string, FuelCountry>` — all 169 countries |
| `.country(code)` | `FuelCountry` — single country by ISO code |
| `.cheapest(fuelType?, limit?)` | `FuelCountry[]` — sorted cheapest-first in EUR per liter |
| `.routeCost(waypoints, options?)` | Fuel cost for 2–10 place names, per-country prices |

```ts
// All countries
const all = await ov.fuel.prices();

// Single country
const tr = await ov.fuel.country("TR");
console.log(tr.prices); // { gasoline: 41.5, diesel: 39.2, lpg: 16.8 }

// Top 5 cheapest diesel globally
const top5 = await ov.fuel.cheapest("diesel", 5);

// Berlin → Prague, 10 l/100 km
const trip = await ov.fuel.routeCost(["Berlin", "Prague"], { cons: 10, fuel: "diesel" });
```

A grade can be priced in its own currency (Venezuela: diesel in USD, gasoline in VES).
When converting yourself, use `country.currencies?.[grade] ?? country.currency`.

---

### `ov.currency`

| Method | Returns |
|---|---|
| `.rates()` | `Record<string, number>` — units per EUR |
| `.convert(amount, from, to)` | `number` |

```ts
const rates = await ov.currency.rates();
const usd = await ov.currency.convert(50, "EUR", "USD");
```

---

### `ov.basket`

| Method | Returns |
|---|---|
| `.list()` | `VanBasketCountry[]` — all 92 countries |
| `.country(code)` | `VanBasketCountry` with historical snapshots |
| `.compare(from, to)` | `VanBasketCompareData` — ratio + both countries |

```ts
// Compare Spain vs Mexico
const comp = await ov.basket.compare("ES", "MX");
// comp.diff_percent = how much cheaper/expensive MX is vs ES
// comp.budget_100  = equivalent of €100 in ES when spending in MX
console.log(`diff: ${comp.diff_percent}%, €100 in Spain ≈ €${comp.budget_100} in Mexico`);
```

---

### `ov.weather`

| Method | Returns |
|---|---|
| `.score(countryCode)` | one country — `van_score` 0–100, `score_label`, 7-day `forecast` |
| `.city(countryCode, citySlug, locale?)` | one city — `van_score` today, `week_score` for the coming 7 days, sleep / drive / solar |
| `.all()` | every country with weather data |
| `.top(options?)` | top N countries by `van_score`, best first |

```ts
const fr = await ov.weather.score("FR");
console.log(fr.van_score);      // today's score 0-100, fr.score_label: "ideal" … "poor"
console.log(fr.forecast[0]);    // today's detailed scores
```

---

### `ov.roadbook`

A whole trip plan — the same roadbook people build at [openvan.camp/en/roadbook](https://openvan.camp/en/roadbook): day-by-day overnights, budget (fuel, tolls, vignettes, ferries), and for every country on the way the entry and vehicle rules for the given passports and plates.

| Method | Returns |
|---|---|
| `.create(places, options?)` | `RoadbookCreated` — `code`, `url`, `status`, resolved `points` |
| `.status(code)` | `{ status: "pending" \| "building" \| "ready" \| "failed" }` |
| `.plan(places, options?)` | creates the roadbook and waits until it is built (default up to 60 s) |

```ts
const trip = await ov.roadbook.plan(["Munich", "Venice"], {
  locale: "en",
  inputs: { travelers: ["DE"], plates: "DE", cons: 10, fuel: "diesel", date: "2026-10-20" },
});
console.log(`https://openvan.camp${trip.url}`); // shareable roadbook page
```

---

### `ov.events`

| Method | Returns |
|---|---|
| `.list(options?)` | `EventsListData` — paginated events |
| `.get(slug)` | `VanEvent` — single event |

```ts
const { events } = await ov.events.list({
  status: "upcoming",
  type: "expo",
  country: "DE",
  locale: "en",
});
```

---

### `ov.stories`

| Method | Returns |
|---|---|
| `.list(options?)` | `StoriesListData` — paginated stories |
| `.get(slug)` | `VanStory` with source articles |

```ts
const { stories } = await ov.stories.list({
  locale: "de",
  category: "gear",
  limit: 20,
});
```

---

### `ov.tolls`

| Method | Returns |
|---|---|
| `.countries(locale?)` | Countries with toll data |
| `.country(code, locale?)` | Rates by vehicle class, vignettes, concession sections, bridges and tunnels |
| `.route(waypoints, vehicleClass?, locale?)` | EUR range for 2–10 place names; `vehicleClass` = `car`, `van` (default, up to 3.5 t), `heavy` |

A route with `partial: true` lists countries without data in `unknown_countries` — they are not free.

---

### `ov.visa`

| Method | Returns |
|---|---|
| `.check(passport, destination, options?)` | Entry mode, length of stay, how days are counted, vehicle rule |
| `.route(countries, options?)` | Rules for a route of up to 12 countries and up to 10 `passports` |
| `.passport(code, locale?)` | All destinations for one passport |
| `.vehicle(place, locale?)` | Temporary import of a foreign-plated vehicle |

---

### `ov.plates`

| Method | Returns |
|---|---|
| `.list(locale?)` | Countries: international code, regions, example plate |
| `.country(code, locale?)` | Plate format and every region code |
| `.types(code, locale?)` | Plate types (private, taxi, diplomatic…); empty where not broken down |
| `.validate(code, number, options?)` | Valid or not, region name and ISO 3166-2 code |
| `.random(code, type?)` | A random valid plate with image URLs |
| `.imageUrl(code, number, options?)` | URL of a ready SVG/PNG plate for `<img src>` — no request |

```ts
const src = ov.plates.imageUrl("ru", "A123BC", { region: "77", format: "png", width: 800 });
```

---

### `ov.holidays`

| Method | Returns |
|---|---|
| `.countries(locale?)` | Countries with holiday data and the kinds each has |
| `.country(code, options?)` | Holidays for a period up to 400 days; `kind` = `public`, `school`, `traffic` |

A country without data throws `OpenVanError` — that does not mean "no holidays".

---

### `ov.hazards`

| Method | Returns |
|---|---|
| `.country(code, locale?)` | UK FCDO advice level and current GDACS disasters — the situation now, not a forecast |
| `.fires([minLon, minLat, maxLon, maxLat])` | NASA FIRMS fires of the last 48 h, box up to 10°×10° |

A new fire area may throw with status `503` ("being loaded") — retry in a minute.

---

### `ov.electricity`

| Method | Returns |
|---|---|
| `.countries(locale?)` | Plug types and voltage of every country |
| `.country(code, locale?)` | Plugs (IEC A–N), voltage, frequency, campsite hook-up (CEE17) |

---

### `ov.customs`

| Method | Returns |
|---|---|
| `.countries(locale?)` | Customs jurisdictions and blocs |
| `.country(code, { from?, locale? })` | Rules on entry by car, each with an official quote and source link |

---

## Error handling

```ts
import { OpenVan, OpenVanError } from "@openvancamp/sdk";

try {
  const data = await ov.fuel.country("XX");
} catch (err) {
  if (err instanceof OpenVanError) {
    console.log(err.status);  // HTTP status code
    console.log(err.message); // the API's explanation when it gives one ("Place not found: …")
    console.log(err.url);     // full request URL
    console.log(err.body);    // parsed error body
  }
}
```

---

## Browser / Edge

The SDK is ESM-native and works in any environment with `fetch` (browser, Node.js ≥ 18, Deno, Cloudflare Workers, Bun).

```html
<script type="module">
  import { OpenVan } from "https://esm.sh/@openvancamp/sdk";
  const ov = new OpenVan();
  const de = await ov.fuel.country("DE");
  console.log(de.prices);
</script>
```

---

## MCP Server (for AI assistants)

Use the data directly in Claude, Cursor, Windsurf, or any MCP-compatible AI:

```bash
npx -y @openvancamp/mcp-server
```

Or add to your Claude Desktop config:
```json
{
  "mcpServers": {
    "openvan": {
      "command": "npx",
      "args": ["-y", "@openvancamp/mcp-server"]
    }
  }
}
```

---

## Attribution

Data is licensed under **CC BY 4.0** — please attribute **OpenVan.camp** when using publicly.  
SDK code is **MIT**.

[API Docs](https://openvan.camp/docs) · [GitHub](https://github.com/openvancamp/openvan-camp-public-api) · [hello@openvan.camp](mailto:hello@openvan.camp)
