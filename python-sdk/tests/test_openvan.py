"""Offline tests: the network is replaced, so they check URLs, parsing and error handling.

Set OPENVAN_LIVE=1 to also run a smoke test against the real API.
"""

import io
import json
import os
import unittest
from unittest import mock
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

from openvan import OpenVan, OpenVanError


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def respond(payload_by_path):
    """urlopen stand-in: answers by URL path and records every request."""
    calls = []

    def fake_urlopen(request, timeout=None):
        calls.append(request)
        path = urlparse(request.full_url).path
        payload = payload_by_path[path]
        if isinstance(payload, HTTPError):
            raise payload
        return FakeResponse(json.dumps(payload).encode())

    return fake_urlopen, calls


FUEL = {
    "data": {
        "DE": {"country_code": "DE", "currency": "EUR", "unit": "liter", "prices": {"diesel": 1.70}},
        "US": {"country_code": "US", "currency": "USD", "unit": "gallon", "prices": {"diesel": 3.80}},
        "VE": {
            "country_code": "VE",
            "currency": "VES",
            "currencies": {"diesel": "USD"},
            "unit": "liter",
            "prices": {"diesel": 0.50},
        },
        "XX": {"country_code": "XX", "currency": "XXX", "unit": "liter", "prices": {"diesel": 0.01}},
    }
}
RATES = {"rates": {"EUR": 1, "USD": 1.10, "VES": 40.0}}


class OpenVanTest(unittest.TestCase):
    def test_source_tag_and_query(self):
        fake, calls = respond({"/api/visa/check": {"success": True}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan(source="myapp.com").visa.check("ru", "tr", locale="en")
        query = parse_qs(urlparse(calls[0].full_url).query)
        self.assertEqual(query["passport"], ["RU"])
        self.assertEqual(query["destination"], ["TR"])
        self.assertEqual(query["source"], ["myapp.com"])
        self.assertEqual(query["locale"], ["en"])

    def test_empty_options_are_dropped(self):
        fake, calls = respond({"/api/tolls/countries": {"countries": []}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan().tolls.countries()
        self.assertNotIn("locale", parse_qs(urlparse(calls[0].full_url).query))

    def test_cheapest_converts_each_grade_with_its_own_currency(self):
        fake, _ = respond({"/api/fuel/prices": FUEL, "/api/currency/rates": RATES})
        with mock.patch("openvan.client.urlopen", fake):
            ranked = OpenVan().fuel.cheapest("diesel")
        # VE diesel is priced in USD (0.45 €/l), US is per gallon (0.91 €/l), DE 1.70 €/l;
        # XX has no rate and is left out instead of being compared as EUR.
        self.assertEqual([c["country_code"] for c in ranked], ["VE", "US", "DE"])

    def test_cheapest_uses_the_unit_of_each_grade(self):
        # Colombia: the country record says liters, but diesel is sold per gallon.
        fuel = {"data": {
            "DE": {"country_code": "DE", "currency": "EUR", "unit": "liter", "prices": {"diesel": 1.70}},
            "CO": {"country_code": "CO", "currency": "COP", "unit": "liter",
                   "units": {"diesel": "gallon"}, "prices": {"diesel": 11219.5}},
        }}
        fake, _ = respond({"/api/fuel/prices": fuel, "/api/currency/rates": {"rates": {"EUR": 1, "COP": 4400.0}}})
        with mock.patch("openvan.client.urlopen", fake):
            ranked = OpenVan().fuel.cheapest("diesel")
        # 11219.5 COP / 4400 = 2.55 € per gallon = 0.67 €/l, cheaper than DE at 1.70 €/l.
        self.assertEqual([c["country_code"] for c in ranked], ["CO", "DE"])

    def test_weather_score_calls_country_endpoint(self):
        fake, calls = respond({"/api/vansky/weather/FR": {"data": {"code": "FR", "van_score": 89}}})
        with mock.patch("openvan.client.urlopen", fake):
            self.assertEqual(OpenVan().weather.score("fr")["van_score"], 89)
        self.assertEqual(urlparse(calls[0].full_url).path, "/api/vansky/weather/FR")

    def test_weather_top_ranks_by_score(self):
        data = {"data": [{"code": "A", "van_score": 50}, {"code": "B", "van_score": 90}, {"code": "C", "van_score": 70}]}
        fake, _ = respond({"/api/vansky/weather": data})
        with mock.patch("openvan.client.urlopen", fake):
            self.assertEqual([c["code"] for c in OpenVan().weather.top(2)], ["B", "C"])

    def test_climate_point_passes_lat_lng_and_date(self):
        fake, calls = respond({"/api/vansky/climate": {"period": "2021–2025", "day": {"date": "09-18"}}})
        with mock.patch("openvan.client.urlopen", fake):
            self.assertEqual(OpenVan().weather.climate(41.64, 41.63, "09-18")["day"]["date"], "09-18")
        q = parse_qs(urlparse(calls[0].full_url).query)
        self.assertEqual((q["lat"], q["lng"], q["date"]), (["41.64"], ["41.63"], ["09-18"]))

    def test_city_climate_without_date_drops_empty_params(self):
        fake, calls = respond({"/api/vansky/climate/GE/batumi": {"period": "2021–2025", "months": []}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan().weather.city_climate("ge", "batumi")
        url = urlparse(calls[0].full_url)
        self.assertEqual(url.path, "/api/vansky/climate/GE/batumi")
        self.assertNotIn("date", parse_qs(url.query))

    def test_route_cost_posts_json(self):
        fake, calls = respond({"/api/route-cost": {"distance_km": 345}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan().fuel.route_cost(["Berlin", "Prague"], fuel="diesel", cons=10)
        self.assertEqual(calls[0].get_method(), "POST")
        self.assertEqual(json.loads(calls[0].data), {"waypoints": ["Berlin", "Prague"], "fuel": "diesel", "cons": 10})

    def test_tolls_route_joins_waypoints(self):
        fake, calls = respond({"/api/tolls/route": {}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan().tolls.route(["Rome", "Paris"], vehicle_class="heavy")
        query = parse_qs(urlparse(calls[0].full_url).query)
        self.assertEqual(query["waypoints"], ["Rome|Paris"])
        self.assertEqual(query["vehicle_class"], ["heavy"])

    def test_holidays_from_keyword(self):
        fake, calls = respond({"/api/holidays/countries/DE": {}})
        with mock.patch("openvan.client.urlopen", fake):
            OpenVan().holidays.country("de", from_="2026-10-01", to="2026-12-31")
        query = parse_qs(urlparse(calls[0].full_url).query)
        self.assertEqual(query["from"], ["2026-10-01"])

    def test_api_error_message_is_kept(self):
        body = io.BytesIO(json.dumps({"message": "Place not found: Atlantis"}).encode())
        error = HTTPError("https://openvan.camp/api/tolls/route", 422, "Unprocessable", {}, body)
        fake, _ = respond({"/api/tolls/route": error})
        with mock.patch("openvan.client.urlopen", fake):
            with self.assertRaises(OpenVanError) as caught:
                OpenVan().tolls.route(["Atlantis", "Paris"])
        self.assertEqual(caught.exception.status, 422)
        self.assertEqual(caught.exception.message, "Place not found: Atlantis")

    def test_plate_image_url_makes_no_request(self):
        url = OpenVan(source="t").plates.image_url("DE", "B AB 1234")
        self.assertEqual(url, "https://openvan.camp/api/plates/de/plate.svg?number=B+AB+1234&source=t")


@unittest.skipUnless(os.environ.get("OPENVAN_LIVE"), "set OPENVAN_LIVE=1 to call the real API")
class LiveSmokeTest(unittest.TestCase):
    def test_every_resource_answers(self):
        ov = OpenVan(source="openvan-python-tests")
        self.assertIn("diesel", ov.fuel.country("DE")["prices"])
        self.assertTrue(ov.fuel.cheapest("diesel", 3))
        self.assertGreater(ov.currency.convert(100, "EUR", "USD"), 0)
        self.assertTrue(ov.basket.compare("DE", "TR"))
        self.assertIn("van_score", ov.weather.score("FR"))
        self.assertEqual(len(ov.weather.top(3)), 3)
        self.assertIn("events", ov.events.list(limit=1))
        self.assertIn("stories", ov.stories.list(limit=1))
        self.assertIn("countries", ov.tolls.countries())
        self.assertIn("points", ov.tolls.route(["Rome", "Paris"]))
        self.assertTrue(ov.visa.check("RU", "TR")["success"])
        self.assertTrue(ov.plates.validate("DE", "B AB 1234")["data"]["valid"])
        self.assertIn("countries", ov.holidays.countries())
        self.assertIn("advisory", ov.hazards.country("TR"))
        self.assertIn("plugs", ov.electricity.country("GB"))
        self.assertIn("items", ov.customs.country("TR", from_country="DE"))


if __name__ == "__main__":
    unittest.main()
