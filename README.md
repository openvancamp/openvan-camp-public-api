# OpenVan.camp Public API

![OpenVan.camp — free road-trip data API for every country](.github/banner.png)

[![MCP server on npm](https://img.shields.io/npm/v/@openvancamp/mcp-server?label=mcp-server)](https://www.npmjs.com/package/@openvancamp/mcp-server)
[![SDK on npm](https://img.shields.io/npm/v/@openvancamp/sdk?label=sdk)](https://www.npmjs.com/package/@openvancamp/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@openvancamp/mcp-server?label=mcp%20downloads)](https://www.npmjs.com/package/@openvancamp/mcp-server)
[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-467187)](https://creativecommons.org/licenses/by/4.0/)
[![CI](https://github.com/openvancamp/openvan-camp-public-api/actions/workflows/ci.yml/badge.svg)](https://github.com/openvancamp/openvan-camp-public-api/actions/workflows/ci.yml)
[![Published packages work](https://github.com/openvancamp/openvan-camp-public-api/actions/workflows/verify-distribution.yml/badge.svg)](https://github.com/openvancamp/openvan-camp-public-api/actions/workflows/verify-distribution.yml)
[![OpenVan MCP server on Glama](https://glama.ai/mcp/servers/openvancamp/openvan-camp-public-api/badges/score.svg)](https://glama.ai/mcp/servers/openvancamp/openvan-camp-public-api)

Free, no-auth API for vanlife data: fuel prices, route fuel cost, toll roads, holidays and peak traffic days, travel hazards, power plugs, customs rules, currency rates, food cost index, weather suitability scores, visa and vehicle-import rules, vanlife events, news stories, and license plates of the world — all in one place, no registration required.

**Base URL:** `https://openvan.camp`  
**Auth:** None required  
**CORS:** Enabled  
**License:** data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); code in this repository (SDK, MCP server, examples) is [MIT](./LICENSE)

**JavaScript/TypeScript SDK:** [`@openvancamp/sdk`](https://www.npmjs.com/package/@openvancamp/sdk) — `npm install @openvancamp/sdk`. Zero-config, typed, Node.js / browser / edge. [SDK docs →](./sdk/README.md)

**Python SDK:** [`openvan`](./python-sdk) — `pip install openvan`. No dependencies, Python 3.9+, works with pandas. [Python docs →](./python-sdk/README.md)

**Daily CSV snapshots:** [`openvancamp/openvan-travel-data`](https://github.com/openvancamp/openvan-travel-data) — fuel prices, exchange rates, food cost index and weather scores as CSV/JSON, one commit a day, with history.

**MCP Server (for AI agents):** [`mcp-server/`](./mcp-server) — 25 read-only tools, hosted at `https://mcp.openvan.camp/mcp`, or locally `npx -y @openvancamp/mcp-server` for Claude Desktop / Cursor / Windsurf. [Install docs →](./mcp-server/README.md) · [AI agents guide →](https://openvan.camp/ai?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo)

**Gemini CLI extension:** install this repository with `gemini extensions install https://github.com/openvancamp/openvan-camp-public-api`. The root [`gemini-extension.json`](./gemini-extension.json) connects Gemini CLI directly to the hosted OpenVan MCP server; no API key is required.

**Custom GPT:** [OpenVan Travel Assistant](https://chatgpt.com/g/g-69e723ddf2f48191b828b461cd7f57e0-openvan-travel-assistant) — live in ChatGPT GPT Store.

---

## What is authoritative

| Resource | Purpose |
|----------|---------|
| This README | Quick overview and code examples |
| [`/docs`](https://openvan.camp/docs?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) | Interactive documentation with "Try it out" |
| [`/docs.openapi`](https://openvan.camp/docs.openapi) | Full OpenAPI 3.0 contract (always up to date) |
| [`/docs.postman`](https://openvan.camp/docs.postman) | Postman collection |

The OpenAPI spec at `/docs.openapi` is generated from the live codebase and is the authoritative contract. Numbers in this README (country counts, story totals) are approximate and updated periodically — check `/api/fuel/prices` meta or `/api/stories` pagination for current totals.

---

## Endpoints

| Endpoint | Description | Coverage |
|----------|-------------|----------|
| `GET /api/fuel/prices` | Retail fuel prices (gasoline, diesel, LPG, E85) | 160+ countries |
| `POST /api/route-cost` | Fuel cost for a route of 2–10 waypoints, per-country prices | — |
| `GET /api/tolls/countries` | Toll roads by country: payment system, per-km rates by vehicle class, vignettes | 84 countries |
| `GET /api/tolls/route` | Toll cost for a route of 2–10 place names (car, van, heavy), EUR range | — |
| `GET /api/holidays/countries/{code}?from=&to=` | Public holidays, school holidays (regional) and peak traffic days | 212 countries |
| `GET /api/hazards/countries/{code}` | UK FCDO travel advice level and current GDACS natural disasters | — |
| `GET /api/hazards/fires?bbox=` | NASA FIRMS active fires of the last 48 hours in a bounding box (up to 10°×10°) | worldwide |
| `GET /api/electricity/countries/{code}` | Plug types, mains voltage and frequency, campsite hook-up (CEE17) | 229 countries |
| `GET /api/customs/countries/{code}?from=` | Customs rules on entry by car: food, cash, alcohol, tobacco, fuel canister | — |
| `GET /api/currency/rates` | Exchange rates relative to EUR | 150+ currencies |
| `GET /api/vanbasket/countries` | Food price index relative to world average (100 = world avg) | 90+ countries |
| `GET /api/vanbasket/compare?from=DE&to=TR` | Compare food costs between two countries | — |
| `GET /api/vanbasket/countries/{code}` | Single country + historical snapshots | — |
| `GET /api/vansky/weather` | Vanlife weather suitability scores (0–100) with 7-day forecast | 160+ countries |
| `GET /api/vansky/weather/{code}` | One country, with marine and solar data | — |
| `GET /api/visa/check?passport=RU&destination=TR` | Entry rules: entry mode, length of stay, how days are counted, vehicle import | 199 destinations |
| `GET /api/visa/route?t=RU,GE,TR&p=RU` | Visa rules for a whole route, up to 10 passports | — |
| `GET /api/visa/passport/{code}` | All destinations for one passport | — |
| `GET /api/visa/vehicle/{place}` | Temporary vehicle import rules for a country | — |
| `GET /api/events` | Vanlife events: expos, festivals, meetups, road trips | 1,100+ events |
| `GET /api/event/{slug}` | Full event details with geo coordinates | — |
| `GET /api/event/{slug}/articles` | Source articles linked to an event | — |
| `GET /api/stories` | News stories aggregated from 200+ publishers | 31,000+ stories |
| `GET /api/story/{slug}` | Full story with all source articles and direct links | — |
| `GET /api/news/search?q=...` | Semantic search over stories | — |
| `GET /api/plates` | License plates of the world: formats, region codes, example plates | 199 countries |
| `GET /api/plates/{code}/types` | Plate types of a country (private, taxi, motorcycle, diplomatic…); empty where not broken down | — |
| `GET /api/plates/{code}/plate.svg` | Ready plate image (also `.png`) — drop into `<img src>` | — |

---

## Quick Start

```bash
# Fuel prices
curl https://openvan.camp/api/fuel/prices

# Currency rates (EUR-based)
curl https://openvan.camp/api/currency/rates

# Food price index
curl https://openvan.camp/api/vanbasket/countries

# Upcoming vanlife events in Germany
curl "https://openvan.camp/api/events?country=DE&status=upcoming&locale=en"

# Latest vanlife news stories in English
curl "https://openvan.camp/api/stories?locale=en"
```

---

## Fuel Prices — `/api/fuel/prices`

Weekly retail prices from 45+ official government sources.  
**Cache TTL:** 6 hours. Please poll no faster than every 10 minutes.

```bash
curl https://openvan.camp/api/fuel/prices
```

```json
{
  "success": true,
  "data": {
    "DE": {
      "country_code": "DE",
      "country_name": "Germany",
      "region": "europe",
      "currency": "EUR",
      "local_currency": "EUR",
      "unit": "liter",
      "prices": {
        "gasoline": 1.79,
        "diesel": 1.69,
        "lpg": 0.89,
        "e85": null,
        "premium": null
      },
      "price_changes": { "gasoline": -0.02, "diesel": 0.01, "lpg": 0.0 },
      "fetched_at": "2026-04-05T10:00:00+00:00",
      "sources": ["EU Weekly Oil Bulletin", "Fuelo.net"],
      "sources_count": 2,
      "is_excluded": false
    }
  },
  "meta": {
    "total_countries": 121,
    "updated_at": "2026-04-05 10:00:00",
    "cache_ttl_hours": 6
  }
}
```

**Notes:**
- `unit` is `"liter"` for most countries, `"gallon"` for US and Ecuador
- `is_excluded: true` means the country has heavy fuel subsidies (prices don't reflect market rates)
- `price_changes` = delta vs last week's prices

---

## Currency Rates — `/api/currency/rates`

EUR-based exchange rates from multiple open-source providers with automatic fallback.  
**Cache TTL:** 25 hours. Refreshed daily at 07:00 UTC.

```bash
curl https://openvan.camp/api/currency/rates
```

```json
{
  "success": true,
  "rates": {
    "EUR": 1,
    "USD": 1.08,
    "GBP": 0.85,
    "TRY": 38.5,
    "GEL": 2.95,
    "KZT": 510,
    "RUB": 98.5
  },
  "cached": true,
  "updated_at": "2026-04-08T07:00:00+00:00"
}
```

**Convert to any currency:**
```js
const priceInUSD = (priceEUR / rates.EUR) * rates.USD;
const priceInTRY = (priceEUR / rates.EUR) * rates.TRY;
```

---

## VanBasket Food Price Index — `/api/vanbasket/*`

Relative cost of a food basket compared to world average (World = 100).  
Based on World Bank ICP 2021 data, adjusted with IMF CPI.  
**Data source:** CC BY 4.0

```bash
# All countries
curl https://openvan.camp/api/vanbasket/countries

# Compare two countries
curl "https://openvan.camp/api/vanbasket/compare?from=DE&to=TR"

# Single country with historical snapshots
curl https://openvan.camp/api/vanbasket/countries/DE
```

```json
{
  "success": true,
  "data": {
    "CH": { "country_code": "CH", "country_name": "Switzerland", "vanbasket_index": 162.3, "pct_vs_world": 62.3 },
    "DE": { "country_code": "DE", "country_name": "Germany",     "vanbasket_index": 118.7, "pct_vs_world": 18.7 },
    "TR": { "country_code": "TR", "country_name": "Turkey",      "vanbasket_index":  82.4, "pct_vs_world": -17.6 },
    "GE": { "country_code": "GE", "country_name": "Georgia",     "vanbasket_index":  64.1, "pct_vs_world": -35.9 }
  },
  "meta": {
    "total_countries": 92,
    "world_avg": 100,
    "base_year": 2021,
    "source": "World Bank ICP 2021",
    "license": "CC BY 4.0"
  }
}
```

**Compare response:**
```json
{
  "success": true,
  "data": {
    "from": { "country_code": "DE", "country_name": "Germany", "vanbasket_index": 118.7 },
    "to":   { "country_code": "TR", "country_name": "Turkey",  "vanbasket_index":  82.4 },
    "diff_percent": -30.6,
    "budget_100": 69,
    "cheaper": true
  }
}
```

`budget_100`: if you spend €100 on food in the `from` country, you'd spend €69 in the `to` country.

---

## Events — `/api/events`

Vanlife events: exhibitions, festivals, meetups, road trips. Updated in real time.

**Query params:**

| Param | Values | Default |
|-------|--------|---------|
| `locale` | `en` `ru` `de` `fr` `es` `pt` `tr` | `en` |
| `status` | `upcoming` `ongoing` `past` `all` | `upcoming` |
| `type` | `expo` `festival` `forum` `meetup` `roadtrip` | — |
| `country` | ISO 3166-1 alpha-2 | — |
| `search` | text | — |
| `page` | integer | `1` |
| `limit` | integer (max 100) | `30` |

```bash
# Upcoming events in Germany
curl "https://openvan.camp/api/events?country=DE&status=upcoming&locale=en"

# Event details
curl "https://openvan.camp/api/event/fit-camper-2026?locale=en"

# Source articles linked to an event
curl "https://openvan.camp/api/event/fit-camper-2026/articles?locale=en"
```

```json
{
  "events": [
    {
      "id": 493,
      "slug": "fit-camper-2026",
      "event_name": "Fit Your Camper",
      "event_type": "expo",
      "event_type_label": "Exhibition",
      "start_date": "2026-04-09",
      "end_date": "2026-04-12",
      "city": "Bologna",
      "country_code": "IT",
      "country": { "code": "it", "name": "Italy", "flag_emoji": "🇮🇹" },
      "venue_name": "BolognaFiere",
      "status": "upcoming",
      "articles_count": 7,
      "url": "https://openvan.camp/en/event/fit-camper-2026"
    }
  ],
  "pagination": { "total": 48, "page": 1, "limit": 30, "pages": 2 }
}
```

**Notes:**
- Unknown or missing `locale` silently falls back to `en`
- `/api/event/{slug}/articles` returns source articles filtered by `locale`; if none match, all articles are returned (may be in the original publisher language)

---

## Stories / News — `/api/stories`

Vanlife news stories aggregated from 200+ publishers and translated into 7 languages. Each story clusters multiple source articles covering the same topic.

**Query params:**

| Param | Values | Default |
|-------|--------|---------|
| `locale` | `en` `ru` `de` `fr` `es` `pt` `tr` | `en` |
| `category` | category slug (e.g. `camping`, `travel`, `gear`, `incident`) | — |
| `country` | ISO 3166-1 alpha-2 | — |
| `search` | text | — |
| `page` | integer | `1` |
| `limit` | integer (max 50) | `20` |

```bash
# Latest stories in English
curl "https://openvan.camp/api/stories?locale=en"

# German vanlife news in Germany
curl "https://openvan.camp/api/stories?locale=de&country=DE"

# Full story with all source links
curl "https://openvan.camp/api/story/free-overnight-parking-netherlands?locale=en"
```

```json
{
  "slug": "free-overnight-parking-netherlands",
  "title": "Free Overnight Parking for Motorhomes in the Netherlands",
  "summary": "The Dutch motorhome community is pushing for more designated free overnight spots...",
  "image_url": "https://...",
  "category": { "slug": "travel", "name": "Travel" },
  "countries": [{ "code": "nl", "name": "Netherlands", "flag_emoji": "🇳🇱" }],
  "first_published_at": "2026-04-01T10:00:00+00:00",
  "last_updated_at": "2026-04-03T08:00:00+00:00",
  "articles_count": 5,
  "url": "https://openvan.camp/en/news/travel/free-overnight-parking-netherlands",
  "sources": [
    {
      "title": "Gratis overnachten in je camper: de beste plekken",
      "original_url": "https://www.campermagazine.nl/overnachten/gratis-plaatsen",
      "source_name": "CamperMagazine.nl",
      "published_at": "2026-04-01T10:00:00+00:00",
      "language": "nl",
      "image_url": "https://..."
    }
  ]
}
```

**Notes:**
- `title` and `summary` are translated to the requested `locale`
- `sources[].language` is always the **original publisher language**, regardless of `locale`
- `sources[].original_url` is the direct link to the publisher article

---

## License Plates — `/api/plates/*`

License plates of the world: plate formats, every region code grouped by region (with ISO 3166-2 units),
validation, and the plate itself as an image. Images are drawn by the same engine as
[openvan.camp/en/license-plates](https://openvan.camp/en/license-plates?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) — the plate typeface is inside
as vector outlines, so there are **no fonts to install**.

The simplest integration is a plain image:

```html
<img src="https://openvan.camp/api/plates/ru/plate.svg?number=A123BC&region=77" alt="A123BC 77">
```

- `plate.png?width=800` — PNG, 200–2000 px wide, transparent background
- Look-alike Latin letters are normalized (`A123BC` → `А123ВС` on Russian plates)
- A number outside the country format returns `422`; add `custom=1` to draw any text (e.g. a name)
- Images are served `Cache-Control: public, max-age=31536000, immutable`; image URLs returned by the API
  carry `v=<engine version>`, so an engine update arrives under a new URL

```bash
curl https://openvan.camp/api/plates                                        # countries
curl "https://openvan.camp/api/plates/ru?locale=en"                         # format, regions, codes, engine
curl "https://openvan.camp/api/plates/ru/validate?number=A123BC&region=799" # valid? which region?
curl https://openvan.camp/api/plates/ru/random                              # random plate + image URLs
```

**Plate types** — special plates have their own colour and number format. `GET /api/plates/{code}/types`
lists them (on Russian plates: `private`, `diplomatic` red, `police` blue, `military` black, `taxi_bus` yellow,
`motorcycle`, `trailer`, `tractor`, `export_transit`), each with an example number. Pass `type` to the image,
`/random` and `/validate`; the response says which `type` was used:

```bash
curl "https://openvan.camp/api/plates/ru/random?type=police"                # a valid blue police plate + image URLs
curl "https://openvan.camp/api/plates/ru/validate?number=У7962&region=790&type=police"
```

```html
<img src="https://openvan.camp/api/plates/ru/plate.svg?number=190Т307&region=23&type=diplomatic" alt="190 Т 307 23">
```

To draw plates in the browser yourself (e.g. an interactive generator), load the scripts listed in
`data.engine.scripts` of `/api/plates/{code}` in order and call
`Plates.render(code, number, region)` → `{svg}` (an SVG element) or `{error}`.

Images and the engine are available for countries whose plate typeface may be redistributed
(`glyphs_license`: `free` or `sharealike`); for the rest the data endpoints still work.
Rate limit: 60 requests/minute for images and `/random`, 120 for the rest.

---

## Holidays, Hazards, Power Plugs, Customs

Trip-planning data for a country you are about to drive into. Every list endpoint has a
`/countries` index; pass `locale` for translated names.

```bash
# Public, school (with ISO 3166-2 regions) and peak traffic days; kind=public|school|traffic
curl "https://openvan.camp/api/holidays/countries/FR?from=2026-10-01&to=2026-11-15"

# FCDO travel advice level + current GDACS disasters (flood, earthquake, cyclone, wildfire…)
curl https://openvan.camp/api/hazards/countries/TR

# NASA FIRMS fire detections of the last 48 h; bbox = minLon,minLat,maxLon,maxLat, up to 10°×10°
curl "https://openvan.camp/api/hazards/fires?bbox=-1,38,1,40"

# Plug types, voltage, frequency, campsite hook-up connector
curl https://openvan.camp/api/electricity/countries/GB

# Customs rules on entry by car, optionally from a given country; each rule quotes the official source
curl "https://openvan.camp/api/customs/countries/NO?from=DE"
```

- A country without holiday or customs data returns an error that says so — it does **not** mean
  "no holidays" or "nothing is restricted"
- Hazards describe the situation now, not a forecast; fire data for a new area may return
  "being loaded, retry in a minute" on the first request

---

## Response Format

All JSON endpoints follow a consistent envelope:

```json
{ "success": true, "data": { ... }, "meta": { ... }, "_attribution": { ... } }
```

Every response includes an `_attribution` object:

```json
"_attribution": {
  "data_source": "openvan.camp",
  "license": "CC BY 4.0",
  "attribution_url": "https://openvan.camp/",
  "attribution_html": "Data: <a href=\"https://openvan.camp/\">OpenVan.camp</a> (CC BY 4.0)"
}
```

Errors:
```json
{ "success": false, "error": "Description of the error." }
```

If you call without `Accept: application/json`, some error responses may return HTML. Always send the header:
```
Accept: application/json
```

---

## Rate Limiting

120 requests per minute per IP. Please be responsible:
- Cache fuel prices for at least 6 hours
- Cache currency rates for at least 1 hour
- Cache stories/events for at least 15 minutes

---

## Attribution

Required by CC BY 4.0. Suggested format:

```html
Data: <a href="https://openvan.camp/">OpenVan.camp</a> — CC BY 4.0
```

### Identify your integration

Pass `?source=yoursite.com` with any request — no registration needed. Your value is echoed back as `_attribution.your_source` so you can verify it's working:

```bash
curl "https://openvan.camp/api/fuel/prices?source=myapp.com"
```

```json
{
  "success": true,
  "data": { "..." },
  "meta": { "..." },
  "_attribution": {
    "data_source": "openvan.camp",
    "license": "CC BY 4.0",
    "attribution_url": "https://openvan.camp/",
    "attribution_html": "Data: <a href=\"https://openvan.camp/\">OpenVan.camp</a> (CC BY 4.0)",
    "your_source": "myapp.com"
  }
}
```

This helps us understand how the data is being used and acknowledge active projects.

---

## Built with OpenVan

Public projects using the API:

| Project | What it does | Uses |
|---------|--------------|------|
| [cyfuel](https://github.com/bushellsblower-maker/cyfuel) | Fuel-price map that ranks an "efficient fill": tank cost plus the fuel burned driving there ([cyfuel.cybush.uk](https://cyfuel.cybush.uk)) | fuel prices |
| [DriveLog](https://github.com/abdalahshaban07/DriveLog) | Driving and fuel log web app | fuel prices |
| [E-Logistic](https://github.com/Gh0s777tt/E-Map) | Logistics platform with EU diesel prices by country | fuel prices |

Built something with the data? Open a pull request adding it to this table, or tell us in [Discussions](https://github.com/openvancamp/openvan-camp-public-api/discussions).

Badge for your README:

```markdown
[![Data: OpenVan.camp](https://img.shields.io/badge/data-OpenVan.camp-467187)](https://openvan.camp/)
```

[![Data: OpenVan.camp](https://img.shields.io/badge/data-OpenVan.camp-467187)](https://openvan.camp/)

---

## JavaScript / TypeScript SDK

```bash
npm install @openvancamp/sdk
# or: pnpm add @openvancamp/sdk
```

```ts
import { OpenVan } from "@openvancamp/sdk";

const ov = new OpenVan();

// Cheapest diesel in Europe (top 5, EUR-normalized)
const top5 = await ov.fuel.cheapest("diesel", 5);
top5.forEach(c => console.log(c.country_name, c.prices.diesel, c.currency));

// Is Portugal cheaper than Germany for van living?
const comp = await ov.basket.compare("DE", "PT");
console.log(`Portugal is ${Math.abs(comp.diff_percent)}% cheaper`);

// Vanlife weather suitability — top 10 countries right now
const weather = await ov.weather.top({ limit: 10 });
```

ESM-native, fully typed (TypeScript included), works in Node.js ≥ 18, browser, Cloudflare Workers, Deno, Bun. No API key.

npm: [`@openvancamp/sdk`](https://www.npmjs.com/package/@openvancamp/sdk) · [Full SDK docs →](./sdk/README.md)

---

## Resources

- **Interactive docs:** [openvan.camp/docs](https://openvan.camp/docs?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo)
- **OpenAPI 3.0 spec:** https://openvan.camp/docs.openapi
- **Postman collection:** https://openvan.camp/docs.postman
- **JavaScript SDK:** https://www.npmjs.com/package/@openvancamp/sdk
- **Python SDK:** [`python-sdk/`](./python-sdk) — `pip install openvan`
- **Daily CSV snapshots with history:** [openvancamp/openvan-travel-data](https://github.com/openvancamp/openvan-travel-data)
- **Developer page:** [openvan.camp/en/developers](https://openvan.camp/en/developers?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo)
- **For AI agents (MCP, Custom GPT, llms.txt):** [openvan.camp/ai](https://openvan.camp/ai?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo)

### The same data on the site

[Fuel prices by country](https://openvan.camp/en/tools/fuel-prices?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[Passport & visa checker](https://openvan.camp/en/tools/passport?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[Roadbook trip planner](https://openvan.camp/en/roadbook?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[VanSky weather](https://openvan.camp/en/vansky?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[Food cost index](https://openvan.camp/en/tools/vanbasket?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[Vanlife events](https://openvan.camp/en/events?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo) ·
[Vanlife news](https://openvan.camp/en/news?utm_source=github&utm_medium=referral&utm_campaign=public-api-repo)
