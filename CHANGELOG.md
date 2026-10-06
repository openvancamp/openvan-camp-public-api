# Changelog

## 2026-10-06

### Changed — MCP server v0.7.0
- **Clearer tool names** (internal brand names replaced with what the tool does):
  `get_vansky_weather` → `get_country_travel_weather`, `list_vansky_top` → `list_best_weather_countries`,
  `get_vanbasket` → `get_country_food_prices`, `compare_vanbasket` → `compare_food_prices`.
  The hosted server at `mcp.openvan.camp` still accepts the old names; update scripts that call them.
- `get_license_plate_image` draws only a country's standard civilian plate: the `type` and `custom` parameters
  are removed. `check_license_plate` still validates any plate type. The REST API is unchanged.
- `estimate_route_tolls`: `waypoints` are cities or countries, not street addresses.
- Fuel tools: price units and currencies per fuel grade (imperial gallon, kg/m³ for gas grades are no longer
  compared per liter).

## 2026-10-04

### Added
- **License plate types in the MCP server (v0.6.2)**: `check_license_plate` and `get_license_plate_image` take
  `type` — e.g. on Russian plates `diplomatic` (red), `police` (blue), `military` (black), `taxi_bus` (yellow).
  `get_license_plate_country` lists the country's plate types with example numbers. An unknown type or a number
  outside the type's format returns a clear error instead of a bare 422.
- **API**: `GET /api/plates/{code}/random` and `/validate` now return `type` — the plate type the number was
  generated or checked as (the requested key, or the country's default). `openapi.yaml` updated.

## 2026-10-03

### Added
- **Release workflow** (`.github/workflows/release.yml`): pushing `mcp-server-vX.Y.Z` or `sdk-vX.Y.Z`
  publishes the package to npm with provenance, the MCP server to the official MCP Registry, and
  creates the GitHub Release. Can be re-run for an existing tag.
- README: npm / license / Glama badges and a **Built with OpenVan** section listing public projects
  that use the API, with a badge snippet for your own README.
- MCP Registry: `io.github.Kopaev/openvan-travel` 0.6.0 published.

- **Python SDK** [`openvan`](./python-sdk) 0.1.0 — the same 13 resources as the JavaScript SDK in
  snake_case, standard library only, Python 3.9+. Released with the `python-vX.Y.Z` tag through PyPI
  Trusted Publishing.
- **CI** (`.github/workflows/ci.yml`): Python SDK unit tests on 3.9 and 3.13, builds of the JS SDK and
  the MCP server.

### Fixed (MCP server v0.6.1)
- **`npx -y @openvancamp/mcp-server` failed with "could not determine executable to run"** in every
  earlier version: the package had two binaries (`openvan-mcp`, `openvan-mcp-sse`) and npx could not
  pick one. A `mcp-server` binary matching the package name is added, so the documented command and
  Claude Desktop / Cursor configs work. The old binary names still work.

### Fixed (SDK v1.1.1)
- `weather.top()` called `/api/vansky/top`, which does not exist, and always failed with 404. It now
  ranks `/api/vansky/weather` by `van_score`.
- `weather.score(code)` sent `?country=`, which the API ignores, and returned all 164 countries. It now
  calls `/api/vansky/weather/{code}` and returns one country.
- New `weather.all()`.

## 2026-10-02

### Added
- **Holidays API**: `/api/holidays/countries`, `/api/holidays/countries/{code}` — public holidays,
  school holidays (regional, with ISO 3166-2 codes) and official peak traffic days, 212 countries.
- **Travel hazards API**: `/api/hazards/countries/{code}` (UK FCDO advice level + current GDACS
  disasters) and `/api/hazards/fires?bbox=` (NASA FIRMS fires of the last 48 hours).
- **Power plugs API**: `/api/electricity/countries`, `/api/electricity/countries/{code}` — plug types,
  voltage, frequency and campsite hook-up connector, 229 countries.
- **Customs API**: `/api/customs/countries`, `/api/customs/countries/{code}?from=` — rules on entry by
  car, each with a verbatim official quote and source link.
- `/api/plates/{code}/types` — plate types of a country.
- `openapi.yaml` regenerated — spec 1.6.0, 40 paths.
- **MCP server v0.6.0** — five new read-only tools: `get_holidays`, `get_travel_hazards`,
  `get_active_fires`, `get_power_plugs`, `get_customs_rules`, 25 tools total.
- **SDK v1.1.0** — new resources `tolls`, `visa`, `plates`, `holidays`, `hazards`, `electricity`,
  `customs`, plus `fuel.routeCost()`. `OpenVanError` now carries the API's message and `body`.
- Examples cover every section of the API.

### Fixed
- **SDK `fuel.cheapest()` and all fuel examples** converted every grade with the country currency;
  now they use the per-grade `currencies` map (Venezuela: diesel in USD, gasoline in VES), normalize
  gallons to liters and skip currencies without a rate instead of comparing local prices as EUR.

## 2026-09-29

### Added
- **Toll roads API**: `/api/tolls/countries`, `/api/tolls/countries/{code}`, `/api/tolls/route`.
  Per-km rates by vehicle class (car, van up to 3.5 t, heavy over 3.5 t), vignettes, concession sections,
  toll bridges and tunnels, each with verification date and source; route estimate from place names as a
  EUR range with a `partial` flag. `openapi.yaml` regenerated — spec 1.4.0, 31 paths.
- **MCP server v0.5.0** — two new read-only tools: `get_toll_rates`, `estimate_route_tolls`, 20 tools total.

### Fixed (MCP server v0.5.1)
- **Fuel prices**: new `currencies` map — the currency of each grade. Venezuela prices diesel in USD and
  gasoline in VES; converting every grade with the country `currency` gave €376/l instead of €0.44.
  MCP fuel tools now convert per grade.
- **Toll route estimate**: a country with no toll data is reported in `unknown_countries` (with
  `partial: true`) instead of a confident €0; new `unchecked_countries`, `route_countries` and `points`
  (where each place name resolved). Ambiguous names now resolve to the largest city (Athens → Greece).
  Clear `422`/`503` errors with a `message`.
- **MCP**: every tool answer carries the CC BY 4.0 attribution; API error messages reach the agent
  instead of a bare `HTTP 404`.

## 2026-09-28

### Changed
- **Repository moved** to `github.com/openvancamp/openvan-camp-public-api`. The old
  `github.com/Kopaev/openvan-camp-public-api` URL redirects, so existing clones and links keep working.
- **MCP server v0.4.1** and **SDK v1.0.3** — repository URL updated; no functional changes.
  The MCP registry name stays `io.github.Kopaev/openvan-travel`.
- `smithery.yaml` brought up to date: 18 tools, `@openvancamp/mcp-server`.
- README: endpoint table now lists route cost, weather, visa rules and news search; coverage numbers refreshed.

## 2026-09-27

### Added
- **License plates API**: `/api/plates`, `/api/plates/{code}`, `/api/plates/{code}/validate`,
  `/api/plates/{code}/random`, `/api/plates/{code}/plate.svg`, `/api/plates/{code}/plate.png`.
  Plate images are drawn by the same engine as openvan.camp (typeface as vector outlines, no fonts to
  install); `custom=1` draws any text in the plate layout. `openapi.yaml` regenerated — spec 1.3.0, 28 paths.
- **MCP server v0.4.0** — four new read-only tools: `list_license_plate_countries`,
  `get_license_plate_country`, `check_license_plate`, `get_license_plate_image` (PNG inline + SVG/PNG
  links), 18 tools total.

## 2026-09-01

### Added
- **Visa & border rules API** documented in `openapi.yaml`: `/api/visa/check`, `/api/visa/route`,
  `/api/visa/passport/{code}`, `/api/visa/map/{code}`, `/api/visa/rank`, `/api/visa/vehicle/{place}`,
  `/api/visa/history`. The endpoints have been live since July; only the published contract lagged.
- **MCP server v0.3.0** — three new read-only tools: `check_visa_rules`, `get_route_visa_rules`,
  `get_vehicle_import_rules` (14 tools total). Visa answers carry `confidence` and the source layer.
- Also documented: `/api/news/search` (semantic search), `/api/news/digest`, `POST /api/route-cost`,
  `/api/event/{slug}/articles`, `/api/vanbasket/countries/{code}`, `/api/vansky/weather/{code}`.

### Changed
- `openapi.yaml` is now generated from `https://openvan.camp/.well-known/openapi.json` — one source of
  truth instead of three specs drifting apart. It listed 10 of 22 public endpoints before this.
- Fuel coverage figures corrected across the docs: 121 → 169 countries.

## 2026-07-27

### Fixed
- **MCP server v0.2.5** — `npx -y @openvancamp/mcp-server` now resolves a binary (added `mcp-server` bin alias). npm `0.2.3` and `0.2.4` were both published from trees with issues (missing bin alias, then a stale hardcoded `VERSION` constant in the User-Agent string) — both deprecated in favor of `0.2.5`.
- Gallon-priced countries (US/EC/DO/HN/SV) now normalize to EUR/liter in `compare_fuel_prices` and `cheapest_fuel` tools.

### Added
- `mcp-server/Dockerfile` for Glama build evaluation.

## 2026-05-22

### Changed
- **MCP server v0.2.3** — `server.json` description now explicitly mentions `openvan.camp` and links to `https://openvan.camp/en/developers`. Catalogs (Glama, Agenstry, PulseMCP, Smithery) render the description field, so this gives us a backlink from every downstream listing.

## 2026-04-08

### Added
- **Stories API** — new endpoints for vanlife news stories:
  - `GET /api/stories` — paginated list with `locale`, `category`, `country`, `search` filters
  - `GET /api/story/{slug}` — full story with `sources[]` array containing direct publisher links, source names, publication dates, and language codes
  - 8200+ stories in 7 languages (en, ru, de, fr, es, pt, tr)

### Fixed
- `GET /api/vanbasket/countries` was returning `500 Internal Server Error` — fixed
- `GET /api/events` without `?locale=` was returning Russian content (inherited from web middleware) — now correctly defaults to `en`
- Invalid `?locale=xx` silently falls back to `en` instead of returning Russian (documented)

### Changed
- Fuel prices coverage expanded: 87 → 121 countries
- VanBasket coverage: 92 countries (stable)
- Total events in database: 695

---

## 2026-03-28

### Added
- `sources` array per country in `/api/fuel/prices` — lists the data sources used for weighted averages
- Coverage expanded to 87 countries (added Pakistan, Nepal, Ghana)

### Changed
- Replaced single `source` field with `sources` array (array of strings)
- `country_name` now always returns English regardless of client locale

---

## 2026-03-20

### Removed
- Redundant fields `prices_eur` and `local_prices` from fuel prices response
  — use `prices` combined with `/api/currency/rates` to convert

---

## 2026-01-15

### Added
- `price_changes` — weekly delta for each fuel type
- `is_excluded` — flag for heavily subsidized countries (Venezuela, Libya, etc.)
- `sources_count` — number of sources used for this country's weighted average
- `total_countries` in metadata is now dynamic

---

## 2025-12-01

### Initial release
- `GET /api/fuel/prices` — 40 countries
- `GET /api/currency/rates` — 150+ currencies
- CC BY 4.0 license
