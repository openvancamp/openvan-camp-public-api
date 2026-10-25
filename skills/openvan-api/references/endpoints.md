# OpenVan.camp API endpoints

Base URL `https://openvan.camp`. Parameters and response schemas: <https://openvan.camp/docs.openapi>.
Add `source=<your-app>` and, where text is returned, `locale=<en|ru|de|fr|es|pt|tr>`.

| Endpoint | Description | Coverage |
|----------|-------------|----------|
| `GET /api/fuel/prices` | Retail fuel prices (gasoline, diesel, LPG, E85) | 160+ countries |
| `POST /api/route-cost` | Fuel cost for a route of 2–10 waypoints, per-country prices | — |
| `POST /api/roadbook/from-places` | Whole-trip roadbook from 2–10 place names: day-by-day plan, budget, per-country entry and vehicle rules; returns a shareable page | — |
| `GET /api/roadbook/{code}/status` | Build status of a roadbook (poll until `ready`) | — |
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
| `GET /api/vansky/weather/{code}/{city}` | One city: score today and for the coming 7 days | — |
| `GET /api/vansky/climate?lat=&lng=&date=` | Typical weather on any day of the year anywhere (ERA5 2021–2025): `day` with `date`, otherwise 366 `days`; `months`, `best_month`. Cache it: it changes once a year | worldwide |
| `GET /api/vansky/climate/{code}/{city}` | The same for a VanSky city | — |
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

Coverage numbers grow over time; read `meta` of the response for current totals.
