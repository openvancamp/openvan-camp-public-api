/**
 * Pure-функции расчёта стоимости топлива — калькуляторы /tools, роудбук и маршрут на /maps.
 *
 * 🔴 Единый источник правды: map-features/route/fuel-calc-core.js — тот же код считает
 * маршрут на карте ParkX. Изменения вносить ТОЛЬКО там; этот файл — путь, по которому его
 * берут модули сайта (и app.js, который ставит window.FuelCalc).
 */
export * from "@map-features/route/fuel-calc-core.js";
