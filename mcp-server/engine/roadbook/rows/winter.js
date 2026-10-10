/**
 * Строка «Зима на дорогах»: шины, шипы, цепи — из справочника road-rules/winter.json.
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */
import { addDays, mdDate, inSeason } from '../plan/util.js';

/**
 * Холодные месяцы своего полушария — для правил «по погоде» без дат: ноябрь–март
 * на севере, май–сентябрь на юге. Без даты поездки — не зима (строку не показываем).
 */
export function coldMonths(presence, south) {
    if (!presence?.entry || !presence?.exit) {
        return false;
    }
    const cold = south ? [4, 5, 6, 7, 8] : [10, 11, 0, 1, 2];
    for (let d = new Date(presence.entry); d <= presence.exit; d = addDays(d, 1)) {
        if (cold.includes(d.getMonth())) {
            return true;
        }
    }

    return false;
}

/**
 * Зима в стране: шины, шипы, цепи — из справочника database/data/road-rules/winter.json,
 * где у каждого значения есть источник с дословной цитатой. Нет данных — строки нет:
 * догадку о чужих правилах не показываем.
 */
export function winterRow(w, presence, fmt, south = false) {
    const year = presence?.entry ? presence.entry.getFullYear() : new Date().getFullYear();
    const range = per => per ? `${fmt.dateShort(mdDate(per.from, year))} – ${fmt.dateShort(mdDate(per.to, year))}` : '';
    const on = per => presence ? inSeason(per, presence.entry, presence.exit) : false;
    const lines = [];
    let active = false;

    if (w.tyres && w.tyres !== 'none') {
        const key = w.period ? `winter_tyres_${w.tyres}_period` : `winter_tyres_${w.tyres}`;
        lines.push(fmt.t(key, { period: range(w.period) }));
        if (w.scope) {
            lines.push(fmt.t(`winter_scope_${w.scope}`));
        }
        active ||= w.period ? on(w.period) : coldMonths(presence, south);
    } else if (w.tyres === 'none') {
        lines.push(fmt.t('winter_tyres_none'));
    }
    if (w.marking === '3pmsf_only') {
        lines.push(fmt.t('winter_marking_3pmsf'));
    }
    if (w.min_tread_mm) {
        lines.push(fmt.t('winter_tread', { mm: fmt.num(w.min_tread_mm) }));
    }
    const studsBanned = w.studs === 'banned' || (w.studs_banned_period && on(w.studs_banned_period));
    if (w.studs === 'banned') {
        lines.push(fmt.t('winter_studs_banned'));
    } else if (w.studs_banned_period) {
        lines.push(fmt.t('winter_studs_banned_period', { period: range(w.studs_banned_period) }));
    } else if (w.studs_period) {
        lines.push(fmt.t(w.studs_speed_kmh ? 'winter_studs_period_speed' : 'winter_studs_period', { period: range(w.studs_period), speed: w.studs_speed_kmh }));
    } else if (w.studs === 'allowed' || w.studs === 'allowed_limited') {
        lines.push(fmt.t('winter_studs_allowed'));
    }
    if (w.scope && !(w.tyres && w.tyres !== 'none')) {
        lines.push(fmt.t(`winter_scope_${w.scope}`));
    }
    if (w.chains) {
        lines.push(fmt.t(`winter_chains_${w.chains}`, { period: range(w.chains_period || w.period) }));
        // Правило только про цепи (US, JP) — зима по периоду цепей или по холодным месяцам.
        active ||= !w.tyres && (w.chains_period ? on(w.chains_period) : coldMonths(presence, south));
    }
    const ev = w.evidence || {};
    const first = ev._all || ev.tyres || ev.period || ev.studs || Object.values(ev)[0] || null;

    return {
        key: 'winter',
        s: active ? 'warn' : 'ok',
        active, lines,
        big: active ? fmt.t('winter_active') : null,
        chains: !!w.chains && (active || !presence),
        studsBanned,
        tyresNeeded: active && w.tyres !== 'recommended',
        source: first?.url || null,
    };
}
