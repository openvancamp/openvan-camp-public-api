/**
 * Строки карточки страны из общих датасетов сайта: праздники (HolidayService), таможня
 * (CustomsService), розетки (ElectricityService), обстановка сейчас (HazardService).
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */
import { DAY, convertMoney } from '../plan/util.js';
import { parseLocalDate } from '../../visa-calc-core.js';

/** Регионов в строке не больше — остальные числом. */
export const HOLIDAY_REGIONS_SHOWN = 4;

/**
 * Праздники, каникулы и пиковые дни на дорогах в даты пребывания (общий датасет сайта,
 * HolidayService). К каждой записи — что это значит для водителя: закрытые магазины,
 * длинные выходные, разъезд или возвращение семей, цвет дня по прогнозу дорожной службы.
 * Нет дат — подсказка; страны нет в датасете — «нет данных», а не «праздников нет».
 */
export function holidaysRow(set, windows, fmt) {
    if (!windows) {
        return { key: 'holidays', s: 'none', hint: true, items: [], lines: [fmt.t('holidays_pick_dates')] };
    }
    if (!set?.covered) {
        return { key: 'holidays', s: 'none', nodata: true, items: [], lines: [fmt.t('holidays_nodata')] };
    }
    const inTrip = d => windows.some(w => d >= w.entry && d <= w.exit);
    const items = (set.items || [])
        .map(h => ({ h, from: parseLocalDate(h.start), to: parseLocalDate(h.end) }))
        .filter(x => windows.some(w => x.to >= w.entry && x.from <= w.exit))
        .map(({ h, from, to }) => {
            const notes = [];
            if (h.kind === 'public') {
                notes.push(fmt.t('hol_public'));
                const wd = from.getDay();
                if (wd === 1 || wd === 5) {
                    notes.push(fmt.t('hol_long_weekend'));
                } else if (wd === 2 || wd === 4) {
                    notes.push(fmt.t('hol_bridge'));
                }
            } else if (h.kind === 'school') {
                if (inTrip(from)) {
                    notes.push(fmt.t('hol_school_start'));
                }
                if (inTrip(to)) {
                    notes.push(fmt.t('hol_school_end'));
                }
                if (!notes.length) {
                    notes.push(fmt.t('hol_school_during'));
                }
            } else if (h.kind === 'traffic') {
                notes.push(fmt.t('hol_traffic', {
                    out: fmt.t(`traffic_${h.details?.departure || 'green'}`),
                    back: fmt.t(`traffic_${h.details?.return || 'green'}`),
                }));
                if (h.category === 'black' || h.category === 'red') {
                    notes.push(fmt.t('hol_traffic_avoid'));
                }
            }
            // В пакете — до 4 названий и общее число регионов.
            const regions = h.nationwide ? null : (h.regions || []).map(x => (typeof x === 'string' ? x : x.name || x.code));
            if (regions?.length) {
                const more = (h.regions_n ?? regions.length) - HOLIDAY_REGIONS_SHOWN;
                notes.push(fmt.t('hol_regions', { list: regions.slice(0, HOLIDAY_REGIONS_SHOWN).join(', ') + (more > 0 ? ` +${more}` : '') }));
            }

            return {
                kind: h.kind, level: h.category, name: h.name,
                local: h.name_local && h.name_local !== h.name ? h.name_local : null,
                date: h.start === h.end ? fmt.dateShort(from) : `${fmt.dateShort(from)} – ${fmt.dateShort(to)}`,
                notes, source: h.source_url,
            };
        });

    // Поездка дальше, чем опубликован календарь школьных каникул страны, — честно об этом.
    const until = set.school_until ? parseLocalDate(set.school_until) : null;
    const notes = until && windows.some(w => w.exit > until)
        ? [fmt.t('holidays_school_unknown', { date: fmt.dateShort(until) })] : [];

    return {
        key: 'holidays',
        notes,
        // Есть что-то в даты поездки — повод учесть (жёлтый); ничего — проверено, спокойно.
        s: items.length ? 'warn' : 'ok',
        items,
        // Календарь каникул на эти даты неизвестен — «каникул нет» было бы неправдой.
        big: items.length ? null : fmt.t(notes.length ? 'holidays_none_public' : 'holidays_none'),
        lines: items.length ? [items[0].name] : [],
    };
}

/**
 * Таможня на въезде (справочник CustomsService): что нельзя ввозить, что декларировать и
 * сколько можно без пошлины. Сервер уже учёл, откуда въезжаем: внутри ЕС таможни нет,
 * а мясной запрет ЕС не касается едущих из Швейцарии или Норвегии. Въездов у участка
 * до двух — по ходу и на обратной дороге «туда и обратно»; страна старта по ходу — без въезда.
 */
export function customsRow(customs, index, round, fmt, rates = {}, userCurrency = 'EUR') {
    const entries = [
        { c: customs?.there?.[index], back: false },
        { c: round ? customs?.back?.[index] : null, back: true },
    ].filter(x => x.c);
    if (!entries.length) {
        return null;
    }
    const order = { ban: 0, declare: 1, limit: 2 };
    // Порог в чужой валюте («30 000 лари») — в скобках в валюте человека, по свежему курсу.
    const sumOf = (v) => {
        if (v?.amount && v?.currency) {
            return [v.amount, v.currency];
        }

        return v?.land_eur ? [v.land_eur, 'EUR'] : null;
    };
    const withMoney = (it) => {
        const sum = sumOf(it.value);
        const eur = sum && sum[1] !== userCurrency ? convertMoney(sum[0], sum[1], 'EUR', rates) : null;

        return eur === null ? it : { ...it, money: fmt.money(eur) };
    };
    const groups = entries.map(({ c, back }) => ({
        back,
        from: c.from,
        nodata: !c.covered,
        title: fmt.t(back ? 'customs_from_back' : 'customs_from', { from: fmt.countryName(c.from) }),
        // Пусто при данных — оба в одном союзе: «без таможни».
        same: c.covered && !c.items.length ? fmt.t('customs_same_union', { from: fmt.countryName(c.from) }) : null,
        items: [...c.items].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)).map(withMoney),
    }));
    const items = groups.flatMap(g => g.items);
    const covered = groups.some(g => !g.nodata);

    return {
        key: 'customs',
        // Запрет — повод проверить багаж до границы (жёлтый); только нормы — спокойно.
        s: !covered ? 'none' : items.some(x => x.severity === 'ban') ? 'warn' : 'ok',
        groups,
        items,
        nodata: !covered,
        big: null,
        lines: items.length ? [items[0].summary] : [groups.find(g => g.same)?.same || fmt.t('customs_nodata')],
    };
}

/** Плоская европейская вилка C входит в эти розетки (классификация IEC). */
export const EUROPLUG_FITS = ['C', 'E', 'F', 'J', 'K', 'L', 'N'];

/** Разница напряжения, при которой техника «на 230 В» не работает (120 против 230). */
export const VOLTAGE_GAP = 50;

/**
 * Розетки в стране (справочник ElectricityService): типы вилок, напряжение, нужен ли
 * переходник для вилок из дома человека, и разъём CEE17 на кемпингах Европы.
 */
export function powerRow(el, cc, home, fmt) {
    const row = el?.countries?.[cc];
    if (!row || !row[0]?.length) {
        return { key: 'power', s: 'none', nodata: true, plugs: [], camp: [], lines: [fmt.t('power_nodata')] };
    }
    const [plugs, volts, hz] = row;
    const lines = [];
    let s = 'ok';
    const h = home && home !== cc ? el.countries[home] : null;
    if (h?.[0]?.length) {
        const own = h[0];
        // Плоская C входит почти везде — «подходит всё» решает толстая вилка мощных приборов;
        // E и F между собой совместимы (гибридная вилка CEE 7/7).
        const thick = own.some(x => x !== 'C' && (plugs.includes(x) || (['E', 'F'].includes(x) && plugs.some(p => ['E', 'F'].includes(p)))));
        if (thick || (own.every(x => x === 'C') && plugs.includes('C'))) {
            lines.push(fmt.t('power_adapter_none', { home: fmt.countryName(home) }));
        } else if (own.some(x => ['C', 'E', 'F'].includes(x)) && plugs.some(p => EUROPLUG_FITS.includes(p))) {
            s = 'warn';
            lines.push(fmt.t('power_adapter_flat', { types: plugs.join(', ') }));
        } else {
            s = 'warn';
            lines.push(fmt.t('power_adapter_need', { types: plugs.join(', '), home: fmt.countryName(home) }));
        }
        if (volts && h[1] && Math.abs(volts - h[1]) > VOLTAGE_GAP) {
            s = 'bad';
            lines.push(fmt.t('power_voltage_diff', { v: volts, home: h[1] }));
        }
    }
    const camp = el.campsites?.countries?.includes(cc) ? el.campsites : null;

    return {
        key: 'power',
        s,
        plugs,
        big: fmt.t('power_volt', { v: volts ?? '—', hz: hz ?? '—' }),
        lines,
        camp: camp ? [fmt.t('power_campsite', { pct: camp.share_percent, from: camp.amps?.[0], to: camp.amps?.[1] }), fmt.t('power_polarity')] : [],
        campSource: camp?.source_url || null,
        // У стран вне общей таблицы (ТРСК) — свой источник.
        source: row[3] || el.source_url || null,
        ownSource: !!row[3],
    };
}

/**
 * Пороги пожаров подобраны по выборке 44 маршрутов (02.10.2026): у дорог десятки скоплений
 * в 1–6 МВт на 3–5 точках — сжигание стерни, а настоящий пожар — десятки и сотни МВт или
 * сотни точек. Заметный — столько точек или такая мощность (МВт); тревога — только крупный у дороги.
 */
export const FIRE_SIGNIFICANT_COUNT = 8;

export const FIRE_SIGNIFICANT_FRP = 10;

export const FIRE_MAJOR_COUNT = 30;

export const FIRE_MAJOR_FRP = 30;

/** Очаг ближе — прямо у дороги: дым, перекрытия. */
export const FIRE_AT_ROAD_KM = 5;

/** Поездка дальше этого — «обстановка сейчас» может смениться, говорим об этом. */
export const HAZARD_FRESH_DAYS = 7;

/**
 * Обстановка сейчас у участка маршрута в стране (общий датасет HazardService, грузится
 * отдельно от роудбука): очаги пожаров NASA FIRMS у трассы, стихийные бедствия GDACS,
 * уровень угрозы МИД Великобритании. Для стран паспорта и ВНЖ уровень МИД не показываем —
 * чужая оценка своей страны человеку ни о чём не говорит.
 */
export function hazardsRow(hz, r, own, start, today, fmt) {
    if (!hz) {
        return { key: 'hazards', s: 'none', pending: true, items: [], notes: [], lines: [fmt.t('haz_loading')] };
    }
    if (hz.failed) {
        return { key: 'hazards', s: 'none', nodata: true, items: [], notes: [], lines: [fmt.t('haz_unavailable')] };
    }
    const inLeg = x => x.km >= r.from_km - 1 && x.km <= r.to_km + 1;
    const items = [];

    const adv = hz.advisories?.[r.cc];
    if (adv && adv.level !== 'none' && !own.has(r.cc)) {
        items.push({
            kind: 'advisory', s: adv.severity >= 4 ? 'bad' : 'warn',
            text: fmt.t(`haz_adv_${adv.level}`), url: adv.url, link: fmt.t('haz_adv_link'),
        });
    }

    (hz.events || []).filter(inLeg).forEach((e) => {
        items.push({
            kind: 'event', s: e.alert_level === 'red' ? 'bad' : e.alert_level === 'orange' ? 'warn' : 'ok',
            type: e.type,
            text: fmt.t(`haz_type_${e.type}`) + (e.severity ? ` · ${e.severity}` : ''),
            where: fmt.t('haz_where', { km: e.km, off: e.off_km }),
            url: e.url, link: fmt.t('haz_gdacs_link'),
        });
    });

    const fires = (hz.fires || []).filter(inLeg);
    const big = fires.filter(f => f.count >= FIRE_SIGNIFICANT_COUNT || f.frp >= FIRE_SIGNIFICANT_FRP);
    big.forEach((f) => {
        items.push({
            kind: 'fire', s: f.off_km <= FIRE_AT_ROAD_KM && (f.frp >= FIRE_MAJOR_FRP || f.count >= FIRE_MAJOR_COUNT) ? 'bad' : 'warn',
            text: fmt.t('haz_fire', { n: f.count }),
            // «Где это» без карты: город и сторона света от него.
            place: f.place ? (f.place.km < 3
                ? fmt.t('haz_place_at', { town: f.place.names?.[fmt.locale] || f.place.name })
                : fmt.t('haz_place', { km: f.place.km, dir: fmt.t(`dir_${f.place.dir}`), town: f.place.names?.[fmt.locale] || f.place.name })) : null,
            where: fmt.t('haz_where', { km: f.km, off: f.off_km }),
            seen: fmt.t('haz_seen', { date: fmt.dateShort(new Date(f.seen_at)) }),
            lat: f.lat, lng: f.lng,
        });
    });
    const small = fires.length - big.length;

    const notes = [];
    if (small > 0) {
        notes.push(fmt.t('haz_fire_small', { n: small }));
    }
    if (hz.fires_pending) {
        notes.push(fmt.t('haz_fires_pending'));
    } else if (!hz.fires_ok) {
        notes.push(fmt.t('haz_fires_unavailable'));
    }
    if (start && today && (start - today) / DAY > HAZARD_FRESH_DAYS) {
        notes.push(fmt.t('haz_now_note'));
    }

    const worst = ['bad', 'warn'].find(k => items.some(x => x.s === k));

    return {
        key: 'hazards',
        s: worst || 'ok',
        items,
        notes,
        big: items.length ? null : fmt.t('haz_calm'),
        lines: items.length ? [items[0].text] : [],
    };
}
