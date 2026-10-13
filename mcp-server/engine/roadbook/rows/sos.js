/**
 * Строка «Экстренные службы»: полиция, скорая, пожарные — справочник road-rules/emergency.json
 * (scripts/road-rules/build_emergency.py, закреплённая ревизия Википедии со ссылками на ITU и посольства).
 */
export function sosRow(emergency, cc, fmt) {
    const n = emergency?.countries?.[cc];
    if (!n) {
        return null;
    }
    const same = n.police === n.ambulance && n.ambulance === n.fire;

    return {
        key: 'sos', s: 'ok',
        big: same ? n.police : fmt.t('sos_big', { police: n.police, ambulance: n.ambulance, fire: n.fire }),
        lines: same ? [fmt.t('sos_same')] : [],
        source: emergency.source_url || null,
    };
}
