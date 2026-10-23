/**
 * Строка «Правила дороги»: скорости для своей машины, промилле, обязательная экипировка — из
 * справочника road-rules/europe.json (портал ЕС Your Europe + ADAC, собран build_europe.py).
 * Нет данных — нет строки: чужие правила не угадываем.
 */

export const EQUIPMENT = ['vest', 'triangle', 'first_aid', 'extinguisher', 'spare_bulbs', 'chocks', 'spare_wheel', 'torch'];

/** Какой набор скоростей брать: легковая, кемпер до 3,5 т или свыше 3,5 т. */
export function vehicleKind(inputs) {
    if (inputs.weight === 'gt35' || inputs.vehicle_class === 'heavy') {
        return 'heavy';
    }

    return inputs.vehicle_class === 'car' ? 'car' : 'light';
}

/** У значения бывает несколько вариантов (сухо/дождь, участки) — берём верхний и помечаем. */
function top(v) {
    if (Array.isArray(v)) {
        return v.length ? { v: Math.max(...v), varies: v.length > 1 } : null;
    }

    return typeof v === 'number' ? { v, varies: false } : null;
}

/** Обязательная экипировка страны — ключи из EQUIPMENT. */
export function requiredEquipment(rules) {
    return EQUIPMENT.filter(k => rules?.equipment?.[k]?.required === true);
}

export function rulesRow(rules, inputs, fmt) {
    if (!rules) {
        return null;
    }
    const kind = vehicleKind(inputs);
    const sp = rules.speed || {};
    // Кемпер до 3,5 т по ADAC; нет — как легковая (у портала ЕС строки кемпера нет).
    const set = kind === 'heavy' ? sp.motorhome_heavy : kind === 'light' ? (sp.motorhome_light || sp.car) : sp.car;
    const lines = [];
    let big = null;
    let varies = false;
    if (set) {
        const parts = ['urban', 'rural', 'expressway', 'expressway_single', 'expressway_dual', 'motorway'].map((k) => {
            const x = top(set[k]);
            if (!x) {
                return null;
            }
            varies ||= x.varies;

            return fmt.t(`rules_speed_${k}`, { speed: set[`${k}_recommended`] ? fmt.t('rules_recommended', { speed: x.v }) : x.v });
        }).filter(Boolean);
        if (parts.length) {
            lines.push(parts.join(' · '));
        }
        const motorway = top(set.motorway);
        if (motorway) {
            big = fmt.t(set.motorway_recommended ? 'rules_recommended' : 'rules_big', { speed: motorway.v });
        }
    } else if (kind === 'heavy' && (sp.car || sp.motorhome_light)) {
        lines.push(fmt.t('rules_heavy_none'));
    }
    if (varies) {
        lines.push(fmt.t('rules_speed_varies'));
    }
    const alc = rules.alcohol;
    if (alc && typeof alc.general === 'number') {
        lines.push(typeof alc.novice === 'number' && alc.novice !== alc.general
            ? fmt.t('rules_alcohol_novice', { g: fmt.num(alc.general), n: fmt.num(alc.novice) })
            : fmt.t('rules_alcohol', { g: fmt.num(alc.general) }));
    }
    if (rules.lights_day === 'always' || rules.lights_day === 'highways') {
        lines.push(fmt.t(rules.lights_day === 'always' ? 'rules_lights_always' : 'rules_lights_highways'));
    }
    if (rules.studs_sign) {
        lines.push(fmt.t('rules_studs_sign', { letter: rules.studs_sign }));
    }
    const equipment = requiredEquipment(rules);
    if (equipment.length) {
        lines.push(fmt.t('rules_equipment', { items: equipment.map(k => fmt.t(`equip_${k}`)).join(', ') }));
    }
    if (!lines.length) {
        return null;
    }

    return {
        key: 'rules', s: 'ok', big, lines, equipment,
        source: rules.source_url || null,
        sourceLabel: fmt.t(rules.source_kind === 'national' ? 'rules_source_national' : 'rules_source'),
        checked: rules.checked_at || null,
    };
}
