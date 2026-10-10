/**
 * Pure-функции расчёта стоимости топлива.
 *
 * Используется в:
 *  - resources/views/partials/fuel-calculator-js.blade.php  (Alpine mixin)
 *  - resources/js/maps2/index.js                            (route panel на /maps)
 *
 * Все расчёты ведутся в БАЗОВЫХ единицах: литры, километры, EUR. UI отвечает
 * за конверсию пользовательского ввода → база перед вызовом этих функций.
 *
 * 🔴 Единый источник правды для fuel-калькуляторов — изменения вносить ТОЛЬКО здесь.
 */

export const LITERS_PER_GAL     = 3.78541;   // 1 US gallon = 3.78541 litres
export const LITERS_PER_IMP_GAL = 4.54609;   // 1 imperial gallon (Кайманы и др. брит. территории)
export const KM_PER_MILE        = 1.60934;   // 1 mile = 1.60934 km
export const MPG_FACTOR         = 235.214583; // L/100km = MPG_FACTOR / mpg (US)

/**
 * Литров в объёмной единице. Зеркало FuelGradeCatalog::literFactors() (PHP).
 * Единица, которой здесь нет (kg, m3), пересчёту не подлежит — вызывающий код
 * оставляет такую цену как есть.
 */
export const LITERS_PER_UNIT = {
    liter: 1,
    gallon: LITERS_PER_GAL,
    imperial_gallon: LITERS_PER_IMP_GAL,
};

// ---------- Unit conversion helpers ----------

export function literToGallon(v) { return v == null ? null : v / LITERS_PER_GAL; }
export function gallonToLiter(v) { return v == null ? null : v * LITERS_PER_GAL; }
export function kmToMile(v)      { return v == null ? null : v / KM_PER_MILE; }
export function mileToKm(v)      { return v == null ? null : v * KM_PER_MILE; }

/**
 * Конверсия объёма в произвольных единицах.
 * @param {number|null} value
 * @param {'liter'|'gallon'} fromUnit
 * @param {'liter'|'gallon'} toUnit
 */
export function convertVolume(value, fromUnit, toUnit) {
    if (value == null || fromUnit === toUnit) return value;
    const from = LITERS_PER_UNIT[fromUnit];
    const to   = LITERS_PER_UNIT[toUnit];
    if (!from || !to) return value;
    return value * from / to;
}

/**
 * Конверсия ЦЕНЫ ЗА ЕДИНИЦУ (цена за галлон ↔ цена за литр).
 * Обратна convertVolume: объёма больше — цена за него выше.
 */
/** Плотность автомобильного LPG, кг/л. Зеркало FuelGradeCatalog::LPG_KG_PER_LITER (PHP). */
export const LPG_KG_PER_LITER = 0.51;

/**
 * Цена за ЛИТР для расчёта маршрута: объёмные единицы — точно, LPG за кг — по плотности
 * (≈; Таиланд, Пакистан, Гана, Зимбабве), метан за кг/м³ — null (в литры не переводится).
 * Зеркало FuelGradeCatalog::routePricePerLiter (PHP).
 */
export function routePricePerLiter(value, unit, grade) {
    if (value == null) return null;
    const u = unit || 'liter';
    if (LITERS_PER_UNIT[u]) return convertUnitPrice(value, u, 'liter');
    return (grade === 'lpg' && u === 'kg') ? value * LPG_KG_PER_LITER : null;
}

/** Цена переведена из кг по плотности — приблизительная (подписывать «≈»). */
export function isApproxRoutePrice(unit, grade) {
    return grade === 'lpg' && unit === 'kg';
}

export function convertUnitPrice(value, fromUnit, toUnit) {
    if (value == null || fromUnit === toUnit) return value;
    const from = LITERS_PER_UNIT[fromUnit];
    const to   = LITERS_PER_UNIT[toUnit];
    if (!from || !to) return value;
    return value / from * to;
}

/**
 * Конверсия расхода (volume per 100 distance) между парами единиц.
 * Например: 10 L/100km ↔ 2.64 gal/100km ↔ 4.25 gal/100mi ↔ 16.1 L/100mi.
 */
export function convertConsumption(value, fromVolU, toVolU, fromDistU, toDistU) {
    if (value == null) return value;
    if (fromVolU === toVolU && fromDistU === toDistU) return value;
    // Normalize to L/100km
    let lper100km = value;
    if (fromVolU  === 'gallon') lper100km *= LITERS_PER_GAL;
    if (fromDistU === 'miles')  lper100km /= KM_PER_MILE;
    // De-normalize to (toVolU, toDistU)
    let out = lper100km;
    if (toVolU  === 'gallon') out /= LITERS_PER_GAL;
    if (toDistU === 'miles')  out *= KM_PER_MILE;
    return out;
}

/** L/100km ↔ MPG (US): 235.214583 / X. */
export function lper100kmToMpg(v) { return v == null || v === 0 ? null : MPG_FACTOR / v; }
export function mpgToLper100km(v) { return v == null || v === 0 ? null : MPG_FACTOR / v; }

/** Привести расход (в выбранных единицах) к базе L/100km. */
export function consumptionToLper100km(value, volU, distU) {
    if (value == null) return null;
    let v = value;
    if (volU  === 'gallon') v *= LITERS_PER_GAL;
    if (distU === 'miles')  v /= KM_PER_MILE;
    return v;
}

// ---------- Расчёт сегмента ----------

/**
 * Сколько литров потратится на сегмент distKm километров.
 * @param {number} distKm  расстояние в km (базовая единица)
 * @param {number} lper100km расход в L/100km (базовая единица)
 */
import { loadCountryAt } from './geo/country-at.js';


/**
 * Разбивка маршрута на страны с километрами — ЕДИНЫЙ источник для карты и калькулятора.
 *
 * Страну точки определяет country-coder прямо в браузере по границам, без сети. До этого
 * калькулятор спрашивал `/geocode/reverse` по 40 точкам и получал страну БЛИЖАЙШЕГО ГОРОДА:
 * у Женевы ближайший город швейцарский, и маршрут Рим→Париж, который идёт по французской
 * стороне, получал 89 км несуществующей Швейцарии (самое дорогое топливо в Европе), а Италия
 * теряла 270 км. Эталонный проход по всем 2719 точкам даёт Италию 804 км и Францию 616 км.
 *
 * Вес участка — его реальная длина: после упрощения геометрии точки расставлены неравномерно
 * (на прямой редко, на серпантине густо), и счёт по числу точек приписывал извилистым странам
 * лишние километры.
 *
 * @param {Array<[number, number]>} coords геометрия маршрута [[lng, lat], ...]
 * @param {number} totalKm длина маршрута по данным провайдера
 * @returns {Promise<Array<{cc: string, km: number}>>}
 */
export async function countrySegments(coords, totalKm) {
    if (!Array.isArray(coords) || coords.length < 2 || !(totalKm > 0)) { return []; }

    // Страна точки — с территориями «как на земле» (Северный Кипр, Курдистан), тем же
    // ответом, что у сервера: голый country-coder терял километры Северного Кипра.
    let countryAt;
    try {
        countryAt = await loadCountryAt();
    } catch (e) {
        return [];
    }

    // 400 сэмплов на маршрут в 3000 км — точка каждые 7 км. Граница страны при этом
    // определяется с точностью до нескольких километров, а стоит это миллисекунды.
    const nSamples = Math.min(400, coords.length);
    const step = Math.max(1, Math.floor(coords.length / nSamples));
    const samples = [];
    for (let i = 0; i < coords.length; i += step) { samples.push(coords[i]); }
    if (samples[samples.length - 1] !== coords[coords.length - 1]) { samples.push(coords[coords.length - 1]); }

    const rawLengths = [];
    let rawTotal = 0;
    for (let i = 0; i < samples.length - 1; i++) {
        const km = haversineKm(samples[i], samples[i + 1]);
        rawLengths.push(km);
        rawTotal += km;
    }
    // Ломаная по сэмплам короче настоящей дороги — приводим её к длине от провайдера.
    const scale = rawTotal > 0 ? totalKm / rawTotal : 1;

    const segments = [];
    for (let i = 0; i < samples.length - 1; i++) {
        let cc = null;
        try {
            cc = countryAt(samples[i]) || countryAt(samples[i + 1]);
        } catch (e) {
            cc = null;
        }
        if (!cc) { continue; }
        const km = rawLengths[i] * scale;
        const last = segments[segments.length - 1];
        if (last && last.cc === cc) { last.km += km; } else { segments.push({ cc, km }); }
    }

    return segments;
}

/**
 * @param {[number, number]} a [lng, lat]
 * @param {[number, number]} b [lng, lat]
 */
function haversineKm(a, b) {
    const R = 6371;
    const lat1 = a[1] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const dLat = lat2 - lat1;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function segmentLiters(distKm, lper100km) {
    if (!distKm || !lper100km) return 0;
    return (distKm * lper100km) / 100;
}

/**
 * Стоимость сегмента в EUR.
 * @param {number} liters       литры топлива
 * @param {number} priceEurPerL цена за литр в EUR
 */
export function segmentCostEur(liters, priceEurPerL) {
    if (!liters || priceEurPerL == null) return 0;
    return liters * priceEurPerL;
}

// ---------- Оптимизация заправки ----------

/**
 * Стратегия «когда заправляться чтобы было дешевле» (жадная, как у водителя с картой цен).
 *
 * На каждом сегменте: сначала покрываем дефицит топлива на саму страну, затем на выезде
 * смотрим вперёд:
 *  - если впереди (в пределах маршрута) есть страна ДЕШЕВЛЕ текущей — берём ровно
 *    столько, чтобы до неё доехать (но не больше бака);
 *  - если дешевле впереди нет — выезжаем с полным баком (min(топливо до финиша, бак)).
 * Итог: в страну с более дорогим топливом въезжаем с полным баком. В стране, где нужно
 * несколько заправок, последняя — у границы, поэтому «куплено в стране» может быть
 * больше бака; флаг tankFullAtExit говорит UI, что перед границей нужен полный бак.
 *
 * Страна с неизвестной ценой не считается «дешевле» — через неё едем на запасе.
 *
 * @param {Array<{cc:string, km:number, literNeed?:number}>} segments
 * @param {Record<string, number|null>}   pricesEurPerL  по коду страны
 * @param {number}                        tankCapacityLiters
 * @returns {Array<{cc:string, km:number, litersBought:number, costEur:number, priceEurPerL:number|null, tankFullAtExit:boolean}>}
 */
export function calcOptimalFillStrategy(segments, pricesEurPerL, tankCapacityLiters) {
    const n = segments.length;
    const fuels = [];
    const prices = [];
    for (let i = 0; i < n; i++) {
        fuels[i]  = segments[i].literNeed != null ? segments[i].literNeed : 0;
        prices[i] = pricesEurPerL[segments[i].cc] ?? null;
    }
    let tankLevel = 0;
    const result = [];
    for (let i = 0; i < n; i++) {
        const fuelNeeded = fuels[i];
        const priceEur   = prices[i];
        let litersBought = 0;
        let costEur      = 0;
        let tankFullAtExit = false;
        // 1) Покрыть дефицит для текущего сегмента
        if (tankLevel < fuelNeeded) {
            const deficit = fuelNeeded - tankLevel;
            litersBought = deficit;
            if (priceEur != null) costEur = deficit * priceEur;
            tankLevel = 0;
        } else {
            tankLevel -= fuelNeeded;
        }
        // 2) На выезде: топлива до ближайшей более дешёвой страны (или до финиша)
        if (priceEur != null && i + 1 < n) {
            let fuelToCheaper = 0;
            for (let j = i + 1; j < n; j++) {
                if (prices[j] != null && prices[j] < priceEur) break;
                fuelToCheaper += fuels[j];
            }
            const target = Math.min(fuelToCheaper, tankCapacityLiters);
            const toFill = target - tankLevel;
            if (toFill > 0.5) {
                litersBought += toFill;
                costEur      += toFill * priceEur;
                tankLevel    += toFill;
            }
            tankFullAtExit = target >= tankCapacityLiters - 0.5;
        }
        result.push({
            cc: segments[i].cc,
            km: segments[i].km,
            litersBought,
            costEur,
            priceEurPerL: priceEur,
            tankFullAtExit,
        });
    }
    return result;
}

/**
 * Классификация заправки в стране для подписи-действия под строкой:
 *  'reserve' — ничего не покупаем, едем на запасе из бака;
 *  'full'    — заливаем (почти) полный бак (дешёвая страна, берём про запас);
 *  'topup'   — частичный долив (запаса из бака не хватило);
 *  'multi'   — топлива на участок нужно больше одного бака (несколько заправок);
 *              в этом случае :litersBought — суммарный расход по стране, а НЕ объём
 *              одной заправки, поэтому подпись «залейте полный бак» неприменима.
 *
 * @param {number} litersBought      сколько куплено в стране (в тех же единицах, что и tank)
 * @param {number} tankCapacity
 * @returns {'reserve'|'full'|'topup'|'multi'}
 */
export function classifyFill(litersBought, tankCapacity) {
    if (!litersBought || litersBought <= 0.5) return 'reserve';
    if (tankCapacity > 0 && litersBought > tankCapacity + 0.5) return 'multi';
    if (tankCapacity > 0 && litersBought >= tankCapacity - 0.5) return 'full';
    return 'topup';
}

/**
 * Оценка числа заправок для участка, который не помещается в один бак.
 * Минимум 2 (раз litersBought > бака — одной заправки точно мало).
 *
 * @param {number} litersBought
 * @param {number} tankCapacity
 * @returns {number}
 */
export function estimateRefuels(litersBought, tankCapacity) {
    if (!(tankCapacity > 0)) return 1;
    return Math.max(2, Math.round(litersBought / tankCapacity));
}

// ---------- Electricity (EV) tariff resolution — ЕДИНЫЙ ИСТОЧНИК ----------
// Используется и в калькуляторе /tools/* (Alpine mixin), и в роут-панели /maps (maps2/index.js).
// Любые изменения режимов/дефолта/разрешения цены — ТОЛЬКО здесь.

/** Режимы EV-тарифа из нашей базы (в порядке отображения). key — ключ в prices_eur.
 *  «Своя цена» — отдельный глобальный чекбокс (для любого топлива), НЕ режим EV. */
export const EV_MODES = [
    { id: 'home', key: 'home_avg'  },
    { id: 'dc',   key: 'public_dc' },
];

/** Режим по умолчанию: DC быстрая (реалистичная дорожная цена, лучшее покрытие). */
export const DEFAULT_EV_MODE = 'dc';

/**
 * Единый приоритет цены за единицу (EUR): своя цена → EV-режим базы → локальная цена страны.
 * Используется и в калькуляторе, и на карте — НЕ дублировать приоритет в другом месте.
 * @param {Object} o
 * @param {boolean} o.customEnabled  включён глобальный чекбокс «Своя цена»
 * @param {number|null} o.customEur   введённая цена EUR/единица (литр для жидкого, кВт·ч для EV)
 * @param {boolean} o.isEv            топливо = электричество
 * @param {Object} o.evData           карта cc → prices_eur (для EV)
 * @param {string} o.cc               код страны
 * @param {string} o.evMode           home | dc
 * @param {number|null} o.localEur     локальная цена страны EUR/единица (для жидкого; уже сконвертирована)
 * @returns {number|null} EUR/единица или null если цена неизвестна
 */
export function resolveUnitPriceEur(o) {
    if (o.customEnabled) { return o.customEur != null ? o.customEur : null; }
    if (o.isEv) { return evPriceEurFor(o.evData, o.cc, o.evMode, null); }
    return o.localEur != null ? o.localEur : null;
}

function currencyAmount(value, currency, symbols, suffixCurrencies, decimals) {
    if (value == null || !isFinite(value)) { return null; }
    const sym = (symbols && symbols[currency]) || currency;
    const sep = sym.length > 1 ? '\u00a0' : '\u00a0';
    const val = value.toFixed(decimals == null ? 2 : decimals);
    return (suffixCurrencies || []).indexOf(currency) >= 0 ? val + sep + sym : sym + val;
}

function convertCurrency(value, fromCurrency, toCurrency, rates) {
    if (value == null || !fromCurrency || !toCurrency) { return null; }
    if (fromCurrency === toCurrency) { return value; }
    const fromRate = fromCurrency === 'EUR' ? 1 : rates && rates[fromCurrency];
    const toRate = toCurrency === 'EUR' ? 1 : rates && rates[toCurrency];
    if (!fromRate || !toRate) { return null; }
    return (value / fromRate) * toRate;
}

function applyUnit(value, nativeUnit, displayUnit) {
    if (value == null) { return null; }
    return convertUnitPrice(value, nativeUnit || 'liter', displayUnit || 'liter');
}

function unitSuffix(displayUnit, labels) {
    if (displayUnit === 'gallon') { return (labels && labels.gallon) || 'gal'; }
    if (displayUnit === 'kwh') { return (labels && labels.kwh) || 'kWh'; }
    return (labels && labels.liter) || 'L';
}

/**
 * Единый формат цены за единицу для route UI: selected/unit (local · USD · EUR).
 * Работает для всех fuel grades и EV; source может быть native local price или EUR-price.
 */
export function formatUnitPriceBreakdown(opts) {
    const rates = opts.rates || {};
    const displayCurrency = opts.displayCurrency || 'EUR';
    const displayUnit = opts.displayUnit || 'liter';
    const nativeUnit = opts.nativeUnit || displayUnit;
    const symbols = opts.currencySymbols || {};
    const suffixCurrencies = opts.suffixCurrencies || [];
    const decimals = opts.decimals == null ? 2 : opts.decimals;
    const localCurrency = opts.localCurrency || opts.currency || 'EUR';
    const localPriceRaw = opts.localPriceRaw;
    const eurPriceRaw = opts.eurPriceRaw;

    let eurPerUnit = eurPriceRaw != null ? applyUnit(eurPriceRaw, 'liter', displayUnit) : null;
    if (displayUnit === 'kwh') { eurPerUnit = eurPriceRaw; }

    if (eurPerUnit == null && localPriceRaw != null) {
        const localPerDisplayUnit = applyUnit(localPriceRaw, nativeUnit, displayUnit);
        eurPerUnit = convertCurrency(localPerDisplayUnit, localCurrency, 'EUR', rates);
    }

    if (eurPerUnit == null) { return null; }

    const localPerUnit = localPriceRaw != null
        ? applyUnit(localPriceRaw, nativeUnit, displayUnit)
        : convertCurrency(eurPerUnit, 'EUR', localCurrency, rates);
    const selectedPerUnit = displayCurrency === localCurrency && localPerUnit != null
        ? localPerUnit
        : convertCurrency(eurPerUnit, 'EUR', displayCurrency, rates);

    const primary = currencyAmount(selectedPerUnit, displayCurrency, symbols, suffixCurrencies, decimals);
    if (!primary) { return null; }

    const secondary = [];
    const pushed = new Set([displayCurrency]);
    const pushCurrency = function (currency, value) {
        if (!currency || pushed.has(currency)) { return; }
        const text = currencyAmount(value, currency, symbols, suffixCurrencies, decimals);
        if (!text) { return; }
        pushed.add(currency);
        secondary.push(text);
    };

    pushCurrency(localCurrency, localPerUnit);
    pushCurrency('USD', convertCurrency(eurPerUnit, 'EUR', 'USD', rates));
    pushCurrency('EUR', eurPerUnit);

    const suffix = '/' + unitSuffix(displayUnit, opts.unitLabels);
    return {
        primary: primary,
        secondary: secondary.join(' · '),
        unit: unitSuffix(displayUnit, opts.unitLabels),
        text: primary + suffix + (secondary.length ? ' (' + secondary.join(' · ') + ')' : ''),
    };
}

/** id режима → ключ в prices_eur (home_avg/public_dc); custom/неизвестный → null. */
export function evModeKey(mode) {
    const m = EV_MODES.find((x) => x.id === mode);
    return m ? m.key : null;
}

/**
 * Цена EV в EUR/кВт·ч для страны по режиму. Источник — наша база EvCharging.
 * home/dc → per-country из prices_eur (fallback public_ac); custom → цена пользователя.
 * @param {Object} evData  карта cc → { prices_eur: {home_avg, public_ac, public_dc} }
 * @param {string} cc      код страны
 * @param {string} mode    home | dc | custom
 * @param {number|null} customEur  цена пользователя (для custom и как fallback при отсутствии данных)
 * @returns {number|null}  EUR/кВт·ч или null
 */
export function evPriceEurFor(evData, cc, mode) {
    const pe = evData && evData[cc] && evData[cc].prices_eur;
    if (!pe) { return null; }
    const k = evModeKey(mode);
    if (k && pe[k] != null) { return pe[k]; }
    return pe.public_ac != null ? pe.public_ac : null;
}

/**
 * Средняя цена базы EV по списку стран (для подсказки «средняя по маршруту» в режимах home/dc).
 * @returns {number|null} средняя EUR/кВт·ч или null
 */
export function evDbAvgEur(evData, ccList, mode) {
    const k = evModeKey(mode);
    const vals = [];
    for (const cc of ccList || []) {
        const pe = evData && evData[cc] && evData[cc].prices_eur;
        if (!pe) { continue; }
        const v = k && pe[k] != null ? pe[k] : (pe.public_ac != null ? pe.public_ac : null);
        if (v != null) { vals.push(v); }
    }
    if (!vals.length) { return null; }
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Известна ли цена EV по стране для режима (home/dc — есть запись в базе; custom — всегда да). */
export function evPriceKnown(evData, cc, mode) {
    const pe = evData && evData[cc] && evData[cc].prices_eur;
    if (!pe) { return false; }
    const k = evModeKey(mode);
    return (k && pe[k] != null) || pe.public_ac != null;
}

// ---------- Cross-border hints (паромы + разница цен) ----------

/**
 * Известные паромные переправы между странами. Ключи — отсортированная пара "AA-BB".
 * Используется и в панели маршрута на /maps, и в калькуляторе /tools/fuel-cost-calculator —
 * любые изменения вносить ТОЛЬКО здесь.
 */
export const FERRY_ROUTES = {
    'ES-MA': { route: 'Tarifa → Tanger Med',            durationMin: 60 },
    'ES-DZ': { route: 'Almería → Alger',            durationMin: 480 },
    'FR-GB': { route: 'Calais → Dover',                  durationMin: 90 },
    'IE-GB': { route: 'Dublin → Holyhead',               durationMin: 195 },
    'IE-FR': { route: 'Rosslare → Cherbourg',            durationMin: 1020 },
    'ES-IE': { route: 'Bilbao → Rosslare',               durationMin: 1800 },
    'GB-NL': { route: 'Harwich → Hook of Holland',       durationMin: 420 },
    'EE-FI': { route: 'Tallinn → Helsinki',              durationMin: 120 },
    'FI-SE': { route: 'Helsinki → Stockholm',            durationMin: 660 },
    'DE-SE': { route: 'Rostock → Trelleborg',            durationMin: 360 },
    'DK-SE': { route: 'Helsingør → Helsingborg',     durationMin: 20 },
    'DE-DK': { route: 'Puttgarden → Rødby',         durationMin: 45 },
    'DE-FI': { route: 'Travemünde → Helsinki',      durationMin: 1800 },
    'DK-NO': { route: 'Hirtshals → Kristiansand',        durationMin: 195 },
    'PL-SE': { route: 'Świnoujście → Ystad',     durationMin: 420 },
    'LV-SE': { route: 'Ventspils → Nynäshamn',      durationMin: 1500 },
    'LT-SE': { route: 'Klaipėda → Karlshamn',       durationMin: 840 },
    'GR-IT': { route: 'Patras → Bari',                   durationMin: 870 },
    'HR-IT': { route: 'Split → Ancona',                  durationMin: 660 },
    'AL-IT': { route: 'Durrës → Bari',              durationMin: 540 },
    'ME-IT': { route: 'Bar → Bari',                      durationMin: 540 },
    'ES-IT': { route: 'Barcelona → Civitavecchia',       durationMin: 1200 },
    'IT-TN': { route: 'Civitavecchia → Tunis',           durationMin: 1440 },
    'GR-TR': { route: 'Lesbos → Ayvalık',           durationMin: 90 },
    'DK-FO': { route: 'Hirtshals → Tórshavn',       durationMin: 2160 },
    'FO-IS': { route: 'Tórshavn → Seyðisfjörður', durationMin: 1080 },
};

export function getFerryBetween(cc1, cc2) {
    if (!cc1 || !cc2 || cc1 === cc2) return null;
    return FERRY_ROUTES[cc1 + '-' + cc2] || FERRY_ROUTES[cc2 + '-' + cc1] || null;
}

/**
 * Форматирует длительность парома в локализованную строку.
 * @param {number} min — минут
 * @param {string} hShort — локализованный "ч" / "h" / "Std" / "sa"
 * @param {string} minShort — локализованный "мин" / "min" / "Min" / "dk"
 */
export function formatFerryDuration(min, hShort, minShort) {
    if (!min || min <= 0) return '';
    if (min < 60) return min + ' ' + (minShort || 'min');
    const h = Math.round(min / 60);
    return h + ' ' + (hShort || 'h');
}

/**
 * Заполнить шаблон вида "Паром :route · ~:duration".
 */
export function formatFerryHintText(ferry, tmpl, hShort, minShort) {
    const durStr = formatFerryDuration(ferry.durationMin, hShort, minShort);
    return (tmpl || 'Ferry :route · ~:duration')
        .replace(':route', ferry.route)
        .replace(':duration', durStr);
}

/**
 * Возвращает целое число процентов разницы цен (next дороже prev) если разница >5%,
 * иначе null. Используется для подсказки "заправьтесь до полного".
 */
export function pctMoreExpensive(prevPriceEur, nextPriceEur) {
    if (prevPriceEur == null || nextPriceEur == null || prevPriceEur <= 0) return null;
    if (nextPriceEur <= prevPriceEur * 1.05) return null;
    return Math.round((nextPriceEur / prevPriceEur - 1) * 100);
}

/**
 * Заполнить шаблон вида "Заправьтесь до полного в :country — в :next топливо на :percent% дороже".
 */
export function formatFillupHintText(tmpl, countryName, nextName, percent) {
    return (tmpl || 'Fill up in :country — fuel is :percent% more expensive in :next')
        .replace(':country', countryName)
        .replace(':next', nextName)
        .replace(':percent', percent);
}

// ---------- Sharing / copy ----------

/** ISO-2 страна → emoji-флаг (🇬🇪). */
export function codeToFlag(code) {
    if (!code || code.length !== 2) return '';
    return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

/**
 * Единый билдер «скопировать результат» для всех страниц с топливным калькулятором.
 * Унифицирует формат на /maps, /tools/fuel-cost-calculator, /tools/fuel-prices,
 * /tools/fuel-prices/{country}.
 *
 * Изменения формата вносить ТОЛЬКО здесь.
 *
 * @param {object} opts
 * @param {?{fromName:string, toName:string}} opts.summary — шапка "From → To" (необяз.)
 * @param {?{fuelLabel:string, consumption, consumptionUnit:string, tankCapacity, tankCapacityUnit:string}} opts.params
 * @param {Array<{cc:string, name:string, city?:string, distance, distanceUnit:string, cost:string, skipped:boolean, action?:string}>} opts.segments
 * @param {Array<{afterIndex:number, type:'ferry'|'fillup', text:string}>} opts.hints
 * @param {{distance, distanceUnit:string, costFormatted:string, liters?, litersUnit?:string, perKm?, perKmUnit?:string, hours?, hoursUnit?:string}} opts.totals
 * @param {?{costFormatted:string}} opts.savings — экономия от tank-opt (необяз.)
 * @param {?{distance?, distanceUnit?:string, rangeFormatted:string, grandTotalFormatted?:string,
 *           byCountry?:Array<{name:string, amount:string}>, vignettes?:Array<{name:string, amount:string, period:string}>,
 *           partial?:boolean, partialNote?:string}} opts.tolls — плата за платные дороги (необяз.)
 * @param {string} opts.url — текущий URL страницы для футера
 * @param {object} opts.t — переводы (route_share_params, route_share_breakdown, route_share_savings,
 *                          route_share_route, route_share_total, route_share_footer, route_tank_skip,
 *                          ferry_flag_template для "⛴️ 🇪🇸→🇲🇦 ...")
 * @returns {string}
 */
export function buildShareableRouteText(opts) {
    const lines = [];
    const t = opts.t || {};
    const hintByIdx = {};
    if (opts.hints) {
        for (const h of opts.hints) hintByIdx[h.afterIndex] = h;
    }

    // Шапка From → To
    if (opts.summary && opts.summary.fromName && opts.summary.toName) {
        lines.push(opts.summary.fromName + ' → ' + opts.summary.toName);
        lines.push('');
    }

    // Параметры расчёта (топливо · расход · бак)
    if (opts.params && t.route_share_params) {
        const p = opts.params;
        const header = t.route_share_params
            .replace(':fuel', p.fuelLabel || '')
            .replace(':cons', p.consumption != null ? p.consumption : '')
            .replace(':consUnit', p.consumptionUnit || '')
            .replace(':tank', p.tankCapacity != null ? p.tankCapacity : '')
            .replace(':tankUnit', p.tankCapacityUnit || '');
        lines.push(header);
        lines.push('');
    }

    // Список сегментов с inline-подсказками
    let hasSkipped = false;
    for (let i = 0; i < opts.segments.length; i++) {
        const s = opts.segments[i];
        const flag = codeToFlag(s.cc);
        const city = s.city ? ' (' + s.city + ')' : '';
        const star = s.skipped ? '*' : '';
        let tail = '';
        const hint = hintByIdx[i];
        if (hint) {
            if (hint.type === 'ferry') {
                const fromFlag = codeToFlag(s.cc);
                const toFlag = i + 1 < opts.segments.length ? codeToFlag(opts.segments[i + 1].cc) : '';
                tail = ' (⛴️ ' + (fromFlag && toFlag ? fromFlag + '→' + toFlag + ' ' : '') + hint.text + ')';
            } else {
                tail = ' (⛽ ' + hint.text + ')';
            }
        }
        if (s.action) {
            tail += ' (⛽ ' + s.action + ')';
        }
        if (s.note) {
            tail += ' (❓ ' + s.note + ')';
        }
        if (s.toll) {
            tail += ' (\u{1F6E3} ' + s.toll + ')';
        }
        lines.push(`${i + 1}. ${flag} ${s.name}${city} — ${s.distance} ${s.distanceUnit} · ${s.cost}${star}${tail}`);
        if (s.skipped) hasSkipped = true;
    }
    lines.push('');

    // Итоги
    if (opts.totals) {
        const labelRoute = t.route_share_route || 'Route';
        const labelTotal = t.route_share_total || 'Total';
        lines.push(labelRoute + ': ' + opts.totals.distance + ' ' + opts.totals.distanceUnit);
        lines.push(labelTotal + ': ' + opts.totals.costFormatted);
        // Сводка-аналитика (литры · ₽/км · часы в пути) — только если переданы все поля
        if (t.route_share_breakdown && opts.totals.liters != null && opts.totals.perKm != null && opts.totals.hours != null) {
            const bd = t.route_share_breakdown
                .replace(':liters', opts.totals.liters)
                .replace(':litersUnit', opts.totals.litersUnit || '')
                .replace(':perKm', opts.totals.perKm)
                .replace(':perKmUnit', opts.totals.perKmUnit || '')
                .replace(':hours', opts.totals.hours)
                .replace(':hoursUnit', opts.totals.hoursUnit || '');
            lines.push(bd);
        }
    }

    // Плата за дороги: отдельной строкой под итогом по топливу, диапазоном — в закрытых
    // системах цена зависит от съездов, и точную цифру мы назвать не можем.
    if (opts.tolls && opts.tolls.rangeFormatted) {
        const tolls = opts.tolls;
        const tollLine = tolls.distance != null && t.route_share_tolls
            ? t.route_share_tolls
                .replace(':distance', (tolls.distance + ' ' + (tolls.distanceUnit || '')).trim())
                .replace(':amount', tolls.rangeFormatted)
            : (t.route_share_tolls_short || 'Toll roads: :amount').replace(':amount', tolls.rangeFormatted);
        lines.push('\u{1F6E3} ' + tollLine);

        if (tolls.vignettes && tolls.vignettes.length && t.route_share_vignettes) {
            const list = tolls.vignettes
                .map((v) => v.name + ' ' + v.amount + (v.period ? ' (' + v.period + ')' : ''))
                .join(' \u00b7 ');
            lines.push('\u{1F9FE} ' + t.route_share_vignettes.replace(':list', list));
        }

        if (tolls.grandTotalFormatted && t.route_share_grand_total) {
            lines.push('\u{1F4B0} ' + t.route_share_grand_total.replace(':amount', tolls.grandTotalFormatted));
        }
    }

    // Экономия от оптимизации (если применимо)
    if (opts.savings && opts.savings.costFormatted && t.route_share_savings) {
        lines.push(t.route_share_savings.replace(':amount', opts.savings.costFormatted));
    }

    // Предупреждение о неполноте — последним среди цифр, чтобы его прочли вместе с ними.
    if (opts.tolls && opts.tolls.partial && opts.tolls.partialNote) {
        lines.push('\u26A0\uFE0F ' + opts.tolls.partialNote);
    }

    // Footnote для skipped стран
    if (hasSkipped && t.route_tank_skip) {
        lines.push('* ' + t.route_tank_skip);
    }

    // Footer с URL
    if (t.route_share_footer && opts.url) {
        lines.push('');
        lines.push(t.route_share_footer + ' \u{1F449} ' + opts.url);
    }

    return lines.join('\n');
}

// ---------- City search (единый geocoding) ----------
// Единый источник параметров поиска: length>=2, limit=6, БЕЗ types-filter, БЕЗ cyrillic-filter.
// Используется и /maps (doWpSearch) и /tools/* (Alpine searchCity).
// Возвращает Promise<Array<{name, fullName, lat, lng, context, raw}>>
// Возвращает null если запрос был отменён (AbortError).
let _searchAbortCtrl = null;
export async function searchCity(query, opts) {
    opts = opts || {};
    const minLen = opts.minLen || 2;
    if (!query || query.length < minLen) return [];
    if (_searchAbortCtrl) { try { _searchAbortCtrl.abort(); } catch (e) {} }
    _searchAbortCtrl = new AbortController();
    const locale = opts.locale || 'en';
    // Геокодинг через наш прокси /geocode/search (Nominatim) — замена MapTiler Geocoding.
    const url = '/geocode/search?q=' + encodeURIComponent(query) + '&lang=' + locale;
    try {
        const res  = await fetch(url, { signal: _searchAbortCtrl.signal });
        const data = await res.json();
        return (data.features || []).map(f => ({
            name:     f.text || (f.place_name || '').split(',')[0],
            fullName: f.place_name || f.text || '',
            lat:      f.center ? f.center[1] : null,
            lng:      f.center ? f.center[0] : null,
            context:  (f.context || []).map(c => c.text).join(', '),
            raw:      f,
        }));
    } catch (e) {
        if (e && e.name === 'AbortError') return null;
        return [];
    }
}

/**
 * Единый источник user-visible текста для всех routing-ошибок от /api/map/directions.
 * Используется и /maps, и всеми fuel-calc страницами (/tools/fuel-cost-calculator,
 * /tools/fuel-prices, /tools/fuel-prices/{country} и др.).
 *
 * Добавление нового error-кода: (1) добавить ключ `maps.route_error_<code>` в 7
 * lang/{locale}/maps.php; (2) добавить ветку switch здесь. Никаких правок в Blade
 * или maps2/index.js не нужно — всё пройдёт через эту функцию.
 *
 * @param {string} backendCode  Код от backend: 'same_point' | 'not_found' | 'too_far' | 'unavailable' | другое
 * @param {Object} t            Объект переводов { route_error_*: string }, обычно из MAPS_CONFIG.translations или fuel-calc mapsTranslations
 * @param {number|null} crowKm  Расстояние по прямой в км (только для too_far) — для подстановки {km}
 * @returns {string}            Готовый локализованный текст или пустую строку если t пустой
 */
function routeErrorText(backendCode, t, crowKm) {
    const T = t || {};
    const get = (key) => T[key] || '';
    switch (backendCode) {
        case 'same_point':
            return get('route_error_same_point') || 'Start and end points are the same.';
        case 'not_found':
            return get('route_error_not_found') || 'No road route exists between these points.';
        case 'too_far': {
            const tpl = get('route_error_too_far') || 'This route is too long ({km}k km in a straight line).';
            const km = crowKm ? Math.round(crowKm / 1000) : '';
            return tpl.replace('{km}', km);
        }
        case 'no_toll_free_route':
            // Человек просил объехать платные дороги, а мы не смогли: сказать «маршрута
            // нет» было бы неправдой — маршрут есть, просто платный.
            return get('route_error_no_toll_free_route') || 'Could not build a route avoiding toll roads.';
        case 'closed_border':
            // Дорога есть, но только через закрытую границу Россия↔Украина — такие
            // маршруты не строим (MapsController::CLOSED_BORDERS).
            return get('route_error_closed_border') || 'The only road between these points crosses a closed border.';
        case 'unavailable':
        case 'network':
        default:
            return get('route_error_unavailable') || 'Routing service is temporarily unavailable.';
    }
}

/**
 * Пояснение к маршруту «без платных»: где объехать не вышло и сколько там километров.
 *
 * Сервер строит объезд всегда и не отказывает целиком: кусок, где платной дороге нет
 * альтернативы, остаётся платным, и человек должен знать, в какой он стране. Пустая
 * строка — всё объехали, показывать нечего.
 *
 * @param {{unavoidable?: Array<{cc: string, km: number}>, unchecked?: boolean}|null} tollFree
 * @param {Object} t переводы maps.*
 * @param {(cc: string) => string} countryName
 */
function tollFreeNoticeText(tollFree, t, countryName) {
    if (!tollFree) return '';
    const T = t || {};
    const parts = [];
    const items = (tollFree.unavoidable || []).map((item) =>
        (T.route_toll_unavoidable_item || '{country} ≈ {km}')
            .replace('{country}', (countryName && countryName(item.cc)) || item.cc)
            // км → единицы человека (мили для США); без VanlifeUnits — метрика с подписью
            .replace('{km}', (typeof window !== 'undefined' && window.VanlifeUnits) ? window.VanlifeUnits.fmt('distance', item.km, { digits: 0 }) : item.km + ' km'));
    if (items.length) {
        parts.push((T.route_toll_unavoidable || 'Toll sections remain: {list}.').replace('{list}', items.join(', ')));
    }
    if (tollFree.unchecked) {
        parts.push(T.route_toll_unchecked || 'Part of the route could not be checked for toll roads.');
    }
    return parts.join(' ');
}

/**
 * Сообщить серверу, что маршрут не построился в браузере.
 *
 * Оборванный на клиенте запрос не оставляет на сервере ни строчки: человек
 * видит «сервис временно недоступен», а в логах пусто и чинить нечего.
 * Маячок ничего не ждёт и ничего не ломает — телеметрия не должна мешать
 * работе страницы.
 *
 * Точки и параметры расчёта сервер кладёт в route_attempt_logs рядом с серверными
 * отказами — по ним потом видно, какие маршруты не строятся.
 *
 * @param {string} reason
 * @param {?{coordinates?:Array<[number,number]>, fuel?:string, tank?:?number, currency?:string, cons?:?number, dist?:string, vol?:string}} route
 */
function reportRouteFailure(reason, route) {
    try {
        fetch('/api/map/route-failure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({}, route || {}, {
                reason: String(reason || '').slice(0, 200),
                page: location.pathname,
            })),
            keepalive: true,
        }).catch(function () {});
    } catch (e) {
        // Телеметрия не работает — это не повод ронять расчёт маршрута.
    }
}

// Глобальный экспорт для не-модульных скриптов (Alpine inline JS из .blade.php).
if (typeof window !== 'undefined') {
    window.FuelCalc = {
        LITERS_PER_GAL, LITERS_PER_IMP_GAL, LITERS_PER_UNIT, KM_PER_MILE, MPG_FACTOR,
        convertVolume, convertConsumption, consumptionToLper100km,
        lper100kmToMpg, mpgToLper100km,
        segmentLiters, segmentCostEur, calcOptimalFillStrategy, classifyFill, estimateRefuels,
        countrySegments,
        EV_MODES, DEFAULT_EV_MODE, evModeKey, evPriceEurFor, evDbAvgEur, evPriceKnown, resolveUnitPriceEur, formatUnitPriceBreakdown,
        literToGallon, gallonToLiter, kmToMile, mileToKm, convertUnitPrice, routePricePerLiter, isApproxRoutePrice, LPG_KG_PER_LITER,
        FERRY_ROUTES, getFerryBetween, formatFerryDuration, formatFerryHintText,
        pctMoreExpensive, formatFillupHintText,
        codeToFlag, buildShareableRouteText,
        searchCity,
        routeErrorText,
        tollFreeNoticeText,
        reportRouteFailure,
    };
}
