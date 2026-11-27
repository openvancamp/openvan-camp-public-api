/**
 * Страна точки в браузере — тот же ответ, что у сервера (CountryLocator и PostGIS).
 *
 * Сначала территории «как на земле» (Северный Кипр XN, регион Курдистан KU) по своим
 * полигонам из territories.json, потом country-coder. Country-coder их не выделяет:
 * Северный Кипр у него без кода — километры маршрута там выпадали из расчёта, а Курдистан
 * он считает Ираком. territories.json собирает scripts/build-country-borders.cjs из
 * database/data/geo/territories.geojson.
 *
 * Загрузка ленивая (country-coder ~670 КБ) — нужна только планировщику маршрута.
 */
let loading = null;

function inRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }

    return inside;
}

function territoryAt(territories, lng, lat) {
    for (const t of territories) {
        const [minLng, minLat, maxLng, maxLat] = t.bbox;
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
            continue;
        }
        if (t.polygons.some(ring => inRing(lng, lat, ring))) {
            return t.code;
        }
    }

    return null;
}

/**
 * @returns {Promise<(point: [number, number]) => string|null>} функция «страна точки [lng, lat]»
 */
export function loadCountryAt() {
    loading ??= Promise.all([
        import('@rapideditor/country-coder'),
        import('./territories.json'),
    ]).then(([coder, data]) => {
        const territories = data.default || data;

        return ([lng, lat]) => territoryAt(territories, lng, lat)
            || coder.iso1A2Code([lng, lat], { level: 'country' })
            || null;
    }).catch((e) => {
        loading = null;
        throw e;
    });

    return loading;
}
