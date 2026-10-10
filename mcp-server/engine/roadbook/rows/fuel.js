/**
 * Строка «Топливо» карточки страны. Вынесено из buildPlan (рефакторинг 02.10.2026).
 */
import { segmentLiters, segmentCostEur } from '../../fuel-calc-core.js';
import { DAY, FUEL_TREND_WEEKS, FUEL_TREND_MIN, FUEL_TREND_MAX, FUEL_TREND_SHOW } from '../plan/util.js';

/** Цена в следующей стране дороже на столько процентов — стоит залить полный бак. */
const FILL_TIP_PCT = 8;

/**
 * Строка «Топливо»: цена литра выбранного топлива, литры и деньги на участке страны с поправкой
 * на темп цен к дню проезда, совет «залить полный бак до границы».
 */
export function fuelRow(ctx) {
    const { ranges, i, r, priceEur, cons, roundK, payload, fuelKey, env, p, round, backInfo, tank, fmt } = ctx;
    const next = ranges[i + 1];
    const price = priceEur(r.cc);
    const nextPrice = next ? priceEur(next.cc) : null;
    const diff = price && nextPrice ? Math.round((nextPrice / price - 1) * 100) : 0;
    const liters = cons ? segmentLiters(r.km * roundK, cons) : null;
    const fuel = payload.countries[r.cc]?.fuel;
    // Цена «сегодня», а едут позже: каждая дорога считается с поправкой на темп цен к её дню.
    const litersOne = cons ? segmentLiters(r.km, cons) : null;
    const trend = fuel?.trend?.[fuelKey] || null;
    const fuelAt = (when) => {
        const ahead = Math.max(0, (when - env.today) / (7 * DAY));
        const raw = trend ? Math.min(FUEL_TREND_MAX, Math.max(FUEL_TREND_MIN, 1 + trend.weekly * Math.min(ahead, FUEL_TREND_WEEKS))) : 1;
        const k = Math.abs(raw - 1) >= FUEL_TREND_SHOW && ahead >= 1 ? raw : 1;

        return { k, pct: Math.round((k - 1) * 100), ahead: Math.round(ahead), costEur: price && litersOne !== null ? segmentCostEur(litersOne, price * k) : null };
    };
    const fuelThere = fuelAt(p.entry);
    const fuelBack = round ? fuelAt(p.back ? p.back.entry : backInfo.date) : null;
    const costEur = fuelThere.costEur === null ? null : fuelThere.costEur + (fuelBack ? fuelBack.costEur : 0);
    const signed = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    const trendParts = [
        fuelThere.pct ? fmt.t(round ? 'fuel_trend_there' : 'fuel_trend_trip', { ahead: fuelThere.ahead, pct: signed(fuelThere.pct) }) : null,
        fuelBack?.pct ? fmt.t('fuel_trend_back', { ahead: fuelBack.ahead, pct: signed(fuelBack.pct) }) : null,
    ].filter(Boolean);
    const trendLine = trendParts.length && costEur !== null
        ? fmt.t(trend.weekly > 0 ? 'fuel_trend_up' : 'fuel_trend_down', {
            weeks: Math.round(trend.weeks), weekly: fmt.num(Math.round(Math.abs(trend.weekly) * 1000) / 10), parts: trendParts.join(', '),
        })
        : null;
    let tip = null;
    if (next && price && nextPrice && diff >= FILL_TIP_PCT) {
        tip = { s: 'ok', t: tank
            ? fmt.t('fuel_fill_here', { country: fmt.countryIn(next.cc), pct: diff, liters: Math.max(0, tank - 10) })
            : fmt.t('fuel_fill_here_nol', { country: fmt.countryIn(next.cc), pct: diff }) };
    } else if (next && price && nextPrice && diff <= -FILL_TIP_PCT) {
        tip = { s: 'warn', t: fmt.t('fuel_fill_min', { country: fmt.countryIn(next.cc), pct: -diff }) };
    }
    return {
        key: 'fuel',
        s: !fuelKey || price === null ? 'none' : tip ? tip.s : 'ok',
        local: fuelKey ? fuel?.prices?.[fuelKey] ?? null : null, localCurrency: (fuelKey && fuel?.currencies?.[fuelKey]) || fuel?.currency || null, price,
        lines: !fuelKey ? [fmt.t('fuel_pick_type')]
            : price === null ? [fmt.t('fuel_no_price')]
                : liters === null ? [fmt.t('fuel_pick_cons')]
                    : [
                        fmt.t('fuel_need', { liters: Math.round(liters), km: r.km * roundK }),
                        ...(trendLine ? [trendLine] : []),
                        // Страна в «приблизительных ценах» — та же оговорка, что на странице цен топлива.
                        ...(fuel?.approx ? [fmt.t('fuel_approx')] : []),
                        // LPG за кг (Таиланд и др.): цена за литр — по плотности, приблизительно.
                        ...(fuel?.per_kg?.includes(fuelKey) ? [fmt.t('fuel_lpg_per_kg')] : []),
                    ],
        tip, cmp: next && price && nextPrice ? { cc: next.cc, diff } : null, costEur, liters,
        // Расход по дорогам — каждая с поправкой на темп цен к своему дню.
        costThere: fuelThere.costEur, back: fuelBack, trend: !!trendLine,
        // Во сколько раз расход в стране больше, чем «литры × сегодняшняя цена» (для суммы в местной валюте).
        costK: fuelBack ? (fuelThere.k + fuelBack.k) / 2 : fuelThere.k,
        // Цены топлива страны — кнопка «все цены»; ссылка из пакета (RoadbookPayload::countryLinks)
        url: fuel ? payload.countryLinks?.[r.cc]?.fuel || null : null,
    };;
}
