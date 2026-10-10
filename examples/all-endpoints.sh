#!/usr/bin/env bash
# OpenVan.camp Public API — Bash Examples
# https://openvan.camp/en/developers
# License: CC BY 4.0 — attribution required

API="https://openvan.camp"

# ─── FUEL PRICES ─────────────────────────────────────────────────────────────

# All fuel prices
curl -s "$API/api/fuel/prices" | python3 -m json.tool

# Cheapest diesel in Europe (requires jq)
curl -s "$API/api/fuel/prices" | jq '
  .data
  | to_entries
  | map(select(.value.region == "europe" and .value.prices.diesel != null))
  | sort_by(.value.prices.diesel)
  | .[0:5]
  | map({country: .value.country_name, diesel: .value.prices.diesel, currency: (.value.currencies.diesel // .value.currency)})
'

# Diesel price in Germany
curl -s "$API/api/fuel/prices" | jq '.data.DE.prices.diesel'

# Countries with LPG
curl -s "$API/api/fuel/prices" | jq '
  [.data | to_entries[] | select(.value.prices.lpg != null) | {country: .value.country_name, lpg: .value.prices.lpg, currency: (.value.currencies.lpg // .value.currency)}]
  | sort_by(.lpg)
'

# ─── CURRENCY RATES ──────────────────────────────────────────────────────────

# All rates (EUR base)
curl -s "$API/api/currency/rates"

# Get USD rate
curl -s "$API/api/currency/rates" | jq '.rates.USD'

# Convert 100 EUR to TRY
curl -s "$API/api/currency/rates" | jq '.rates.TRY * 100'

# ─── VANBASKET ───────────────────────────────────────────────────────────────

# All countries food price index
curl -s "$API/api/vanbasket/countries" | jq '.data | to_entries | sort_by(.value.vanbasket_index) | .[0:5]'

# Compare Germany vs Turkey
curl -s "$API/api/vanbasket/compare?from=DE&to=TR" | jq '.data | {diff: .diff_percent, budget_de_100eur: .budget_100}'

# Georgia food index with history
curl -s "$API/api/vanbasket/countries/GE" | jq '{index: .data.country.vanbasket_index, snapshots: .data.snapshots[-3:]}'

# ─── EVENTS ──────────────────────────────────────────────────────────────────

# Upcoming events (English)
curl -s "$API/api/events?status=upcoming&locale=en"

# Festivals in Germany
curl -s "$API/api/events?country=DE&type=festival&status=all&locale=en" | jq '.events[] | {name: .event_name, dates: "\(.start_date) - \(.end_date)", city}'

# Event details
curl -s "$API/api/event/fit-camper-2026?locale=en" | jq '{name: .event_name, city, dates: "\(.start_date) - \(.end_date)", url}'

# Source articles for an event
curl -s "$API/api/event/fit-camper-2026/articles?locale=en" | jq '[.[] | {title, source: .source_name, lang: .language, url: .original_url}]'

# ─── STORIES ─────────────────────────────────────────────────────────────────

# Latest vanlife news in English
curl -s "$API/api/stories?locale=en&limit=5" | jq '.stories[] | {title, category: .category.name, url}'

# German news about Germany
curl -s "$API/api/stories?locale=de&country=DE&limit=5" | jq '.stories[] | .title'

# Search for stories about solar
curl -s "$API/api/stories?locale=en&search=solar&limit=5" | jq '.stories[] | {title, url}'

# Full story with publisher sources
curl -s "$API/api/story/free-overnight-parking-netherlands?locale=en" | jq '{
  title,
  summary,
  sources_count: (.sources | length),
  sources: [.sources[] | {publisher: .source_name, lang: .language, url: .original_url}]
}'

# ─── ROUTE FUEL COST & TOLL ROADS ────────────────────────────────────────────

# Fuel cost Berlin → Prague, 10 l/100 km
curl -s -X POST "$API/api/route-cost" -H "Content-Type: application/json" \
  -d '{"waypoints":["Berlin","Prague"],"cons":10,"fuel":"diesel"}' | jq '{distance_km, liters, fuel_cost, currency}'

# Tolls Munich → Venice for a campervan (car | van | heavy). partial=true means a country has no data
curl -s "$API/api/tolls/route?waypoints=Munich|Venice&vehicle_class=van" | jq '{total_eur, range_eur, partial, unknown_countries}'

# Toll reference for one country
curl -s "$API/api/tolls/countries/FR" | jq '{name, system_type, vignettes}'

# ─── ROADBOOK (WHOLE TRIP) ───────────────────────────────────────────────────

# Roadbook Munich → Venice: create, poll until ready, open https://openvan.camp + url
RB=$(curl -s -X POST "$API/api/roadbook/from-places" -H "Content-Type: application/json" \
  -d '{"places":["Munich","Venice"],"locale":"en","name":"Munich — Venice","inputs":{"travelers":["DE"],"cons":10,"fuel":"diesel"}}')
CODE=$(echo "$RB" | jq -r .code)
for i in $(seq 1 40); do
  ST=$(curl -s "$API/api/roadbook/$CODE/status" | jq -r .status)
  [ "$ST" = ready ] || [ "$ST" = failed ] && break
  sleep 1.5
done
echo "$RB" | jq --arg st "$ST" --arg api "$API" '{status: $st, url: ($api + .url)}'

# VanSky weather of one city (today and the coming 7 days)
curl -s "$API/api/vansky/weather/ES/malaga" | jq '.data | {city_name, van_score, week_score}'

# ─── VISA & VEHICLE IMPORT ───────────────────────────────────────────────────

# Russian passport → Turkey: entry mode and stay
curl -s "$API/api/visa/check?passport=RU&destination=TR" | jq '.data | {entry_mode, max: .stay.max_continuous, total: .stay.max_total, window: .stay.window_days}'

# Whole route for two passports
curl -s "$API/api/visa/route?t=RU,GE,TR&p=RU,KZ" | jq '.data.legs[] | .name'

# Temporary import of a foreign-plated vehicle
curl -s "$API/api/visa/vehicle/TR" | jq '.data[0]'

# ─── LICENSE PLATES ──────────────────────────────────────────────────────────

# Which region is 799?
curl -s "$API/api/plates/ru/validate?number=A123BC&region=799" | jq '.data | {valid, region_name, region_iso3166_2}'

# Plate types (empty list where the country has no breakdown)
curl -s "$API/api/plates/ua/types" | jq '[.data[] | .name]'

# Plate image — or just use the URL in <img src>
curl -s -o plate.png "$API/api/plates/ru/plate.png?number=A123BC&region=77&width=800"

# ─── HOLIDAYS, HAZARDS, POWER PLUGS, CUSTOMS ─────────────────────────────────

# School holidays in Germany in December (kind = public | school | traffic)
curl -s "$API/api/holidays/countries/DE?from=2026-12-01&to=2026-12-31&kind=school" | jq '.items[] | {name, start, "end": .end, regions: [.regions[].code]}'

# FCDO advice level + current GDACS disasters
curl -s "$API/api/hazards/countries/TR" | jq '{advisory: .advisory.level, events: [.events[] | "\(.name) (\(.alert_level))"]}'

# Active fires of the last 48 h, bbox = minLon,minLat,maxLon,maxLat (503 = area is loading, retry in a minute)
curl -s "$API/api/hazards/fires?bbox=-1,38,1,40" | jq '.count'

# Plugs and voltage
curl -s "$API/api/electricity/countries/GB" | jq '{plugs, voltage, frequency}'

# Customs Germany → Norway
curl -s "$API/api/customs/countries/NO?from=DE" | jq '.items[] | {topic, summary, source_url}'

# ─── COMBINED ────────────────────────────────────────────────────────────────

# Road trip cost overview: fuel + food for multiple countries
COUNTRIES=("DE" "CZ" "PL" "TR" "GE")

FUEL=$(curl -s "$API/api/fuel/prices")
RATES=$(curl -s "$API/api/currency/rates")
FOOD=$(curl -s "$API/api/vanbasket/countries")

for CODE in "${COUNTRIES[@]}"; do
  NAME=$(echo $FUEL | jq -r ".data.${CODE}.country_name // \"${CODE}\"")
  DIESEL=$(echo $FUEL | jq -r ".data.${CODE}.prices.diesel // \"N/A\"")
  CURRENCY=$(echo $FUEL | jq -r ".data.${CODE}.currencies.diesel // .data.${CODE}.currency // \"EUR\"")
  FOOD_IDX=$(echo $FOOD | jq -r ".data.${CODE}.vanbasket_index // \"N/A\"")
  echo "$NAME: diesel=$DIESEL $CURRENCY/L | food index=$FOOD_IDX (world=100)"
done
