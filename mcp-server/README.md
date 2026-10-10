# @openvancamp/mcp-server

[![npm version](https://img.shields.io/npm/v/@openvancamp/mcp-server.svg)](https://www.npmjs.com/package/@openvancamp/mcp-server)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Official MCP server for [OpenVan.camp](https://openvan.camp)** — free, no-auth, machine-readable vanlife and RV travel data for AI agents.

Exposes 27 read-only tools via the [Model Context Protocol](https://modelcontextprotocol.io) so you can ask your AI assistant about:

- **Whole road trips** — `plan_road_trip` builds an [OpenVan roadbook](https://openvan.camp/en/roadbook): day-by-day plan with overnights, budget (fuel, tolls, vignettes, ferries), entry and vehicle rules for every country on the way, and a shareable roadbook page
- **Fuel prices** across all API-supported countries, using the same price keys as `/api/fuel/prices`
- **Toll roads** — per-km rates, vignettes, toll bridges and tunnels by country; toll estimate for a route
- **Holidays and peak traffic** — public and school holidays (regional), official peak traffic days
- **Travel hazards** — UK FCDO advice level, GDACS natural disasters, NASA FIRMS active fires of the last 48 hours
- **Power plugs** — plug types, mains voltage and frequency, campsite hook-up connector (CEE17)
- **Customs rules** — food bans, cash declaration, alcohol and tobacco limits, with official quotes
- **VanSky** vanlife weather suitability scores (0-100) for countries and cities
- **VanBasket** food price index (world average = 100)
- **Currency** conversion (150+ currencies)
- **Events** (expos, festivals, meetups, road trips)
- **News stories** in 7 languages
- **Visa and border rules** — entry mode, length of stay, how the days are counted, temporary vehicle import
- **License plates of the world** — formats, region codes, plate check, and the plate itself as an image

Every tool also returns an **interactive card** ([MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps)) that Claude and ChatGPT render right in the chat: weather with the best and toughest cities of the week, fuel and toll tables with a currency switch, visa terms with a leave-by date, event and news carousels, the whole trip plan. Hosts without MCP Apps get the same data as text.

Data is CC BY 4.0. Attribute *OpenVan.camp* when citing.

---

## Install

### Remote (no-install, for web-based clients)

Connect your MCP-compatible host to the hosted Streamable HTTP endpoint:

```
https://mcp.openvan.camp/mcp
```

No authentication. Attribution is automatic (`?source=mcp-server-sse`). Intended for ChatGPT Apps SDK, browser-based agents, and serverless integrations.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. The tools should appear in the 🔧 panel.

### Cursor / Windsurf / Continue

Add to your MCP config:

```json
{
  "openvan": {
    "command": "npx",
    "args": ["-y", "@openvancamp/mcp-server"]
  }
}
```

### Any MCP-compatible host

The server speaks MCP over stdio. Run:

```bash
npx -y @openvancamp/mcp-server
```

---

## Tools

| Tool | Description |
|---|---|
| `plan_road_trip` | Whole trip between 2–10 places via the OpenVan roadbook: day-by-day overnights, budget, per-country entry and vehicle rules (Schengen 90/180), holidays, safety, power, checklist, link to the roadbook |
| `get_fuel_prices` | Current retail fuel prices per country |
| `compare_fuel_prices` | Compare one fuel type across 2–10 countries |
| `find_cheapest_fuel` | Top cheapest countries by fuel type, filterable by region |
| `get_country_travel_weather` | Campervan travel weather score (0-100), solar yield, 7-day forecast for one country |
| `get_city_travel_weather` | Campervan travel weather of one city or town: today and the coming 7 days |
| `list_best_weather_countries` | Top N countries with the best travel weather today |
| `list_events` | Vanlife events (expos, festivals, meetups) with filters |
| `get_event` | Details for one event by slug |
| `search_stories` | Vanlife news: headline, short summary and link to the story page on openvan.camp (7 languages) |
| `compare_food_prices` | Food price index comparison between two countries |
| `get_country_food_prices` | Food price index details for one country |
| `get_currency_rate` | Currency conversion between 150+ currencies |
| `check_visa_rules` | Entry rules for one passport and destination, with confidence and source |
| `get_route_visa_rules` | Visa rules for a whole route, up to 10 passports, plus the tightest leg |
| `get_vehicle_import_rules` | Temporary import rules for a foreign-plated vehicle |
| `list_license_plate_countries` | Countries with license plates: international code, regions, example plate |
| `get_license_plate_country` | Plate format and every region code of one country |
| `check_license_plate` | Validate a plate number and resolve its region code |
| `get_license_plate_image` | Illustrative image of a standard civilian plate (PNG inline + SVG/PNG links) |
| `get_toll_rates` | Toll reference for one country: per-km rates by vehicle class, vignettes, bridges and tunnels |
| `estimate_route_tolls` | Toll cost for a route of 2–10 place names as a EUR range, flags partial results |
| `get_holidays` | Public holidays, school holidays (with ISO 3166-2 regions) and peak traffic days for up to 400 days |
| `get_travel_hazards` | FCDO travel advice level and current GDACS disasters with alert level in one country |
| `get_active_fires` | NASA FIRMS satellite fire detections of the last 48 hours in a bounding box up to 10°×10° |
| `get_power_plugs` | Plug types (IEC A–N), voltage and frequency, campsite hook-up connector in Europe |
| `get_customs_rules` | Customs rules on entry by car: food, cash, alcohol, tobacco, fuel canister, with source quotes |

All tools are `readOnlyHint: true` and `openWorldHint: true` (they call the public openvan.camp API). Safe to allow by default.

---

> **Renamed in 0.7.0:** `get_vansky_weather` → `get_country_travel_weather`, `list_vansky_top` → `list_best_weather_countries`, `get_vanbasket` → `get_country_food_prices`, `compare_vanbasket` → `compare_food_prices`. The hosted server at `mcp.openvan.camp` still accepts the old names.

## Example prompts

- "Plan a campervan trip from Munich to Venice with a German passport."
- "What's the weather for a motorhome in Málaga this week?"
- "What's the cheapest diesel in Europe right now?"
- "Compare fuel prices between Germany, France, and Spain."
- "Is Spain a good place to van-camp this week? What about solar yield?"
- "Find upcoming vanlife festivals in Germany this summer."
- "Convert 500 EUR to Turkish lira using today's rate."
- "How expensive is food in Portugal vs Turkey?"
- "Which Russian region is plate code 199? Show me a plate with it."
- "Are there school holidays or peak traffic days in France next week?"
- "Any wildfires near Valencia right now?"
- "Can I bring cheese and sausage into Norway by car?"

---

## How it works

The server is a thin TypeScript wrapper around the public OpenVan.camp REST API:

```
MCP host ─► @openvancamp/mcp-server ─► https://openvan.camp/api/*
```

`plan_road_trip` creates a roadbook through `POST /api/roadbook/from-places`, waits for the route build and computes the plan with the roadbook's own engine (`engine/`, a copy of the openvan.camp roadbook code made by `npm run sync-engine`), so the answer matches the roadbook page.

Every outbound request automatically appends `?source=mcp-server` for attribution tracking and sets a descriptive User-Agent (`openvan-mcp/<version>`). This helps us credit MCP integrations in public reports and segment traffic.

### Configuration

Environment variables (optional):

- `OPENVAN_API_URL` — override the base URL (default `https://openvan.camp`)
- `OPENVAN_SOURCE` — override the attribution tag (default `mcp-server`)

### Rate limits

120 requests / minute per IP. Responses include `X-RateLimit-Remaining` headers. If you hit the limit, contact hello@openvan.camp to request a higher quota for your integration.

---

## Development

```bash
git clone https://github.com/openvancamp/openvan-camp-public-api.git
cd openvan-camp-public-api/mcp-server
npm install
npm run build
npm start
```

Smoke-test via stdio:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/index.js
```

---

## License

MIT for this server. Data returned by the server is licensed CC BY 4.0 — please attribute **OpenVan.camp** when using it.

## Links

- Website: https://openvan.camp
- AI agents landing: https://openvan.camp/ai
- OpenAPI schema: https://openvan.camp/.well-known/openapi.json
- Custom GPT: https://chatgpt.com/g/g-69e723ddf2f48191b828b461cd7f57e0-openvan-travel-assistant
- Contact: hello@openvan.camp
