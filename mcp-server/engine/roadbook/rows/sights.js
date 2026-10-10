/**
 * «По пути»: время на заезд по типу места и лучшие места страны.
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */

/**
 * «По пути»: сколько обычно проводят на месте, мин — прибавляется к крюку, когда
 * человек нажал «Заехать». Смотровая — постоять и сфотографировать, музей — надолго.
 */
export const SIGHT_VISIT_MIN = {
    view: 20, pass: 15, lighthouse: 20, church: 30, mosque: 30, monument: 30, waterfall: 30, lake: 30,
    monastery: 45, ruins: 45, beach: 45, glacier: 45, canyon: 45, sight: 45,
    castle: 60, cave: 60, town: 60, park: 60, museum: 90,
};

/** В карточке страны — не больше стольких мест; остальное в шторке «Все места». */
export const SIGHTS_PER_COUNTRY = 5;

/**
 * Прибавка к рейтингу места, у которого название и текст есть на языке страницы.
 * На ru/pt/tr у половины мест базы их нет (название английское, описания нет) —
 * в пятёрку страны сначала идут те, что человек сможет прочитать. +6 ≈ в 1,8 раза
 * больше Википедий; мировую знаменитость без перевода это не вытеснит.
 */
const SIGHT_LOCAL_BONUS = 6;

/** Два места ближе этого — одно и то же для человека за рулём (дворец и площадь перед ним). */
const SIGHT_SAME_SPOT_KM = 1.5;

export const sightVisitMin = kind => SIGHT_VISIT_MIN[kind] ?? 45;

/**
 * Лучшие места страны для карточки: выбранные человеком — первыми, дальше по рейтингу,
 * без двух мест в одной точке и не больше двух одного вида (пять соборов подряд — не выбор).
 */
export function topSights(list, limit = SIGHTS_PER_COUNTRY) {
    const picked = [];
    const perKind = {};
    const near = (a, b) => Math.hypot((a.lng - b.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180), (a.lat - b.lat) * 110.57) < SIGHT_SAME_SPOT_KM;
    const rank = s => s.score + (s.local ? SIGHT_LOCAL_BONUS : 0);
    const ordered = list.slice().sort((a, b) => (b.chosen - a.chosen) || (rank(b) - rank(a)));
    for (const s of ordered) {
        if (picked.length >= limit) {
            break;
        }
        if (!s.chosen && ((perKind[s.kind] || 0) >= 2 || picked.some(p => near(p, s)))) {
            continue;
        }
        picked.push(s);
        perKind[s.kind] = (perKind[s.kind] || 0) + 1;
    }

    return picked.sort((a, b) => a.km - b.km);
}
