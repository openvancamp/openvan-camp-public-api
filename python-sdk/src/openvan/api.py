"""OpenVan.camp resources — the same surface as the JavaScript SDK, in snake_case."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import quote

from .client import DEFAULT_BASE_URL, OpenVanClient, OpenVanError

LITERS_PER_GALLON = 3.78541

JSON = Dict[str, Any]


class OpenVan:
    """OpenVan.camp — free vanlife / RV travel data. No API key.

    >>> from openvan import OpenVan
    >>> ov = OpenVan()
    >>> ov.fuel.country("DE")["prices"]["diesel"]
    >>> ov.visa.check("RU", "TR")
    >>> ov.tolls.route(["Rome", "Paris"])

    Data is CC BY 4.0 — credit "Data: OpenVan.camp" with a link to https://openvan.camp/.
    Pass ``source="yourapp.com"`` so we can see and acknowledge your project.
    """

    def __init__(
        self,
        source: str = "openvan-python",
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self.client = OpenVanClient(base_url=base_url, source=source, timeout=timeout)
        self.fuel = Fuel(self.client)
        self.currency = Currency(self.client)
        self.basket = Basket(self.client)
        self.weather = Weather(self.client)
        self.events = Events(self.client)
        self.stories = Stories(self.client)
        self.tolls = Tolls(self.client)
        self.visa = Visa(self.client)
        self.plates = Plates(self.client)
        self.holidays = Holidays(self.client)
        self.hazards = Hazards(self.client)
        self.electricity = Electricity(self.client)
        self.customs = Customs(self.client)


class _Resource:
    def __init__(self, client: OpenVanClient) -> None:
        self.client = client


class Fuel(_Resource):
    def prices(self) -> Dict[str, JSON]:
        """Retail fuel prices of every country: ISO code → country entry."""
        return self.client.get("/api/fuel/prices")["data"]

    def country(self, code: str) -> JSON:
        """Fuel prices of one country."""
        entry = self.prices().get(code.upper())
        if entry is None:
            raise KeyError(f'No fuel data for country code "{code}"')
        return entry

    def cheapest(self, fuel_type: str = "diesel", limit: int = 10) -> List[JSON]:
        """Cheapest countries for a fuel type, in EUR per liter, cheapest first.

        Each grade is converted with its own currency (``currencies``) and unit (``units``):
        gallon prices are normalized to liters, and countries whose currency has no rate are left out.
        """
        prices = self.prices()
        try:
            rates = self.client.get("/api/currency/rates")["rates"]
        except OpenVanError:
            rates = {}

        def eur_per_liter(country: JSON) -> float:
            price = (country.get("prices") or {}).get(fuel_type)
            if price is None:
                return math.nan
            currency = ((country.get("currencies") or {}).get(fuel_type) or country.get("currency") or "").upper()
            rate = 1 if currency == "EUR" else rates.get(currency)
            if not rate:
                return math.nan
            eur = price / rate
            unit = (country.get("units") or {}).get(fuel_type) or country.get("unit", "")
            return eur / LITERS_PER_GALLON if "gal" in str(unit).lower() else eur

        ranked = [(eur_per_liter(c), c) for c in prices.values()]
        ranked = [x for x in ranked if not math.isnan(x[0])]
        ranked.sort(key=lambda x: x[0])
        return [c for _, c in ranked[:limit]]

    def route_cost(self, waypoints: Sequence[str], **options: Any) -> JSON:
        """Fuel cost for a route of 2–10 place names, with per-country prices along the way.

        Options: ``fuel`` ("diesel", "gasoline", …), ``cons`` (l/100 km), ``tank`` (l),
        ``currency``, ``locale``.
        """
        return self.client.post("/api/route-cost", {"waypoints": list(waypoints), **options})


class Currency(_Resource):
    def rates(self) -> Dict[str, float]:
        """Exchange rates relative to EUR (1 EUR = rate units)."""
        return self.client.get("/api/currency/rates")["rates"]

    def convert(self, amount: float, from_currency: str, to_currency: str) -> float:
        """Convert an amount between two currencies via EUR."""
        rates = self.rates()

        def rate(code: str) -> float:
            code = code.upper()
            value = 1 if code == "EUR" else rates.get(code)
            if not value:
                raise KeyError(f"Unknown currency: {code}")
            return value

        return amount / rate(from_currency) * rate(to_currency)


class Basket(_Resource):
    def list(self) -> Dict[str, JSON]:
        """Food cost index of every country (world average = 100)."""
        return self.client.get("/api/vanbasket/countries")["data"]

    def country(self, code: str) -> JSON:
        """Food cost index of one country with historical snapshots."""
        return self.client.get(f"/api/vanbasket/countries/{code.upper()}")["data"]

    def compare(self, from_country: str, to_country: str) -> JSON:
        """Compare food cost between two countries."""
        return self.client.get(
            "/api/vanbasket/compare", {"from": from_country.upper(), "to": to_country.upper()}
        )["data"]


class Weather(_Resource):
    def score(self, code: str) -> JSON:
        """Vanlife weather of one country: ``van_score`` 0–100, ``score_label``, 7-day ``forecast``."""
        return self.client.get(f"/api/vansky/weather/{code.upper()}")["data"]

    def city(self, code: str, city_slug: str, locale: Optional[str] = None, hourly: bool = False) -> JSON:
        """One city, as on its page: score today and for the coming 7 days, place among the cities of the
        country (``rank``), per-day score breakdown, worst day, best stretch, air quality, recommendations.
        ``hourly=True`` adds 3-hour steps.
        """
        params = {"locale": locale, "include": "hourly" if hourly else None}
        return self.client.get(f"/api/vansky/weather/{code.upper()}/{quote(city_slug)}", params)["data"]

    def cities(
        self, code: str, sort: str = "week", limit: Optional[int] = None, offset: Optional[int] = None,
        locale: Optional[str] = None,
    ) -> JSON:
        """Cities of a country ranked by the score of the coming 7 days (``sort="week"``, as on the site) or today."""
        params = {"sort": sort, "limit": limit, "offset": offset, "locale": locale}
        return self.client.get(f"/api/vansky/weather/{code.upper()}/cities", params)

    def ranking(
        self, by: str = "week", region: Optional[str] = None, limit: Optional[int] = None, locale: Optional[str] = None
    ) -> List[JSON]:
        """Countries ranked by the score of the coming 7 days (``by="week"``) or today, optionally in one region."""
        params = {"by": by, "region": region, "limit": limit, "locale": locale}
        return self.client.get("/api/vansky/ranking", params)["data"]

    def methodology(self) -> JSON:
        """How the VanSky score is calculated: curves, weights, adjustments, week score."""
        return self.client.get("/api/vansky/methodology")

    def all(self) -> List[JSON]:
        """Every country with weather data (one request, ~1 MB)."""
        return self.client.get("/api/vansky/weather")["data"]

    def top(self, limit: int = 10) -> List[JSON]:
        """Top countries by vanlife weather suitability today, best first."""
        return sorted(self.all(), key=lambda c: c.get("van_score") or 0, reverse=True)[:limit]

    def climate(self, lat: float, lng: float, date: Optional[str] = None) -> JSON:
        """Typical weather (climate) at any point: median of 35 archive days (the date ±3 days over
        2021–2025, ERA5). With ``date`` (``MM-DD`` or ``YYYY-MM-DD``) the result has ``day``; without it,
        ``days`` holds all 366 days. ``months``, ``best_month`` and ``good_months`` are always included.
        """
        return self.client.get("/api/vansky/climate", {"lat": lat, "lng": lng, "date": date})

    def city_climate(
        self, code: str, city_slug: str, date: Optional[str] = None, locale: Optional[str] = None
    ) -> JSON:
        """The same as :meth:`climate` for a VanSky city, plus the city name and page URL."""
        return self.client.get(
            f"/api/vansky/climate/{code.upper()}/{quote(city_slug)}", {"date": date, "locale": locale}
        )


class Events(_Resource):
    def list(self, **filters: Any) -> JSON:
        """Vanlife events. Filters: ``locale``, ``status``, ``type``, ``country``, ``search``, ``page``, ``limit``.

        Returns ``{"events": [...], "pagination": {...}}``.
        """
        res = self.client.get("/api/events", filters)
        return {"events": res["events"], "pagination": res["pagination"]}

    def get(self, slug: str, locale: Optional[str] = None) -> JSON:
        """One event with geo coordinates."""
        return self.client.get(f"/api/event/{quote(slug)}", {"locale": locale})


class Stories(_Resource):
    def list(self, **filters: Any) -> JSON:
        """News stories. Filters: ``locale``, ``category``, ``country``, ``search``, ``page``, ``limit``.

        Returns ``{"stories": [...], "pagination": {...}}``.
        """
        res = self.client.get("/api/stories", filters)
        return {"stories": res["stories"], "pagination": res["pagination"]}

    def get(self, slug: str, locale: Optional[str] = None) -> JSON:
        """One story with all source articles and direct links."""
        return self.client.get(f"/api/story/{quote(slug)}", {"locale": locale})

    def search(self, query: str, **options: Any) -> JSON:
        """Semantic search over stories."""
        return self.client.get("/api/news/search", {"q": query, **options})


class Tolls(_Resource):
    def countries(self, locale: Optional[str] = None) -> JSON:
        """Countries with toll data: payment system, per-km rates by vehicle class, vignettes."""
        return self.client.get("/api/tolls/countries", {"locale": locale})

    def country(self, code: str, locale: Optional[str] = None) -> JSON:
        """Toll reference for one country: rates, vignettes, concession sections, bridges and tunnels."""
        return self.client.get(f"/api/tolls/countries/{code.upper()}", {"locale": locale})

    def route(self, waypoints: Sequence[str], vehicle_class: str = "van", locale: Optional[str] = None) -> JSON:
        """Toll cost for a route of 2–10 place names as a EUR range.

        Check ``partial`` and ``unknown_countries``: a country without data is not a free country.
        """
        return self.client.get(
            "/api/tolls/route",
            {"waypoints": "|".join(waypoints), "vehicle_class": vehicle_class, "locale": locale},
        )


class Visa(_Resource):
    def check(self, passport: str, destination: str, **options: Any) -> JSON:
        """Entry rules for one passport and destination. Options: ``weight``, ``plate``, ``locale``."""
        return self.client.get(
            "/api/visa/check", {"passport": passport.upper(), "destination": destination.upper(), **options}
        )

    def route(
        self,
        countries: Sequence[str],
        passports: Sequence[str] = (),
        weight: Optional[str] = None,
        plate: Optional[str] = None,
        locale: Optional[str] = None,
    ) -> JSON:
        """Visa rules for a whole route (countries in travel order) for up to 10 passports."""
        return self.client.get(
            "/api/visa/route",
            {
                "t": ",".join(countries),
                "p": ",".join(passports) or None,
                "w": weight,
                "plate": plate,
                "locale": locale,
            },
        )

    def passport(self, code: str, locale: Optional[str] = None) -> JSON:
        """Every destination for one passport."""
        return self.client.get(f"/api/visa/passport/{code.upper()}", {"locale": locale})

    def vehicle(self, place: str, locale: Optional[str] = None) -> JSON:
        """Temporary import rules for a foreign-plated vehicle in a country."""
        return self.client.get(f"/api/visa/vehicle/{quote(place)}", {"locale": locale})


class Plates(_Resource):
    def list(self, locale: Optional[str] = None) -> JSON:
        """Countries with license plate data: international code, regions, example plate."""
        return self.client.get("/api/plates", {"locale": locale})

    def country(self, code: str, locale: Optional[str] = None) -> JSON:
        """Plate format and every region code of one country."""
        return self.client.get(f"/api/plates/{code.lower()}", {"locale": locale})

    def types(self, code: str, locale: Optional[str] = None) -> JSON:
        """Plate types (private, taxi, diplomatic…). Empty for countries without a breakdown."""
        return self.client.get(f"/api/plates/{code.lower()}/types", {"locale": locale})

    def validate(self, code: str, number: str, **options: Any) -> JSON:
        """Validate a plate number and resolve its region. Options: ``region``, ``type``, ``locale``."""
        return self.client.get(f"/api/plates/{code.lower()}/validate", {"number": number, **options})

    def random(self, code: str, type: Optional[str] = None) -> JSON:
        """A random valid plate with image URLs."""
        return self.client.get(f"/api/plates/{code.lower()}/random", {"type": type})

    def image_url(
        self,
        code: str,
        number: str,
        format: str = "svg",
        region: Optional[str] = None,
        type: Optional[str] = None,
        width: Optional[int] = None,
    ) -> str:
        """URL of a ready plate image (SVG or PNG). No request is made."""
        return self.client.url(
            f"/api/plates/{code.lower()}/plate.{format}",
            {"number": number, "region": region, "type": type, "width": width if format == "png" else None},
        )


class Holidays(_Resource):
    def countries(self, locale: Optional[str] = None) -> JSON:
        """Countries with holiday data."""
        return self.client.get("/api/holidays/countries", {"locale": locale})

    def country(self, code: str, **options: Any) -> JSON:
        """Public holidays, school holidays (ISO 3166-2 regions) and peak traffic days.

        Options: ``from_`` / ``to`` (YYYY-MM-DD, default today + 90 days), ``kind``
        ("public", "school" or "traffic"), ``locale``.
        A country without data raises — that is not the same as "no holidays".
        """
        if "from_" in options:
            options["from"] = options.pop("from_")
        return self.client.get(f"/api/holidays/countries/{code.upper()}", options)


class Hazards(_Resource):
    def country(self, code: str, locale: Optional[str] = None) -> JSON:
        """UK FCDO travel advice level and current GDACS natural disasters. Not a forecast."""
        return self.client.get(f"/api/hazards/countries/{code.upper()}", {"locale": locale})

    def fires(self, bbox: Tuple[float, float, float, float]) -> JSON:
        """NASA FIRMS fires of the last 48 hours in ``(min_lon, min_lat, max_lon, max_lat)``, up to 10°×10°.

        A new area may answer 503 "being loaded, retry in a minute".
        """
        return self.client.get("/api/hazards/fires", {"bbox": ",".join(str(v) for v in bbox)})


class Electricity(_Resource):
    def countries(self, locale: Optional[str] = None) -> JSON:
        """Plug types and mains voltage of every country."""
        return self.client.get("/api/electricity/countries", {"locale": locale})

    def country(self, code: str, locale: Optional[str] = None) -> JSON:
        """Plug types (IEC A–N), voltage, frequency and campsite hook-up connector of one country."""
        return self.client.get(f"/api/electricity/countries/{code.upper()}", {"locale": locale})


class Customs(_Resource):
    def countries(self, locale: Optional[str] = None) -> JSON:
        """Customs jurisdictions and blocs."""
        return self.client.get("/api/customs/countries", {"locale": locale})

    def country(self, code: str, from_country: Optional[str] = None, locale: Optional[str] = None) -> JSON:
        """Customs rules on entry by car, each with an official quote.

        A country without data raises — that is not the same as "nothing is restricted".
        """
        return self.client.get(
            f"/api/customs/countries/{code.upper()}",
            {"from": from_country.upper() if from_country else None, "locale": locale},
        )
