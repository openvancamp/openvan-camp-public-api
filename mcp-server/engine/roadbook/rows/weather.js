/**
 * Погода роудбука: иконка неба по коду прогноза, климат «обычно в это время» по неделям.
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */
import { DAY } from '../plan/util.js';

/**
 * Температура дня из недельных медиан — плавно между серединами соседних недель,
 * иначе шесть дней подряд показывают одно число, а на стыке недель — скачок.
 */
export function climateTemps(weeks, date) {
    const doy = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / DAY;
    const pos = Math.max(0, Math.min(52, (doy - 3) / 7));
    const a = weeks[Math.floor(pos)];
    const b = weeks[Math.min(52, Math.floor(pos) + 1)];
    const k = pos - Math.floor(pos);
    const mix = i => (a?.[i] === null || a?.[i] === undefined ? null
        : b?.[i] === null || b?.[i] === undefined ? a[i] : Math.round(a[i] + (b[i] - a[i]) * k));

    return [mix(0), mix(1)];
}

/**
 * Небо дня прогноза: код «морось/дождь» при осадках меньше миллиметра — это
 * пасмурный день, а не дождливый (то же правило, что у климата в CityClimateService).
 */
export function forecastSky(code, precip) {
    const sky = skyOf(code);
    if ((sky === 'rain' || sky === 'snow' || sky === 'storm') && precip !== null && precip !== undefined && Number(precip) < 1) {
        return 'overcast';
    }

    return sky;
}

/** Небо по коду погоды WMO — те же группы, что CityClimateService::sky(). */
export function skyOf(code) {
    if (code === null || code === undefined) {
        return null;
    }
    if (code >= 95) {
        return 'storm';
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return 'snow';
    }
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        return 'rain';
    }
    if (code === 3 || code === 45 || code === 48) {
        return 'overcast';
    }

    return code === 2 ? 'cloud' : 'sun';
}
