# REST equivalents of the MCP tools

Use these when the `openvan` MCP server is not connected. Base URL `https://openvan.camp`, no key.
Send `Accept: application/json`, add `locale=<language>` and `source=<your-app>` to every request.
Full contract: <https://openvan.camp/docs.openapi>.

| MCP tool | REST |
|---|---|
| `plan_road_trip` | `POST /api/roadbook/from-places` with `{"places":["Munich","Venice"],"locale":"en","inputs":{"travelers":["DE"],"fuel":"diesel"}}`, then poll `GET /api/roadbook/{code}/status` until `ready` (up to a minute); the page is `https://openvan.camp` + `url` |
| `get_fuel_prices` | `GET /api/fuel/prices?country=tr` (omit `country` for all) |
| `compare_fuel_prices`, `find_cheapest_fuel` | `GET /api/fuel/prices`, then compare `prices[grade]` converted with `units[grade]` and `currencies[grade]` |
| `get_toll_rates` | `GET /api/tolls/countries/{code}` |
| `estimate_route_tolls` | `GET /api/tolls/route?waypoints=Rome|Paris&vehicle_class=van` (2–10 place names separated by `|`; `vehicle_class` is `car`, `van` or `heavy`) |
| `check_visa_rules` | `GET /api/visa/check?passport=RU&destination=TR` |
| `get_route_visa_rules` | `GET /api/visa/route?t=RU,GE,TR&p=RU` |
| `get_vehicle_import_rules` | `GET /api/visa/vehicle/{country}` |
| `get_customs_rules` | `GET /api/customs/countries/{code}?from=DE` |
| `get_holidays` | `GET /api/holidays/countries/{code}?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=public\|school\|traffic` |
| `get_travel_hazards` | `GET /api/hazards/countries/{code}` |
| `get_active_fires` | `GET /api/hazards/fires?bbox=west,south,east,north` (up to 10°×10°) |
| `find_ferries`, `get_ferry_schedule` | `GET /api/ferries?bbox=west,south,east,north&zoom=6` (GeoJSON; keep `kind: route`), `GET /api/ferries/{id}` and `/api/ferries/{id}/schedule` |
| `get_power_plugs` | `GET /api/electricity/countries/{code}` |
| `get_country_travel_weather`, `get_city_travel_weather`, `list_best_weather_countries` | `GET /api/vansky/weather/{code}`, `/api/vansky/weather/{code}/{city}`, `/api/vansky/ranking` (`/api/vansky/weather/{code}/cities` for the cities of a country, `/api/vansky/methodology` for the formula) |
| `get_city_climate` | `GET /api/vansky/climate?lat=&lng=&date=MM-DD`, `/api/vansky/climate/{code}/{city}?date=MM-DD` |
| `get_country_food_prices`, `compare_food_prices` | `GET /api/vanbasket/countries/{code}`, `/api/vanbasket/compare?from=DE&to=TR` |
| `get_currency_rate` | `GET /api/currency/rates` (EUR-based: `amount / rates[FROM] * rates[TO]`) |
| `list_events`, `get_event` | `GET /api/events?country=DE&status=upcoming`, `GET /api/event/{slug}` |
| `search_stories` | `GET /api/news/search?q=…` or `GET /api/stories` |
| `get_license_plate_country`, `get_license_plate_image` | `GET /api/plates`, `/api/plates/{code}/types`, `/api/plates/{code}/plate.svg` |

A response with `covered: false` and no items means "no data for this country" — the same rule
as in SKILL.md applies.
