"""
OpenVan.camp Public API — Python Examples
https://openvan.camp/en/developers
License: CC BY 4.0 — attribution required
"""

import time

import requests

API = "https://openvan.camp"


# ─── FUEL PRICES ─────────────────────────────────────────────────────────────


def get_fuel_prices() -> dict:
    return requests.get(f"{API}/api/fuel/prices").json()["data"]


def grade_currency(country: dict, fuel: str) -> str:
    """Currency of one grade. Venezuela prices diesel in USD and gasoline in VES,
    so never convert every grade with the country `currency`."""
    return (country.get("currencies") or {}).get(fuel, country["currency"])


def cheapest_diesel_europe(top_n: int = 10) -> list[dict]:
    """Top N cheapest diesel countries in Europe."""
    data = get_fuel_prices()
    europe = [
        {"country": c["country_name"], "diesel": c["prices"]["diesel"], "currency": grade_currency(c, "diesel")}
        for c in data.values()
        if c["region"] == "europe" and c["prices"]["diesel"] is not None
    ]
    return sorted(europe, key=lambda x: x["diesel"])[:top_n]


def countries_with_lpg_in_eur() -> list[dict]:
    """All countries with LPG, price normalized to EUR/liter."""
    data = get_fuel_prices()
    rates = requests.get(f"{API}/api/currency/rates").json()["rates"]

    result = []
    for c in data.values():
        if c["prices"]["lpg"] is None:
            continue
        currency = grade_currency(c, "lpg")
        if currency not in rates:
            continue
        price_eur = c["prices"]["lpg"] / rates[currency]
        if c["unit"] == "gallon":
            price_eur /= 3.78541
        result.append({
            "country": c["country_name"],
            "lpg_eur_per_liter": round(price_eur, 3),
            "region": c["region"],
        })

    return sorted(result, key=lambda x: x["lpg_eur_per_liter"])


def fuel_prices_usd(country_code: str) -> dict:
    """Fuel prices for a country, converted to USD/liter."""
    data = get_fuel_prices()
    rates = requests.get(f"{API}/api/currency/rates").json()["rates"]

    c = data.get(country_code.upper())
    if not c:
        raise ValueError(f"Country {country_code} not found")

    def to_usd(fuel):
        price = c["prices"].get(fuel)
        if price is None:
            return None
        usd = (price / rates[grade_currency(c, fuel)]) * rates["USD"]
        return round(usd / 3.78541 if c["unit"] == "gallon" else usd, 3)

    return {
        "country": c["country_name"],
        "gasoline_usd_per_liter": to_usd("gasoline"),
        "diesel_usd_per_liter": to_usd("diesel"),
        "lpg_usd_per_liter": to_usd("lpg"),
    }


# ─── VANBASKET ────────────────────────────────────────────────────────────────


def get_vanbasket() -> dict:
    return requests.get(f"{API}/api/vanbasket/countries").json()["data"]


def cheapest_countries_for_food(top_n: int = 10) -> list[dict]:
    """Countries where food is cheapest relative to world average."""
    data = get_vanbasket()
    countries = [
        {
            "country": c["country_name"],
            "index": c["vanbasket_index"],
            "vs_world": f"{c['pct_vs_world']:+.1f}%",
            "region": c.get("region", ""),
        }
        for c in data.values()
    ]
    return sorted(countries, key=lambda x: x["index"])[:top_n]


def compare_food_cost(from_code: str, to_code: str, budget: float = 100) -> dict:
    """How much does the same food basket cost in destination vs home country?"""
    r = requests.get(f"{API}/api/vanbasket/compare?from={from_code}&to={to_code}").json()
    if not r.get("success"):
        raise ValueError(r.get("error"))

    d = r["data"]
    return {
        "from": d["from"]["country_name"],
        "to": d["to"]["country_name"],
        f"budget_in_{from_code}": f"€{budget:.0f}",
        f"budget_in_{to_code}": f"€{budget * d['budget_100'] / 100:.0f}",
        "difference": f"{d['diff_percent']:+.1f}%",
        "cheaper_in_destination": d["cheaper"],
    }


# ─── EVENTS ──────────────────────────────────────────────────────────────────


def get_upcoming_events(country: str = None, event_type: str = None, locale: str = "en") -> list[dict]:
    """Upcoming vanlife events, optionally filtered by country and type."""
    params = {"status": "upcoming", "locale": locale, "limit": 50}
    if country:
        params["country"] = country
    if event_type:
        params["type"] = event_type

    r = requests.get(f"{API}/api/events", params=params).json()
    return [
        {
            "name": e["event_name"],
            "type": e["event_type_label"],
            "dates": f"{e['start_date']} → {e['end_date']}",
            "city": e["city"],
            "country": e["country"]["name"] if e.get("country") else "",
            "url": e["url"],
        }
        for e in r["events"]
    ]


def get_event_with_sources(slug: str, locale: str = "en") -> dict:
    """Full event details with source articles."""
    event = requests.get(f"{API}/api/event/{slug}", params={"locale": locale}).json()
    articles = requests.get(f"{API}/api/event/{slug}/articles", params={"locale": locale}).json()

    return {
        "name": event["event_name"],
        "dates": f"{event['start_date']} → {event['end_date']}",
        "location": f"{event.get('city', '')}, {event.get('country', {}).get('name', '')}",
        "official_url": event.get("official_url"),
        "sources": [
            {
                "title": a["title"],
                "publisher": a["source_name"],
                "language": a["language"],
                "url": a["original_url"],
            }
            for a in articles
        ],
    }


# ─── STORIES ─────────────────────────────────────────────────────────────────


def get_stories(locale: str = "en", category: str = None, country: str = None, limit: int = 20) -> dict:
    """Get latest vanlife news stories."""
    params = {"locale": locale, "limit": limit}
    if category:
        params["category"] = category
    if country:
        params["country"] = country

    return requests.get(f"{API}/api/stories", params=params).json()


def get_story_with_sources(slug: str, locale: str = "en") -> dict:
    """Full story with all original publisher links."""
    story = requests.get(f"{API}/api/story/{slug}", params={"locale": locale}).json()

    if "error" in story:
        raise ValueError(story["error"])

    return {
        "title": story["title"],
        "summary": story["summary"],
        "category": story["category"]["name"],
        "countries": [f"{c['flag_emoji']} {c['name']}" for c in story.get("countries", [])],
        "published": story["first_published_at"],
        "url": story["url"],
        "sources": [
            {
                "publisher": s["source_name"],
                "language": s["language"],
                "url": s["original_url"],
                "title": s["title"],
            }
            for s in story.get("sources", [])
        ],
    }


def stories_by_country(country_code: str, locale: str = "en", limit: int = 10) -> list[dict]:
    """News stories filtered by country."""
    r = get_stories(locale=locale, country=country_code, limit=limit)
    return [{"title": s["title"], "category": s["category"]["name"], "url": s["url"]} for s in r["stories"]]


# ─── COMBINED: Road trip planner ─────────────────────────────────────────────


def road_trip_cost_overview(country_codes: list[str]) -> list[dict]:
    """
    For each country: diesel price in EUR/L + food index.
    Useful for comparing living costs across a planned road trip route.
    """
    fuel_data = get_fuel_prices()
    rates = requests.get(f"{API}/api/currency/rates").json()["rates"]
    food_data = get_vanbasket()

    result = []
    for code in country_codes:
        f = fuel_data.get(code.upper())
        v = food_data.get(code.upper())
        if not f or not v:
            continue

        diesel = f["prices"].get("diesel")
        if diesel is not None and grade_currency(f, "diesel") in rates:
            diesel_eur = diesel / rates[grade_currency(f, "diesel")]
            if f["unit"] == "gallon":
                diesel_eur /= 3.78541
        else:
            diesel_eur = None

        result.append({
            "country": f["country_name"],
            "diesel_eur_per_liter": round(diesel_eur, 3) if diesel_eur else None,
            "food_index": v["vanbasket_index"],
            "food_vs_world": f"{v['pct_vs_world']:+.1f}%",
        })

    return sorted(result, key=lambda x: x["diesel_eur_per_liter"] or 999)


# ─── ROUTE FUEL COST & TOLL ROADS ────────────────────────────────────────────


def route_fuel_cost(waypoints: list[str], cons: float = 10, fuel: str = "diesel") -> dict:
    """Fuel cost for 2–10 place names, with prices of every country on the way."""
    r = requests.post(f"{API}/api/route-cost", json={"waypoints": waypoints, "cons": cons, "fuel": fuel})
    r.raise_for_status()
    return r.json()


def roadbook(places: list[str], inputs: dict | None = None, locale: str = "en") -> dict:
    """The same roadbook people build at openvan.camp/en/roadbook: create, wait, open the page.
    Identical requests return the same roadbook."""
    created = requests.post(
        f"{API}/api/roadbook/from-places",
        json={"places": places, "locale": locale, "name": " — ".join(places), "inputs": inputs or {}},
    ).json()
    status = created["status"]
    for _ in range(40):
        if status in ("ready", "failed"):
            break
        time.sleep(1.5)
        status = requests.get(f"{API}/api/roadbook/{created['code']}/status").json()["status"]
    return {"status": status, "url": API + created["url"]}


def city_weather(country: str, city_slug: str) -> dict:
    """VanSky weather of one city: today and the coming 7 days."""
    d = requests.get(f"{API}/api/vansky/weather/{country}/{city_slug}").json()["data"]
    return {"city": d["city_name"], "today": d["van_score"], "week": d["week_score"]}


def route_tolls(waypoints: list[str], vehicle_class: str = "van") -> dict:
    """Toll estimate in EUR. vehicle_class: car | van (up to 3.5 t) | heavy (over 3.5 t).
    Check `partial`: a country in `unknown_countries` has no data, it is not free."""
    r = requests.get(
        f"{API}/api/tolls/route",
        params={"waypoints": "|".join(waypoints), "vehicle_class": vehicle_class},
    ).json()
    return {
        "total_eur": r["total_eur"],
        "range_eur": r["range_eur"],
        "partial": r["partial"],
        "unknown_countries": r["unknown_countries"],
    }


# ─── VISA & VEHICLE IMPORT ───────────────────────────────────────────────────


def visa_check(passport: str, destination: str) -> dict:
    """Entry mode and length of stay for one passport and destination."""
    d = requests.get(f"{API}/api/visa/check", params={"passport": passport, "destination": destination}).json()["data"]
    stay = d["stay"]
    return {
        "entry_mode": d["entry_mode"],
        "max_continuous_days": stay["max_continuous"],
        "max_total_days": stay["max_total"],
        "window_days": stay["window_days"],
        "confidence": stay["confidence"],
        "source": stay["source_url"],
    }


def visa_route(countries: list[str], passports: list[str]) -> dict:
    """Visa rules for a whole route (up to 12 countries) and up to 10 passports."""
    return requests.get(
        f"{API}/api/visa/route", params={"t": ",".join(countries), "p": ",".join(passports)}
    ).json()["data"]


# ─── LICENSE PLATES ──────────────────────────────────────────────────────────


def plate_region(country: str, number: str, region: str) -> dict:
    """Validate a plate and resolve its region code."""
    d = requests.get(
        f"{API}/api/plates/{country.lower()}/validate", params={"number": number, "region": region}
    ).json()["data"]
    return {"valid": d["valid"], "region": d["region_name"], "iso": d["region_iso3166_2"]}


def plate_image_url(country: str, number: str, region: str = "") -> str:
    """Ready plate image — put it straight into <img src>. No request needed."""
    return f"{API}/api/plates/{country.lower()}/plate.svg?number={number}&region={region}"


# ─── HOLIDAYS, HAZARDS, POWER PLUGS, CUSTOMS ─────────────────────────────────


def holidays(country: str, date_from: str, date_to: str, kind: str | None = None) -> list[dict]:
    """Public, school (with regions) and peak traffic days. kind: public | school | traffic.
    A country without data answers with an error — that is not "no holidays"."""
    r = requests.get(
        f"{API}/api/holidays/countries/{country.upper()}",
        params={"from": date_from, "to": date_to, "kind": kind},
    )
    r.raise_for_status()
    return [
        {"kind": h["kind"], "name": h["name"], "start": h["start"], "end": h["end"],
         "regions": [x["code"] for x in h["regions"]]}
        for h in r.json()["items"]
    ]


def travel_hazards(country: str) -> dict:
    """UK FCDO advice level + current GDACS disasters. The situation now, not a forecast."""
    d = requests.get(f"{API}/api/hazards/countries/{country.upper()}").json()
    return {
        "advisory": d["advisory"]["level"] if d["advisory"] else None,
        "events": [f"{e['name']} ({e['alert_level']})" for e in d["events"]],
    }


def active_fires(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list[dict]:
    """NASA FIRMS fires of the last 48 h in a box up to 10°×10°.
    A new area may answer 503 "being loaded" — retry in a minute."""
    r = requests.get(f"{API}/api/hazards/fires", params={"bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}"})
    r.raise_for_status()
    return r.json()["fires"]


def power_plugs(country: str) -> dict:
    """Plug types, voltage, frequency and campsite hook-up connector."""
    d = requests.get(f"{API}/api/electricity/countries/{country.upper()}").json()
    return {"plugs": d["plugs"], "voltage": d["voltage"], "frequency": d["frequency"], "campsites": d["campsites"]}


def customs_rules(country: str, from_country: str | None = None) -> list[dict]:
    """Customs rules on entry by car, each with an official quote and source link."""
    d = requests.get(
        f"{API}/api/customs/countries/{country.upper()}", params={"from": from_country}
    ).json()
    return [{"topic": i["topic"], "summary": i["summary"], "source": i["source_url"]} for i in d["items"]]


# ─── Usage ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== Top 5 cheapest diesel in Europe ===")
    for row in cheapest_diesel_europe(5):
        print(f"  {row['country']}: {row['diesel']} {row['currency']}/L")

    print("\n=== Food cost comparison: Germany → Turkey ===")
    print(compare_food_cost("DE", "TR"))

    print("\n=== Latest vanlife stories in English ===")
    r = get_stories(locale="en", limit=3)
    print(f"  Total stories in database: {r['pagination']['total']}")
    for s in r["stories"]:
        print(f"  • {s['title']} [{s['category']['name']}]")

    print("\n=== Road trip: DE → CZ → PL → TR → GE ===")
    for row in road_trip_cost_overview(["DE", "CZ", "PL", "TR", "GE"]):
        diesel = f"{row['diesel_eur_per_liter']} EUR/L" if row["diesel_eur_per_liter"] else "N/A"
        print(f"  {row['country']}: diesel={diesel}, food index={row['food_index']} ({row['food_vs_world']})")

    print("\n=== Tolls Munich → Venice (campervan) ===")
    print(route_tolls(["Munich", "Venice"]))

    print("\n=== Roadbook Munich → Venice (German passport, 10 l/100 km diesel) ===")
    print(roadbook(["Munich", "Venice"], {"travelers": ["DE"], "cons": 10, "fuel": "diesel"}))

    print("\n=== Weather in Málaga for a campervan ===")
    print(city_weather("ES", "malaga"))

    print("\n=== Visa: Russian passport → Turkey ===")
    print(visa_check("RU", "TR"))

    print("\n=== Plate А123ВС 799 ===")
    print(plate_region("ru", "A123BC", "799"), plate_image_url("ru", "A123BC", "799"))

    print("\n=== School holidays in Germany, December ===")
    for h in holidays("DE", "2026-12-01", "2026-12-31", kind="school")[:3]:
        print(f"  {h['start']}–{h['end']} {h['name']} {h['regions']}")

    print("\n=== Turkey: hazards, plugs ===")
    print(travel_hazards("TR"), power_plugs("TR"))

    print("\n=== Customs: Germany → Norway ===")
    for rule in customs_rules("NO", "DE")[:3]:
        print(f"  [{rule['topic']}] {rule['summary']}")
