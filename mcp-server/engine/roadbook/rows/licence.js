/**
 * Строка «Права за рулём»: какой образец международного водительского удостоверения (МВУ)
 * признаёт страна — по участию в конвенциях ООН о дорожном движении 1949 и 1968 гг.
 * Справочник road-rules/licence.json (scripts/road-rules/build_licence.py, депозитарий ООН).
 */

/** Страны ЕС: права любой из них действуют во всём ЕС без МВУ (портал Your Europe). */
export const EU27 = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

/** Конвенции страны: ['1949'], ['1968'], оба или [] — не участвует ни в одной. */
export function conventionsOf(licence, cc) {
    return licence?.countries?.[cc] || [];
}

export function licenceRow(licence, cc, fmt) {
    if (!licence?.countries) {
        return null;
    }
    const conv = conventionsOf(licence, cc);
    const key = conv.length === 2 ? 'licence_both' : conv[0] === '1949' ? 'licence_1949' : conv[0] === '1968' ? 'licence_1968' : 'licence_none';
    const lines = [fmt.t(`${key}_text`)];
    if (EU27.has(cc)) {
        lines.push(fmt.t('licence_eu'));
    }

    return {
        key: 'licence', s: conv.length ? 'ok' : 'warn',
        big: fmt.t(`${key}_big`), lines, conventions: conv,
        source: conv.includes('1968') ? licence.sources?.['1968'] : licence.sources?.['1949'] || null,
    };
}

/**
 * Пункт чек-листа про МВУ: одним удостоверением не обойтись, если на маршруте есть страны,
 * признающие только образец 1949 года, и страны только с образцом 1968-го.
 */
export function licenceCheck(licence, ccs, fmt) {
    if (!licence?.countries || !ccs.length) {
        return null;
    }
    const only = v => ccs.filter(cc => conventionsOf(licence, cc).join() === v).map(cc => fmt.countryName(cc));
    const a = only('1949');
    const b = only('1968');
    const none = ccs.filter(cc => !conventionsOf(licence, cc).length).map(cc => fmt.countryName(cc));
    if (none.length) {
        return { id: 'idp', s: 'warn', c: [], t: fmt.t('check_idp_none', { countries: none.join(', ') }) };
    }
    if (a.length && b.length) {
        return { id: 'idp', s: 'warn', c: [], t: fmt.t('check_idp_mixed', { a: a.join(', '), b: b.join(', ') }) };
    }
    if (a.length || b.length) {
        return { id: 'idp', s: 'ok', c: [], t: fmt.t(a.length ? 'check_idp_1949' : 'check_idp_1968', { countries: (a.length ? a : b).join(', ') }) };
    }

    return null;
}
