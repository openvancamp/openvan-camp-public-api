/**
 * VanLife — единый движок визового счётчика дней (чистая математика).
 *
 * До 21.08.2026 один и тот же алгоритм жил тремя копиями в шаблонах
 * turkey-/europe-/russia-visa-calculator.blade.php (~700 строк JS каждая).
 * Копии разошлись: турецкая умела лимит «подряд», европейская — нет, а
 * российская вообще не спрашивала /api/visa/check и показывала зашитые
 * 90 дней любому паспорту (белорусу — вместо безлимита, американцу —
 * вместо «нужна виза»). Здесь одна реализация на все направления.
 *
 * Здесь только чистые функции без DOM и хранилища: журнал поездок живёт в
 * visa-journey.js, Alpine-обвязка — в visa-calculator-component.js.
 *
 * 🔴 Единственный источник правды для счётчика дней на сайте.
 *    Правила пребывания приходят из App\Services\Visa\VisaService через
 *    GET /api/visa/check — сюда их НЕ дублировать и не хардкодить.
 *
 * Поддержаны все четыре типа окна, которые отдаёт VisaService:
 *   rolling       — скользящее окно windowDays (Шенген 90/180, Турция 90/180)
 *   calendar_year — сброс 1 января (Россия 90/год)
 *   per_entry     — срок на каждый въезд заново, дни не суммируются
 *   unlimited     — ограничения по дням нет (свобода передвижения, свой паспорт)
 * Неподтверждённое окно VisaService отдаёт как per_entry — это его решение,
 * здесь оно просто исполняется.
 */

export const WINDOW_ROLLING = 'rolling';
export const WINDOW_CALENDAR_YEAR = 'calendar_year';
export const WINDOW_PER_ENTRY = 'per_entry';
export const WINDOW_UNLIMITED = 'unlimited';

/** Режимы въезда, при которых считать нечего (зеркало VisaService::NO_COUNTER). */
export const NO_COUNTER_MODES = ['visa_required', 'e_visa', 'eta', 'voa', 'no_admission'];

/** Потолок итераций на один визит — защита от зацикливания на битой дате. */
const MAX_VISIT_DAYS = 365;

/**
 * new Date('YYYY-MM-DD') парсит как UTC-полночь; сравнение с локальной
 * полуночью молча сдвигает результат на смещение часового пояса — «сегодня»
 * перестаёт считаться использованным днём в зонах с положительным offset.
 * Все конверсии строка <-> Date идут только через эти две функции.
 */
export function parseLocalDate(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Разница в КАЛЕНДАРНЫХ днях между двумя датами.
 *
 * Нельзя делить разницу миллисекунд на 86 400 000: в ночь перехода на летнее
 * время в сутках 23 часа, и floor() съедает день. На интервале «10 января →
 * 9 апреля» это давало 89 вместо 90, и последний разрешённый день уезжал на
 * сутки вперёд — а для машины в Грузии (90 дней) сутки это штраф на границе.
 * Приводим обе даты к UTC-полуночи их локального Y/M/D — часовой пояс уходит.
 */
export function daysBetween(from, to) {
    const index = (date) => Math.floor(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
    );

    return index(to) - index(from);
}

export function isValidDateString(dateStr) {
    if (!dateStr || String(dateStr).length !== 10) return false;
    const date = parseLocalDate(dateStr);
    if (isNaN(date.getTime())) return false;
    const year = date.getFullYear();

    return year >= 2020 && year <= 2035;
}

/** Предел симуляции вперёд, дней — с запасом больше года (как _HORIZON в боте). */
const HORIZON = 800;

/**
 * Множество занятых дней заезда, не позже cap.
 *
 * exit === null означает «ещё внутри»: открытый заезд обрезаем датой cap.
 * Это модель журнала из @FAQVanBot — человек отмечает въезд, а выезд появляется
 * позже; требовать обе даты сразу значит заставлять придумывать дату выезда.
 */
export function expandTrip(entry, exit, cap) {
    const days = new Set();

    if (!isValidDateString(entry)) {
        return days;
    }

    const from = parseLocalDate(entry);
    let to = exit && isValidDateString(exit) ? parseLocalDate(exit) : new Date(cap);

    if (to > cap) {
        to = new Date(cap);
    }
    if (to < from) {
        return days;
    }

    const current = new Date(from);
    let iterations = 0;

    while (current <= to && iterations < HORIZON) {
        days.add(formatLocalDate(current));
        current.setDate(current.getDate() + 1);
        iterations++;
    }

    return days;
}

/** Длительность заезда в днях; день въезда и день выезда — полные дни. */
export function visitDays(visit, today = new Date()) {
    return expandTrip(visit?.entry, visit?.exit, today).size;
}

/** Заезд, покрывающий дату on (человек внутри страны на эту дату). */
export function currentTrip(trips, on) {
    return trips.find(trip => {
        if (!isValidDateString(trip.entry)) {
            return false;
        }

        const entry = parseLocalDate(trip.entry);
        const exit = trip.exit && isValidDateString(trip.exit) ? parseLocalDate(trip.exit) : on;

        return entry <= on && on <= exit;
    }) ?? null;
}

/**
 * Начало окна подсчёта для даты проверки. null — окно не ограничивает
 * (per_entry считается отдельно, unlimited не считается вовсе).
 */
export function windowStartFor(checkDate, window, windowDays) {
    if (window === WINDOW_CALENDAR_YEAR) {
        return new Date(checkDate.getFullYear(), 0, 1);
    }

    if (window === WINDOW_ROLLING) {
        const start = new Date(checkDate);
        start.setDate(start.getDate() - ((windowDays || 180) - 1));

        return start;
    }

    return null;
}

/**
 * Множество использованных дней (ISO-строки) на дату проверки.
 *
 * Множество, а не сумма: заезды могут пересекаться (человек ввёл накладывающиеся
 * поездки, или после импорта штампов осталось два открытых въезда в одну страну),
 * и один календарный день не должен списаться дважды.
 */
export function usedDays(trips, checkDate, window, windowDays) {
    const used = new Set();

    if (window === WINDOW_UNLIMITED) {
        return used;
    }

    if (window === WINDOW_PER_ENTRY) {
        // Срок на каждый въезд заново: выезд обнуляет счётчик, поэтому
        // считаем только текущий (продолжающийся на дату проверки) заезд.
        const ongoing = currentTrip(trips, checkDate);

        return ongoing ? expandTrip(ongoing.entry, formatLocalDate(checkDate), checkDate) : used;
    }

    const windowStart = windowStartFor(checkDate, window, windowDays);

    trips.forEach(trip => {
        expandTrip(trip.entry, trip.exit, checkDate).forEach(day => {
            const date = parseLocalDate(day);

            if ((!windowStart || date >= windowStart) && date <= checkDate) {
                used.add(day);
            }
        });
    });

    return used;
}

/**
 * Дней, использованных ДО указанной даты въезда (сама дата не входит) —
 * нужно, чтобы предложить дату выезда при вводе новой поездки.
 */
export function usedDaysBefore(trips, entryDate, window, windowDays, excludeIndex = -1) {
    const used = new Set();

    if (window === WINDOW_UNLIMITED || window === WINDOW_PER_ENTRY) {
        return used;
    }

    const windowStart = windowStartFor(entryDate, window, windowDays);

    trips.forEach((trip, index) => {
        if (index === excludeIndex) {
            return;
        }

        expandTrip(trip.entry, trip.exit, entryDate).forEach(day => {
            const date = parseLocalDate(day);

            if ((!windowStart || date >= windowStart) && date < entryDate) {
                used.add(day);
            }
        });
    });

    return used;
}

/**
 * Последний разрешённый день текущего (или гипотетического) заезда.
 *
 * Портировано из bot/counter/engine.py::_simulate_exit. Считается СИМУЛЯЦИЕЙ
 * вперёд по дням, а не формулой: так одна ветка кода корректна для всех типов
 * окон, включая случай, когда потолок «подряд» меньше суммарного (Турция для
 * россиян: 60 подряд из 90 за 180 дней). Формула здесь ошибается на стыке
 * двух ограничений.
 *
 * Симуляция ведётся ОТ ВЪЕЗДА, а не от даты проверки: если срок уже превышен,
 * последний разрешённый день лежит в прошлом — так мы его найдём и пометим
 * overstay, вместо того чтобы показать бодрое «можно остаться ещё 0 дней».
 *
 * @return {{mustExitOn: string|null, visaRunOn: string|null, overstay: boolean}}
 */
export function simulateExit(trips, on, rule) {
    const { maxContinuous = null, maxTotal = null, window, windowDays = null, visaRun = false } = rule;

    if (window === WINDOW_UNLIMITED) {
        return { mustExitOn: null, visaRunOn: null, overstay: false };
    }

    const ongoing = currentTrip(trips, on);
    const entry = ongoing ? parseLocalDate(ongoing.entry) : new Date(on);
    const horizonCap = new Date(on);
    horizonCap.setDate(horizonCap.getDate() + HORIZON);

    // Дни всех ОСТАЛЬНЫХ заездов: текущий достраиваем по дню-кандидату.
    const other = new Set();
    trips.forEach(trip => {
        if (ongoing && trip === ongoing) {
            return;
        }

        expandTrip(trip.entry, trip.exit, horizonCap).forEach(day => other.add(day));
    });

    let lastOk = null;
    let bindingContinuous = false;

    for (let i = 0; i < HORIZON; i++) {
        const day = new Date(entry);
        day.setDate(day.getDate() + i);

        const continuousOk = maxContinuous === null
            || daysBetween(entry, day) + 1 <= maxContinuous;

        let totalOk = true;

        if (maxTotal !== null && (window === WINDOW_ROLLING || window === WINDOW_CALENDAR_YEAR)) {
            const occupied = new Set(other);
            expandTrip(formatLocalDate(entry), formatLocalDate(day), day).forEach(d => occupied.add(d));

            const start = windowStartFor(day, window, windowDays);
            const end = window === WINDOW_CALENDAR_YEAR ? new Date(day.getFullYear(), 11, 31) : day;
            let inWindow = 0;
            occupied.forEach(d => {
                const date = parseLocalDate(d);
                if ((!start || date >= start) && date <= end) {
                    inWindow++;
                }
            });

            totalOk = inWindow <= maxTotal;
        }

        if (continuousOk && totalOk) {
            lastOk = day;
        } else {
            bindingContinuous = !continuousOk; // что именно упёрлось
            break;
        }
    }

    if (lastOk === null) {
        return { mustExitOn: null, visaRunOn: null, overstay: true };
    }

    // Визаран помогает только если упёрлись в «подряд», а суммарный лимит ещё есть.
    let visaRunOn = null;

    if (visaRun && bindingContinuous) {
        if (window === WINDOW_PER_ENTRY) {
            visaRunOn = formatLocalDate(lastOk); // выезд-въезд открывает новый заезд
        } else if (maxTotal !== null) {
            const occupied = new Set(other);
            expandTrip(formatLocalDate(entry), formatLocalDate(lastOk), lastOk).forEach(d => occupied.add(d));

            const start = windowStartFor(lastOk, window, windowDays);
            let inWindow = 0;
            occupied.forEach(d => {
                const date = parseLocalDate(d);
                if ((!start || date >= start) && date <= lastOk) {
                    inWindow++;
                }
            });

            if (inWindow < maxTotal) {
                visaRunOn = formatLocalDate(lastOk);
            }
        }
    }

    return {
        mustExitOn: formatLocalDate(lastOk),
        visaRunOn,
        overstay: lastOk < on,
    };
}

/**
 * Когда окно освободит место — то есть когда снова можно въехать.
 *
 * Портировано из engine.py::_reset_date. Для скользящего окна это САМЫЙ РАННИЙ
 * засчитанный день + windowDays (он первым выпадет из окна), а не «последний
 * выезд + windowDays» — последнее отвечает на другой вопрос, когда вернётся
 * ПОЛНЫЙ лимит (это fullResetDate ниже).
 */
export function windowResetDate(trips, on, window, windowDays) {
    if (window === WINDOW_CALENDAR_YEAR) {
        return formatLocalDate(new Date(on.getFullYear() + 1, 0, 1));
    }

    if (window === WINDOW_ROLLING && windowDays) {
        const inWindow = [...usedDays(trips, on, window, windowDays)].sort();

        if (inWindow.length) {
            const reset = parseLocalDate(inWindow[0]);
            reset.setDate(reset.getDate() + windowDays);

            return formatLocalDate(reset);
        }
    }

    return null;
}

/**
 * Полный расчёт одной дорожки (человек или машина) на дату проверки.
 *
 * Портировано из bot/counter/engine.py::_compute — там же причина, почему
 * человек и машина считаются ОДНИМ кодом: у них разные лимиты и разные окна,
 * но одна и та же арифметика. В Грузии гражданин РФ может находиться год, а
 * его машина — 90 дней; если считать их разным кодом, дорожки разъезжаются.
 *
 * @param {list<{entry: string, exit: string|null}>} trips
 * @param {Date} on
 * @param {{maxContinuous: number|null, maxTotal: number|null, window: string,
 *          windowDays: number|null, visaRun: boolean}} rule
 * @return {{limited: boolean, used: number, remaining: number|null, inside: boolean,
 *           overstay: boolean, mustExitOn: string|null, visaRunOn: string|null,
 *           windowResetOn: string|null}}
 */
export function computeTrack(trips, on, rule) {
    const { maxContinuous = null, maxTotal = null, window, windowDays = null, visaRun = false } = rule;
    const inside = currentTrip(trips, on) !== null;

    if (window === WINDOW_UNLIMITED || (maxContinuous === null && maxTotal === null)) {
        return {
            limited: false, used: 0, remaining: null, inside, overstay: false,
            mustExitOn: null, visaRunOn: null, windowResetOn: null,
        };
    }

    const used = usedDays(trips, on, window, windowDays).size;
    // При окне «на каждый въезд» ограничивает именно потолок одного заезда.
    const cap = window === WINDOW_PER_ENTRY ? (maxContinuous ?? maxTotal) : (maxTotal ?? maxContinuous);
    const remaining = cap === null ? null : Math.max(0, cap - used);
    const plan = simulateExit(trips, on, { maxContinuous, maxTotal, window, windowDays, visaRun });

    return {
        limited: true,
        used,
        remaining,
        inside,
        overstay: plan.overstay,
        mustExitOn: plan.mustExitOn,
        visaRunOn: plan.visaRunOn,
        windowResetOn: windowResetDate(trips, on, window, windowDays),
    };
}

/**
 * Правило ввоза машины (ответ /api/visa/check → vehicle) → параметры дорожки.
 *
 * basis описывает, ОТ ЧЕГО считается срок машины, и это не то же самое, что
 * окно человека:
 *   tied_to_person — уезжает вместе с человеком, своего лимита нет;
 *   per_entry      — свой срок на каждый въезд (Грузия: 90 дней);
 *   rolling        — свой суммарный лимит в скользящем окне;
 *   calendar_year  — свой суммарный лимит за календарный год;
 *   unknown        — проверенного правила нет, считать нечего.
 *
 * @return {{tied: boolean, rule: object|null}}
 */
export function vehicleRuleToTrack(vehicle) {
    if (!vehicle || vehicle.max_days === null || vehicle.max_days === undefined) {
        return { tied: vehicle?.basis === 'tied_to_person', rule: null };
    }

    switch (vehicle.basis) {
        case 'tied_to_person':
            return { tied: true, rule: null };
        case 'per_entry':
            return {
                tied: false,
                rule: {
                    maxContinuous: vehicle.max_days, maxTotal: null,
                    window: WINDOW_PER_ENTRY, windowDays: null, visaRun: false,
                },
            };
        case 'rolling':
            return {
                tied: false,
                rule: {
                    maxContinuous: null, maxTotal: vehicle.max_days,
                    window: WINDOW_ROLLING, windowDays: vehicle.window_days ?? 365, visaRun: false,
                },
            };
        case 'calendar_year':
            return {
                tied: false,
                rule: {
                    maxContinuous: null, maxTotal: vehicle.max_days,
                    window: WINDOW_CALENDAR_YEAR, windowDays: null, visaRun: false,
                },
            };
        default:
            return { tied: false, rule: null };
    }
}

/**
 * Дата, когда снова доступен ПОЛНЫЙ лимит дней (все прошлые дни вышли из окна).
 *
 * Уже наступивший сброс датой не возвращается: лимит полный ПРЯМО СЕЙЧАС,
 * и «вернётся 11 июн. 2023» — не будущее событие, а прошлое. Раньше такая
 * дата уезжала и в напоминания («сегодня · 11 июн. 2023»), и в подпись под
 * полосой. Гейт стоит здесь, в единственной точке расчёта, — иначе каждый
 * потребитель обязан помнить про проверку сам.
 */
export function fullResetDate(window, windowDays, checkDate, latestExit) {
    if (window === WINDOW_UNLIMITED) {
        return null;
    }

    if (window === WINDOW_CALENDAR_YEAR) {
        return formatLocalDate(new Date(checkDate.getFullYear() + 1, 0, 1));
    }

    if (!latestExit) {
        return null;
    }

    const reset = parseLocalDate(latestExit);

    if (window === WINDOW_PER_ENTRY) {
        // Выезд обнуляет счётчик — полный лимит доступен со следующего дня.
        reset.setDate(reset.getDate() + 1);
    } else {
        reset.setDate(reset.getDate() + (windowDays || 180));
    }

    return reset > checkDate ? formatLocalDate(reset) : null;
}
