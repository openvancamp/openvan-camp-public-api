/**
 * Общие помощники расчёта роудбука: даты и сезоны, расстояния до линии маршрута, деньги.
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */

export const DAY = 864e5;

/** Грубое расстояние от точки до ломаной (км) — по вершинам упрощённой линии. */
export function kmToLine(lat, lng, preview) {
    let best = Infinity;
    const k = Math.cos(lat * Math.PI / 180);
    for (const [plng, plat] of preview) {
        const dx = (plng - lng) * 111.32 * k;
        const dy = (plat - lat) * 110.57;
        best = Math.min(best, dx * dx + dy * dy);
    }

    return Math.sqrt(best);
}

export const STATUS = ['ok', 'warn', 'bad', 'toll', 'none'];

export const addDays = (date, n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);

    return d;
};

/** «ММ-ДД» из справочника в дату года поездки. */
export const mdDate = (md, year) => new Date(year, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5)));

/** Попадает ли хоть один день пребывания в период «ММ-ДД – ММ-ДД» (период может переходить через Новый год). */
export function inSeason(period, entry, exit) {
    if (!period?.from || !period?.to || !entry || !exit) {
        return false;
    }
    for (let d = new Date(entry); d <= exit; d = addDays(d, 1)) {
        const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hit = period.from <= period.to ? md >= period.from && md <= period.to : md >= period.from || md <= period.to;
        if (hit) {
            return true;
        }
    }

    return false;
}

/** Неделя года 0..52 — так её считает CityClimateService (день года / 7). */
export const weekOfYear = date => Math.min(52, Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / DAY / 7));

export const pct = (part, whole) => `${whole > 0 ? Math.round(part / whole * 100000) / 1000 : 0}%`;

/**
 * Километр точки вдоль маршрута — по проекции на ближайший отрезок упрощённой линии.
 * Ближайшая вершина давала ошибку до половины отрезка: на 5000 км и 320 точках — до 16 км.
 */
export function kmOnLine(line, totalKm, lat, lng) {
    if (!line?.length) {
        return 0;
    }
    const kx = Math.cos(lat * Math.PI / 180);
    let cum = 0;
    let best = 0;
    let bestD = Math.hypot((line[0][0] - lng) * kx, line[0][1] - lat);
    for (let i = 1; i < line.length; i++) {
        const [x1, y1] = line[i - 1];
        const [x2, y2] = line[i];
        const segKx = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
        const len = Math.hypot((x2 - x1) * segKx, y2 - y1);
        // Проекция в локальной равнопромежуточной плоскости у точки.
        const dx = (x2 - x1) * kx;
        const dy = y2 - y1;
        const d2 = dx * dx + dy * dy;
        const t = d2 > 0 ? Math.max(0, Math.min(1, (((lng - x1) * kx) * dx + (lat - y1) * dy) / d2)) : 0;
        const d = Math.hypot((x1 + t * (x2 - x1) - lng) * kx, y1 + t * dy - lat);
        if (d < bestD) {
            bestD = d;
            best = cum + t * len;
        }
        cum += len;
    }

    return cum ? best / cum * totalKm : 0;
}

/**
 * Сумма из валюты в валюту по курсам сайта (база EUR: rates[X] — X за 1 EUR).
 * Нет курса — null: лучше пустая скобка, чем выдуманная цифра.
 */
export function convertMoney(amount, from, to, rates) {
    const rate = code => (code === 'EUR' ? 1 : rates[code] || null);
    const a = rate(from);
    const b = rate(to);

    return amount === null || amount === undefined || !a || !b ? null : amount / a * b;
}

/**
 * Топливо на дальнюю дату (выезд через месяц, обратная дорога): цена к тому дню уже
 * другая. Поправка — темп последних недель
 * (payload.countries[cc].fuel.trend, считает FuelTrend), продлённый не дальше FUEL_TREND_WEEKS
 * и не сильнее FUEL_TREND_MIN…MAX: двухмесячный темп нельзя тянуть на полгода вперёд.
 * Меньше FUEL_TREND_SHOW — поправки нет: это шум, а не изменение цены.
 */
export const FUEL_TREND_WEEKS = 8;
export const FUEL_TREND_MIN = 0.9;
export const FUEL_TREND_MAX = 1.15;
export const FUEL_TREND_SHOW = 0.01;
