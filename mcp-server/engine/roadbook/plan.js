/**
 * Роудбук: расчёт плана поездки по готовым данным.
 *
 * Своих формул сроков и расходов здесь НЕТ — это сборка из движков сайта:
 *   • сроки пребывания, Шенген 90/180, «выехать до» — visa-calc-core.js
 *     (единственный источник правды для счётчика дней), правила — /api/visa/route;
 *   • литры и стоимость топлива — fuel-calc-core.js;
 *   • платные дороги и виньетки — скелет маршрута (тот же расчёт, что панель карты).
 * Новое здесь только одно — раскладка поездки по дням: где ночёвка, в какой день
 * въезд и выезд из каждой страны. Всё остальное — перекладка чужих ответов в ленту,
 * карточки и чек-лист по дизайну.
 *
 * Чистый модуль: без DOM и хранилища, тексты — через переданный fmt.
 */

import { DAY, addDays, kmToLine, pct, kmOnLine, weekOfYear } from './plan/util.js';
import { holidaysRow, customsRow, powerRow, hazardsRow } from './rows/datasets.js';
import { moneyRow } from './rows/money.js';
import { sightVisitMin, topSights } from './rows/sights.js';
import { climateTemps, forecastSky } from './rows/weather.js';
import { winterRow } from './rows/winter.js';
import { roadsRow, urbanRow, notesRow } from './rows/roads.js';
import { fuelRow } from './rows/fuel.js';
import { computeTrack, vehicleRuleToTrack, parseLocalDate, formatLocalDate, NO_COUNTER_MODES, WINDOW_UNLIMITED } from '../visa-calc-core.js';

// Публичное, вынесенное в модули, — по старому адресу (page.js и другие берут из plan.js).
export { inSeason, convertMoney, STATUS } from './plan/util.js';
export { holidaysRow, customsRow, powerRow, hazardsRow } from './rows/datasets.js';
export { winterRow } from './rows/winter.js';
export { skyOf } from './rows/weather.js';
export { sightVisitMin, topSights } from './rows/sights.js';
export { roadsRow, urbanRow, notesRow } from './rows/roads.js';
export { fuelRow } from './rows/fuel.js';

/** Короче этого страна — транзит: карточка сворачивается в строку. */
const TRANSIT_KM = 150;

/** Ночёвка — в городе у трассы; дальше этого город ищем, только если ближе ничего нет. */
const NIGHT_MAX_OFFSET_KM = 12;

const NIGHT_WINDOW_KM = 80;

// Главный срок поездки выносится наверх, только когда запас до него меньше этого:
// транзит в два дня при сроке в 30 не повод для тревоги (фактчек 30.09.2026).
const DEADLINE_ALERT_DAYS = 14;

// Город погоды не дальше этого от финиша по маршруту может говорить за финиш.
const FIN_NEAR_KM = 60;

/** Событие дальше этого от линии — уже отдельная поездка, а не «по пути». */
const EVENT_MAX_KM = 120;

/** Погодное окно: даты выезда в пределах недели прогноза и комфортные дневные температуры. */
const WINDOW_DAYS = 7;

const WINDOW_T_MIN = 16;

const WINDOW_T_MAX = 28;

// Высшие точки на ленте: не ниже стольки метров, не больше стольки штук и не ближе доли
// маршрута друг к другу — иначе подписи на ленте легли бы одна на другую.
const PEAK_MIN_M = 400;

const PEAKS_MAX = 5;

const PEAK_GAP_SHARE = 0.07;

// Высота и что она значит: горная болезнь — от 2500 м; дизельные отопители без высотного
// комплекта рассчитаны до 1500 м; на той же высоте в холодный сезон — снег на перевале;
// ночёвка от 1500 м — заметно холоднее, чем в долине.
const ALT_SICK_M = 2500;

const ALT_HEATER_M = 1500;

const ALT_SNOW_M = 1500;

const ALT_NIGHT_M = 1500;

// Стоянки показываем у ночёвок: не дальше стольки км вдоль маршрута от точки, где кончается день.
const CAMP_NIGHT_KM = 40;

const CAMPS_PER_NIGHT = 2;

// Страна без ночёвки (транзит) — столько лучших по пути.
const CAMPS_TRANSIT = 3;

/** Скорость парома, когда время переправы неизвестно: обычные паромы идут 30–40 км/ч. */
const FERRY_KMH = 35;

/** Быстрее этого средняя по дороге не бывает — страховка, если провайдер переправу во времени не учёл. */
const ROAD_MAX_KMH = 100;

/**
 * Пограничная страховка, купленная при въезде в ЕС, действует во всём ЕС и ЕЭЗ
 * (Директива 2009/103/EC, ст. 7): на внутренних границах её заново не покупают.
 * Швейцарии здесь нет — её покрытие страховкой ЕС не подтверждено.
 */
const FRONTIER_INSURANCE_AREA = new Set([
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
    'IS', 'LI', 'NO',
]);

/**
 * @param {object} payload  ответ RoadbookPayload (route, countries, weather, rates)
 * @param {object} inputs   состояние «Про вас» и плана по странам
 * @param {object|null} visa  ответ /api/visa/route (или null, пока паспорт не выбран / загрузка)
 * @param {object} env  { today: Date, journal: {tripsFor(place)}, fmt }
 */
export function buildPlan(payload, inputs, visa, env) {
    const { fmt } = env;
    const route = payload.route;
    const total = Math.max(1, route.distance_km || 1);
    const totalHoursBase = (route.duration_sec || total / 70 * 3600) / 3600;
    const P = km => pct(km, total);
    const start = inputs.date ? parseLocalDate(inputs.date) : null;
    const round = !!inputs.round;
    const travelers = (inputs.travelers || []).filter(Boolean);
    const cities = (route.cities || []).slice().sort((a, b) => a.km - b.km);

    // ---------- Паромы ----------
    // Время провайдера маршрута уже включает переправу, но раскладывалось по километрам
    // поровну: 330 км парома на Крит шли как дорога, ~4 ч вместо ~9. Участок парома идёт
    // по времени переправы (config roadbook.ferries.*.duration_min, иначе FERRY_KMH),
    // дорога — по оставшемуся времени.
    const ferryPieces = [];
    const ferryInfo = Object.values(payload.ferries || {});
    (route.borders || []).forEach((b) => {
        if (b.ferry && b.ferry_km > 0) {
            const info = ferryInfo.find(f => (f.from === b.from && f.to === b.to) || (f.from === b.to && f.to === b.from));
            ferryPieces.push({ from: b.km, to: Math.min(total, b.km + b.ferry_km), h: info?.duration_min ? info.duration_min / 60 : b.ferry_km / FERRY_KMH });
        }
    });
    // Паром внутри страны (Крит, пролив Кука) — без границы: место — по точке переправы на линии.
    ferryInfo.filter(f => !f.from && f.length_km > 0 && f.lat != null && f.lng != null && (route.tolls?.items || []).some(x => x.meta?.slug && payload.ferries[x.meta.slug] === f))
        .forEach((f) => {
            const mid = kmOnLine(route.preview, total, f.lat, f.lng);
            const from = Math.max(0, mid - f.length_km / 2);
            const to = Math.min(total, mid + f.length_km / 2);
            if (!ferryPieces.some(x => from < x.to && to > x.from)) {
                ferryPieces.push({ from, to, h: f.duration_min ? f.duration_min / 60 : f.length_km / FERRY_KMH });
            }
        });
    ferryPieces.sort((a, b) => a.from - b.from);
    const ferryKm = ferryPieces.reduce((sum, x) => sum + (x.to - x.from), 0);
    const ferryH = ferryPieces.reduce((sum, x) => sum + x.h, 0);
    // Время без парома, но не быстрее ROAD_MAX_KMH: если провайдер переправу не учёл, не ускоряем дорогу.
    const roadRate = Math.max(totalHoursBase - ferryH, (total - ferryKm) / ROAD_MAX_KMH) / Math.max(total - ferryKm, 1);
    /** Часы на отрезке [a, b] км: дорога по roadRate, паром — своей долей времени переправы. */
    const hoursBetween = (a, b) => {
        let h = roadRate * (b - a);
        for (const x of ferryPieces) {
            const overlap = Math.max(0, Math.min(b, x.to) - Math.max(a, x.from));
            h += overlap * (x.h / Math.max(x.to - x.from, 1e-6) - roadRate);
        }

        return h;
    };

    // ---------- Страны и часы ----------
    const lastIndex = (route.countries || []).length - 1;
    const ranges = (route.countries || []).map((c, i) => ({
        ...c,
        // Километры скелета округлены до 0,1, а длина маршрута — до целых: без этого
        // финиш «выпадал» из последней страны, и остановка в ней вставала на день раньше.
        to_km: i === lastIndex ? Math.max(c.to_km, total) : c.to_km,
        index: i,
        name: payload.countries[c.cc]?.name || c.cc,
        hours: ferryPieces.length ? hoursBetween(c.from_km, c.from_km + c.km) : totalHoursBase * (c.km / total),
    }));
    // «Заехать»: крюк туда-обратно плюс время на месте — стоянка на своём километре.
    // Ночёвки сдвигаются сами: день всё так же длится hpd часов, просто проезжает меньше.
    const chosenIds = new Set((inputs.sights || []).map(Number));
    const stops = (route.sights || [])
        .filter(s => chosenIds.has(s.id))
        .map(s => ({ ...s, visit: sightVisitMin(s.kind), h: (s.detour_min + sightVisitMin(s.kind)) / 60, left: P(s.km) }))
        .sort((a, b) => a.km - b.km);
    const stopsH = stops.reduce((sum, s) => sum + s.h, 0);
    const totalH = ranges.reduce((sum, r) => sum + r.hours, 0) + stopsH;
    const driveKmAtHour = (h) => {
        if (ferryPieces.length) {
            // По кускам «дорога / паром»: внутри куска время линейно.
            let km = 0;
            let acc = 0;
            for (const x of [...ferryPieces, { from: total, to: total, h: 0 }]) {
                const road = roadRate * (x.from - km);
                if (acc + road >= h) {
                    return km + (h - acc) / roadRate;
                }
                acc += road;
                if (acc + x.h >= h && x.h > 0) {
                    return x.from + (h - acc) / x.h * (x.to - x.from);
                }
                acc += x.h;
                km = x.to;
            }

            return total;
        }
        let acc = 0;
        for (const r of ranges) {
            if (acc + r.hours >= h) {
                return r.from_km + (h - acc) / Math.max(r.hours, 1e-6) * r.km;
            }
            acc += r.hours;
        }

        return total;
    };
    const driveHoursAt = (km) => {
        if (ferryPieces.length) {
            return hoursBetween(0, Math.min(km, total));
        }
        let acc = 0;
        for (const r of ranges) {
            if (km <= r.from_km) {
                break;
            }
            acc += r.hours * Math.min(1, (km - r.from_km) / Math.max(r.km, 1e-6));
        }

        return acc;
    };
    const hoursAt = km => driveHoursAt(km) + stops.reduce((sum, s) => sum + (s.km < km ? s.h : 0), 0);
    const kmAtHour = (h) => {
        if (!stops.length) {
            return driveKmAtHour(h);
        }
        let lo = 0;
        let hi = total;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (hoursAt(mid) < h) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return hi;
    };
    const rangeAt = km => ranges.find(r => km >= r.from_km && km < r.to_km) || ranges[ranges.length - 1];

    const largest = list => list.reduce((best, c) => (!best || c.population > best.population ? c : best), null);
    // Город в той же стране, что и точка: у Сан-Диего крупнее Тихуана за границей, и
    // американский участок начинался «Тихуаной» (фактчек 01.10.2026).
    const startCity = largest(cities.filter(c => c.km <= 20 && (!ranges[0] || c.cc === ranges[0].cc)));
    const endCity = largest(cities.filter(c => c.km >= total - 20 && (!ranges.length || c.cc === ranges[ranges.length - 1].cc)));
    // Сначала имя точки маршрута — так её назвал человек (его видит и заголовок); нет имени —
    // крупнейший город у старта или финиша, а не безымянное «Финиш» (Петербург → Кацюнь).
    // Город первым подменял названное: Мюнхен → Венеция кончался «Местре» — он крупнее
    // исторической Венеции в базе городов.
    const pointNames = route.points || [];
    const startName = pointNames[0] || startCity?.name || fmt.t('start');
    const endName = pointNames[pointNames.length - 1] || endCity?.name || fmt.t('finish');

    // Где городов от 20 тыс. у дороги нет на сотни километров (Исландия, Патагония, Лофотены),
    // ночёвка называлась «км 367». Тогда её имя — названная точка маршрута рядом (её выбрал
    // человек или редакция), а нет и её — кемпинг со своим именем у дороги.
    const waypointsNamed = (route.waypoints || []).map((w, i) => ({ name: (route.points || [])[i], lat: w[1], lng: w[0] }))
        .filter((w, i, all) => w.name && i > 0 && i < all.length - 1)
        .map(w => ({ name: w.name, km: kmOnLine(route.preview, total, w.lat, w.lng) }))
        .map(w => ({ ...w, cc: rangeAt(w.km)?.cc }));
    const namedNear = (list, km, window) => list
        .filter(x => Math.abs(x.km - km) <= window)
        .reduce((best, x) => (!best || Math.abs(x.km - km) < Math.abs(best.km - km) ? x : best), null);
    const nightCity = (km) => {
        const near = cities.filter(c => Math.abs(c.km - km) <= NIGHT_WINDOW_KM);
        const close = near.filter(c => c.offset_km <= NIGHT_MAX_OFFSET_KM);
        const pool = close.length ? close : near;
        if (!pool.length) {
            const point = namedNear(waypointsNamed, km, NIGHT_WINDOW_KM);
            const camp = point ? null : namedNear((route.camps || []).filter(c => c.named), km, NIGHT_WINDOW_KM / 2);
            const named = point || camp;

            return named
                ? { name: named.name, km: named.km, cc: named.cc || rangeAt(named.km)?.cc }
                : { name: fmt.t('km_point', { km: km }), km, cc: rangeAt(km)?.cc };
        }

        // Ближе к цели дня важнее, чем крупнее: город в 60 км от цели — лишний час за рулём.
        return pool.reduce((best, c) => {
            const score = Math.abs(c.km - km) - Math.log10(Math.max(c.population, 1)) * 8;
            const bestScore = Math.abs(best.km - km) - Math.log10(Math.max(best.population, 1)) * 8;

            return score < bestScore ? c : best;
        });
    };

    // ---------- Ходовые дни и ночёвки ----------
    // Закреплённые ночёвки (inputs.nights — номера точек маршрута): человек сам решил, где
    // спит, и день кончается там. Между ними ночёвки по-прежнему подбираются сами — по
    // часам за рулём; перегон до закреплённой ночёвки может выйти длиннее или короче hpd.
    const hpd = inputs.hpd || 6;
    const waypoints = route.waypoints || [];
    // nights: номер точки → ночей (список номеров — прежний вид, по одной ночи).
    const nightMap = Array.isArray(inputs.nights)
        ? Object.fromEntries(inputs.nights.map(i => [i, 1]))
        : (inputs.nights || {});
    const pinned = Object.keys(nightMap).map(Number)
        .filter(i => i > 0 && i < waypoints.length - 1 && nightMap[i] > 0)
        .map((i) => {
            const km = kmOnLine(route.preview, total, waypoints[i][1], waypoints[i][0]);

            return {
                name: (route.points || [])[i] || fmt.t('km_point', { km: km }),
                lat: waypoints[i][1], lng: waypoints[i][0], km, cc: rangeAt(km)?.cc, pinned: true,
                // Больше одной ночи — человек остаётся на месте: лишние сутки сдвигают все даты дальше.
                stay: Math.max(0, Math.round(nightMap[i]) - 1),
            };
        })
        .filter(p => p.km > 1 && p.km < total - 1)
        .sort((a, b) => a.km - b.km);
    const days = [];
    let prevKm = 0;
    let prevH = 0;
    [...pinned, { name: endName, km: total, cc: ranges[ranges.length - 1]?.cc, finish: true }].forEach((anchor) => {
        const n = Math.max(1, Math.ceil((hoursAt(anchor.km) - prevH) / hpd - 0.3));
        for (let i = 1; i <= n; i++) {
            // Цель дня посреди переправы — ночуют у порта отправления, а не «на км 5141» в море.
            const target = kmAtHour(prevH + i * hpd);
            const onFerry = ferryPieces.find(x => target > x.from && target < x.to);
            const end = i === n ? anchor : nightCity(onFerry ? onFerry.from : target);
            const toKm = Math.max(prevKm + 1, Math.min(anchor.km, end.km));
            const own = i === n && !!anchor.pinned;
            days.push({
                d: days.length + 1, from: prevKm, to: toKm, km: toKm - prevKm, city: end.name, cc: end.cc, point: end,
                last: i === n && !!anchor.finish, pinned: own,
                stayN: own ? anchor.stay : 0, ...(own && anchor.stay ? { stayCity: anchor.name } : {}),
            });
            prevKm = toKm;
        }
        prevH = hoursAt(anchor.km);
    });
    const nDrive = days.length;

    // Остановки: после последнего ходового дня, который заканчивается в стране.
    const stays = inputs.stays || {};
    const stayInfo = {};
    // Дата выезда обратно (inputs.back) сама задаёт, сколько дней человек проведёт в стране
    // финиша: остановка там выводится из неё, счётчик дней этой страны в плане не читается.
    const finishCc = ranges[ranges.length - 1]?.cc;
    const backWanted = round && start && inputs.back ? parseLocalDate(inputs.back) : null;
    ranges.forEach((r) => {
        const n = Math.max(0, Math.round(stays[r.cc] || 0));
        if (!n || stayInfo[r.cc] || (backWanted && r.cc === finishCc)) {
            return;
        }
        const inside = days.filter(x => x.cc === r.cc && x.to > r.from_km && x.to <= r.to_km);
        const host = inside[inside.length - 1] || days.find(x => x.to > (r.from_km + r.to_km) / 2) || days[days.length - 1];
        host.stayN += n;
        host.stayCity = inside.length ? host.city : r.name;
        stayInfo[r.cc] = { n, city: host.stayCity, day: host.d };
    });

    const base = start || addDays(env.today, 1);
    let offset = 0;
    days.forEach((x) => {
        x.date = addDays(base, x.d - 1 + offset);
        if (x.stayN) {
            x.stayFrom = addDays(x.date, 1);
            x.stayTo = addDays(x.date, x.stayN);
        }
        offset += x.stayN;
    });
    // Обратно — не раньше следующего дня после приезда; более ранняя дата сдвигается, а
    // страница говорит об этом человеку (backInfo.early).
    let backInfo = null;
    if (round) {
        const finish = days[days.length - 1];
        const min = addDays(finish.date, 1);
        if (backWanted) {
            const date = backWanted < min ? min : backWanted;
            const n = Math.round((date - min) / DAY);
            if (n) {
                finish.stayN = n;
                finish.stayCity = finish.city;
                finish.stayFrom = min;
                finish.stayTo = addDays(finish.date, n);
                offset += n;
                stayInfo[finishCc] = { n, city: finish.city, day: finish.d };
            }
            backInfo = { date, min, arrive: finish.date, early: backWanted < min };
        } else {
            backInfo = { date: addDays(finish.date, (finish.stayN || 0) + 1), min, arrive: finish.date, early: false, auto: true };
        }
    }
    const tripDays = nDrive + offset;
    const dayOf = km => days.find(x => km > x.from && km <= x.to) || days[0];
    days.forEach((x) => {
        x.sights = stops.filter(s => dayOf(s.km) === x);
        x.stopH = x.sights.reduce((sum, s) => sum + s.h, 0);
        x.hours = driveHoursAt(x.to) - driveHoursAt(x.from) + x.stopH;
    });

    // ---------- По пути ----------
    // Бюджет крюка — фильтр просмотра: 0 — «не заезжаю», места прячутся, выбранные остаются.
    const detour = Number.isFinite(Number(inputs.detour)) ? Number(inputs.detour) : 30;
    const sights = (route.sights || []).map((s) => {
        const visit = sightVisitMin(s.kind);

        return {
            ...s, visit, cost: s.detour_min + visit,
            chosen: chosenIds.has(s.id),
            inBudget: detour > 0 && s.detour_min <= detour,
            day: dayOf(s.km).d, dayDate: dayOf(s.km).date,
        };
    });

    // Города погоды: крупные города по пути (точки сервера) + старт + КАЖДАЯ ночёвка —
    // человеку нужна погода там, где он спит, а не только в столицах стран.
    const cityKey = c => `${c.cc}:${c.slug}`;
    const nightOf = new Map();
    days.forEach((x) => {
        const c = x.last ? endCity : x.point;
        // Высота ночёвки над морем (м) — у городов из скелета маршрута; у точки без города её нет.
        x.ele = c?.ele ?? null;
        if (c?.slug) {
            nightOf.set(cityKey(c), x.d);
        }
    });
    const weatherCities = cities
        .filter(c => c.weather || nightOf.has(cityKey(c)) || c === startCity)
        .map(c => ({ ...c, night: nightOf.get(cityKey(c)) || null, lastNight: endCity === c }));

    // ---------- Обратная дорога ----------
    // «Туда и обратно» — тот же путь назад тем же темпом, сразу после остановки на финише:
    // ходовой день «туда» становится ходовым днём «обратно», в обратном порядке. Остановки
    // по странам — только по дороге туда.
    const tripEnd = addDays(days[days.length - 1].date, days[days.length - 1].stayN || 0);
    const backDate = x => addDays(tripEnd, nDrive - x.d + 1);
    const span = (a, b) => Math.round((b - a) / DAY) + 1;

    // ---------- Присутствие в странах ----------
    // У страны два заезда: туда (entry–exit) и обратно (back). В стране финиша они
    // сливаются в один — человек из неё не выезжал.
    const presence = {};
    ranges.forEach((r, idx) => {
        const touch = days.filter(x => x.to > r.from_km && x.from < r.to_km);
        const first = touch[0] || days[0];
        const lastDay = touch[touch.length - 1] || days[days.length - 1];
        const isLast = idx === ranges.length - 1;
        const entryDay = idx === 0 ? days[0] : dayOf(r.from_km + 0.01);
        const exitDay = isLast ? lastDay : dayOf(r.to_km + 0.01);
        const entry = entryDay.date;
        let exit = isLast ? addDays(lastDay.date, lastDay.stayN || 0) : exitDay.date;
        if (exit < entry) {
            exit = entry;
        }
        let back = null;
        if (round) {
            if (isLast) {
                exit = backDate(entryDay);
            } else {
                back = { entry: backDate(exitDay), exit: backDate(entryDay) };
            }
        }
        const key = `${r.cc}:${idx}`;
        presence[key] = { entry, exit, back, planned: span(entry, exit) + (back ? span(back.entry, back.exit) : 0), driveDays: touch.length, first };
        r.key = key;
    });

    // ---------- Визы: правила из /api/visa/route, счёт — visa-calc-core ----------
    const legFor = (cc) => (visa?.legs || []).find(leg => leg.code === cc || (leg.members || []).some(m => m.code === cc)) || null;
    const zoneOf = (cc) => {
        const leg = legFor(cc);

        return leg && leg.zone ? leg.code : null;
    };

    // Запланированные заезды на место счёта (страна или зона целиком: Шенген — один счётчик).
    const plannedTrips = {};
    const addPlanned = (cc, entry, exit) => {
        const place = zoneOf(cc) || cc;
        const list = plannedTrips[place] || (plannedTrips[place] = []);
        const lastTrip = list[list.length - 1];
        if (lastTrip && (parseLocalDate(lastTrip.exit) - entry) >= -DAY) {
            lastTrip.exit = formatLocalDate(exit > parseLocalDate(lastTrip.exit) ? exit : parseLocalDate(lastTrip.exit));
        } else {
            list.push({ entry: formatLocalDate(entry), exit: formatLocalDate(exit) });
        }
    };
    ranges.forEach(r => addPlanned(r.cc, presence[r.key].entry, presence[r.key].exit));
    // Обратная дорога — страны в обратном порядке: эти дни тоже расходуют счётчики.
    ranges.slice().reverse().filter(r => presence[r.key].back)
        .forEach(r => addPlanned(r.cc, presence[r.key].back.entry, presence[r.key].back.exit));

    const priorTrips = (place, entryDate) => {
        const manual = inputs.prior?.[place];
        if (manual !== undefined && manual !== null && manual !== '') {
            const n = Math.max(0, Math.min(180, parseInt(manual, 10) || 0));
            if (!n) {
                return [];
            }
            // «Было N дней за 180» — один заезд, закончившийся за месяц до въезда.
            const end = addDays(entryDate, -31);

            return [{ entry: formatLocalDate(addDays(end, -(n - 1))), exit: formatLocalDate(end) }];
        }

        return env.journal ? env.journal.tripsFor(place) : [];
    };

    const priorDays = (place, entryDate) => priorTrips(place, entryDate).reduce((sum, trip) => {
        const from = parseLocalDate(trip.entry);
        const to = trip.exit ? parseLocalDate(trip.exit) : entryDate;
        const windowStart = addDays(entryDate, -180);
        const a = from > windowStart ? from : windowStart;
        const b = to < entryDate ? to : addDays(entryDate, -1);

        return sum + (b >= a ? Math.round((b - a) / DAY) + 1 : 0);
    }, 0);

    const ruleFromRow = row => ({
        maxContinuous: row.days ?? null,
        maxTotal: row.total ?? null,
        window: row.window || (row.days ? 'per_entry' : WINDOW_UNLIMITED),
        windowDays: row.window_days ?? null,
        visaRun: !!row.visa_run,
    });

    // ---------- ВНЖ ----------
    // В стране ВНЖ срок не ограничен. ВНЖ страны Шенгена открывает остальной Шенген:
    // до 90 дней в любые 180 без визы, а дни в стране ВНЖ в счётчик не идут.
    const SCHENGEN_MEMBERS = new Set(payload.schengen || []);
    const residences = travelers.map((_, i) => (inputs.residences || [])[i] || null);
    const residenceTrack = (cc, residence, p) => {
        if (!residence) {
            return null;
        }
        if (residence === cc) {
            return { kind: 'residence', residence };
        }
        if (!SCHENGEN_MEMBERS.has(residence) || zoneOf(cc) !== 'SCHENGEN') {
            return null;
        }
        // ВНЖ страны Шенгена: въезд в остальной Шенген без визы. Дни не считаем — решение
        // владельца (28.09.2026): у людей с ВНЖ счётчик 90/180 вне страны ВНЖ почти никогда
        // не упирается, а счётчик путает. Строка визы честно говорит, что его не ведём.
        return { kind: 'residence_schengen', residence };
    };

    /** Срок одного паспорта в стране: ответ движка по прошлым + запланированным заездам. */
    const personTrack = (cc, passport, p, residence = null) => {
        const leg = legFor(cc);
        const row = leg?.rows?.find(x => (x.passports || []).includes(passport));
        // Паспорт сильнее ВНЖ: гражданину (своя страна, свобода передвижения в ЕС) ВНЖ
        // ничего не добавляет. Иначе австриец с ВНЖ Испании ехал по Шенгену «без визы по ВНЖ».
        if (row && ['citizen', 'freedom'].includes(row.visa_type)) {
            return { kind: 'home', row };
        }
        const byResidence = residenceTrack(cc, residence, p);
        if (byResidence) {
            return byResidence;
        }
        if (!leg || !row) {
            return { kind: 'none' };
        }
        if (leg.home || ['citizen', 'freedom'].includes(row.visa_type)) {
            return { kind: 'home', row };
        }
        if (row.mode === 'no_admission') {
            return { kind: 'restricted', row };
        }
        if (NO_COUNTER_MODES.includes(row.mode)) {
            return { kind: 'visa', row };
        }
        const rule = ruleFromRow(row);
        if (rule.window === WINDOW_UNLIMITED || (rule.maxContinuous === null && rule.maxTotal === null)) {
            return { kind: 'unlimited', row };
        }
        const place = leg.zone ? leg.code : cc;
        const list = plannedTrips[place] || [];
        const firstEntry = list.length ? parseLocalDate(list[0].entry) : p.entry;
        // Срок заезда, идущего в день `on`: прошлые поездки плюс все заезды плана до него
        // включительно — обратная дорога считается с учётом дней, потраченных по пути туда.
        const visit = (on) => {
            const index = list.findIndex(t => parseLocalDate(t.entry) <= on && parseLocalDate(t.exit) >= on);
            const planned = index >= 0 ? list[index] : { entry: formatLocalDate(p.entry), exit: formatLocalDate(p.exit) };
            const trips = [...priorTrips(place, firstEntry), ...list.slice(0, Math.max(0, index)), planned];
            const track = computeTrack(trips, parseLocalDate(planned.entry), rule);
            const mustExit = track.mustExitOn ? parseLocalDate(track.mustExitOn) : null;
            const plannedExit = parseLocalDate(planned.exit);

            return {
                mustExit,
                allowed: mustExit ? Math.round((mustExit - parseLocalDate(planned.entry)) / DAY) + 1 : 0,
                over: !mustExit || plannedExit > mustExit,
                margin: mustExit ? Math.round((mustExit - plannedExit) / DAY) : -1,
                days: span(parseLocalDate(planned.entry), plannedExit),
            };
        };
        const visits = [visit(p.entry), ...(p.back ? [visit(p.back.entry)] : [])];
        // Решает заезд с меньшим запасом — туда или обратно.
        const tight = visits.reduce((a, b) => (b.margin < a.margin ? b : a));

        return {
            kind: 'free', row, rule, place, zone: !!leg.zone,
            mustExit: tight.mustExit, allowed: tight.allowed, days: tight.days,
            over: visits.some(v => v.over),
            margin: tight.margin,
            prior: priorDays(place, firstEntry),
        };
    };

    const SEV = { restricted: 6, none: 5, visa: 4, free: 3, unlimited: 1, residence_schengen: 0, residence: 0, home: 0 };

    // ---------- Счётчик Шенгена ----------
    let schengen = null;
    const schengenRanges = ranges.filter(r => zoneOf(r.cc) === 'SCHENGEN');
    // ВНЖ страны Шенгена у всех в машине — счётчик 90/180 не ведём (см. residenceTrack).
    const groupSchengenResidence = residences.length > 0 && residences.every(r => r && SCHENGEN_MEMBERS.has(r));
    if (schengenRanges.length && !groupSchengenResidence) {
        const daysIn = new Set();
        // Если у всех в машине ВНЖ одной страны Шенгена — дни в ней счётчик не расходуют.
        const groupResidence = residences.length && residences.every(r => r && r === residences[0]) && SCHENGEN_MEMBERS.has(residences[0]) ? residences[0] : null;
        const exempt = new Set();
        if (groupResidence) {
            ranges.filter(r => r.cc === groupResidence).forEach((r) => {
                [presence[r.key], presence[r.key].back].filter(Boolean).forEach((v) => {
                    for (let d = v.entry; d <= v.exit; d = addDays(d, 1)) {
                        exempt.add(formatLocalDate(d));
                    }
                });
            });
        }
        (plannedTrips.SCHENGEN || []).forEach((t) => {
            for (let d = parseLocalDate(t.entry); d <= parseLocalDate(t.exit); d = addDays(d, 1)) {
                if (!exempt.has(formatLocalDate(d))) {
                    daysIn.add(formatLocalDate(d));
                }
            }
        });
        const firstEntry = presence[schengenRanges[0].key].entry;
        const prior = priorDays('SCHENGEN', firstEntry);
        const used = daysIn.size;
        schengen = {
            used, prior, total: used + prior, left: 90 - used - prior, over: used + prior > 90,
            pct: pct(Math.min(90, used + prior), 90), priorPct: pct(Math.min(90, prior), 90),
            flags: schengenRanges.map(r => r.cc),
        };
    }

    // ---------- Платные дороги ----------
    // Евро — из местной суммы по курсам этого пакета: в скелете маршрута amount_eur посчитан
    // один раз, при сборке, а скелет живёт неделями (запрет на зашитые курсовые значения).
    const tollEur = (x) => {
        const rate = x?.currency === 'EUR' ? 1 : payload.rates?.[x?.currency];

        return x?.amount_local !== null && x?.amount_local !== undefined && rate ? x.amount_local / rate : x?.amount_eur ?? null;
    };
    const tollItems = (route.tolls?.items || []).map(x => ({
        ...x,
        amount_eur: tollEur(x),
        meta: x.meta?.options ? { ...x.meta, options: x.meta.options.map(o => ({ ...o, amount_eur: tollEur(o) })) } : x.meta,
    }));
    const unknownToll = new Set(route.tolls?.unknown_countries || []);
    const ferryItems = (route.borders || []).map((border) => {
        if (!border.ferry) {
            return null;
        }
        const distance = (item) => {
            const ferry = payload.ferries?.[item.meta?.slug];
            if (ferry?.lat == null || ferry?.lng == null || border.lat == null || border.lng == null) {
                return Infinity;
            }

            return Math.hypot(ferry.lat - border.lat, (ferry.lng - border.lng) * Math.cos(border.lat * Math.PI / 180));
        };

        return tollItems.filter(item => item.meta?.kind === 'ferry' && [border.from, border.to].includes(item.country) && Number.isFinite(distance(item)))
            .sort((a, b) => distance(a) - distance(b))[0] || null;
    });
    const borderFerryItems = new Set(ferryItems.filter(Boolean));
    const tollsFor = cc => tollItems.filter(item => item.country === cc && !borderFerryItems.has(item));
    // Плата привязана к стране, а не к месту: при повторном заезде (Аргентина → Чили →
    // Аргентина) вторая карточка повторяла всю плату страны — RN9 Буэнос-Айрес — Росарио
    // на Огненной Земле, и бюджет считал её дважды (фактчек 01.10.2026). Плата страны — в
    // первом заезде в неё.
    const tollsForVisit = (cc, i) => (ranges.findIndex(x => x.cc === cc) === i ? tollsFor(cc) : []);

    // ---------- Топливо ----------
    // Топливо и расход — только известные человека: без них цифры не выдумываем,
    // строка топлива просит их указать, а бюджет показывает «—».
    const fuelKey = inputs.fuel || null;
    const cons = Number(inputs.cons) > 0 ? Number(inputs.cons) : null;
    const tank = Number(inputs.tank) > 0 ? Number(inputs.tank) : null;
    // Евро — из местной цены по курсам этого же пакета (payload.rates): так же страница
    // считает сумму в местной валюте, и две суммы топлива страны сходятся. prices_eur
    // пересчитан по курсу на момент кеша цен — только запасной путь.
    const priceEur = (cc) => {
        const fuel = fuelKey ? payload.countries[cc]?.fuel : null;
        const local = fuel?.prices?.[fuelKey];
        // Валюта — у вида топлива (Венесуэла: дизель в долларах); цена уже за литр (RoadbookPayload::fuelFor).
        const currency = fuel?.currencies?.[fuelKey] || fuel?.currency;
        const rate = currency === 'EUR' ? 1 : payload.rates?.[currency];

        return local !== null && local !== undefined && rate ? local / rate : fuel?.prices_eur?.[fuelKey] ?? null;
    };
    const roundK = round ? 2 : 1;

    // ---------- Границы ----------
    const innerSchengen = (from, to) => zoneOf(from) === 'SCHENGEN' && zoneOf(to) === 'SCHENGEN';
    const borderPairs = (route.borders || []).map((b, i) => [ranges[i]?.cc || b.from, ranges[i + 1]?.cc || b.to]);
    // С ребёнком документы смотрят на каждой границе с контролем; весь путь внутри
    // Шенгена — напоминание остаётся на первой границе.
    const kidsEverywhere = borderPairs.some(([from, to]) => !innerSchengen(from, to));
    /** Нужен ли машине карнет в стране: только по правилу ввоза, не дома у машины и не под запретом номеров. */
    const carnetAt = (cc) => {
        const leg = legFor(cc);

        return leg?.vehicle?.carnet_required === true && !leg.plate_ban && !(leg.car_home ?? leg.home) && inputs.plates !== cc;
    };
    /** Что ждёт на границе при въезде из `from` в `to`; back — это пересечение на обратной дороге. */
    const borderChecks = (from, to, i, back = false, ferry = false) => {
        const fromZone = ferry && SCHENGEN_MEMBERS.has(from) ? 'SCHENGEN' : zoneOf(from);
        const toZone = ferry && SCHENGEN_MEMBERS.has(to) ? 'SCHENGEN' : zoneOf(to);
        const checks = [];
        if (fromZone !== toZone && (fromZone === 'SCHENGEN' || toZone === 'SCHENGEN')) {
            checks.push({ s: 'warn', phase: fromZone === 'SCHENGEN' ? 'exit' : 'entry', t: fmt.t(toZone === 'SCHENGEN' ? 'check_enter_schengen' : 'check_exit_schengen') });
        } else if (fromZone === 'SCHENGEN' && toZone === 'SCHENGEN') {
            checks.push({ s: 'ok', t: fmt.t('check_inner_schengen') });
        } else {
            checks.push({ s: 'warn', t: fmt.t('check_passport_control') });
        }
        const toLeg = legFor(to);
        if (toLeg?.plate_ban) {
            checks.push({ s: 'bad', t: fmt.t('check_plate_ban') });
        }
        const green = toLeg?.green_card_for_plate;
        if (green === 'border_insurance' && !toLeg?.plate_ban) {
            // Снова в ЕС после страны вне его (Швейцария, Сербия) — купленная раньше ещё может действовать.
            const insuredBefore = FRONTIER_INSURANCE_AREA.has(to) && ranges.slice(0, i + 1).some(x => FRONTIER_INSURANCE_AREA.has(x.cc));
            if (FRONTIER_INSURANCE_AREA.has(from) && FRONTIER_INSURANCE_AREA.has(to)) {
                checks.push({ s: 'ok', t: fmt.t('check_insurance_eu') });
            } else {
                // Обратно страховка с дороги туда может ещё действовать — не «купите», а «проверьте».
                checks.push({ s: 'warn', t: fmt.t(back || insuredBefore ? 'check_insurance_valid' : 'check_buy_insurance') });
            }
        }
        const vgn = !route.avoid_tolls && tollsFor(to).find(x => x.type === 'vignette');
        if (vgn) {
            checks.push({ s: 'toll', t: fmt.t(back ? 'check_vignette_valid' : 'check_vignette_before', { country: fmt.countryName(to) }) });
        }
        // Карнет: отметка таможни на въезде и на выезде — без выездной залог не вернут.
        if (carnetAt(to)) {
            checks.push({ s: 'warn', t: fmt.t('check_carnet_entry') });
        }
        if (carnetAt(from)) {
            checks.push({ s: 'warn', t: fmt.t('check_carnet_exit') });
        }
        if (inputs.pets && fromZone !== 'SCHENGEN' && toZone === 'SCHENGEN') {
            checks.push({ s: 'warn', t: fmt.t('check_pets_eu') });
        }
        if (inputs.kids && (kidsEverywhere ? !innerSchengen(from, to) : i === 0 && !back)) {
            checks.push({ s: 'warn', t: fmt.t('check_kids') });
        }

        return checks;
    };
    // Часы пункта пропуска — из OSM и поправок config/roadbook.php. «Только по будням»
    // проверяется по дню перехода: Иркештам по плану приходился на субботу и воскресенье.
    const hoursLabel = h => (h === '24/7' ? fmt.t('hours_247') : /^Mo-Fr$/.test(h || '') ? fmt.t('hours_weekdays') : h || null);
    const weekdaysOnly = h => /^Mo-Fr\b/.test(h || '');
    const hoursChecks = (b, date) => {
        if (!weekdaysOnly(b.opening_hours)) {
            return [];
        }
        const weekend = !!date && [0, 6].includes(date.getDay());

        return [{ s: weekend ? 'bad' : 'warn', t: weekend ? fmt.t('check_border_weekend', { day: fmt.dateWd(date) }) : fmt.t('check_border_weekdays') }];
    };
    // Часы и камеры из слоя border_info (payload: border.info). Нет данных — «Время работы
    // неизвестно», кроме парных шенгенских границ, где поста может не быть вовсе. Часы одной
    // службы не выдаются за часы всего перехода: показываем службу, сторону, источник и дату.
    const HOURS_GROUPS = {
        border_post_operation: 'post', published_pass_hours: 'post', cruce_pais_pais: 'post',
        seasonal_border_operation: 'post', bridge_road_operation: 'post',
        customs: 'customs', customs_office: 'customs', immigration_office: 'immigration',
        economic_border_crossing_procedures: 'procedures', departure_processing: 'procedures', arrival_processing: 'procedures',
    };
    const hoursInfo = (b, from, to) => {
        // Терминалы коммерческих грузов путешественнику на машине не нужны — в базе остаются.
        const rows = (b.info?.hours || []).filter(h => h.service !== 'commercial_goods_clearance_terminal').map(h => ({
            who: /^[A-Z]{2}$/.test(h.side) ? fmt.countryName(h.side) : null,
            group: HOURS_GROUPS[h.service] || 'other',
            svc: fmt.t(`hours_svc_${HOURS_GROUPS[h.service] || 'other'}`),
            schedule: h.schedule, url: h.source_url, title: h.source_title,
            checked: fmt.t('hours_checked', { date: h.reviewed_on }),
            warn: h.conflicting ? fmt.t('hours_conflict') : h.stale ? fmt.t('hours_stale', { date: h.reviewed_on }) : null,
            side: h.side,
        }));
        const notes = [];
        const unknown = !rows.length && !b.opening_hours && !b.ferry && !innerSchengen(from, to);
        const sides = [...new Set(rows.map(r => r.side))];
        if (rows.length && sides.length === 1 && /^[A-Z]{2}$/.test(sides[0])) {
            notes.push(fmt.t('hours_one_side', { country: fmt.countryName(sides[0]) }));
        }
        if (rows.length && rows.every(r => r.group === 'customs')) {
            notes.push(fmt.t('hours_customs_only'));
        }
        const cameras = b.info ? (b.info.cameras || []).map(c => ({ url: c.url, label: c.provider || fmt.t('camera_link') })) : [];
        const noCamera = !!b.info && !cameras.length;

        return unknown || rows.length || notes.length || cameras.length || noCamera ? { unknown, notes, rows, cameras, noCamera } : null;
    };
    const ferryFor = (i, from, to) => {
        const item = ferryItems[i];
        if (!item) {
            return null;
        }
        const data = payload.ferries[item.meta.slug];
        const reversed = data.from === to && data.to === from;
        const details = reversed ? data.reverse : data;
        const ports = reversed ? { from: data.ports?.to, to: data.ports?.from } : data.ports;
        const eur = tollEur({ amount_local: data.amount_local, currency: data.currency });
        const name = ports?.from && ports?.to ? `${ports.from} — ${ports.to}` : data.name;
        const price = eur === null ? fmt.t('no_data') : `${data.estimate !== false ? '≈ ' : ''}${fmt.money(eur)}`;
        const line = [fmt.t('ferry_line', { name }), data.duration_min ? `~${fmt.t('hours', { n: fmt.num(data.duration_min / 60) })}` : null,
            data.length_km ? fmt.t('km', { km: data.length_km }) : null, price].filter(Boolean).join(' · ');

        return { ...data, ...details, ports, name, eur, price, line, slug: item.meta.slug };
    };
    const ferryChecks = (from, to, i, ferry, back = false) => {
        const checks = borderChecks(from, to, i, back, true);

        return {
            exitChecks: [...checks.filter(k => k.phase === 'exit'), ...(ferry.exit ? [{ s: 'ok', t: ferry.exit }] : [])],
            entryChecks: [...(ferry.arrival ? [{ s: 'warn', t: ferry.arrival }] : []), ...checks.filter(k => k.phase !== 'exit')],
        };
    };
    const borders = (route.borders || []).map((b, i) => {
        const [from, to] = borderPairs[i];
        const d = dayOf(b.km);
        const ferry = ferryFor(i, from, to);
        const backFerry = round ? ferryFor(i, to, from) : null;

        return {
            ...b, from, to, left: P(b.km), code: `${from} → ${to}`,
            ferry: ferry || b.ferry,
            ...(ferry ? ferryChecks(from, to, i, ferry) : {}),
            name: ferry?.name || b.name || null, hours: hoursLabel(b.opening_hours), hoursInfo: ferry ? null : hoursInfo(b, from, to),
            checks: [...hoursChecks(b, start ? d.date : null), ...borderChecks(from, to, i)], dayLabel: start ? fmt.dateWd(d.date) : fmt.t('day_n', { n: d.d }),
            // Та же граница на обратной дороге — в другую сторону и со своими проверками.
            back: round ? {
                code: `${to} → ${from}`, from: to, to: from,
                name: backFerry?.name || b.name || null, ferry: backFerry || b.ferry,
                ...(backFerry ? ferryChecks(to, from, i, backFerry, true) : {}),
                checks: [...hoursChecks(b, start ? backDate(d) : null), ...borderChecks(to, from, i, true)],
                dayLabel: start ? fmt.dateWd(backDate(d)) : fmt.t('day_n', { n: nDrive * 2 - d.d + 1 }),
            } : null,
        };
    });
    // ---------- Карточки ----------
    const plan = [];
    const cards = ranges.map((r, i) => {
        const p = presence[r.key];
        const stayN = stayInfo[r.cc]?.n || 0;
        const rows = [];

        // 1. Виза — по каждому паспорту, срок группы по самому строгому.
        const res = travelers.map((passport, i) => ({ passport, t: personTrack(r.cc, passport, p, residences[i]) }));
        const worst = res.length
            ? res.slice().sort((a, b) => (SEV[b.t.kind] * 1000 - (b.t.allowed ?? 999)) - (SEV[a.t.kind] * 1000 - (a.t.allowed ?? 999)))[0]
            : null;
        let vrow;
        if (!travelers.length) {
            vrow = { key: 'visa', s: 'none', hint: true, lines: [fmt.t('visa_pick_passport')] };
        } else if (!visa) { // ответ /api/visa/route ещё не пришёл
            vrow = { key: 'visa', s: 'none', loading: true, lines: [fmt.t('loading')] };
        } else if (!worst || worst.t.kind === 'none') {
            vrow = { key: 'visa', s: 'none', big: fmt.t('no_data'), nodataPassport: true, lines: [fmt.t('visa_no_rule', { country: r.name })] };
        } else {
            const t = worst.t;
            const perPerson = travelers.length > 1
                ? res.map(x => `${fmt.countryName(x.passport)}: ${fmt.t('visa_short_' + x.t.kind, { days: x.t.row?.days ?? '' })}`).join(' · ')
                : null;
            const lines = [];
            if (t.kind === 'restricted') {
                vrow = { key: 'visa', s: 'bad', big: fmt.t('visa_restricted'), restricted: true, lines: [t.row.note || fmt.t('visa_restricted_text')] };
            } else if (t.kind === 'visa') {
                vrow = { key: 'visa', s: 'warn', big: t.row.mode_label || fmt.t('visa_needed'), lines: [t.row.note].filter(Boolean) };
            } else if (t.kind === 'residence') {
                vrow = { key: 'visa', s: 'ok', free: true, big: fmt.t('visa_residence'), lines: [fmt.t('visa_residence_text')] };
            } else if (t.kind === 'residence_schengen') {
                vrow = { key: 'visa', s: 'ok', free: true, big: fmt.t('visa_residence_schengen'), lines: [fmt.t('visa_residence_schengen_text', { country: fmt.countryName(t.residence) })] };
            } else if (t.kind === 'home' || t.kind === 'unlimited') {
                vrow = { key: 'visa', s: 'ok', free: true, big: t.kind === 'home' ? fmt.t('visa_home') : fmt.t('visa_unlimited'), lines: [] };
            } else {
                lines.push(t.row.window_label ? fmt.t('visa_counted', { how: t.row.window_label }) : '');
                if (t.prior) {
                    lines.push(fmt.t('visa_prior', { days: fmt.days(t.prior) }));
                }
                if (t.zone) {
                    lines.push(fmt.t('visa_zone_shared'));
                }
                // Дни — того заезда, чей срок теснее (туда или обратно); у зоны с общим
                // счётчиком заезд — вся зона целиком, поэтому там дни страны.
                const plannedDays = t.zone ? p.planned : t.days;
                lines.push(t.over
                    ? fmt.t('visa_over', { planned: fmt.days(plannedDays), allowed: fmt.days(Math.max(0, t.allowed)) })
                    : fmt.t('visa_margin', { planned: fmt.days(plannedDays), margin: fmt.days(Math.max(0, t.margin)) }));
                if (p.back && start) {
                    lines.push(fmt.t('visit_back', { from: fmt.dateShort(p.back.entry), to: fmt.dateShort(p.back.exit) }));
                }
                vrow = {
                    key: 'visa',
                    s: t.over ? 'bad' : t.margin < 7 ? 'warn' : 'ok',
                    big: t.row.days_label ? fmt.t('visa_days_free', { days: t.row.days_label }) : t.row.mode_label,
                    lines: lines.filter(Boolean),
                    deadline: start && t.mustExit ? fmt.t('exit_by', { date: fmt.date(t.mustExit) }) : null,
                    until: t.mustExit, over: t.over, margin: t.margin, allowed: t.allowed, days: plannedDays,
                    needDate: !start,
                };
            }
            if (perPerson) {
                vrow.lines.push(perPerson);
            }
            // Регистрация иностранца в сроки страны (visa_places.registration_hours).
            const registration = legFor(r.cc)?.registration_hours;
            if (registration && !['home', 'residence'].includes(t.kind)) {
                vrow.lines.push(fmt.t('visa_registration', { hours: registration }));
            }
            vrow.who = travelers.length > 1 ? fmt.countryName(worst.passport) : null;
        }
        rows.push(vrow);

        // 2. Машина — правило ввоза, запрет по номерам и зелёная карта из того же ответа.
        const leg = legFor(r.cc);
        // «Дома» в ответе сервера — про человека; у машины свой признак (car_home): гражданин
        // ЕС на машине с номерами не ЕС не «у себя» — ей положены правило ввоза и запреты.
        const carHome = leg ? (leg.car_home ?? leg.home) : false;
        let car;
        if (!inputs.plates && !leg) {
            car = { key: 'car', s: 'none', hint: true, lines: [fmt.t('car_pick_plates')] };
        } else if (leg?.plate_ban) {
            car = { key: 'car', s: 'bad', big: fmt.t('car_banned'), banned: true, lines: [leg.plate_ban.label], source: leg.plate_ban.source_url, basis: leg.plate_ban.legal_basis };
        } else if (carHome || (inputs.plates && inputs.plates === r.cc)) {
            // «Дома» у машины бывает и не в своей стране: немецкие номера в Австрии или Исландии —
            // номера ЕС в зоне свободного передвижения, и «Своя страна» там звучало бы неправдой.
            const eu = inputs.plates && inputs.plates !== r.cc;
            car = { key: 'car', s: 'ok', free: true, big: fmt.t(eu ? 'car_home_eu' : 'car_home'), lines: [] };
        } else if (!leg?.vehicle) {
            car = { key: 'car', s: 'none', big: fmt.t('no_data'), lines: [fmt.t('car_no_rule')] };
        } else {
            const vehicle = leg.vehicle;
            const track = vehicleRuleToTrack(vehicle);
            // Про карнет нет данных (null) — молчим: «Карнет не нужен» было бы выдумкой.
            const carnet = vehicle.carnet_required === true ? fmt.t('car_carnet') : vehicle.carnet_required === false ? fmt.t('car_no_carnet') : null;
            const lines = [vehicle.basis_label, carnet].filter(Boolean);
            const green = leg.green_card_for_plate && leg.green_card_for_plate !== 'unknown' ? leg.green_card_for_plate : vehicle.green_card;
            // Въехали из другой страны ЕС — страховка, купленная на въезде в ЕС, уже действует.
            const insured = green === 'border_insurance' && i > 0 && FRONTIER_INSURANCE_AREA.has(r.cc) && FRONTIER_INSURANCE_AREA.has(ranges[i - 1].cc);
            const insuredBefore = green === 'border_insurance' && !insured && FRONTIER_INSURANCE_AREA.has(r.cc) && ranges.slice(0, i).some(x => FRONTIER_INSURANCE_AREA.has(x.cc));
            if (green) {
                lines.push(fmt.t(insured ? 'car_green_eu_insured' : insuredBefore ? 'check_insurance_valid' : 'car_green_' + green));
            }
            car = { key: 'car', s: green === 'border_insurance' && !insured ? 'warn' : 'ok', big: vehicle.days_label ? fmt.t('car_days', { days: vehicle.days_label }) : null, lines, buyIns: green === 'border_insurance' && !insured, green };
            // Карнет оформляют за недели до выезда и под залог — спокойный зелёный тут неправда.
            if (vehicle.carnet_required === true) {
                car.carnet = true;
                car.s = 'warn';
            }
            if (track.tied) {
                car.big = fmt.t('car_tied');
            } else if (track.rule) {
                const place = leg.zone ? leg.code : r.cc;
                // Обратная дорога — новый ввоз: у него свой срок, с учётом дней по пути туда.
                const visits = [p, p.back].filter(Boolean);
                const tracks = visits.map((v, k) => {
                    const trips = visits.slice(0, k + 1).map(x => ({ entry: formatLocalDate(x.entry), exit: formatLocalDate(x.exit) }));
                    const vt = computeTrack(trips, v.entry, track.rule);
                    const mustExit = vt.mustExitOn ? parseLocalDate(vt.mustExitOn) : null;

                    return {
                        mustExit,
                        over: !mustExit || v.exit > mustExit,
                        margin: mustExit ? Math.round((mustExit - v.exit) / DAY) : -1,
                        allowed: mustExit ? Math.round((mustExit - v.entry) / DAY) + 1 : 0,
                        days: span(v.entry, v.exit),
                    };
                });
                const tight = tracks.reduce((a, b) => (b.margin < a.margin ? b : a));
                car.until = tight.mustExit;
                car.over = tracks.some(x => x.over);
                car.margin = tight.margin;
                car.allowed = tight.allowed;
                car.days = tight.days;
                car.deadline = start && tight.mustExit ? fmt.t('car_exit_by', { date: fmt.date(tight.mustExit) }) : null;
                car.needDate = !start;
                car.place = place;
                if (car.over) {
                    car.s = 'bad';
                    car.lines.push(fmt.t('car_over', { planned: fmt.days(tight.days), extra: fmt.days(Math.max(1, -car.margin)) }));
                }
            }
        }
        // ВНЖ в этой стране: временный ввоз машины с иностранными номерами — режим для
        // нерезидентов, живущему здесь он обычно не положен.
        if (residences.includes(r.cc) && inputs.plates && inputs.plates !== r.cc && !car.banned) {
            car.s = car.s === 'bad' ? 'bad' : 'warn';
            car.lines = [...(car.lines || []), fmt.t('car_residence_warn')];
        } else if (leg?.home && !carHome && !car.banned && !(inputs.plates && inputs.plates === r.cc)) {
            // Человек здесь дома, машина — нет: временный ввоз рассчитан на приезжих.
            car.s = car.s === 'bad' ? 'bad' : 'warn';
            car.lines = [...(car.lines || []), fmt.t('car_home_foreign_warn')];
        }
        // Условия въезда страны (route_warnings) — все про дорогу и машину: закрытая граница,
        // разрешение на машину, местная страховка. Спокойный зелёный у машины им противоречит.
        if (legFor(r.cc)?.warnings?.length && car.s === 'ok' && !car.free) {
            car.s = 'warn';
        }
        rows.push(car);

        // Узкое место: чей срок кончается раньше — ваш или машины.
        let pinch = null;
        if (vrow.over || car.over) {
            const lim = [vrow.over ? vrow.allowed : null, car.over ? car.allowed : null].filter(x => x !== null);
            const limit = Math.max(0, Math.min(...lim));
            // На сколько дней план длиннее срока: по запасу самого тесного заезда.
            const overBy = Math.max(1, -Math.min(vrow.over ? vrow.margin : 0, car.over ? car.margin : 0));
            pinch = {
                over: true, youFirst: !!vrow.over,
                text: fmt.t(vrow.over && car.over ? 'pinch_over_both' : vrow.over ? 'pinch_over_you' : 'pinch_over_car', {
                    planned: fmt.days((vrow.over ? vrow.days : car.days) ?? p.planned), limit: fmt.days(limit), cut: fmt.days(overBy),
                }),
                until: vrow.over ? vrow.until : car.until,
            };
        } else if (vrow.until && car.until && vrow.until.getTime() !== car.until.getTime()) {
            const youFirst = vrow.until < car.until;
            pinch = {
                youFirst,
                text: fmt.t(youFirst ? 'pinch_you_first' : 'pinch_car_first', { you: fmt.date(vrow.until), car: fmt.date(car.until) }),
                until: youFirst ? vrow.until : car.until,
                margin: Math.min(vrow.margin ?? 999, car.margin ?? 999),
            };
        }

        // 3. Дороги — rows/roads.js.
        rows.push(roadsRow({ route, r, i, p, round, roundK, payload, fmt, tollsForVisit, unknownToll, span }));

        // 4. Топливо — rows/fuel.js.
        rows.push(fuelRow({ ranges, i, r, priceEur, cons, roundK, payload, fuelKey, env, p, round, backInfo, tank, fmt }));

        // Номера в стране — как выглядит номер местной машины (раздел /license-plates).
        const plate = payload.plateCatalog?.[r.cc] || null;
        rows.push({
            key: 'plates',
            s: plate ? 'ok' : 'none',
            plate: plate?.p || null,
            intl: plate?.i || null,
            url: payload.plateLinks?.[r.cc] || null,
            nodata: !plate,
        });

        // Зима — только когда даты пребывания в стране попадают в её зимний период:
        // летом и без даты поездки строка не тратит внимание читателя.
        if (payload.winter?.[r.cc] && start) {
            const south = (cities.find(c => c.cc === r.cc)?.lat ?? 1) < 0;
            // Зима может наступить к обратной дороге: строка нужна, если в сезон попадает любой заезд.
            const wrow = [p, p.back].filter(Boolean).map(v => winterRow(payload.winter[r.cc], v, fmt, south)).find(x => x.active);
            if (wrow) {
                rows.push(wrow);
            }
        }

        // Въезд в города (payload.urban, справочник urban-access.json): rows/roads.js.
        const urban = urbanRow(payload.urban?.[r.cc], r, days, fmt);
        if (urban) {
            rows.push(urban);
        }

        // Особенности дорог (payload.notes, справочник route-notes.json): rows/roads.js.
        const notesRowValue = notesRow({ payload, inputs, fmt, days, start, p, r, i, ranges, carHome, travelers, residences, roundK, span });
        if (notesRowValue) {
            rows.push(notesRowValue);
        }

        // 5. Новости — готовые сюжеты страны за полгода.
        const news = payload.countries[r.cc]?.news || [];
        rows.push({
            key: 'news',
            // Нет сюжетов — «нет данных», а не зелёное «спокойно»: отсутствие записи ничего не доказывает.
            s: !news.length ? 'none' : news.some(n => n.severity === 'bad') ? 'bad' : news.some(n => n.severity === 'warn') ? 'warn' : 'ok',
            news, calm: !news.length,
            url: payload.countryLinks?.[r.cc]?.news || null,
        });

        // 6. События — в окне поездки, если есть дата.
        const events = (payload.countries[r.cc]?.events || []).filter((e) => {
            // Место события неизвестно — «по пути» оно или нет, не сказать: в западный
            // Синьцзян попадала выставка в Ухани, за 3500 км от маршрута.
            if (e.lat === null || e.lat === undefined || kmToLine(e.lat, e.lng, route.preview || []) > EVENT_MAX_KM) {
                return false;
            }
            if (!start) {
                return true;
            }
            const from = parseLocalDate(e.start);
            const to = e.end ? parseLocalDate(e.end) : from;

            return [p, p.back].filter(Boolean).some(v => to >= v.entry && from <= v.exit);
        });
        rows.push({ key: 'events', s: events.length ? 'ok' : 'none', events, nodata: !events.length, url: payload.countryLinks?.[r.cc]?.events || null });

        // 6½. Праздники, каникулы и пиковые дни на дорогах — в даты пребывания в стране.
        rows.push(holidaysRow(payload.holidays?.[r.cc], start ? [p, p.back].filter(Boolean) : null, fmt));

        // 6¾. Обстановка сейчас: пожары у трассы, стихийные бедствия, уровень МИД.
        rows.push(hazardsRow(payload.hazards, r, new Set([...travelers, ...residences].filter(Boolean)), start, env.today || new Date(), fmt));

        // 7. Погода
        // В карточке страны — её крупные города (до двух) и ночёвки в ней; промежуточные
        // города без ночёвки только в общей сетке «Погода по всему пути».
        const hasCountryFlag = cities.some(c => c.weather_country !== undefined);
        const wcities = weatherCities
            .filter(c => c.cc === r.cc && (c.night || (hasCountryFlag ? c.weather_country : c.weather)))
            .map(c => cityWeather(c, p.entry));
        const withForecast = wcities.filter(c => !c.later);
        rows.push({ key: 'weather', s: withForecast.length ? 'ok' : 'none', cities: withForecast, nodata: !wcities.length, later: wcities.length > 0 && !withForecast.length, url: payload.countryLinks?.[r.cc]?.vansky || null });

        // 8. Стоянки — у ночёвок: место нужно там, где по плану кончается день, а не где
        // попало в стране. Оценка места (score) — с сервера; каждые 4 км от ночёвки стоят балл.
        const countryCamps = (route.camps || []).filter(c => c.cc === r.cc && c.km >= r.from_km - 1 && c.km <= r.to_km + 1);
        const takenCamps = new Set();
        const campGroups = days.filter(x => x.cc === r.cc && x.to > r.from_km && x.to <= r.to_km).map((night) => {
            const rank = c => (c.score || 0) - Math.abs(c.km - night.to) / 4;
            const free = countryCamps.filter(c => !takenCamps.has(c.id));
            const close = free.filter(c => Math.abs(c.km - night.to) <= CAMP_NIGHT_KM);
            // Рядом с ночёвкой мест нет — ближайшие по пути в этой стране, с честной пометкой.
            const near = (close.length
                ? close.sort((a, b) => rank(b) - rank(a))
                : free.sort((a, b) => Math.abs(a.km - night.to) - Math.abs(b.km - night.to)))
                .slice(0, CAMPS_PER_NIGHT)
                .sort((a, b) => a.km - b.km);
            near.forEach(c => takenCamps.add(c.id));

            return { night: night.d, city: night.stayCity || night.city, last: night.last, far: !close.length, camps: near };
        }).filter(g => g.camps.length);
        // Страну проезжают без ночёвки — лучшие по пути, чтобы строка не была пустой.
        if (!campGroups.length && countryCamps.length) {
            campGroups.push({
                night: null,
                camps: [...countryCamps].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, CAMPS_TRANSIT).sort((a, b) => a.km - b.km),
            });
        }
        const camps = campGroups.flatMap(g => g.camps);
        rows.push({ key: 'camps', s: camps.length ? 'ok' : 'none', camps, groups: campGroups, nodata: !camps.length });

        // 8½. По пути — лучшие места страны в пределах крюка; все — в шторке.
        const pool = sights.filter(s => s.cc === r.cc);
        const shown = pool.filter(s => s.chosen || s.inBudget);
        rows.push({
            key: 'sights', s: shown.length ? 'ok' : 'none', sights: topSights(shown),
            count: shown.length, all: pool.length, off: detour === 0,
            // Места ещё считаются — это не «мест нет»: строка так и говорит.
            pending: !!route.sights_pending, nodata: !pool.length && !route.sights_pending,
        });

        // 9. Деньги — валюта страны, курс к валюте человека и цены продуктов «Корзины»:
        // на ценнике местная цена, в скобках — сколько это в его деньгах.
        rows.push(moneyRow(payload.money?.[r.cc], env.moneyCurrency || inputs.currency || 'EUR', payload.rates || {}));

        // 9½. Таможня на въезде — из предыдущей страны по ходу (страна старта — без строки).
        const customs = customsRow(payload.customs, r.index, round, fmt, payload.rates || {}, env.moneyCurrency || inputs.currency || 'EUR');
        if (customs) {
            rows.push(customs);
        }

        // 10. Розетки: «дом» человека — где живёт, иначе страна номеров, иначе паспорта.
        rows.push(powerRow(payload.electricity, r.cc, residences[0] || inputs.plates || travelers[0] || null, fmt));

        rows.forEach((row, k) => { row.n = k + 1; });

        // Шенген — общий счётчик, его лимит показывает отдельная полоса, а не строка страны.
        const limitPerson = vrow.allowed !== undefined && !legFor(r.cc)?.zone ? vrow.allowed : null;
        const limits = [limitPerson, car.allowed ?? null].filter(x => x !== null && x !== undefined);
        const limit = limits.length ? Math.min(...limits) : null;
        plan.push({
            cc: r.cc, key: r.key, name: r.name, km: r.km, stay: stayN, planned: p.planned,
            prior: worst?.t?.prior || 0,
            limit, limitWho: limit === null ? null : (limitPerson !== null && limitPerson === limit ? 'you' : 'car'),
            over: !!(vrow.over || car.over),
            // Запас — по самому тесному заезду (туда или обратно), а не «лимит минус все дни»:
            // обратная дорога — отдельный въезд со своим сроком.
            margin: limit === null ? null : Math.min(...[limitPerson !== null ? vrow.margin : null, car.margin ?? null].filter(x => x !== null && x !== undefined)),
            overBy: vrow.over || car.over ? Math.max(1, -Math.min(vrow.over ? vrow.margin : 0, car.over ? car.margin : 0)) : 0,
            isStart: i === 0 && r.km < TRANSIT_KM, zone: !!legFor(r.cc)?.zone && !!schengen,
            range: start ? [p, p.back].filter(Boolean).map(v => `${fmt.dateShort(v.entry)}–${fmt.dateShort(v.exit)}`).join(' · ') : null,
            // Зона с общим счётчиком (Шенген): у её стран в плане одна общая строка над плитками
            zoneCode: legFor(r.cc)?.zone ? legFor(r.cc).code : null,
            canPrior: !!worst && worst.t.kind === 'free' && !legFor(r.cc)?.zone,
            priorPlace: worst?.t?.place || r.cc,
        });

        const border = i < ranges.length - 1 ? (borders[i] || null) : null;

        return {
            ...r, rows, pinch, border,
            // Условия въезда страны, которые не выражаются днями (visa_places.route_warnings):
            // в Китай машина въезжает только по заранее оформленному разрешению.
            warnings: legFor(r.cc)?.warnings || [],
            transit: r.km < TRANSIT_KM && !stayN,
            stay: stayInfo[r.cc] || null,
            entryName: i === 0 ? startName : (borders[i - 1]?.ferry?.ports?.to || borders[i - 1]?.name || fmt.t('border_km', { km: borders[i - 1]?.km || r.from_km })),
            exitName: i === ranges.length - 1 ? endName : (borders[i]?.ferry?.ports?.from || borders[i]?.name || fmt.t('border_km', { km: borders[i]?.km || r.to_km })),
            hours: r.hours, presence: p,
        };
    });

    // ---------- Погода: города и сетка ----------
    // Климат запрашивается только по точкам погоды (у архива лимит); ночёвка без своего
    // климата берёт его у ближайшей точки не дальше 80 км — погода там та же.
    function nearestClimate(city) {
        const near = cities
            .filter(c => c.weather && payload.climate?.[`${c.cc}:${c.slug}`] && Math.abs(c.km - city.km) <= 80)
            .sort((a, b) => Math.abs(a.km - city.km) - Math.abs(b.km - city.km))[0];

        return near ? payload.climate[`${near.cc}:${near.slug}`] : null;
    }

    // Прогноз VanSky знает неделю вперёд; дальше — «обычно в это время»: медиана
    // за последние годы по неделе года (CityClimateService). Клетка помнит, что она
    // такое, — страница подписывает климат как климат, а не как прогноз.
    /** Погода города в конкретный день: прогноз VanSky, дальше него — климат. */
    function cellAt(city, date) {
        const forecast = payload.weather?.[`${city.cc}:${city.slug}`] || [];
        const day = forecast.find(x => x.date === formatLocalDate(date));
        if (day) {
            return { date, t: day.t_day, tn: day.t_night, score: day.score, code: day.code, sky: forecastSky(day.code, day.precip), precip: day.precip, forecast: true };
        }
        const climate = payload.climate?.[`${city.cc}:${city.slug}`] || nearestClimate(city);
        const week = climate?.weeks?.[weekOfYear(date)];
        if (week && week[0] !== null) {
            const [t, tn] = climateTemps(climate.weeks, date);

            return { date, t, tn, rain: week[2], sky: week[3], score: null, climate: true, years: climate.years };
        }

        return { date, t: null, score: null, forecast: false };
    }

    function cityWeather(city, from, back = false) {
        const first = start ? (from || start) : addDays(env.today, 1);
        const cells = Array.from({ length: 7 }, (_, k) => cellAt(city, addDays(first, k)));
        const known = cells.filter(c => c.t !== null);
        const scored = known.filter(c => c.score !== null);
        const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
        known.forEach((c) => { c.best = c === best; });

        // День, когда проезжаем город (на обратной дороге — свой), — его клетку страница подсвечивает.
        const passDay = start ? dayOf(city.km) : null;
        const pass = passDay ? (back ? backDate(passDay) : passDay.date).getTime() : null;
        known.forEach((c) => { c.pass = pass !== null && c.date.getTime() === pass; });

        // url — страница города в VanSky (только у городов, по которым там есть прогноз)
        return { name: city.name, cc: city.cc, km: city.km, url: payload.weatherLinks?.[cityKey(city)] || null, night: city.night || null, lastNight: !!city.lastNight, cells: known, best: best ? best.date : null, later: !known.length };
    }

    const forecastDates = [...new Set(Object.values(payload.weather || {}).flatMap(days => days.map(d => d.date)))].sort();
    const firstTripDay = formatLocalDate(start || addDays(env.today, 1));
    // С климатом сетка начинается с дня выезда; без него — с первого дня прогноза.
    const hasClimate = Object.keys(payload.climate || {}).length > 0;
    const gridFrom = hasClimate ? firstTripDay : (forecastDates.find(d => d >= firstTripDay) || forecastDates[0]);
    const gridStart = gridFrom ? parseLocalDate(gridFrom) : null;
    // Сетка «город × день» на неделю от `from`; для обратной дороги — города в обратном порядке.
    const weatherGrid = (from, back = false) => {
        const list = back ? weatherCities.slice().reverse() : weatherCities;
        const raw = from ? list.map(c => cityWeather(c, from, back)) : [];
        const headDates = [...new Set(raw.flatMap(g => g.cells.map(c => c.date.getTime())))].sort((a, b) => a - b).slice(0, 7);
        const head = headDates.map(t => ({ date: new Date(t) }));
        const rows = raw.map(g => ({ ...g, cells: headDates.map(t => g.cells.find(c => c.date.getTime() === t) || { date: new Date(t), t: null, score: null }) }))
            .filter(g => g.cells.some(c => c.t !== null));
        // Группы колонок шапки: подряд идущие дни прогноза и дни «обычно» (климат) —
        // над сеткой подписано, где кончается прогноз и начинаются средние.
        head.forEach((h, i) => {
            const known = rows.map(g => g.cells[i]).filter(c => c && c.t !== null);
            h.climate = known.length > 0 && known.every(c => c.climate);
            h.years = known.find(c => c.years)?.years || null;
        });
        const groups = [];
        head.forEach((h) => {
            const kind = h.climate ? 'climate' : 'forecast';
            const last = groups[groups.length - 1];
            if (last && last.kind === kind) {
                last.span++;
            } else {
                groups.push({ kind, span: 1, years: h.years });
            }
        });

        return { grid: rows, gridHead: head, gridGroups: groups };
    };
    const { grid, gridHead, gridGroups } = weatherGrid(gridStart);
    // Обратная дорога — своя неделя погоды, от дня выезда обратно (только при известной дате).
    const weatherBack = round && start ? { ...weatherGrid(backInfo.date, true), from: backInfo.date, to: addDays(tripEnd, nDrive) } : null;
    const gridBeforeTrip = !!(start && gridHead.length && gridHead[gridHead.length - 1].date < start);
    let weatherTip = null;
    const scored = grid.map(g => ({ g, sum: g.cells.reduce((a, c) => a + (c.score ?? 0), 0), n: g.cells.filter(c => c.score !== null).length })).filter(x => x.n);
    if (scored.length) {
        const bestCity = scored.sort((a, b) => b.sum / b.n - a.sum / a.n)[0].g;
        // «Финиш — лучший день» только про сам финиш и только если день приезда в сетке:
        // сетка — неделя от выезда, а до Кацюня 11 дней, и подсказка звала ехать в день старта.
        // Своего города погоды у финиша нет — ближайший к нему в пределах FIN_NEAR_KM, с честной
        // подписью «ближе всего к финишу» (у Кацюня погода была от Карека, подписанного финишем).
        const fin = grid.find(g => g.lastNight) || grid.filter(g => g.km >= total - FIN_NEAR_KM).pop() || null;
        const finOk = !!fin && fin.cells.some(c => c.pass);
        weatherTip = {
            city: bestCity.name, fin: finOk ? fin.name : null, finBest: finOk ? fin.best : null, finNear: finOk && !fin.lastNight, beforeTrip: gridBeforeTrip,
        };
    }

    // ---------- Погодное окно: с какой даты выезда погода по пути лучше ----------
    // ТОЛЬКО по прогнозу: климат — это «в среднем», по нему нельзя честно сказать, что
    // выезд 29.10 лучше 01.10. Поэтому перебираются даты выезда, при которых весь путь
    // (та же раскладка по дням с остановками) лежит внутри недели прогноза VanSky. День
    // оценивается по городам, которые проезжаем: был ли дождь плюс штраф за холод и жару.
    // Хоть один день без прогноза — дата не оценивается.
    function tripWeather(first) {
        let off = 0;
        let rain = 0;
        let penalty = 0;
        let temps = 0;
        let n = 0;
        for (const x of days) {
            const legs = [{ date: addDays(first, x.d - 1 + off), from: x.from, to: x.to }];
            for (let k = 1; k <= (x.stayN || 0); k++) {
                legs.push({ date: addDays(first, x.d - 1 + off + k), from: x.to, to: x.to });
            }
            for (const leg of legs) {
                const pts = weatherCities.filter(c => (leg.from === leg.to ? Math.abs(c.km - leg.to) < 1 : c.km >= leg.from && c.km <= leg.to));
                const cells = (pts.length ? pts : weatherCities.slice().sort((a, b) => Math.abs(a.km - leg.to) - Math.abs(b.km - leg.to)).slice(0, 1))
                    .map(c => cellAt(c, leg.date)).filter(c => c.forecast && c.t !== null);
                if (!cells.length) {
                    return null;
                }
                const dayRain = cells.reduce((sum, c) => sum + (['rain', 'storm', 'snow'].includes(c.sky) ? 1 : 0), 0) / cells.length;
                const dayT = cells.reduce((sum, c) => sum + c.t, 0) / cells.length;
                rain += dayRain;
                temps += dayT;
                penalty += Math.max(0, WINDOW_T_MIN - dayT, dayT - WINDOW_T_MAX) / 8;
                n++;
            }
            off += x.stayN || 0;
        }

        return n ? { date: first, iso: formatLocalDate(first), rainy: Math.round(rain), days: n, t: Math.round(temps / n), score: (rain + penalty) / n } : null;
    }
    let weatherWindow = null;
    if (weatherCities.length && days.length) {
        const candidates = Array.from({ length: WINDOW_DAYS }, (_, k) => tripWeather(addDays(env.today, k))).filter(Boolean);
        const best = candidates.reduce((a, b) => (!a || b.score < a.score - 1e-9 ? b : a), null);
        const current = start ? tripWeather(start) : null;
        if (best) {
            weatherWindow = {
                best,
                current,
                // Своя дата не хуже лучшей на «полдня дождя» — не дёргаем человека.
                isBest: !!current && (current.score - best.score < 0.08 || current.iso === best.iso),
                // Своя дата за пределами прогноза — сравнивать не с чем, подсказка молчит.
                outside: !!start && !current,
            };
        }
    }

    // ---------- Ходовые дни: погода ночёвки ----------
    // Своя погода ночёвки; нет прогноза по ней — ближайшего города погоды.
    const nightWeather = (own, km, date) => {
        const w = own?.slug && payload.weather?.[cityKey(own)]
            ? { c: own }
            : weatherCities.map(c => ({ c, dist: Math.abs(c.km - km) })).sort((a, b) => a.dist - b.dist)[0];
        const cell = w ? cityWeather(w.c, date).cells[0] : null;

        return cell && cell.t !== null ? cell : null;
    };
    days.forEach((x) => {
        x.w = nightWeather(x.last ? endCity : x.point, x.to, x.date);
        x.left = P(x.from);
        x.width = P(x.km);
        x.nightLeft = P(x.to);
    });
    const bestDay = days.filter(x => x.w && x.w.score !== null).reduce((a, b) => (!a || b.w.score > a.w.score ? b : a), null);
    days.forEach((x) => { x.best = x === bestDay; });

    // ---------- Лента: платные полосы и объекты ----------
    const tollBands = [];
    ranges.forEach((r, i) => {
        if (route.avoid_tolls) {
            return;
        }
        const items = tollsForVisit(r.cc, i);
        if (items.some(x => x.type === 'vignette')) {
            tollBands.push({ left: P(r.from_km), width: P(r.km), vignette: true, cc: r.cc });
        } else if (items.some(x => x.type === 'per_km' || x.type === 'section')) {
            // Точного положения платных участков у нас нет — показываем долю страны без места.
            tollBands.push({ left: P(r.from_km), width: P(r.km), vignette: false, partial: true, cc: r.cc });
        }
    });

    const ticks = [];
    const step = total > 3000 ? 500 : total > 1200 ? 250 : 100;
    for (let k = 0; k <= total; k += step) {
        ticks.push({ left: P(k), km: k });
    }

    // ---------- Главный алерт ----------
    let alert = null;
    const banned = cards.find(c => c.rows[1].banned);
    const restricted = cards.find(c => c.rows[0].restricted);
    const overCard = cards.find(c => c.pinch?.over);
    if (banned) {
        alert = { s: 'bad', key: 'ban', title: fmt.t('alert_ban_title', { plates: inputs.plates || '' }), text: banned.rows[1].lines[0], cc: banned.cc };
    } else if (restricted) {
        alert = { s: 'bad', key: 'restricted', title: fmt.t('alert_restricted_title', { country: restricted.name }), text: restricted.rows[0].lines[0], cc: restricted.cc };
    } else if (schengen?.over && travelers.length) {
        alert = { s: 'bad', key: 'schengen', title: fmt.t('alert_schengen_title', { total: schengen.total }), text: fmt.t('alert_schengen_text', { extra: fmt.days(schengen.total - 90) }) };
    } else if (overCard) {
        alert = { s: 'bad', key: 'over', title: fmt.t('alert_over_title', { country: overCard.name }), text: overCard.pinch.text, cc: overCard.cc };
    } else if (!travelers.length) {
        alert = { s: 'none', key: 'passport', soft: true, title: fmt.t('alert_passport_title'), text: fmt.t('alert_passport_text') };
    } else if (cards.some(c => c.rows[0].nodataPassport)) {
        const n = cards.filter(c => c.rows[0].nodataPassport);
        alert = { s: 'warn', key: 'nodata', soft: true, title: fmt.t('alert_nodata_title', { countries: n.map(c => c.name).join(', ') }), text: fmt.t('alert_nodata_text') };
    } else if (!start) {
        const pinched = cards.slice().reverse().find(c => c.pinch);
        alert = { s: 'warn', key: 'date', soft: true, title: pinched ? fmt.t('alert_diff_title', { country: pinched.name }) : fmt.t('alert_date_title'), text: pinched ? pinched.pinch.text : fmt.t('alert_date_text') };
    } else {
        // Главный срок — самый короткий запас по всей поездке: и ваш, и машины.
        const deadlines = cards.flatMap(c => [c.rows[0], c.rows[1]]
            .filter(row => row.until && row.margin !== undefined)
            .map(row => ({ card: c, until: row.until, margin: row.margin, car: row.key === 'car' })));
        const tightest = deadlines.sort((a, b) => a.margin - b.margin)[0];
        const tight = tightest && tightest.margin < DEADLINE_ALERT_DAYS ? tightest.card : null;
        if (tight) {
            const until = tightest.until;
            const margin = tightest.margin;
            alert = {
                s: margin !== undefined && margin < 7 ? 'bad' : 'warn', key: 'deadline', cal: true, until, cc: tight.cc,
                title: fmt.t('alert_deadline_title', { country: fmt.countryName(tight.cc), date: fmt.date(until) }),
                // Текст «узкого места» — только если оно про этот же срок, иначе — чей это срок.
                text: (tight.pinch?.until && tight.pinch.until.getTime() === until.getTime()
                    ? tight.pinch.text
                    : fmt.t(tightest.car ? 'alert_deadline_car' : 'alert_deadline_you'))
                    + ' ' + fmt.t('alert_margin', { days: fmt.days(Math.max(0, margin)) }),
            };
        }
    }

    // Участок маршрута закрыт на даты поездки (перевал, горная дорога) — это важнее мягких подсказок.
    const closedCard = cards.find(c => c.rows.find(x => x.key === 'notes')?.closed?.length);
    if ((!alert || alert.soft) && closedCard) {
        const item = closedCard.rows.find(x => x.key === 'notes').items.find(x => x.s === 'bad');
        alert = { s: 'bad', key: 'closed', title: fmt.t('alert_closed_title', { name: item.name }), text: item.flag, cc: closedCard.cc };
    }

    // Сроки далеко — наверх выходит условие въезда страны (visa_places.route_warnings).
    const warned = cards.find(c => c.warnings.length);
    if (!alert && warned) {
        alert = { s: 'warn', key: 'warning', title: fmt.t('alert_warning_title', { country: warned.name }), text: warned.warnings[0], cc: warned.cc };
    }

    // ---------- Чек-лист ----------
    // Пункт — только там, где он нужен: людям — в стране не их паспорта, машине — не её номеров.
    // Поездка по своей стране с её номерами не требует загранпаспорта, международных прав,
    // доверенности и документов на пересечение границы (Тверь — Новгород на RU/RU, 09.10.2026).
    // Номера не выбраны — машина считается из страны паспорта, если паспорт у всех один.
    const home = travelers.length && travelers.every(t => t === ranges[0].cc) ? ranges[0].cc : null;
    const uniq = arr => [...new Set(arr)];
    const allCc = uniq(ranges.map(r => r.cc));
    const abroad = travelers.length ? uniq(ranges.filter(r => travelers.some(t => t !== r.cc)).map(r => r.cc)) : allCc;
    const plateCc = inputs.plates || (travelers.length && travelers.every(t => t === travelers[0]) ? travelers[0] : null);
    const carAbroad = plateCc ? allCc.filter(cc => cc !== plateCc) : allCc;
    const groups = [];
    const docs = [];
    if (abroad.length) {
        docs.push(
            { id: 'passport', t: fmt.t('check_doc_passport'), c: abroad },
            { id: 'licence', t: fmt.t('check_doc_licence'), c: abroad },
        );
    }
    if (carAbroad.length) {
        docs.push(
            { id: 'registration', t: fmt.t('check_doc_registration'), c: carAbroad },
            { id: 'poa', t: fmt.t('check_doc_poa'), c: carAbroad },
        );
    }
    // Карнет — один пункт на все страны: документ один, оформляется заранее в автоклубе.
    const carnetIn = cards.filter(c => c.rows[1].carnet && !c.rows[1].banned).map(c => c.cc);
    if (carnetIn.length) {
        docs.push({ id: 'carnet', t: fmt.t('check_doc_carnet'), c: uniq(carnetIn), s: 'warn' });
    }
    if (!travelers.length) {
        docs.unshift({ id: 'pick', t: fmt.t('alert_passport_title'), c: [], s: 'none', hint: true });
    }
    // Шенген — одна виза на всю зону: пять задач «Виза: Германия», «Виза: Дания»… читались как
    // пять отдельных разрешений (фактчек 01.10.2026). Страны зоны — одной строкой.
    const visaCards = cards.filter(c => c.rows[0].big && c.rows[0].s === 'warn' && !c.rows[0].until);
    const schengenVisa = visaCards.filter(c => SCHENGEN_MEMBERS.has(c.cc));
    visaCards.filter(c => !SCHENGEN_MEMBERS.has(c.cc)).forEach((c) => {
        docs.unshift({ id: `visa-${c.cc}`, t: fmt.t('check_doc_visa', { country: c.name }), c: [c.cc], s: 'warn' });
    });
    if (schengenVisa.length) {
        docs.unshift({ id: 'visa-schengen', t: fmt.t('check_doc_visa', { country: fmt.t('plan_zone_schengen') }), c: uniq(schengenVisa.map(c => c.cc)), s: 'warn' });
    }
    if (inputs.kids && abroad.length) {
        docs.push({ id: 'kids', t: fmt.t('check_doc_kids'), c: abroad, s: 'warn' });
    }
    if (inputs.pets && abroad.length) {
        docs.push({ id: 'pets', t: fmt.t('check_doc_pets'), c: abroad, s: 'warn' });
        // Въезд в Шенген извне — по дороге туда или обратно. Кто выезжает из ЕС и возвращается,
        // делает тест до выезда; кто едет в ЕС впервые — за три месяца до въезда.
        const intoEu = [...borders, ...borders.map(b => b.back).filter(Boolean)]
            .find(b => zoneOf(b.from) !== 'SCHENGEN' && zoneOf(b.to) === 'SCHENGEN');
        if (intoEu) {
            const fromEu = zoneOf(ranges[0].cc) === 'SCHENGEN';
            docs.push({ id: 'titer', t: fmt.t(fromEu ? 'check_doc_titer_return' : 'check_doc_titer'), c: [intoEu.to], s: 'bad' });
        }
    }
    groups.push({ id: 'docs', icon: 'document-text', items: docs });

    const ahead = cards.filter(c => c.rows[2].vignette).map(c => ({
        id: `vg-${c.cc}`, s: 'toll', c: [c.cc], link: c.rows[2].vignette.buyUrl,
        t: fmt.t(c.rows[2].vignette.again ? 'check_buy_vignette_two' : 'check_buy_vignette', { country: c.name, price: fmt.money(c.rows[2].vignette.eur) }),
    }));
    if (inputs.kids) {
        // Кресло обязательно и дома: правило про рост ребёнка, а не про границу.
        ahead.push({ id: 'seat', s: 'warn', c: allCc, t: fmt.t('check_child_seat') });
    }
    // Переходники — для чужих заправок: дома пистолет подходит к своему штуцеру.
    if (fuelKey === 'lpg' && carAbroad.length) {
        ahead.push({ id: 'lpg', s: 'warn', c: carAbroad, t: fmt.t('check_lpg_adapters') });
    }
    // Зима на даты поездки: шины и цепи — купить заранее, шипы — где запрещены.
    const winterOf = c => c.rows.find(x => x.key === 'winter');
    const tyresIn = cards.filter(c => winterOf(c)?.tyresNeeded).map(c => c.cc);
    if (tyresIn.length) {
        ahead.push({ id: 'winter-tyres', s: 'warn', c: uniq(tyresIn), t: fmt.t('check_winter_tyres') });
    }
    const chainsIn = cards.filter(c => winterOf(c)?.chains && winterOf(c)?.active).map(c => c.cc);
    if (chainsIn.length) {
        ahead.push({ id: 'winter-chains', s: 'warn', c: uniq(chainsIn), t: fmt.t('check_winter_chains') });
    }
    const studsNo = cards.filter(c => winterOf(c)?.studsBanned && (winterOf(c)?.active || tyresIn.length)).map(c => c.cc);
    if (studsNo.length) {
        ahead.push({ id: 'winter-studs', s: 'warn', c: uniq(studsNo), t: fmt.t('check_winter_studs') });
    }
    borders.forEach((b, i) => {
        if (!b.ferry?.slug) {
            return;
        }
        ahead.push({ id: `ferry-${i}-${b.ferry.slug}`, s: 'toll', c: [b.from, b.to],
            t: fmt.t('check_ferry_ticket', { name: b.ferry.name, price: b.ferry.price }) + (b.ferry.checkin_min ? '; ' + fmt.t('ferry_checkin', { min: b.ferry.checkin_min }) : ''), url: b.ferry.buy_url });
        if (b.ferry.tip) {
            ahead.push({ id: `ferry-tip-${i}`, s: 'toll', c: [b.from, b.to], t: b.ferry.tip });
        }
    });
    // Экозоны Германии у маршрута — наклейку покупают заранее, на границе её не продают.
    cards.filter(c => c.rows.find(x => x.key === 'urban' && x.kind === 'sticker' && x.near.length)).forEach((c) => {
        ahead.push({ id: `umwelt-${c.cc}`, s: 'warn', c: [c.cc], t: fmt.t('check_umwelt', { country: c.name }) });
    });
    groups.push({ id: 'ahead', icon: 'shopping-cart', items: ahead });

    const atBorder = cards.filter(c => c.rows[1].buyIns).map(c => ({
        id: `ins-${c.cc}`, s: 'warn', c: [c.cc], t: fmt.t('check_insurance', { country: c.name }), where: c.entryName,
    }));
    groups.push({ id: 'border', icon: 'border', items: atBorder });

    const fill = cards.filter(c => c.rows[3].tip?.s === 'ok').map(c => ({ id: `f-${c.cc}`, s: 'ok', c: [c.cc], t: c.rows[3].tip.t }));
    groups.push({ id: 'fuel', icon: 'fuel', items: fill });

    // ---------- Высота над уровнем моря ----------
    // Место и высота — с сервера (road.peaks): расчёт ORS, тот же, что «Высшая точка» на
    // карте; где ORS маршрут не разметил — рельеф (RouteElevation).
    const peaks = [];
    (route.road?.peaks || [])
        .filter(p => p.m >= PEAK_MIN_M)
        .map(p => ({ m: p.m, lat: p.lat, km: kmOnLine(route.preview, total, p.lat, p.lng) }))
        .sort((a, b) => b.m - a.m)
        .forEach((p) => {
            if (peaks.length < PEAKS_MAX && peaks.every(q => Math.abs(q.km - p.km) >= total * PEAK_GAP_SHARE)) {
                peaks.push({ ...p, left: P(p.km), cc: rangeAt(p.km)?.cc });
            }
        });
    // Что высота значит для человека и машины — в «Важно» чек-листа.
    const altitude = [];
    const topPeak = peaks[0] || null;
    if (topPeak && topPeak.m >= ALT_SICK_M) {
        altitude.push({ id: 'alt-sick', s: 'bad', c: uniq(peaks.filter(p => p.m >= ALT_SICK_M).map(p => p.cc)), t: fmt.t('check_alt_sick', { m: topPeak.m }) });
    }
    if (topPeak && topPeak.m >= ALT_HEATER_M) {
        altitude.push({ id: 'alt-heater', s: 'warn', c: uniq(peaks.filter(p => p.m >= ALT_HEATER_M).map(p => p.cc)), t: fmt.t('check_alt_heater', { m: topPeak.m }) });
    }
    // Холодный сезон на дату проезда перевала: октябрь–май на севере, апрель–ноябрь на юге.
    const coldAt = (p) => {
        const month = dayOf(p.km).date.getMonth() + 1;

        return p.lat >= 0 ? (month >= 10 || month <= 5) : (month >= 4 && month <= 11);
    };
    const snowy = start ? peaks.filter(p => p.m >= ALT_SNOW_M && coldAt(p)) : [];
    if (snowy.length) {
        altitude.push({ id: 'alt-snow', s: 'warn', c: uniq(snowy.map(p => p.cc)), t: fmt.t('check_alt_snow', { m: snowy[0].m }) });
    }
    days.filter(x => x.ele >= ALT_NIGHT_M).forEach(x => altitude.push({
        id: `alt-night-${x.d}`, s: 'warn', c: [x.cc], t: fmt.t('check_alt_night', { city: x.stayCity || x.city, m: x.ele }),
    }));

    const attention = [];
    if (banned) {
        attention.push({ id: 'ban', s: 'bad', tag: 'ban', c: cards.filter(c => c.rows[1].banned).map(c => c.cc), t: alert.title });
    }
    cards.filter(c => c.pinch?.over).forEach(c => attention.push({ id: `over-${c.cc}`, s: 'bad', c: [c.cc], t: c.pinch.text }));
    if (alert?.cal) {
        attention.push({ id: 'deadline', s: alert.s, c: [alert.cc], t: alert.title });
    }
    cards.forEach(c => c.warnings.forEach((w, k) => attention.push({ id: `warn-${c.cc}-${k}`, s: 'warn', c: [c.cc], t: `${c.name}: ${w}` })));
    // Особенности дорог: участок закрыт на даты поездки или ограничен по габаритам — проверить заранее.
    cards.forEach(c => (c.rows.find(x => x.key === 'notes')?.items || []).filter(x => x.s === 'bad' || x.limits).forEach(x => attention.push({
        id: `note-${x.id}`, s: x.s === 'bad' ? 'bad' : 'warn', c: [c.cc], t: `${x.name}: ${x.s === 'bad' ? x.flag : x.limits}`,
    })));
    cards.forEach(c => c.rows.find(r => r.key === 'news').news.filter(n => n.severity === 'bad').slice(0, 1)
        .forEach(n => attention.push({ id: `n-${c.cc}`, s: n.severity, tag: 'news', c: [c.cc], t: n.title, url: n.url })));
    attention.push(...altitude);
    // Ночёвка в городе с ZTL: к отелю или стоянке в центре — только в часы, когда зона открыта.
    cards.forEach(c => (c.rows.find(x => x.key === 'urban' && x.kind === 'ztl')?.items || []).filter(z => z.night).forEach(z => attention.push({
        id: `ztl-${c.cc}-${z.name}`, s: 'warn', c: [c.cc], t: fmt.t('check_ztl_night', { city: z.name, hours: z.hours || '' }),
    })));
    // Часы за рулём — только дорога: очередь и досмотр на границах в план по дням не входят.
    const controlled = borders.filter(b => !b.ferry && !innerSchengen(b.from, b.to));
    if (controlled.length) {
        attention.push({ id: 'border-time', s: 'warn', c: uniq(controlled.map(b => b.to)), t: fmt.t('check_border_time', { n: controlled.length * (round ? 2 : 1) }) });
    }
    groups.push({ id: 'attention', icon: 'exclamation-triangle', items: attention });
    groups.forEach((g) => {
        g.count = g.items.filter(x => !x.none && !x.hint).length;
        g.items.forEach((x) => { x.s = x.s || 'ok'; });
    });
    // Пустая группа не показывается вовсе: «виньетки не нужны», «на границе покупать
    // нечего» — это не дело в чек-листе, а место и внимание читателя.
    const shownGroups = groups.filter(g => g.items.length);

    // ---------- Бюджет ----------
    const budget = cards.map((c) => {
        const fuelE = c.rows[3].costEur;
        const ferryInside = c.rows[2].ferrySum || 0;
        const toll = (c.rows[2].tollSum || 0) - ferryInside;
        const vg = c.rows[2].vignette ? (c.rows[2].vignette.eur || 0) : 0;

        const ferry = (c.border?.ferry?.eur || 0) * roundK + ferryInside;
        // Сборы из «Особенностей дорог»: нацпарки, RUC Новой Зеландии, пошлина Исландии.
        const fees = c.rows.find(x => x.key === 'notes')?.feeEur || 0;

        return { cc: c.cc, name: c.name, km: c.km, fuel: fuelE, toll, vg, ferry, fees, total: (fuelE || 0) + toll + vg + ferry + fees, fuelUnknown: fuelE === null };
    });
    const sum = k => budget.reduce((a, b) => a + (b[k] || 0), 0);
    const totals = {
        fuel: sum('fuel'), toll: sum('toll'), vg: sum('vg'), ferry: sum('ferry'), fees: sum('fees'), total: sum('total'), fuelUnknown: budget.some(b => b.fuelUnknown),
        // Страны, где про платные дороги данных нет: в итог они вошли нулём — бюджет говорит об этом.
        roadsUnknown: cards.filter(c => c.rows.find(x => x.key === 'roads')?.mode === 'unknown').map(c => c.name),
    };

    // ---------- Ленты: дорога туда и дорога обратно ----------
    // Обратная лента — зеркало: те же страны, границы и ночёвки в обратном порядке,
    // километры — от финиша. Между лентами страница ставит остановку на финише (turn).
    const segments = ranges.map(r => ({ ...r, left: P(r.from_km), width: P(r.km), transit: r.km < TRANSIT_KM }));
    // Расходы под лентой — за одну дорогу: топливо и платные дороги в бюджете удвоены,
    // виньетка «туда» — первая, «обратно» — вторая, если первая к тому дню истекла.
    const laneBudget = back => budget.map((b, i) => {
        const vg = cards[i].rows[2].vignette;

        return {
            ...b,
            fuel: b.fuel === null ? null : (back ? cards[i].rows[3].back?.costEur ?? b.fuel : cards[i].rows[3].costThere ?? b.fuel),
            toll: b.toll / roundK,
            ferry: b.ferry / roundK,
            vg: back ? (vg?.again?.eur || 0) : (vg?.again ? vg.enough?.eur || 0 : b.vg),
        };
    });
    const lanes = [{ key: 'there', from: days[0].date, to: days[days.length - 1].date, segments, borders, ticks, tollBands, days, stops, peaks, budget: laneBudget(false) }];
    let turn = null;
    if (round) {
        const mirror = km => total - km;
        const lastRange = ranges[ranges.length - 1];
        turn = {
            cc: lastRange.cc, name: lastRange.name, city: endName, stay: days[days.length - 1].stayN || 0,
            days: presence[lastRange.key].planned, from: presence[lastRange.key].entry, to: presence[lastRange.key].exit,
        };
        lanes.push({
            key: 'back', from: addDays(tripEnd, 1), to: addDays(tripEnd, nDrive),
            segments: segments.slice().reverse().map(x => ({ ...x, key: `${x.key}:b`, left: P(mirror(x.to_km)) })),
            borders: borders.slice().reverse().map(b => ({ ...b, ...b.back, km: mirror(b.km), left: P(mirror(b.km)) })),
            ticks,
            tollBands: tollBands.slice().reverse().map(x => ({ ...x, left: `${100 - parseFloat(x.left) - parseFloat(x.width)}%` })),
            stops: [],
            peaks: peaks.map(p => ({ ...p, km: mirror(p.km), left: P(mirror(p.km)) })),
            // День обратно кончается там, где день туда начинался: у предыдущей ночёвки или дома.
            days: days.slice().reverse().map((x, k) => {
                const night = x.d > 1 ? days[x.d - 2] : null;
                const date = backDate(x);

                return {
                    d: nDrive + k + 1, from: mirror(x.to), to: mirror(x.from), km: x.km, date,
                    city: night ? night.city : startName, cc: night ? night.cc : ranges[0].cc,
                    last: !night, stayN: 0, best: false, ele: (night ? night.ele : startCity?.ele) ?? null,
                    w: nightWeather(night ? night.point : startCity, x.from, date),
                    left: P(mirror(x.to)), width: P(x.km), nightLeft: P(mirror(x.from)),
                };
            }),
            budget: laneBudget(true).reverse(),
        });
    }

    // ---------- Сроки: вы и машина ----------
    // Сводка, а не таблица по всем странам (основания и подробности — в карточках стран):
    //  • страна, где крайнего дня нет ни у человека, ни у машины, в список не идёт;
    //  • сторона без крайнего дня пишется «без срока», а не своим основанием — иначе
    //    «виза не нужна» и «ВНЖ — без ограничений» не сливались бы в одну строку;
    //  • страны с одинаковым ответом — одной строкой с флагами; в зоне с общим счётчиком
    //    (Шенген) день выезда один на всех, показываем самый ранний.
    const terms = [];
    cards.filter(c => c.cc !== home).forEach((c) => {
        const [you, car] = c.rows;
        if (you.free && car.free) {
            return;
        }
        const zone = legFor(c.cc)?.zone || '';
        const youText = you.free ? fmt.t('terms_no_limit') : (you.big || '—');
        const carText = car.free ? fmt.t('terms_no_limit') : (car.big || '—');
        const youBad = !!you.over;
        const carBad = !!car.over || !!car.banned;
        const side = (until, text) => (until ? (zone ? 'date' : `d${+until}`) : `t${text}`);
        const key = [zone, side(you.until, youText), side(car.until, carText), youBad, carBad].join('|');
        let row = terms.find(x => x.group === key);
        if (!row) {
            row = { group: key, cc: c.cc, ccs: [], names: [], youUntil: null, carUntil: null, youText, carText, youBad, carBad, youFree: !!you.free, carFree: !!car.free };
            terms.push(row);
        }
        row.ccs.push(c.cc);
        row.names.push(c.name);
        const earliest = (a, b) => (a && b ? (a < b ? a : b) : (a || b || null));
        row.youUntil = earliest(row.youUntil, you.until);
        row.carUntil = earliest(row.carUntil, car.until);
    });
    terms.forEach((row) => {
        row.key = row.ccs.join('-');
        row.you = row.youUntil ? fmt.date(row.youUntil) : row.youText;
        row.car = row.carUntil ? fmt.date(row.carUntil) : row.carText;
    });

    // ---------- Зоны плана: страны с общим счётчиком (Шенген) ----------
    // Плитки стран идут в порядке маршрута, а у зоны над ними одна строка: общий статус
    // и переключатель «все транзит / везде остаюсь».
    const planZones = [];
    plan.forEach((p) => {
        if (!p.zoneCode) {
            return;
        }
        let zone = planZones.find(z => z.code === p.zoneCode);
        if (!zone) {
            zone = { code: p.zoneCode, items: [] };
            planZones.push(zone);
        }
        zone.items.push(p);
    });
    planZones.forEach((z) => {
        const movable = z.items.filter(p => !p.isStart);
        z.movable = movable;
        z.km = z.items.reduce((sum, p) => sum + p.km, 0);
        z.nStay = movable.filter(p => p.stay).length;
        z.allStay = movable.length > 0 && z.nStay === movable.length;
    });

    return {
        planZones, peaks,
        total, totalH, nDrive, tripDays: tripDays + (round ? nDrive : 0), stayTotal: offset, hpd, startName, endName, start, round,
        // Обратная дорога: первый и последний её день (null — поездка в одну сторону).
        back: round ? { from: addDays(tripEnd, 1), to: addDays(tripEnd, nDrive) } : null,
        segments, lanes, turn, backInfo, weatherBack,
        // Топливо посчитано с поправкой на темп цен — бюджет говорит об этом.
        fuelTrend: cards.some(c => c.rows[3].trend),
        sights, stops, stopsH, detour,
        borders, tollBands, ticks, days, bestDay, plan, schengen, cards, grid, gridHead, gridGroups, gridBeforeTrip, weatherTip, weatherWindow,
        // Неделя в стране финиша: где комфортно и чего избегать — считает сервер (RoadbookPayload::destinationWeather)
        destWeather: payload.destWeather || null,
        needsPrior: !!schengen || plan.some(x => x.canPrior),
        alert, groups: shownGroups, budget, totals, terms,
        end: round ? addDays(tripEnd, nDrive) : tripEnd,
    };
}

/**
 * Проекция ломаной маршрута в SVG. Страны окрашиваются по километрам из скелета:
 * у упрощённой линии своя длина, поэтому километры пересчитываются пропорцией.
 */
export function buildMap(route, width = 600, pad = 28) {
    const pts = route.preview || [];
    if (pts.length < 2) {
        return null;
    }
    const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const kx = Math.cos(lat0 * Math.PI / 180);
    const xs = pts.map(p => p[0] * kx);
    const ys = pts.map(p => -p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = (width - pad * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
    const height = Math.round((maxY - minY) * scale + pad * 2);
    const X = lng => +(pad + (lng * kx - minX) * scale).toFixed(1);
    const Y = lat => +(pad + (-lat - minY) * scale).toFixed(1);

    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
        const dx = (pts[i][0] - pts[i - 1][0]) * kx;
        const dy = pts[i][1] - pts[i - 1][1];
        cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    const k = (route.distance_km || 1) / (cum[cum.length - 1] || 1);
    const kmAt = i => cum[i] * k;

    const segs = (route.countries || []).map((c, index) => {
        const inside = pts.filter((_, i) => kmAt(i) >= c.from_km - 1 && kmAt(i) <= c.to_km + 1);

        return { cc: c.cc, index, d: inside.length > 1 ? 'M' + inside.map(p => `${X(p[0])} ${Y(p[1])}`).join(' L') : '' };
    });

    return { width, height, X, Y, segs, viewBox: `0 0 ${width} ${height}` };
}
