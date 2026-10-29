# openvan — Python client for the OpenVan.camp API

Free vanlife & RV travel data in Python: whole-trip roadbooks, fuel prices in 170+ countries, toll roads, ferry
crossings and timetables, visa and vehicle-import rules, public and school holidays, travel hazards and wildfires, customs rules,
power plugs, weather suitability scores, food cost index, currency rates, events, news and
license plates of the world.

**No API key, no registration, no dependencies** — standard library only, Python 3.9+.

```bash
pip install openvan
```

## Quick start

```python
from openvan import OpenVan

ov = OpenVan(source="myapp.com")  # source is optional: it lets us see and credit your project

# Cheapest diesel in the world right now, EUR per liter
for c in ov.fuel.cheapest("diesel", 5):
    print(c["country_name"], c["prices"]["diesel"], c["currency"])

# Can a Russian passport enter Turkey, and for how long?
print(ov.visa.check("RU", "TR")["data"])

# Toll cost Rome → Paris for a van, as a EUR range
print(ov.tolls.route(["Rome", "Paris"], vehicle_class="van"))

# Best countries for vanlife weather today
for c in ov.weather.top(5):
    print(c["code"], c["van_score"], c["score_label"])

# Countries of Europe by the score of the coming week (the site ranking), one city with its place
for c in ov.weather.ranking(region="europe", limit=5):
    print(c["rank"], c["name"], c["week_score"])
print(ov.weather.city("GE", "batumi")["rank"])

# Typical weather (climate) in Batumi on 18 September and the best month to go
batumi = ov.weather.city_climate("GE", "batumi", date="09-18")
print(batumi["day"]["temp_day_c"], batumi["day"]["precipitation_days_of_35"], batumi["best_month"])

# School holidays in Germany this autumn, by federal state
ov.holidays.country("DE", from_="2026-10-01", to="2026-12-31", kind="school")

# Ferries in the Tyrrhenian Sea (OpenStreetMap, ODbL) and the next departures of one line
lines = [f["properties"] for f in ov.ferries.window((8, 38, 16, 42), zoom=6)["features"] if f["properties"]["kind"] == "route"]
print(ov.ferries.schedule("r5958961")["directions"][0]["next"])

# A whole trip plan: route, days, budget and rules for every country (waits up to 60 s)
trip = ov.roadbook.plan(["Munich", "Venice"], inputs={"travelers": ["DE"]})
print("https://openvan.camp" + trip["url"])
```

### With pandas

```python
import pandas as pd
from openvan import OpenVan

ov = OpenVan()
fuel = pd.DataFrame.from_dict(ov.fuel.prices(), orient="index")
basket = pd.DataFrame.from_dict(ov.basket.list(), orient="index")
```

## Resources

| Resource | Methods |
|----------|---------|
| `ov.fuel` | `prices()`, `country(code)`, `cheapest(fuel_type, limit)`, `route_cost(waypoints, **options)` |
| `ov.currency` | `rates()`, `convert(amount, from_currency, to_currency)` |
| `ov.basket` | `list()`, `country(code)`, `compare(from_country, to_country)` — food cost index |
| `ov.weather` | `score(code)`, `all()`, `top(limit)` — VanSky weather suitability |
| `ov.tolls` | `countries()`, `country(code)`, `route(waypoints, vehicle_class)` |
| `ov.visa` | `check(passport, destination)`, `route(countries, passports)`, `passport(code)`, `vehicle(place)` |
| `ov.holidays` | `countries()`, `country(code, from_=, to=, kind=)` |
| `ov.hazards` | `country(code)`, `fires((min_lon, min_lat, max_lon, max_lat))` |
| `ov.electricity` | `countries()`, `country(code)` — plug types and voltage |
| `ov.customs` | `countries()`, `country(code, from_country=)` |
| `ov.plates` | `list()`, `country(code)`, `types(code)`, `validate(code, number)`, `random(code)`, `image_url(code, number)` |
| `ov.events` | `list(**filters)`, `get(slug)` |
| `ov.stories` | `list(**filters)`, `get(slug)`, `search(query)` |

Methods return the API's JSON as plain `dict` / `list`. Field reference:
[interactive docs](https://openvan.camp/docs?utm_source=pypi&utm_medium=referral&utm_campaign=python-sdk) ·
[OpenAPI spec](https://openvan.camp/docs.openapi).

Errors raise `OpenVanError` with `status`, `url`, `body` and the API's own `message`:

```python
from openvan import OpenVan, OpenVanError

try:
    OpenVan().tolls.route(["Atlantis", "Paris"])
except OpenVanError as e:
    print(e.status, e.message)  # 422 and the reason, e.g. no road route
```

## License and attribution

Code: MIT. Data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — credit it as
`Data: OpenVan.camp` with a link to https://openvan.camp/.

Also available: [JavaScript SDK](https://www.npmjs.com/package/@openvancamp/sdk) ·
[MCP server for AI agents](https://github.com/openvancamp/openvan-camp-public-api/tree/main/mcp-server) ·
[all API docs](https://github.com/openvancamp/openvan-camp-public-api).
