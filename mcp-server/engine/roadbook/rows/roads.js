/**
 * Строки карточки страны про дороги: платные дороги и виньетки, въезд в города, особенности участков.
 * Вынесено из buildPlan (рефакторинг 02.10.2026).
 */
import { parseLocalDate } from '../../visa-calc-core.js';
import { mdDate, inSeason } from '../plan/util.js';
// Страны, где платные автомагистрали есть, а тег toll=yes в OpenStreetMap стоит неровно:
// на Пекин → Тяньцзинь размечено 4,4 км из 125. Ноль платных км там — не «бесплатно».
const TOLL_TAGS_POOR = new Set(['CN', 'TH']);
// Где вся платная сеть страны — в одном районе, маршрут вдали от него платным быть не может:
// в Таиланде платные только трассы вокруг Бангкока (M7 до Паттайи, M6 до Кората, M9, M81), и
// петля Маехонгсона на севере шла как «нет данных». [юг, запад, север, восток]
const TOLL_NETWORK_BOX = { TH: [12.3, 99.4, 15.3, 102.3] };

// Ночёвка не дальше этого по маршруту от города экозоны или ZTL — ночуем в нём.
const URBAN_NIGHT_KM = 12;

/**
 * Строка «Дороги»: виньетка (одна на обе дороги или две — что дешевле), платные участки и
 * объекты со своими тарифами и источниками, «нет данных» там, где сеть платных дорог размечена плохо.
 */
export function roadsRow(ctx) {
    const { route, r, i, p, round, roundK, payload, fmt, tollsForVisit, unknownToll, span } = ctx;
    // Паром внутри страны (Крит, пролив Кука) — не платная дорога: объезд платных его не убирает.
    const isFerry = x => x.meta?.kind === 'ferry';
    const items = route.avoid_tolls ? tollsForVisit(r.cc, i).filter(isFerry) : tollsForVisit(r.cc, i);
    const vignette = items.find(x => x.type === 'vignette');
    const paidItems = items.filter(x => x.type !== 'vignette');
    const tollSum = paidItems.reduce((sum, x) => sum + (x.amount_eur || 0), 0) * roundK;
    // Из них паромы — в бюджете это строка «Паромы», а не «Платные дороги».
    const ferrySum = paidItems.filter(isFerry).reduce((sum, x) => sum + (x.amount_eur || 0), 0) * roundK;
    let mode = 'free';
    // Платных участков не найдено, но в этой стране они в картах размечены плохо
    // (фактчек 23.09.2026) — честнее «нет данных», чем «бесплатно».
    const box = TOLL_NETWORK_BOX[r.cc];
    const nearTollNetwork = !box || (route.preview || []).some(([lng, lat]) => lat >= box[0] && lat <= box[2] && lng >= box[1] && lng <= box[3]);
    if (!items.length && TOLL_TAGS_POOR.has(r.cc) && nearTollNetwork) {
        mode = 'unknown';
    }
    if (unknownToll.has(r.cc)) {
        mode = 'unknown';
    } else if (vignette) {
        mode = 'vignette';
    } else if (items.some(x => x.type === 'per_km' || x.type === 'section')) {
        mode = 'toll';
    } else if (items.some(x => x.type === 'object')) {
        mode = 'bridges';
    }
    let vg = null;
    if (vignette) {
        const options = (vignette.meta?.options || [vignette.meta]).filter(Boolean)
            .map(o => ({ period: o.period, validDays: o.valid_days, eur: o.amount_eur ?? vignette.amount_eur }))
            .sort((a, b) => (a.validDays || 0) - (b.validDays || 0));
        const pick = n => options.find(o => (o.validDays || 0) >= n) || options[options.length - 1];
        let enough = pick(span(p.entry, p.exit));
        let again = null;
        let eur = enough?.eur ?? vignette.amount_eur;
        if (p.back) {
            // Обратно — та же страна, но позже. Либо одна виньетка покрывает обе дороги
            // (от въезда туда до выезда обратно), либо нужна вторая — что дешевле.
            const whole = options.find(o => (o.validDays || 0) >= span(p.entry, p.back.exit));
            const second = pick(span(p.back.entry, p.back.exit));
            const two = (enough?.eur ?? 0) + (second?.eur ?? 0);
            if (whole && (whole.eur ?? Infinity) <= two) {
                enough = whole;
                eur = whole.eur;
            } else {
                again = second;
                eur = two;
            }
        }
        // В чипах — первые четыре срока и те, что выбраны (годовая могла не попасть).
        const chips = options.filter((o, k) => k < 4 || o === enough || o === again);
        vg = { options: chips, enough, again, both: !!p.back && !again, buyUrl: vignette.meta?.buy_url || null, eur };
    }
    const vgLabel = (o) => {
        const key = `vignette_period_${o.period}`;

        return fmt.t(key) !== key ? fmt.t(key) : fmt.t('vignette_days', { n: o.validDays });
    };
    const vgLines = !vg ? [] : vg.again
        ? [fmt.t('road_vignette_back_two', { first: vgLabel(vg.enough), second: vgLabel(vg.again) })]
        : vg.both ? [fmt.t('road_vignette_back_one', { period: vgLabel(vg.enough) })] : [];
    // Копеечный участок (0,6 км A2 = 0,11 €) не показываем как «0 €».
    const tollPrice = eur => (eur > 0 && eur < 1 ? `< ${fmt.money(1)}` : fmt.money(eur));
    // Строки платы: дорога или мост — своей строкой с именем; участки «за километр» —
    // одной общей. Маршрутизатор дробит платную трассу на десятки кусков (Казахстан:
    // 56 строк «Платные участки ≈ 5 км — 9 ₽»), человеку нужна сумма, а не куски.
    const kmText = km => `≈ ${fmt.t('km', { km: km })}`;
    const rateText = x => (x.meta?.rate_per_km && x.currency ? fmt.t('road_rate', { rate: fmt.num(x.meta.rate_per_km), cur: x.currency }) : null);
    const perKm = paidItems.filter(x => x.type === 'per_km');
    // Когда тариф сверяли и где — у каждой дороги свой источник: один «Тариф проверен» на
    // страну вёл на статью про ЗСД и для М-11, и для М-12 (фактчек 30.09.2026).
    const verified = list => list.filter(x => x.verified_at).sort((a, b) => (a.verified_at < b.verified_at ? 1 : -1))[0] || null;
    const srcOf = x => (x ? { date: fmt.date(parseLocalDate(x.verified_at)), url: x.source_url || null } : null);
    const roadItems = paidItems.filter(x => x.type !== 'per_km').map(x => ({
        name: payload.tollNames?.[x.meta?.slug] || x.meta?.name || '',
        meta: [x.meta?.km ? kmText(x.meta.km) : null, x.type === 'section' ? rateText(x) : null].filter(Boolean).join(' · '),
        price: tollPrice(x.amount_eur),
        src: srcOf(x.verified_at ? x : null),
    }));
    if (perKm.length) {
        roadItems.push({
            name: fmt.t('road_toll_sections'),
            meta: [kmText(perKm.reduce((sum, x) => sum + (x.meta?.km || 0), 0)), rateText(perKm[0])].filter(Boolean).join(' · '),
            price: tollPrice(perKm.reduce((sum, x) => sum + (x.amount_eur || 0), 0)),
            src: srcOf(verified(perKm)),
        });
    }
    return {
        key: 'roads',
        s: mode === 'free' ? 'ok' : mode === 'unknown' ? 'none' : 'toll',
        mode, lines: vgLines, items: roadItems, eachWay: round && roadItems.length > 0, checked: null, vignette: vg, tollSum, ferrySum,
        big: mode === 'unknown' ? fmt.t('no_data') : tollSum ? `≈ ${fmt.money(tollSum)}${round ? ' ' + fmt.t('both_ways') : ''}` : vg ? fmt.t(vg.again ? 'road_vignette_big_two' : 'road_vignette_big', { price: fmt.money(vg.eur) }) : fmt.t('road_free'),
        avoid: !!route.avoid_tolls,
    };;
}

/**
 * Въезд в города у маршрута: экозоны Германии (зелёная наклейка) и ZTL Италии (центры под камерами).
 */
export function urbanRow(urban, r, days, fmt) {
    if (!urban) {
        return null;
    }
    {
        const near = urban.near || [];
        // Ночёвка у города зоны: день кончается в нескольких километрах от него по маршруту.
        const nightAt = z => days.find(x => x.cc === r.cc && Math.abs(x.to - z.km) <= URBAN_NIGHT_KM);
        const names = near.map(z => z.name).join(', ');
        const nights = near.map(z => ({ z, night: nightAt(z) })).filter(x => x.night);
        const lines = urban.kind === 'sticker'
            ? [
                fmt.t('urban_sticker_text', { fine: urban.fine_eur }),
                near.length ? fmt.t('urban_sticker_near', { cities: names }) : fmt.t('urban_sticker_none'),
                ...nights.map(x => fmt.t('urban_sticker_night', { city: x.z.name })),
            ]
            : [
                fmt.t('urban_ztl_text'),
                ...(near.length ? [] : [fmt.t('urban_ztl_none')]),
            ];
        return {
            key: 'urban', kind: urban.kind,
            s: near.length ? 'warn' : 'ok',
            big: fmt.t(urban.kind === 'sticker' ? 'urban_sticker_big' : 'urban_ztl_big'),
            lines,
            // ZTL — по городам: часы, сайт мэрии и дата сверки.
            items: urban.kind === 'ztl' ? near.map(z => ({
                name: z.name, hours: z.hours, url: z.url, paid: z.paid, night: !!nightAt(z),
                checked: z.checked_at ? fmt.date(parseLocalDate(z.checked_at)) : null,
            })) : [],
            source: urban.source_url || null,
            near, nights: nights.map(x => x.z.name),
        };
    }
}

/**
 * Особенности дорог на участке страны (справочник route-notes.json): сезонные закрытия и
 * перекрытия перевалов, габариты, зимние правила участков, обязательные сборы — с источником.
 */
export function notesRow(ctx) {
    const { payload, inputs, fmt, days, start, p, r, i, ranges, carHome, travelers, residences, roundK, span } = ctx;
    const firstVisit = ranges.findIndex(x => x.cc === r.cc) === i;
    const foreignPlate = !(carHome || (inputs.plates && inputs.plates === r.cc));
    const notes = (payload.notes?.[r.cc] || []).filter(n => (n.km === null ? firstVisit : n.km >= r.from_km - 1 && n.km <= r.to_km + 1)
        && (!n.foreign_plate || foreignPlate) && (n.kind !== 'fee' || n.fee?.type !== 'stay_bands_foreign_plate' || foreignPlate));
    if (!notes.length) {
        return null;
    }
    {
        const eurOf = (amount, cur) => {
            const rate = cur === 'EUR' ? 1 : payload.rates?.[cur];

            return rate ? amount / rate : null;
        };
        const local = (amount, cur) => `${fmt.num(Math.round(amount * 100) / 100)} ${cur}`;
        // Дата у участка: день, на который он приходится по дороге туда; обратно — весь обратный заезд.
        const dayAt = km => days.find(x => x.cc === r.cc && km >= x.from - 1 && km <= x.to + 1) || days.find(x => km <= x.to) || null;
        const visits = n => {
            if (!start) {
                return [];
            }
            const d = n.km === null ? null : dayAt(n.km);
            const there = d ? { entry: d.date, exit: dayAt(n.km_to ?? n.km)?.date || d.date } : { entry: p.entry, exit: p.exit };

            return [there, p.back || null].filter(Boolean);
        };
        const range = (per, year) => `${fmt.dateShort(mdDate(per.from, year))} – ${fmt.dateShort(mdDate(per.to, year))}`;
        // Сборы с нерезидентов США: одна сумма на все парки маршрута — или годовой пропуск, если дешевле.
        const nps = notes.filter(n => n.fee?.type === 'per_person_nonresident');
        const npsPeople = travelers.length ? travelers.filter((t, k) => (residences[k] || t) !== nps[0]?.fee?.resident).length : 1;
        const npsPay = nps.length ? Math.min(nps.length * npsPeople * nps[0].fee.amount, Math.ceil(npsPeople / 4) * nps[0].fee.annual) : 0;
        const npsAnnual = nps.length && Math.ceil(npsPeople / 4) * nps[0].fee.annual < nps.length * npsPeople * nps[0].fee.amount;
        let feeEur = 0;
        const items = notes.map((n) => {
            const year = start ? (visits(n)[0]?.entry || start).getFullYear() : new Date().getFullYear();
            const lines = [n.text];
            let s = n.kind === 'fee' ? 'toll' : 'warn';
            let flag = null;
            if (n.closed) {
                const hit = visits(n).some(v => inSeason(n.closed, v.entry, v.exit));
                flag = !start ? fmt.t('note_closed_nodate', { period: range(n.closed, year) })
                    : hit ? fmt.t('note_closed_hit', { period: range(n.closed, year) }) : fmt.t('note_closed_open', { period: range(n.closed, year) });
                s = hit ? 'bad' : start ? 'ok' : 'warn';
            } else if (n.risk) {
                // Перекрывают эпизодически (снегопад, лавины) — о закрытии узнают за часы или сутки,
                // поэтому «закрыто на ваши даты» тут неправда: только предупреждение о риске.
                const hit = visits(n).some(v => inSeason(n.risk, v.entry, v.exit));
                flag = !start ? fmt.t('note_risk_nodate', { period: range(n.risk, year) })
                    : hit ? fmt.t('note_risk_hit', { period: range(n.risk, year) }) : fmt.t('note_risk_off', { period: range(n.risk, year) });
                s = hit || !start ? 'warn' : 'ok';
            } else if (n.active) {
                const hit = visits(n).some(v => inSeason(n.active, v.entry, v.exit));
                flag = !start ? fmt.t('note_active_nodate', { period: range(n.active, year) })
                    : hit ? fmt.t('note_active_hit', { period: range(n.active, year) }) : fmt.t('note_active_off', { period: range(n.active, year) });
                s = hit ? 'warn' : start ? 'ok' : 'warn';
            }
            let price = null;
            const f = n.fee;
            if (f?.type === 'per_day_vehicle') {
                const inPark = days.filter(x => x.cc === r.cc && x.to >= n.km && x.from <= (n.km_to ?? n.km)).length || 1;
                const nDays = inPark * roundK;
                const pay = Math.min(nDays * f.amount, f.annual);
                flag = fmt.t(pay < nDays * f.amount ? 'note_fee_days_annual' : 'note_fee_days', { n: nDays, price: local(pay, f.currency), annual: local(f.annual, f.currency) });
                price = eurOf(pay, f.currency);
            } else if (f?.type === 'per_person_nonresident') {
                if (!npsPeople) {
                    flag = fmt.t('note_fee_nps_none');
                } else if (n === nps[0]) {
                    flag = fmt.t(npsAnnual ? 'note_fee_nps_annual' : 'note_fee_nps', {
                        n: npsPeople, parks: nps.length, price: local(npsPay, f.currency), annual: local(f.annual, f.currency),
                    });
                    price = eurOf(npsPay, f.currency);
                } else {
                    // Текст сбора уже есть у первого парка — здесь только отсылка к нему.
                    flag = fmt.t('note_fee_nps_included');
                    lines.length = 0;
                }
            } else if (f?.type === 'stay_bands_foreign_plate') {
                const stay = start ? span(p.entry, (p.back || p).exit) : null;
                const band = stay !== null ? f.bands.find(b => stay <= b[0]) : null;
                const pay = stay === null ? null : band ? band[1] : f.over_per_km * r.km * roundK;
                flag = stay === null ? fmt.t('note_fee_stay_nodate')
                    : fmt.t(band ? 'note_fee_stay' : 'note_fee_stay_km', { n: stay, price: local(pay, f.currency) });
                price = pay === null ? null : eurOf(pay, f.currency);
            } else if (f?.type === 'distance_fuel') {
                if (!(f.fuels || []).includes(inputs.fuel)) {
                    return null;
                }
                const km = r.km * roundK;
                const blocks = Math.ceil(km / f.block_km);
                flag = fmt.t('note_fee_ruc', { km: km, n: blocks, rate: local(f.per_1000km, f.currency), price: local(blocks * f.per_1000km, f.currency) });
                price = eurOf(blocks * f.per_1000km, f.currency);
            }
            if (price) {
                feeEur += price;
            }
            if (n.kind === 'vehicle_limit' || n.kind === 'advice') {
                s = 'warn';
            }

            return {
                id: n.id, name: n.name, lines, flag, s, km: n.km, price: price ? fmt.money(price) : null,
                limits: n.limits ? fmt.t('note_limits', {
                    list: [['height_m', 'note_lim_height'], ['width_m', 'note_lim_width'], ['length_m', 'note_lim_length'], ['weight_t', 'note_lim_weight']]
                        .filter(([k]) => n.limits[k]).map(([k, key]) => fmt.t(key, {
                            // Габариты (м) — в футах при милях; масса — в тоннах, как на знаке, у тех, кто
                            // в фунтах, — с фунтами в скобках: «7,5 т (16 535 фунт.)»
                            v: k === 'weight_t' ? (window.VanlifeUnits
                                ? `${fmt.num(n.limits[k])}\u00a0${window.VanlifeUnits.unitLabel('t')} ${window.VanlifeUnits.fmt('mass_t', n.limits[k] * 1000, { alt: true })}`.trim()
                                : `${fmt.num(n.limits[k])} t`)
                                : (window.VanlifeUnits ? window.VanlifeUnits.fmt('elevation', n.limits[k], { digits: 1 }) : `${fmt.num(n.limits[k])} m`),
                        })).join(' · '),
                }) : null,
                src: n.source_url ? { url: n.source_url, date: n.checked_at ? fmt.date(parseLocalDate(n.checked_at)) : null } : null,
            };
        }).filter(Boolean);
        if (items.length) {
            const worst = ['bad', 'warn', 'toll', 'ok'].find(k => items.some(x => x.s === k)) || 'ok';
            const closedNow = items.filter(x => x.s === 'bad');
            return {
                key: 'notes', s: worst, items, feeEur,
                big: closedNow.length ? fmt.t('note_big_closed', { names: closedNow.map(x => x.name).join(', ') })
                    : feeEur ? `≈ ${fmt.money(feeEur)}` : fmt.t('note_big_count', { n: items.length }),
                lines: [],
                closed: closedNow.map(x => x.name),
            };
        }
    }

    return null;
}
