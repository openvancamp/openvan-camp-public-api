import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { page, SITE } from "./bridge.js";
import { MONEY_HTML, MONEY_WIDGETS } from "./money.js";
import { TRAVEL_HTML, TRAVEL_WIDGETS, TRIP_WIDGET } from "./travel.js";
import { COUNTRY_JS, WEATHER_ICON_JS } from "./snippets.js";

/**
 * Интерактивные карточки (MCP Apps) для Claude и ChatGPT.
 *
 * Инструмент указывает на карточку через _meta.ui.resourceUri (стандарт) и
 * openai/outputTemplate (алиас ChatGPT). Хост читает ресурс ui://… и рисует его
 * в песочнице, передавая туда structuredContent результата. Хосты без поддержки
 * карточек получают обычный текст из content — как раньше.
 */

export const MIME = "text/html;profile=mcp-app";

export const WIDGETS = {
  weather: "ui://openvan/country-weather.html",
  bestWeather: "ui://openvan/best-weather.html",
  events: "ui://openvan/events.html",
  ...MONEY_WIDGETS,
  ...TRAVEL_WIDGETS,
  trip: TRIP_WIDGET,
} as const;

/** Картинки грузятся только с этих доменов: свои файлы и прокси чужих фото (как на сайте). */
const RESOURCE_DOMAINS = [SITE, "https://wsrv.nl"];

/**
 * ui.domain не задаём: у Claude его формат — хеш URL коннектора, у ChatGPT — домен
 * сервиса, а одно значение для обоих хостов невозможно. Claude без него работает,
 * ChatGPT берёт домен из openai/widgetDomain.
 */
function resourceMeta(description: string) {
  return {
    ui: {
      csp: { connectDomains: [], resourceDomains: RESOURCE_DOMAINS },
      prefersBorder: false,
    },
    "openai/widgetDescription": description,
    "openai/widgetDomain": SITE,
    "openai/widgetPrefersBorder": false,
    "openai/widgetCSP": { connect_domains: [], resource_domains: RESOURCE_DOMAINS },
  };
}

/** _meta для инструмента, у которого есть карточка. */
export function toolUiMeta(uri: string, invoking: string, invoked: string) {
  return {
    ui: { resourceUri: uri },
    "ui/resourceUri": uri,
    "openai/outputTemplate": uri,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetAccessible": false,
  };
}

// ------------------------------------------------------------------
// 1. Погода в стране (get_country_travel_weather)
// ------------------------------------------------------------------

const WEATHER_I18N = {
  en: { best_places: "Best today", worst_places: "Toughest now", n_cities: "{n} cities", today: "Travel weather today", week: "Week", sleep: "Sleep", drive: "Driving", solar: "Solar", sea: "Sea", gusts: "gusts", rain: "rain", open: "Open on OpenVan", best: "Best countries today", updated: "Updated", awning_caution: "Wind: keep the awning secured", awning_danger: "Strong wind: fold the awning", cond_high: "High condensation risk overnight — ventilate", cond_medium: "Some condensation overnight", kmh: "km/h", mph: "mph", kwh: "kWh/day", ask_best: "Which countries have the best travel weather today?", ideal: "Ideal", comfortable: "Comfortable", acceptable: "Acceptable", hard: "Tough", extreme: "Extreme" },
  ru: { best_places: "Лучше всего сегодня", worst_places: "Сложнее всего сейчас", n_cities: "городов: {n}", today: "Погода для поездки сегодня", week: "Неделя", sleep: "Сон", drive: "Дорога", solar: "Солнце", sea: "Море", gusts: "порывы", rain: "дождь", open: "Открыть на OpenVan", best: "Где лучше сегодня", updated: "Обновлено", awning_caution: "Ветер: закрепите маркизу", awning_danger: "Сильный ветер: сверните маркизу", cond_high: "Ночью сильный конденсат — проветривайте", cond_medium: "Ночью возможен конденсат", kmh: "км/ч", mph: "миль/ч", kwh: "кВт·ч/день", ask_best: "В каких странах сегодня лучшая погода для поездки?", ideal: "Идеально", comfortable: "Комфортно", acceptable: "Терпимо", hard: "Сложно", extreme: "Экстрим" },
  de: { best_places: "Heute am besten", worst_places: "Gerade am schwierigsten", n_cities: "{n} Orte", today: "Reisewetter heute", week: "Woche", sleep: "Schlafen", drive: "Fahren", solar: "Solar", sea: "Meer", gusts: "Böen", rain: "Regen", open: "Auf OpenVan öffnen", best: "Beste Länder heute", updated: "Aktualisiert", awning_caution: "Wind: Markise sichern", awning_danger: "Starker Wind: Markise einfahren", cond_high: "Nachts starkes Kondenswasser — lüften", cond_medium: "Nachts etwas Kondenswasser", kmh: "km/h", mph: "mph", kwh: "kWh/Tag", ask_best: "Welche Länder haben heute das beste Reisewetter?", ideal: "Ideal", comfortable: "Angenehm", acceptable: "Akzeptabel", hard: "Schwierig", extreme: "Extrem" },
  fr: { best_places: "Le meilleur aujourd’hui", worst_places: "Le plus difficile", n_cities: "{n} villes", today: "Météo du voyage aujourd’hui", week: "Semaine", sleep: "Sommeil", drive: "Route", solar: "Solaire", sea: "Mer", gusts: "rafales", rain: "pluie", open: "Ouvrir sur OpenVan", best: "Meilleurs pays aujourd’hui", updated: "Mis à jour", awning_caution: "Vent : attachez l’auvent", awning_danger: "Vent fort : repliez l’auvent", cond_high: "Forte condensation la nuit — aérez", cond_medium: "Un peu de condensation la nuit", kmh: "km/h", mph: "mph", kwh: "kWh/jour", ask_best: "Quels pays ont la meilleure météo pour voyager aujourd’hui ?", ideal: "Idéal", comfortable: "Confortable", acceptable: "Acceptable", hard: "Difficile", extreme: "Extrême" },
  es: { best_places: "Lo mejor hoy", worst_places: "Lo más difícil ahora", n_cities: "{n} ciudades", today: "Tiempo para viajar hoy", week: "Semana", sleep: "Dormir", drive: "Conducir", solar: "Solar", sea: "Mar", gusts: "rachas", rain: "lluvia", open: "Abrir en OpenVan", best: "Mejores países hoy", updated: "Actualizado", awning_caution: "Viento: asegura el toldo", awning_danger: "Viento fuerte: recoge el toldo", cond_high: "Mucha condensación por la noche — ventila", cond_medium: "Algo de condensación por la noche", kmh: "km/h", mph: "mph", kwh: "kWh/día", ask_best: "¿Qué países tienen hoy el mejor tiempo para viajar?", ideal: "Ideal", comfortable: "Cómodo", acceptable: "Aceptable", hard: "Difícil", extreme: "Extremo" },
  pt: { best_places: "O melhor hoje", worst_places: "O mais difícil agora", n_cities: "{n} cidades", today: "Tempo para viajar hoje", week: "Semana", sleep: "Dormir", drive: "Estrada", solar: "Solar", sea: "Mar", gusts: "rajadas", rain: "chuva", open: "Abrir no OpenVan", best: "Melhores países hoje", updated: "Atualizado", awning_caution: "Vento: prenda o toldo", awning_danger: "Vento forte: recolha o toldo", cond_high: "Muita condensação à noite — areje", cond_medium: "Alguma condensação à noite", kmh: "km/h", mph: "mph", kwh: "kWh/dia", ask_best: "Quais países têm hoje o melhor tempo para viajar?", ideal: "Ideal", comfortable: "Confortável", acceptable: "Aceitável", hard: "Difícil", extreme: "Extremo" },
  tr: { best_places: "Bugün en iyi", worst_places: "Şu an en zor", n_cities: "{n} şehir", today: "Bugün seyahat havası", week: "Hafta", sleep: "Uyku", drive: "Yol", solar: "Güneş", sea: "Deniz", gusts: "rüzgâr", rain: "yağmur", open: "OpenVan’da aç", best: "Bugün en iyi ülkeler", updated: "Güncellendi", awning_caution: "Rüzgâr: tenteyi sabitleyin", awning_danger: "Kuvvetli rüzgâr: tenteyi kapatın", cond_high: "Gece yoğun yoğuşma — havalandırın", cond_medium: "Gece biraz yoğuşma", kmh: "km/sa", mph: "mil/sa", kwh: "kWh/gün", ask_best: "Bugün seyahat için havası en iyi ülkeler hangileri?", ideal: "İdeal", comfortable: "Rahat", acceptable: "Kabul edilebilir", hard: "Zor", extreme: "Aşırı" },
};

/** Объяснение индекса — те же строки, что в блоке «VanSky Индекс» на сайте (lang/*.json, vansky.widget.*). */
const INDEX_I18N = {"en": {"title": "VanSky Index","description": "A weather comfort index for travel: a 0–100 score. Recalculated daily from live weather data — temperature, rainfall, wind and sun.","how_calculated": "How it's calculated:","thermal": "Thermal comfort","thermal_hint": "temperature + humidity","sunshine": "Sunshine","sunshine_hint": "panel charge, mood; in heat the sun is no longer a bonus","precipitation": "Precipitation","precipitation_hint": "rain → muddy ground","wind": "Wind","wind_hint": "awning, driving, noise","extremes": "Extremes override all: frost, heat, storm, downpour","heat_rule": "Heat counts by feels-like temperature: at 32°+ the score can’t reach “Comfortable”, muggy nights lower it further","worst_day_rule": "A dangerous day drags the week down: a storm or downpour in the forecast keeps the week from being “Comfortable”","bonus": "Bonus: warm sea, high panel output","data_source": "Data: Open-Meteo · Updated several times a day","best_cities": "Best cities in the coming days","worst": "Avoid now","ideal": "Ideal","comfortable": "Comfortable","acceptable": "Acceptable","hard": "Challenging","extreme": "Extreme"},"ru": {"title": "VanSky Индекс","description": "Погодный индекс комфорта для путешествий: балл от 0 до 100. Каждый день рассчитывается по реальным метеоданным — температуре, осадкам, ветру и солнцу.","how_calculated": "Как считается:","thermal": "Тепловой комфорт","thermal_hint": "температура + влажность","sunshine": "Солнце","sunshine_hint": "заряд панелей, настроение; в жару солнце — уже не бонус","precipitation": "Осадки","precipitation_hint": "дождь → грунт раскисает","wind": "Ветер","wind_hint": "маркиза, вождение, шум","extremes": "Экстремумы перекрывают всё: мороз, жара, шторм, ливень","heat_rule": "Жара — по ощущаемой температуре: при 32°+ балл не выше «Приемлемо», душная ночь дополнительно снижает","worst_day_rule": "Опасный день тянет неделю вниз: шторм или ливень в прогнозе не дают неделе быть «Комфортной»","bonus": "Бонус: тёплое море, высокая выработка панелей","data_source": "Данные: Open-Meteo · Обновление несколько раз в день","best_cities": "Лучшие города в ближайшие дни","worst": "Сложнее всего","ideal": "Идеально","comfortable": "Комфортно","acceptable": "Приемлемо","hard": "Сложно","extreme": "Невыносимо"},"de": {"title": "VanSky Index","description": "Ein Wetter-Komfortindex für Reisen: ein Wert von 0–100. Täglich neu berechnet aus aktuellen Wetterdaten — Temperatur, Niederschlag, Wind und Sonne.","how_calculated": "Berechnung:","thermal": "Thermischer Komfort","thermal_hint": "Temperatur + Luftfeuchtigkeit","sunshine": "Sonnenschein","sunshine_hint": "Panelladung, Stimmung; bei Hitze ist Sonne kein Bonus mehr","precipitation": "Niederschlag","precipitation_hint": "Regen → weicher Untergrund","wind": "Wind","wind_hint": "Markise, Fahren, Lärm","extremes": "Extreme überschreiben alles: Frost, Hitze, Sturm, Starkregen","heat_rule": "Hitze zählt nach gefühlter Temperatur: ab 32°+ bleibt der Wert unter „Komfortabel“, schwüle Nächte senken ihn zusätzlich","worst_day_rule": "Ein gefährlicher Tag zieht die Woche runter: Sturm oder Starkregen in der Vorhersage verhindern eine „komfortable“ Woche","bonus": "Bonus: warmes Meer, hohe Panelleistung","data_source": "Daten: Open-Meteo · Aktualisierung mehrmals täglich","best_cities": "Beste Städte in den nächsten Tagen","worst": "Derzeit meiden","ideal": "Ideal","comfortable": "Komfortabel","acceptable": "Akzeptabel","hard": "Anspruchsvoll","extreme": "Extrem"},"fr": {"title": "VanSky Indice","description": "Un indice de confort météo pour voyager : un score de 0 à 100. Recalculé chaque jour à partir de données météo en temps réel — température, précipitations, vent et soleil.","how_calculated": "Comment c'est calculé :","thermal": "Confort thermique","thermal_hint": "température + humidité","sunshine": "Ensoleillement","sunshine_hint": "charge des panneaux, moral ; en canicule le soleil n’est plus un bonus","precipitation": "Précipitations","precipitation_hint": "pluie → sol détrempé","wind": "Vent","wind_hint": "auvent, conduite, bruit","extremes": "Les extrêmes annulent tout : gel, canicule, tempête, averse","heat_rule": "La chaleur compte en température ressentie : à 32°+ le score reste sous « Confortable », les nuits moites le réduisent encore","worst_day_rule": "Un jour dangereux plombe la semaine : une tempête ou une averse prévue empêche une semaine « Confortable »","bonus": "Bonus : mer chaude, haute production de panneaux","data_source": "Données : Open-Meteo · Mise à jour plusieurs fois par jour","best_cities": "Meilleures villes dans les prochains jours","worst": "À éviter en ce moment","ideal": "Idéal","comfortable": "Confortable","acceptable": "Acceptable","hard": "Difficile","extreme": "Extrême"},"es": {"title": "VanSky Índice","description": "Un índice de confort meteorológico para viajar: una puntuación de 0–100. Se recalcula a diario a partir de datos meteorológicos en directo — temperatura, lluvia, viento y sol.","how_calculated": "Cómo se calcula:","thermal": "Confort térmico","thermal_hint": "temperatura + humedad","sunshine": "Sol","sunshine_hint": "carga de paneles, estado de ánimo; con calor el sol ya no suma","precipitation": "Precipitación","precipitation_hint": "lluvia → suelo blando","wind": "Viento","wind_hint": "toldo, conducción, ruido","extremes": "Los extremos anulan todo: helada, calor, tormenta, aguacero","heat_rule": "El calor cuenta por sensación térmica: con 32°+ la puntuación no llega a «Confortable» y las noches sofocantes la bajan más","worst_day_rule": "Un día peligroso hunde la semana: una tormenta o aguacero en el pronóstico impide que la semana sea «Confortable»","bonus": "Bonus: mar cálido, alta producción de paneles","data_source": "Datos: Open-Meteo · Actualización varias veces al día","best_cities": "Mejores ciudades en los próximos días","worst": "Evitar ahora","ideal": "Ideal","comfortable": "Cómodo","acceptable": "Aceptable","hard": "Exigente","extreme": "Extremo"},"pt": {"title": "VanSky Índice","description": "Um índice de conforto meteorológico para viajar: uma pontuação de 0–100. Recalculado diariamente a partir de dados meteorológicos em tempo real — temperatura, chuva, vento e sol.","how_calculated": "Como é calculado:","thermal": "Conforto térmico","thermal_hint": "temperatura + humidade","sunshine": "Sol","sunshine_hint": "carga dos painéis, ânimo; no calor o sol deixa de ser bônus","precipitation": "Precipitação","precipitation_hint": "chuva → solo lamacento","wind": "Vento","wind_hint": "toldo, condução, ruído","extremes": "Extremos anulam tudo: geada, calor, tempestade, aguaceiro","heat_rule": "O calor conta pela sensação térmica: com 32°+ a pontuação não chega a «Confortável» e noites abafadas reduzem ainda mais","worst_day_rule": "Um dia perigoso puxa a semana para baixo: tempestade ou temporal na previsão impedem uma semana «Confortável»","bonus": "Bónus: mar quente, alta produção de painéis","data_source": "Dados: Open-Meteo · Atualização várias vezes ao dia","best_cities": "Melhores cidades nos próximos dias","worst": "Evitar agora","ideal": "Ideal","comfortable": "Confortável","acceptable": "Aceitável","hard": "Exigente","extreme": "Extremo"},"tr": {"title": "VanSky Endeksi","description": "Seyahat için hava konforu endeksi: 0–100 puan. Canlı hava verilerinden günlük olarak yeniden hesaplanır — sıcaklık, yağış, rüzgâr ve güneş.","how_calculated": "Nasıl hesaplanır:","thermal": "Termal konfor","thermal_hint": "sıcaklık + nem","sunshine": "Güneş","sunshine_hint": "panel şarjı, ruh hali; sıcakta güneş artık bonus değil","precipitation": "Yağış","precipitation_hint": "yağmur → zemin yumuşar","wind": "Rüzgar","wind_hint": "tente, sürüş, gürültü","extremes": "Aşırı koşullar her şeyi geçersiz kılar: don, sıcak, fırtına, sağanak","heat_rule": "Sıcak hissedilen sıcaklığa göre sayılır: 32°+ olduğunda puan «Konforlu»ya ulaşamaz, bunaltıcı geceler puanı daha da düşürür","worst_day_rule": "Tehlikeli bir gün haftayı aşağı çeker: tahmindeki fırtına veya sağanak haftanın «Konforlu» olmasını engeller","bonus": "Bonus: ılık deniz, yüksek panel üretimi","data_source": "Veri: Open-Meteo · Günde birkaç kez güncellenir","best_cities": "Önümüzdeki günlerin en iyi şehirleri","worst": "Şimdilik kaçının","ideal": "İdeal","comfortable": "Konforlu","acceptable": "Kabul edilebilir","hard": "Zorlu","extreme": "Dayanılmaz"}};

const WEATHER_CSS = `
.unit{position:absolute;top:12px;right:12px}
.wx-now{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.metric{background:var(--ov-bg2);border-radius:var(--ov-radius-sm);padding:8px 10px;min-width:0}
.metric b{display:block;font-size:16px;font-weight:700;color:var(--ov-text)}
.metric span{font-size:11px;color:var(--ov-text3)}
.fc{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:12px;text-align:center}
.fc .d{font-size:11px;color:var(--ov-text3);text-transform:capitalize}
.fc .i{color:var(--ov-text2);display:flex;justify-content:center;margin:4px 0}
.fc .t{font-size:13px;font-weight:600}
.fc .n{font-size:11px;color:var(--ov-text3)}
.fc .bar{height:4px;border-radius:2px;margin:6px 6px 0}
.notes{display:flex;flex-direction:column;gap:4px;margin-top:12px}
.places{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--ov-border)}
.places h2{margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ov-text3)}
.pl{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:4px 6px;margin:0 -6px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;border-radius:6px;cursor:pointer}
.pl:hover{background:var(--ov-bg2)}
.pl .i{color:var(--ov-text3);display:flex}
.pl .m{font-size:12px;color:var(--ov-text3);white-space:nowrap}
.pl .track{width:56px;height:5px;border-radius:3px;background:var(--ov-bg2);overflow:hidden;flex:none}
.pl .track i{display:block;height:100%;border-radius:3px}
.pl b{width:26px;text-align:right;flex:none}
.idx{margin-top:12px;border-top:1px solid var(--ov-border);padding-top:10px}
.idx summary{cursor:pointer;min-height:36px;display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;color:var(--ov-text2);list-style:none}
.idx summary::-webkit-details-marker{display:none}
.idx summary::after{content:"";width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);margin-left:4px}
.idx[open] summary::after{transform:rotate(-135deg)}
.idx p{margin:6px 0 10px;color:var(--ov-text2);font-size:13px}
.bands{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.band{font-size:12px;border-radius:9999px;padding:3px 9px;background:var(--ov-bg2);color:var(--ov-text2)}
.band b{margin-right:4px}
.idx ul{margin:0;padding-left:18px;font-size:13px;color:var(--ov-text2);display:flex;flex-direction:column;gap:4px}
.idx .w{color:var(--ov-text3)}
@media (max-width:380px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

const WEATHER_SKELETON = `<div class="card"><div class="hero"><div class="hero-row"><div class="ring"><div></div></div><div class="grow"><div class="skel" style="height:22px;width:60%;opacity:.4"></div><div class="skel" style="height:14px;width:40%;margin-top:8px;opacity:.4"></div></div></div></div><div class="body"><div class="skel" style="height:52px"></div><div class="skel" style="height:70px;margin-top:12px"></div></div></div>`;

const WEATHER_JS = `
var T=${JSON.stringify(WEATHER_I18N)};
${WEATHER_ICON_JS}
${COUNTRY_JS}
var unit=null;
function t(k){return OV.t(T,k)}
function useF(){if(unit)return unit==="f";try{var u=localStorage.getItem("ov-unit");if(u)return u==="f"}catch(e){}return OV.imperial()}
function deg(c){if(c==null)return "—";return Math.round(useF()?c*9/5+32:c)+"°"}
function wind(k){if(k==null)return "—";return useF()?Math.round(k/1.609)+" "+t("mph"):Math.round(k)+" "+t("kmh")}
function dow(d){try{return new Date(d+"T12:00:00").toLocaleDateString(OV.locale(),{weekday:"short"})}catch(e){return d.slice(5)}}
function hm(iso){try{return new Date(iso).toLocaleString(OV.locale(),{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}catch(e){return ""}}
var E=OV.esc;
function render(d){
  var c=d.country||{};var name=d.city?d.city.name:cName(c.code,c.name);var lab=d.label||"comfortable";var col=LABEL_COLOR[lab]||"#fff";var w=d.today||{};
  var h='<div class="card"><div class="hero">';
  h+='<div class="seg unit" role="group"><button data-u="c" aria-pressed="'+!useF()+'">°C</button><button data-u="f" aria-pressed="'+useF()+'">°F</button></div>';
  h+='<div class="hero-row"><div class="ring" style="--v:'+(d.score||0)+';--c:'+col+'"><div><div><b>'+(d.score==null?"—":d.score)+'</b><small>/100</small></div></div></div>';
  h+='<div class="grow" style="padding-right:84px"><div class="row">'+flag(c.code)+'<h1 class="h1 ellipsis">'+E(name)+'</h1></div>';
  h+='<div class="sub">'+(d.city?E(cName(c.code,c.name))+' · ':'')+t("today")+' · <b>'+t(lab)+'</b>'+(d.week_score!=null?' · '+t("week")+' '+d.week_score:'')+'</div></div></div>';
  h+='<div class="wx-now"><span class="chip chip-glass">'+wIcon(w.weather_code,16)+' '+deg(w.temp_day)+' / '+deg(w.temp_night)+'</span>';
  if(w.wind_gusts!=null)h+='<span class="chip chip-glass">'+t("gusts")+' '+wind(w.wind_gusts)+'</span>';
  if(w.precip_prob!=null)h+='<span class="chip chip-glass">'+t("rain")+' '+w.precip_prob+'%</span>';
  h+='</div></div><div class="body">'+places(d)+'<div class="metrics">';
  h+='<div class="metric"><b>'+(d.sleep_score==null?"—":d.sleep_score)+'</b><span>'+t("sleep")+' /100</span></div>';
  h+='<div class="metric"><b>'+(d.drive_score==null?"—":d.drive_score)+'</b><span>'+t("drive")+' /100</span></div>';
  h+='<div class="metric"><b>'+(d.solar_kwh==null?"—":Number(d.solar_kwh).toFixed(1))+'</b><span>'+t("solar")+', '+t("kwh")+'</span></div>';
  h+='<div class="metric"><b>'+(d.sea_temp==null?"—":deg(d.sea_temp))+'</b><span>'+t("sea")+'</span></div></div>';
  var fc=(d.forecast||[]).slice(0,7);
  if(fc.length){h+='<div class="fc">';fc.forEach(function(f){h+='<div><div class="d">'+E(dow(f.date))+'</div><div class="i">'+(f.weather_code!=null?wIcon(f.weather_code,20):'<b style="font-size:13px;color:'+(LABEL_COLOR[f.label]||"inherit")+'">'+f.score+'</b>')+'</div><div class="t">'+deg(f.temp_day)+'</div>'+(f.temp_night!=null?'<div class="n">'+deg(f.temp_night)+'</div>':'')+'<div class="bar" title="'+(f.score||"")+'" style="background:'+(LABEL_COLOR[f.label]||"var(--ov-border)")+'"></div></div>'});h+='</div>'}
  var notes=[];
  if(d.awning==="caution")notes.push(t("awning_caution"));if(d.awning==="danger"||d.awning==="unsafe")notes.push(t("awning_danger"));
  if(d.condensation==="high")notes.push(t("cond_high"));if(d.condensation==="medium")notes.push(t("cond_medium"));
  if(notes.length){h+='<div class="notes">';notes.forEach(function(n){h+='<div class="note">• '+E(n)+'</div>'});h+='</div>'}
  h+=explain();
  h+='</div><div class="actions"><button class="btn btn-primary" data-act="open">'+t("open")+'</button><button class="btn btn-ghost" data-act="best">'+t("best")+'</button></div>';
  h+='<div class="foot"><span>'+(d.updated_at?t("updated")+' '+E(hm(d.updated_at))+' · ':'')+'Open-Meteo</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>';
  document.getElementById("app").innerHTML=h;
}
function sColor(v){return v>=80?"var(--ov-ideal)":v>=60?"var(--ov-comfy)":v>=40?"var(--ov-ok)":"var(--ov-hard)"}
var IDX=${JSON.stringify(INDEX_I18N)};
function ix(k){return OV.t(IDX,k)}
function explain(){
  var bands=[["80–100","ideal","var(--ov-ideal)"],["60–79","comfortable","var(--ov-comfy)"],["40–59","acceptable","var(--ov-ok)"],["20–39","hard","var(--ov-hard)"],["0–19","extreme","var(--ov-hard)"]];
  var h='<details class="idx"><summary>'+E(ix("title"))+' · '+E(String(ix("how_calculated")).replace(/:$/,""))+'</summary><p>'+E(ix("description"))+'</p><div class="bands">';
  bands.forEach(function(b){h+='<span class="band"><b style="color:'+b[2]+'">'+b[0]+'</b>'+E(ix(b[1]))+'</span>'});
  h+='</div><ul>';
  [["thermal",35],["sunshine",25],["precipitation",25],["wind",15]].forEach(function(f){h+='<li><b>'+E(ix(f[0]))+'</b> <span class="w">'+f[1]+'%</span> — '+E(ix(f[0]+"_hint"))+'</li>'});
  ["extremes","heat_rule","worst_day_rule","bonus"].forEach(function(k){h+='<li>'+E(ix(k))+'</li>'});
  return h+'</ul><p class="muted" style="margin-bottom:0">'+E(ix("data_source"))+'</p></details>';
}
function places(d){
  var c=d.cities||{};if(!(c.best&&c.best.length))return "";
  function col(title,list,kind){
    if(!list||!list.length)return "";
    var h='<div><h2>'+E(title)+'</h2>';
    list.forEach(function(p,i){
      h+='<button class="pl" data-city="'+kind+i+'"><span class="i">'+wIcon(p.clear?0:3,18)+'</span><span class="grow ellipsis">'+E(p.name)+'</span>';
      h+='<span class="m">'+deg(p.temp_day)+(p.wind!=null?' · '+wind(p.wind):'')+'</span><span class="track"><i style="width:'+p.score+'%;background:'+sColor(p.score)+'"></i></span><b style="color:'+sColor(p.score)+'">'+p.score+'</b></button>';
    });
    return h+'</div>';
  }
  return '<div class="places">'+col(ix("best_cities"),c.best,"b")+col(ix("worst"),c.worst,"w")+'</div>';
}
var current=null;
OV.onData(function(d){current=d;render(d)});
document.addEventListener("click",function(e){
  var u=e.target.closest("[data-u]");if(u){unit=u.getAttribute("data-u");try{localStorage.setItem("ov-unit",unit)}catch(x){}if(current)render(current);return}
  var pc=e.target.closest("[data-city]");
  if(pc&&current){var k=pc.getAttribute("data-city");var p=(k[0]==="b"?current.cities.best:current.cities.worst)[+k.slice(1)];if(p)OV.openLink(OV.siteUrl(p.url));return}
  var a=e.target.closest("[data-act]");if(!a||!current)return;e.preventDefault();
  var act=a.getAttribute("data-act");
  if(act==="open")OV.openLink(OV.siteUrl(current.url));
  if(act==="home")OV.openLink("${SITE}/"+OV.locale());
  if(act==="best")OV.ask(t("ask_best"));
});
`;

// ------------------------------------------------------------------
// 2. Лучшая погода (list_best_weather_countries)
// ------------------------------------------------------------------

const BEST_I18N = {
  en: { title: "Best travel weather today", sub: "Campervan travel score, 0–100 · tap a country for details", open: "Open the weather map", ask: "Show the travel weather in {c}", ideal: "Ideal", comfortable: "Comfortable", acceptable: "Acceptable", hard: "Tough", extreme: "Extreme" },
  ru: { title: "Лучшая погода для поездки сегодня", sub: "Индекс для автодома, 0–100 · нажмите на страну", open: "Открыть карту погоды", ask: "Покажи погоду для поездки: {c}", ideal: "Идеально", comfortable: "Комфортно", acceptable: "Терпимо", hard: "Сложно", extreme: "Экстрим" },
  de: { title: "Bestes Reisewetter heute", sub: "Camper-Index 0–100 · Land antippen für Details", open: "Wetterkarte öffnen", ask: "Zeig das Reisewetter in {c}", ideal: "Ideal", comfortable: "Angenehm", acceptable: "Akzeptabel", hard: "Schwierig", extreme: "Extrem" },
  fr: { title: "Meilleure météo de voyage aujourd’hui", sub: "Indice van 0–100 · touchez un pays", open: "Ouvrir la carte météo", ask: "Montre la météo du voyage : {c}", ideal: "Idéal", comfortable: "Confortable", acceptable: "Acceptable", hard: "Difficile", extreme: "Extrême" },
  es: { title: "Mejor tiempo para viajar hoy", sub: "Índice camper 0–100 · toca un país", open: "Abrir el mapa del tiempo", ask: "Muestra el tiempo para viajar en {c}", ideal: "Ideal", comfortable: "Cómodo", acceptable: "Aceptable", hard: "Difícil", extreme: "Extremo" },
  pt: { title: "Melhor tempo para viajar hoje", sub: "Índice autocaravana 0–100 · toque num país", open: "Abrir o mapa do tempo", ask: "Mostra o tempo para viajar em {c}", ideal: "Ideal", comfortable: "Confortável", acceptable: "Aceitável", hard: "Difícil", extreme: "Extremo" },
  tr: { title: "Bugün seyahat için en iyi hava", sub: "Karavan endeksi 0–100 · ülkeye dokunun", open: "Hava haritasını aç", ask: "{c} için seyahat havasını göster", ideal: "İdeal", comfortable: "Rahat", acceptable: "Kabul edilebilir", hard: "Zor", extreme: "Aşırı" },
};

const BEST_CSS = `
.list{list-style:none;margin:0;padding:6px 0}
.item{display:flex;align-items:center;gap:10px;padding:8px 16px;min-height:44px;width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left}
.item:hover{background:var(--ov-bg2)}
.rank{width:18px;font-size:12px;color:var(--ov-text3);text-align:right;flex:none}
.temp{font-size:12px;color:var(--ov-text2);flex:none;display:flex;align-items:center;gap:4px}
.track{width:64px;height:6px;border-radius:3px;background:var(--ov-bg2);flex:none;overflow:hidden}
.track i{display:block;height:100%;border-radius:3px}
.score{width:28px;text-align:right;font-weight:700;flex:none}
@media (max-width:360px){.track{display:none}}
`;

const BEST_SKELETON = `<div class="card"><div class="hero"><div class="skel" style="height:22px;width:70%;opacity:.4"></div></div><div class="body"><div class="skel" style="height:180px"></div></div></div>`;

const BEST_JS = `
var T=${JSON.stringify(BEST_I18N)};
${WEATHER_ICON_JS}
${COUNTRY_JS}
function t(k){return OV.t(T,k)}
var E=OV.esc,current=null;
function deg(c){if(c==null)return "";var f=OV.imperial();return Math.round(f?c*9/5+32:c)+"°"}
function render(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+t("title")+'</h1><div class="sub">'+t("sub")+'</div></div><ul class="list">';
  (d.countries||[]).forEach(function(c,i){
    var col=LABEL_COLOR[c.label]||"var(--ov-comfy)";
    h+='<li><button class="item tap" data-i="'+i+'" title="'+E(t(c.label))+'"><span class="rank">'+(i+1)+'</span>'+flag(c.code,"flag-sm")+'<span class="grow ellipsis">'+E(cName(c.code,c.name))+'</span>';
    h+='<span class="temp">'+wIcon(c.weather_code,16)+deg(c.temp_day)+'</span><span class="track"><i style="width:'+(c.score||0)+'%;background:'+col+'"></i></span><span class="score" style="color:'+col+'">'+c.score+'</span></button></li>';
  });
  h+='</ul><div class="actions"><button class="btn btn-primary" data-act="open">'+t("open")+'</button></div>';
  h+='<div class="foot"><span>Open-Meteo</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>';
  document.getElementById("app").innerHTML=h;
}
OV.onData(function(d){current=d;render(d)});
document.addEventListener("click",function(e){
  if(!current)return;
  var it=e.target.closest("[data-i]");
  if(it){var c=current.countries[+it.getAttribute("data-i")];OV.ask(t("ask").replace("{c}",cName(c.code,c.name)));return}
  var a=e.target.closest("[data-act]");if(!a)return;e.preventDefault();
  if(a.getAttribute("data-act")==="open")OV.openLink(OV.siteUrl(current.url));
  else OV.openLink("${SITE}/"+OV.locale());
});
`;

// ------------------------------------------------------------------
// 3. События (list_events + get_event)
// ------------------------------------------------------------------

const EVENTS_I18N = {
  en: { upcoming: "Upcoming vanlife events", ongoing: "Events happening now", past: "Past events", all: "Vanlife events", found: "{n} found", all_events: "All events", details: "Details", on_site: "On OpenVan", official: "Official site", organizer: "Organizer", price: "Admission", tba: "Dates TBA", expo: "Expo", festival: "Festival", forum: "Forum", meetup: "Meetup", roadtrip: "Road trip" },
  ru: { upcoming: "Ближайшие события", ongoing: "События сейчас", past: "Прошедшие события", all: "События", found: "найдено: {n}", all_events: "Все события", details: "Подробнее", on_site: "На OpenVan", official: "Официальный сайт", organizer: "Организатор", price: "Вход", tba: "Даты уточняются", expo: "Выставка", festival: "Фестиваль", forum: "Форум", meetup: "Встреча", roadtrip: "Автопробег" },
  de: { upcoming: "Kommende Vanlife-Events", ongoing: "Events gerade jetzt", past: "Vergangene Events", all: "Vanlife-Events", found: "{n} gefunden", all_events: "Alle Events", details: "Details", on_site: "Auf OpenVan", official: "Offizielle Website", organizer: "Veranstalter", price: "Eintritt", tba: "Termin folgt", expo: "Messe", festival: "Festival", forum: "Forum", meetup: "Treffen", roadtrip: "Roadtrip" },
  fr: { upcoming: "Événements vanlife à venir", ongoing: "Événements en cours", past: "Événements passés", all: "Événements vanlife", found: "{n} trouvés", all_events: "Tous les événements", details: "Détails", on_site: "Sur OpenVan", official: "Site officiel", organizer: "Organisateur", price: "Entrée", tba: "Dates à venir", expo: "Salon", festival: "Festival", forum: "Forum", meetup: "Rencontre", roadtrip: "Road trip" },
  es: { upcoming: "Próximos eventos vanlife", ongoing: "Eventos en curso", past: "Eventos pasados", all: "Eventos vanlife", found: "{n} encontrados", all_events: "Todos los eventos", details: "Detalles", on_site: "En OpenVan", official: "Web oficial", organizer: "Organizador", price: "Entrada", tba: "Fechas por confirmar", expo: "Feria", festival: "Festival", forum: "Foro", meetup: "Encuentro", roadtrip: "Ruta" },
  pt: { upcoming: "Próximos eventos vanlife", ongoing: "Eventos a decorrer", past: "Eventos passados", all: "Eventos vanlife", found: "{n} encontrados", all_events: "Todos os eventos", details: "Detalhes", on_site: "No OpenVan", official: "Site oficial", organizer: "Organizador", price: "Entrada", tba: "Datas a confirmar", expo: "Feira", festival: "Festival", forum: "Fórum", meetup: "Encontro", roadtrip: "Road trip" },
  tr: { upcoming: "Yaklaşan karavan etkinlikleri", ongoing: "Şu an süren etkinlikler", past: "Geçmiş etkinlikler", all: "Karavan etkinlikleri", found: "{n} bulundu", all_events: "Tüm etkinlikler", details: "Ayrıntılar", on_site: "OpenVan’da", official: "Resmî site", organizer: "Organizatör", price: "Giriş", tba: "Tarih belli değil", expo: "Fuar", festival: "Festival", forum: "Forum", meetup: "Buluşma", roadtrip: "Yol gezisi" },
};

const EVENTS_CSS = `
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:14px 16px 4px;scroll-padding-inline:16px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.ev{flex:0 0 220px;scroll-snap-align:start;background:var(--ov-bg);border:1px solid var(--ov-border);border-radius:var(--ov-radius);overflow:hidden;display:flex;flex-direction:column;cursor:pointer;text-align:left;padding:0;font:inherit;color:inherit}
.ev:hover{border-color:var(--ov-primary)}
.media{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#4E8097 0%,#5E8D34 100%);overflow:hidden;isolation:isolate}
.media::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--ov-pat) center/cover;opacity:.18}
.media img{width:100%;height:100%;object-fit:cover;display:block}
.date{position:absolute;top:8px;left:8px;background:#fff;color:#111827;border-radius:8px;padding:4px 8px;text-align:center;line-height:1.05;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.date b{display:block;font-size:17px}
.date small{font-size:10px;text-transform:uppercase;letter-spacing:.04em}
.type{position:absolute;bottom:8px;left:8px}
.ev-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.ev-name{font-weight:700;font-size:14px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ev-where{font-size:12px;color:var(--ov-text3);display:flex;align-items:center;gap:6px;margin-top:auto}
.one .media{aspect-ratio:2/1}
.one .h1{color:var(--ov-text)}
.facts{display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:13px;color:var(--ov-text2)}
.sum{margin-top:10px;color:var(--ov-text2);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
`;

const EVENTS_SKELETON = `<div class="card"><div class="hero"><div class="skel" style="height:22px;width:60%;opacity:.4"></div></div><div class="rail"><div class="skel" style="flex:0 0 220px;height:210px"></div><div class="skel" style="flex:0 0 220px;height:210px"></div></div></div>`;

const EVENTS_JS = `
var T=${JSON.stringify(EVENTS_I18N)};
${COUNTRY_JS}
function t(k){return OV.t(T,k)}
var E=OV.esc,current=null;
function dt(s,o){try{return new Date(s+"T12:00:00").toLocaleDateString(OV.locale(),o)}catch(e){return s}}
function range(a,b){
  if(!a)return t("tba");
  var o={day:"numeric",month:"short"};
  if(!b||b===a)return dt(a,Object.assign({year:"numeric"},o));
  return dt(a,o)+" – "+dt(b,Object.assign({year:"numeric"},o));
}
function typeLabel(e){return T.en[e.type]?t(e.type):(e.type_label||"")}
function media(e,big){
  var h='<div class="media">';
  if(e.image)h+='<img src="'+E(e.image)+'" alt="" loading="lazy" onerror="this.remove()">';
  if(e.start){h+='<div class="date"><b>'+E(dt(e.start,{day:"numeric"}))+'</b><small>'+E(dt(e.start,{month:"short"}))+'</small></div>'}
  if(e.type)h+='<span class="chip chip-glass type">'+E(typeLabel(e))+'</span>';
  return h+'</div>';
}
function where(e){return [e.city,cName(e.country_code,e.country_name)].filter(Boolean).join(", ")}
function renderList(d){
  var evs=d.events||[];
  var h='<div class="card"><div class="hero"><div class="head"><div><h1 class="h1">'+t(d.status||"upcoming")+'</h1><div class="sub">'+E(t("found").replace("{n}",d.total||evs.length))+'</div></div></div></div><div class="rail">';
  evs.forEach(function(e,i){
    h+='<button class="ev" data-i="'+i+'">'+media(e)+'<div class="ev-body"><div class="ev-name">'+E(e.name)+'</div><div class="muted">'+E(range(e.start,e.end))+'</div><div class="ev-where">'+flag(e.country_code,"flag-sm")+'<span class="ellipsis">'+E(where(e))+'</span></div></div></button>';
  });
  h+='</div><div class="actions" style="padding-top:10px"><button class="btn btn-primary" data-act="all">'+t("all_events")+'</button></div>';
  h+='<div class="foot"><span></span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>';
  document.getElementById("app").innerHTML=h;
}
function renderOne(e){
  var h='<div class="card one">'+media(e,true)+'<div class="body"><h1 class="h1">'+E(e.name)+'</h1><div class="facts">';
  h+='<div class="row"><span>'+E(range(e.start,e.end))+'</span></div>';
  h+='<div class="row">'+flag(e.country_code,"flag-sm")+'<span>'+E([e.venue,where(e)].filter(Boolean).join(" · "))+'</span></div>';
  if(e.organizer)h+='<div>'+t("organizer")+': '+E(e.organizer)+'</div>';
  if(e.price)h+='<div>'+t("price")+': '+E(e.price)+'</div>';
  h+='</div>'+(e.summary?'<div class="sum">'+E(e.summary)+'</div>':'')+'</div>';
  h+='<div class="actions"><button class="btn btn-primary" data-act="site">'+t("on_site")+'</button>'+(e.official_url?'<button class="btn btn-ghost" data-act="official">'+t("official")+'</button>':'')+'</div>';
  h+='<div class="foot"><span></span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>';
  document.getElementById("app").innerHTML=h;
}
OV.onData(function(d){current=d;if(d.event)renderOne(d.event);else renderList(d)});
document.addEventListener("click",function(ev){
  if(!current)return;
  var c=ev.target.closest("[data-i]");
  if(c){var e=current.events[+c.getAttribute("data-i")];if(e&&e.url)OV.openLink(OV.siteUrl(e.url));return}
  var a=ev.target.closest("[data-act]");if(!a)return;ev.preventDefault();
  var act=a.getAttribute("data-act");
  if(act==="all")OV.openLink("${SITE}/"+OV.locale()+"/events");
  if(act==="site"&&current.event)OV.openLink(OV.siteUrl(current.event.url));
  if(act==="official"&&current.event)OV.openLink(current.event.official_url);
  if(act==="home")OV.openLink("${SITE}/"+OV.locale());
});
`;

const HTML: Record<string, { name: string; description: string; html: string }> = {
  [WIDGETS.weather]: {
    name: "Country travel weather card",
    description: "Card with today's campervan travel score for a country, sleep/driving/solar scores and a 7-day forecast.",
    html: page({ title: "Travel weather", css: WEATHER_CSS, skeleton: WEATHER_SKELETON, script: WEATHER_JS, pattern: 3 }),
  },
  [WIDGETS.bestWeather]: {
    name: "Best travel weather ranking",
    description: "Ranking of countries with the best campervan travel weather today.",
    html: page({ title: "Best travel weather", css: BEST_CSS, skeleton: BEST_SKELETON, script: BEST_JS, pattern: 9 }),
  },
  [WIDGETS.events]: {
    name: "Vanlife events",
    description: "Carousel of vanlife events (expos, festivals, meetups) or a single event card with dates, place and links.",
    html: page({ title: "Vanlife events", css: EVENTS_CSS, skeleton: EVENTS_SKELETON, script: EVENTS_JS, pattern: 12 }),
  },
};

/** Регистрирует ресурсы карточек на сервере. */
export function registerWidgets(server: McpServer): void {
  for (const [uri, w] of Object.entries({ ...HTML, ...MONEY_HTML, ...TRAVEL_HTML })) {
    const meta = resourceMeta(w.description);
    server.registerResource(
      w.name,
      uri,
      { title: w.name, description: w.description, mimeType: MIME, _meta: meta },
      async () => ({ contents: [{ uri, mimeType: MIME, text: w.html, _meta: meta }] })
    );
  }
}

/** Ссылка на картинку для карточки: свои файлы — напрямую, чужие — через wsrv.nl, как на сайте. */
export function cardImage(url: string | null | undefined, width = 640, height = 360): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, SITE);
    if (u.hostname === "openvan.camp") return u.toString();
    return `https://wsrv.nl/?url=${encodeURIComponent(u.toString())}&w=${width}&h=${height}&fit=cover&output=webp`;
  } catch {
    return null;
  }
}
