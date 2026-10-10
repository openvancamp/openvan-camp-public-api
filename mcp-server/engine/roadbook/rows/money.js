/**
 * Строка «Деньги и цены»: валюта страны, курс к валюте человека, цены продуктов «Корзины».
 * Вынесено из plan.js (рефакторинг 02.10.2026); plan.js реэкспортирует публичное.
 */
import { convertMoney } from '../plan/util.js';

export function moneyRow(money, base, rates) {
    if (!money) {
        return { key: 'money', s: 'none', nodata: true, items: [] };
    }
    const cur = money.currency;
    const items = (money.items || []).map(item => ({
        label: item.label,
        local: item.local ?? convertMoney(item.usd, 'USD', cur, rates),
        base: convertMoney(item.usd, 'USD', base, rates),
    }));
    // «1 GEL = 34,20 ₽»; у дешёвой валюты единица почти ноль — «100 RUB = 1,05 €».
    const one = cur !== base ? convertMoney(1, cur, base, rates) : null;
    const unit = one && one < 0.1 ? 10 ** Math.ceil(-Math.log10(one)) : 1;

    return {
        key: 'money',
        s: items.length ? 'ok' : 'none',
        currency: cur,
        base,
        rate: one ? { unit, value: one * unit } : null,
        items,
        url: money.url,
        nodata: !items.length,
    };
}
