import { page, SITE, UI_BASE } from "./bridge.js";
import { COUNTRY_JS } from "./snippets.js";

/**
 * Карточки «в дорогу»: новости, визы и ввоз авто, платные дороги, справка по стране
 * (праздники, опасности, пожары, розетки, таможня), номера машин.
 *
 * Названия, метки режимов въезда и праздников приходят из API уже на языке разговора
 * (инструмент передаёт locale). Здесь переведены только подписи самой карточки.
 */

export const TRAVEL_WIDGETS = {
  news: `${UI_BASE}news.html`,
  visa: `${UI_BASE}visa.html`,
  tolls: `${UI_BASE}tolls.html`,
  country: `${UI_BASE}country-info.html`,
  plates: `${UI_BASE}plates.html`,
  brief: `${UI_BASE}country-brief.html`,
} as const;

const COMMON_CSS = `
.list{list-style:none;margin:0;padding:4px 0}
.li{display:flex;gap:10px;align-items:flex-start;padding:10px 16px}
.li+.li{border-top:1px solid var(--ov-border)}
.li .grow{min-width:0}
.t1{font-weight:600}
.t2{font-size:12px;color:var(--ov-text3);margin-top:2px}
.tag{display:inline-flex;align-items:center;font-size:11px;font-weight:700;border-radius:9999px;padding:2px 8px;white-space:nowrap}
.ok{background:rgba(118,176,65,.18);color:#3f6e1b}
.mid{background:rgba(244,208,63,.28);color:#6b5400}
.bad{background:rgba(192,57,43,.14);color:#9b2c20}
.neu{background:var(--ov-bg2);color:var(--ov-text2)}
.blk{background:#111827;color:#fff}
:root[data-theme=dark] .ok{color:#a7d97a}:root[data-theme=dark] .mid{color:#f1d264}:root[data-theme=dark] .bad{color:#f19a90}
.box{background:var(--ov-bg2);border-radius:var(--ov-radius-sm);padding:10px 12px;font-size:13px;color:var(--ov-text2)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px}
.kv dt{color:var(--ov-text3)}.kv dd{margin:0;color:var(--ov-text)}
.sec{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ov-text3);margin:14px 0 6px}
.more{padding:6px 16px 0;font-size:12px;color:var(--ov-text3)}
details.q summary{cursor:pointer;font-size:12px;color:var(--ov-primary);min-height:28px;display:flex;align-items:center}
details.q blockquote{margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--ov-border);font-size:12px;color:var(--ov-text2)}
.date-in{font:inherit;font-size:16px;padding:8px 10px;border-radius:var(--ov-radius-sm);border:1px solid var(--ov-border);background:var(--ov-bg);color:var(--ov-text);min-height:44px}
`;

const SKELETON = `<div class="card"><div class="hero"><div class="skel" style="height:22px;width:60%;opacity:.4"></div></div><div class="body"><div class="skel" style="height:140px"></div></div></div>`;

/** Общие помощники клиентского JS. */
const HELPERS_JS = `
${COUNTRY_JS}
var E=OV.esc,current=null;
function dt(s,o){if(!s)return "";try{return new Date(String(s).length===10?s+"T12:00:00":s).toLocaleDateString(OV.locale(),o||{day:"numeric",month:"short",year:"numeric"})}catch(e){return s}}
function foot(note){return '<div class="foot"><span>'+E(note||"")+'</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>'}
function btns(list){var h='<div class="actions">';list.forEach(function(b,i){if(b)h+='<button class="btn '+(i?"btn-ghost":"btn-primary")+'" data-link="'+E(b[1])+'">'+E(b[0])+'</button>'});return h+'</div>'}
function draw(h){document.getElementById("app").innerHTML=h}
document.addEventListener("click",function(e){
  var l=e.target.closest("[data-link]");if(l){e.preventDefault();OV.openLink(OV.siteUrl(l.getAttribute("data-link")));return}
  var a=e.target.closest("[data-act=home]");if(a){e.preventDefault();OV.openLink("${SITE}/"+OV.locale())}
});
`;

// ------------------------------------------------------------------
// 1. Новости (search_stories)
// ------------------------------------------------------------------

const NEWS_I18N = {
  en: { none: "No news found for this request.", title: "Vanlife news", found: "{n} stories", all: "All news", sources: "{n} sources" },
  ru: { none: "По этому запросу новостей нет.", title: "Новости ванлайфа", found: "сюжетов: {n}", all: "Все новости", sources: "источников: {n}" },
  de: { none: "Keine News zu dieser Anfrage.", title: "Vanlife-News", found: "{n} Meldungen", all: "Alle News", sources: "{n} Quellen" },
  fr: { none: "Aucune actualité pour cette recherche.", title: "Actualités vanlife", found: "{n} sujets", all: "Toutes les actualités", sources: "{n} sources" },
  es: { none: "No hay noticias para esta búsqueda.", title: "Noticias vanlife", found: "{n} noticias", all: "Todas las noticias", sources: "{n} fuentes" },
  pt: { none: "Sem notícias para este pedido.", title: "Notícias vanlife", found: "{n} notícias", all: "Todas as notícias", sources: "{n} fontes" },
  tr: { none: "Bu arama için haber yok.", title: "Karavan haberleri", found: "{n} haber", all: "Tüm haberler", sources: "{n} kaynak" },
};

const NEWS_CSS = `
.rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:14px 16px 4px;scroll-padding-inline:16px}
.st{flex:0 0 240px;scroll-snap-align:start;border:1px solid var(--ov-border);border-radius:var(--ov-radius);overflow:hidden;background:var(--ov-bg);display:flex;flex-direction:column;cursor:pointer;padding:0;font:inherit;color:inherit;text-align:left}
.st:hover{border-color:var(--ov-primary)}
.st .m{aspect-ratio:1200/630;background:linear-gradient(135deg,#4E8097,#5E8D34)}
.st .m img{width:100%;height:100%;object-fit:cover;display:block}
.st .b{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.st .h{font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.st .s{font-size:12px;color:var(--ov-text2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.st .meta{margin-top:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ov-text3)}
`;

const NEWS_JS = `
var T=${JSON.stringify(NEWS_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
OV.onData(function(d){current=d;
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("title"))+(d.query?' · '+E(d.query):'')+'</h1><div class="sub">'+E(t("found").replace("{n}",d.total||d.stories.length))+'</div></div><div class="rail">';
  if(!d.stories.length)h+='<div class="body">'+E(t("none"))+'</div>';
  d.stories.forEach(function(s){
    h+='<button class="st" data-link="'+E(s.url)+'"><div class="m">'+(s.image?'<img src="'+E(s.image)+'" alt="" loading="lazy" onerror="this.remove()">':'')+'</div><div class="b">';
    if(s.category)h+='<span class="tag neu" style="align-self:flex-start">'+E(s.category)+'</span>';
    h+='<div class="h">'+E(s.title)+'</div>'+(s.summary?'<div class="s">'+E(s.summary)+'</div>':'');
    h+='<div class="meta">'+(s.countries||[]).slice(0,3).map(function(c){return flag(c,"flag-sm")}).join("")+'<span>'+E(dt(s.date,{day:"numeric",month:"short"}))+'</span>'+(s.sources>1?'<span>· '+E(t("sources").replace("{n}",s.sources))+'</span>':'')+'</div></div></button>';
  });
  draw(h+'</div>'+btns([[t("all"),d.url]])+foot(""));
});
`;

// ------------------------------------------------------------------
// 2. Визы и ввоз авто (check_visa_rules, get_route_visa_rules, get_vehicle_import_rules)
// ------------------------------------------------------------------

const VISA_I18N = {
  en: { conf_high: "high", conf_medium: "medium", conf_low: "low", weight: "Weight", term: "How long", visa_free: "Visa-free", visa_required: "Visa required", e_visa: "e-Visa", eta: "Travel authorisation (ETA)", visa_on_arrival: "Visa on arrival", home: "Own country", unknown: "No data", per_entry: "{n} days per entry", in_window: "{t} days in any {w} days", per_year: "per calendar year", no_limit: "no day limit", run_yes: "Leaving and re-entering restarts the count", run_no: "Leaving and re-entering does NOT restart the count", zone: "Days count across the whole {z} zone", vehicle: "Your vehicle", tied: "Stays as long as you do", days: "{n} days", carnet: "Carnet de Passages", needed: "required", not_needed: "not needed", green: "Insurance", gc_required: "Green Card required", gc_border: "buy insurance at the border", gc_not_required: "Green Card not needed", le35: "up to 3.5 t", gt35: "over 3.5 t", entry: "Entry date", leave_by: "Leave by {d}", confidence: "Confidence", checked: "checked {d}", source: "Official source", open: "Open on OpenVan.camp", disclaimer: "Reference data, not legal advice — rules change; check with the consulate.", route: "Visa rules along the route", tightest: "Tightest: {c}", import: "Temporary vehicle import", unverified: "unverified source" },
  ru: { conf_high: "высокая", conf_medium: "средняя", conf_low: "низкая", weight: "Масса", term: "Срок", visa_free: "Без визы", visa_required: "Нужна виза", e_visa: "Электронная виза", eta: "Электронное разрешение (ETA)", visa_on_arrival: "Виза по прилёту", home: "Своя страна", unknown: "Нет данных", per_entry: "{n} дней за въезд", in_window: "{t} дней в любые {w} дней", per_year: "за календарный год", no_limit: "без ограничения по дням", run_yes: "Выезд и повторный въезд обнуляют счёт", run_no: "Выезд и повторный въезд НЕ обнуляют счёт", zone: "Дни считаются по всей зоне {z}", vehicle: "Ваша машина", tied: "Может находиться столько же, сколько вы", days: "{n} дней", carnet: "Карне (Carnet de Passages)", needed: "нужно", not_needed: "не нужно", green: "Страховка", gc_required: "нужна Зелёная карта", gc_border: "страховку купить на границе", gc_not_required: "Зелёная карта не нужна", le35: "до 3,5 т", gt35: "свыше 3,5 т", entry: "Дата въезда", leave_by: "Выехать до {d}", confidence: "Надёжность", checked: "проверено {d}", source: "Официальный источник", open: "Открыть на OpenVan.camp", disclaimer: "Справочные данные, не юридическая консультация — правила меняются, уточняйте в консульстве.", route: "Визы по маршруту", tightest: "Самое строгое: {c}", import: "Временный ввоз авто", unverified: "непроверенный источник" },
  de: { conf_high: "hoch", conf_medium: "mittel", conf_low: "niedrig", weight: "Gewicht", term: "Dauer", visa_free: "Visumfrei", visa_required: "Visum nötig", e_visa: "E-Visum", eta: "Reisegenehmigung (ETA)", visa_on_arrival: "Visum bei Ankunft", home: "Eigenes Land", unknown: "Keine Daten", per_entry: "{n} Tage pro Einreise", in_window: "{t} Tage in beliebigen {w} Tagen", per_year: "pro Kalenderjahr", no_limit: "ohne Tageslimit", run_yes: "Aus- und Wiedereinreise setzt die Zählung zurück", run_no: "Aus- und Wiedereinreise setzt die Zählung NICHT zurück", zone: "Tage zählen für die ganze Zone {z}", vehicle: "Ihr Fahrzeug", tied: "Bleibt so lange wie Sie", days: "{n} Tage", carnet: "Carnet de Passages", needed: "nötig", not_needed: "nicht nötig", green: "Versicherung", gc_required: "Grüne Karte nötig", gc_border: "Versicherung an der Grenze kaufen", gc_not_required: "Grüne Karte nicht nötig", le35: "bis 3,5 t", gt35: "über 3,5 t", entry: "Einreisedatum", leave_by: "Ausreise bis {d}", confidence: "Verlässlichkeit", checked: "geprüft {d}", source: "Offizielle Quelle", open: "Auf OpenVan.camp öffnen", disclaimer: "Referenzdaten, keine Rechtsberatung — Regeln ändern sich, beim Konsulat prüfen.", route: "Visaregeln entlang der Route", tightest: "Am strengsten: {c}", import: "Vorübergehende Fahrzeugeinfuhr", unverified: "ungeprüfte Quelle" },
  fr: { conf_high: "élevée", conf_medium: "moyenne", conf_low: "faible", weight: "Poids", term: "Durée", visa_free: "Sans visa", visa_required: "Visa obligatoire", e_visa: "Visa électronique", eta: "Autorisation de voyage (ETA)", visa_on_arrival: "Visa à l’arrivée", home: "Pays d’origine", unknown: "Pas de données", per_entry: "{n} jours par entrée", in_window: "{t} jours sur toute période de {w} jours", per_year: "par année civile", no_limit: "sans limite de jours", run_yes: "Sortir et revenir remet le compteur à zéro", run_no: "Sortir et revenir NE remet PAS le compteur à zéro", zone: "Les jours comptent pour toute la zone {z}", vehicle: "Votre véhicule", tied: "Reste aussi longtemps que vous", days: "{n} jours", carnet: "Carnet de Passages", needed: "obligatoire", not_needed: "pas nécessaire", green: "Assurance", gc_required: "Carte verte obligatoire", gc_border: "assurance à acheter à la frontière", gc_not_required: "Carte verte inutile", le35: "jusqu’à 3,5 t", gt35: "plus de 3,5 t", entry: "Date d’entrée", leave_by: "Sortir avant le {d}", confidence: "Fiabilité", checked: "vérifié le {d}", source: "Source officielle", open: "Ouvrir sur OpenVan.camp", disclaimer: "Données de référence, pas un avis juridique — les règles changent, vérifiez auprès du consulat.", route: "Visas sur l’itinéraire", tightest: "Le plus strict : {c}", import: "Importation temporaire du véhicule", unverified: "source non vérifiée" },
  es: { conf_high: "alta", conf_medium: "media", conf_low: "baja", weight: "Peso", term: "Plazo", visa_free: "Sin visado", visa_required: "Visado obligatorio", e_visa: "Visado electrónico", eta: "Autorización de viaje (ETA)", visa_on_arrival: "Visado a la llegada", home: "País propio", unknown: "Sin datos", per_entry: "{n} días por entrada", in_window: "{t} días en cualquier periodo de {w} días", per_year: "por año natural", no_limit: "sin límite de días", run_yes: "Salir y volver a entrar reinicia la cuenta", run_no: "Salir y volver a entrar NO reinicia la cuenta", zone: "Los días cuentan para toda la zona {z}", vehicle: "Tu vehículo", tied: "Puede quedarse lo mismo que tú", days: "{n} días", carnet: "Carnet de Passages", needed: "obligatorio", not_needed: "no hace falta", green: "Seguro", gc_required: "Carta Verde obligatoria", gc_border: "seguro en la frontera", gc_not_required: "Carta Verde no necesaria", le35: "hasta 3,5 t", gt35: "más de 3,5 t", entry: "Fecha de entrada", leave_by: "Salir antes del {d}", confidence: "Fiabilidad", checked: "verificado {d}", source: "Fuente oficial", open: "Abrir en OpenVan.camp", disclaimer: "Datos de referencia, no asesoría legal — las normas cambian, consulta al consulado.", route: "Visados en la ruta", tightest: "Lo más estricto: {c}", import: "Importación temporal del vehículo", unverified: "fuente no verificada" },
  pt: { conf_high: "alta", conf_medium: "média", conf_low: "baixa", weight: "Peso", term: "Prazo", visa_free: "Sem visto", visa_required: "Visto obrigatório", e_visa: "Visto eletrónico", eta: "Autorização de viagem (ETA)", visa_on_arrival: "Visto à chegada", home: "País próprio", unknown: "Sem dados", per_entry: "{n} dias por entrada", in_window: "{t} dias em qualquer período de {w} dias", per_year: "por ano civil", no_limit: "sem limite de dias", run_yes: "Sair e voltar a entrar reinicia a contagem", run_no: "Sair e voltar a entrar NÃO reinicia a contagem", zone: "Os dias contam para toda a zona {z}", vehicle: "O seu veículo", tied: "Pode ficar o mesmo tempo que você", days: "{n} dias", carnet: "Carnet de Passages", needed: "obrigatório", not_needed: "não é preciso", green: "Seguro", gc_required: "Carta Verde obrigatória", gc_border: "seguro na fronteira", gc_not_required: "Carta Verde não é precisa", le35: "até 3,5 t", gt35: "mais de 3,5 t", entry: "Data de entrada", leave_by: "Sair até {d}", confidence: "Fiabilidade", checked: "verificado {d}", source: "Fonte oficial", open: "Abrir no OpenVan.camp", disclaimer: "Dados de referência, não aconselhamento jurídico — as regras mudam, confirme no consulado.", route: "Vistos ao longo da rota", tightest: "O mais restrito: {c}", import: "Importação temporária do veículo", unverified: "fonte não verificada" },
  tr: { conf_high: "yüksek", conf_medium: "orta", conf_low: "düşük", weight: "Ağırlık", term: "Süre", visa_free: "Vizesiz", visa_required: "Vize gerekli", e_visa: "E-vize", eta: "Seyahat izni (ETA)", visa_on_arrival: "Kapıda vize", home: "Kendi ülkesi", unknown: "Veri yok", per_entry: "Giriş başına {n} gün", in_window: "Herhangi {w} günde {t} gün", per_year: "takvim yılı başına", no_limit: "gün sınırı yok", run_yes: "Çıkıp yeniden girmek sayacı sıfırlar", run_no: "Çıkıp yeniden girmek sayacı SIFIRLAMAZ", zone: "Günler tüm {z} bölgesi için sayılır", vehicle: "Aracınız", tied: "Sizinle aynı süre kalabilir", days: "{n} gün", carnet: "Carnet de Passages", needed: "gerekli", not_needed: "gerekmez", green: "Sigorta", gc_required: "Yeşil Kart gerekli", gc_border: "sigorta sınırda alınır", gc_not_required: "Yeşil Kart gerekmez", le35: "3,5 t’ye kadar", gt35: "3,5 t üzeri", entry: "Giriş tarihi", leave_by: "{d} tarihine kadar çıkış", confidence: "Güvenilirlik", checked: "kontrol {d}", source: "Resmî kaynak", open: "OpenVan.camp’da aç", disclaimer: "Bilgi amaçlıdır, hukuki tavsiye değildir — kurallar değişir, konsolosluğa danışın.", route: "Güzergâhtaki vize kuralları", tightest: "En sıkı: {c}", import: "Aracın geçici ithali", unverified: "doğrulanmamış kaynak" },
};

const VISA_CSS = `
.verdict{font-size:24px;font-weight:800;letter-spacing:-.01em;margin-top:10px}
.calc{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}
.calc label{font-size:12px;color:var(--ov-text3);display:flex;flex-direction:column;gap:4px}
.calc .res{font-weight:700;font-size:15px}
.leg{display:flex;gap:12px;padding:10px 16px;position:relative}
.leg+.leg{border-top:1px solid var(--ov-border)}
.leg .dot{width:28px;flex:none;display:flex;justify-content:center;padding-top:2px}
.leg.tight{background:rgba(192,57,43,.06)}
.rowv{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;font-size:13px;color:var(--ov-text2)}
.warn{font-size:12px;color:var(--ov-text2);margin-top:4px}
`;

const VISA_JS = `
var T=${JSON.stringify(VISA_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
function cls(m){return m==="visa_free"||m==="home"||m==="citizen"?"ok":m==="visa_required"?"bad":m?"mid":"neu"}
function gc(v){return v==="required"?t("gc_required"):v==="border_insurance"?t("gc_border"):v==="not_required"?t("gc_not_required"):v}
function vehicleRows(v){
  var h='<dl class="kv">';
  if(v.weight_class)h+='<dt>'+E(t("weight"))+'</dt><dd>'+E(t(v.weight_class))+'</dd>';
  h+='<dt>'+E(t("term"))+'</dt><dd>'+E(v.basis==="tied_to_person"?t("tied"):v.max_days?t("days").replace("{n}",v.max_days):"—")+'</dd>';
  if(v.carnet_required!=null)h+='<dt>'+E(t("carnet"))+'</dt><dd>'+E(v.carnet_required?t("needed"):t("not_needed"))+'</dd>';
  if(v.green_card)h+='<dt>'+E(t("green"))+'</dt><dd>'+E(gc(v.green_card))+'</dd>';
  h+='</dl>';
  if(v.note)h+='<div class="box" style="margin-top:8px">'+E(v.note)+'</div>';
  return h;
}
function stayText(s){
  var p=[];
  if(s.max_continuous)p.push(t("per_entry").replace("{n}",s.max_continuous));
  if(s.window==="rolling"&&s.window_days&&s.max_total)p.push(t("in_window").replace("{t}",s.max_total).replace("{w}",s.window_days));
  else if(s.window==="calendar_year")p.push(t("per_year"));
  else if(s.window==="unlimited")p.push(t("no_limit"));
  if(!p.length&&s.duration)p.push(typeof s.duration==="number"?t("days").replace("{n}",s.duration):String(s.duration).replace(/_/g," "));
  return p.join(" · ");
}
function renderCheck(d){
  var s=d.stay||{},m=d.entry_mode;
  var h='<div class="card"><div class="hero"><div class="row">'+flag(d.passport.code)+'<span style="opacity:.8">→</span>'+flag(d.destination.flag||d.destination.code)+'<h1 class="h1 ellipsis">'+E(d.destination.name||d.destination.code)+'</h1></div>';
  h+='<div class="sub">'+E(d.passport.name||d.passport.code)+'</div><div class="verdict">'+E(t(m||"unknown"))+'</div>'+(d.stay?'<div class="sub">'+E(stayText(s))+'</div>':'')+'</div><div class="body">';
  if(d.counted_against&&d.counted_against!==d.destination.code)h+='<div class="box" style="margin-bottom:8px">'+E(t("zone").replace("{z}",d.counted_against))+'</div>';
  if(s.window==="rolling"&&s.visa_run!=null)h+='<div class="note">'+(s.visa_run?'✓ ':'✕ ')+E(s.visa_run?t("run_yes"):t("run_no"))+'</div>';
  if(s.note)h+='<div class="box" style="margin-top:8px">'+E(s.note)+'</div>';
  if(s.max_continuous)h+='<div class="calc"><label>'+E(t("entry"))+'<input type="date" class="date-in" id="entry"></label><span class="res" id="leave"></span></div>';
  if(d.vehicle){h+='<div class="sec">'+E(t("vehicle"))+'</div>'+vehicleRows(d.vehicle)}
  if(s.confidence)h+='<div class="muted" style="margin-top:12px">'+E(t("confidence"))+': '+E(T.en["conf_"+s.confidence]?t("conf_"+s.confidence):s.confidence)+(s.updated_at?' · '+E(t("checked").replace("{d}",dt(s.updated_at))):'')+'</div>';
  h+='<div class="muted" style="margin-top:6px">'+E(t("disclaimer"))+'</div></div>';
  draw(h+btns([[t("open"),d.url],s.source_url?[t("source"),s.source_url]:null])+foot(""));
  var inp=document.getElementById("entry");
  if(inp){var today=new Date();inp.value=today.toISOString().slice(0,10);calc();inp.addEventListener("input",calc)}
  function calc(){var v=inp.value;var out=document.getElementById("leave");if(!v){out.textContent="";return}
    var e=new Date(v+"T12:00:00");e.setDate(e.getDate()+s.max_continuous-1);out.textContent=t("leave_by").replace("{d}",dt(e.toISOString().slice(0,10)))}
}
function renderRoute(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("route"))+'</h1><div class="sub">'+E(d.legs.map(function(l){return l.name||l.code}).join(" → "))+'</div>';
  if(d.bottleneck&&d.bottleneck.code)h+='<div class="wx-now" style="margin-top:8px"><span class="chip chip-glass">'+E(t("tightest").replace("{c}",(d.bottleneck.name||d.bottleneck.code)+(d.bottleneck.days?" · "+t("days").replace("{n}",d.bottleneck.days):"")))+'</span></div>';
  h+='</div>';
  d.legs.forEach(function(l){
    var tight=d.bottleneck&&d.bottleneck.code===l.code;
    h+='<div class="leg'+(tight?" tight":"")+'"><div class="dot">'+flag(l.flag||l.code,"flag-sm")+'</div><div class="grow"><div class="t1">'+E(l.name||l.code)+'</div>';
    (l.rows||[]).forEach(function(r){h+='<div class="rowv"><span class="tag '+cls(r.mode||(l.home?"home":""))+'">'+E(r.mode_label||t("unknown"))+'</span>'+(r.days_label?'<b>'+E(r.days_label)+'</b>':'')+(r.window_label&&r.window_label!==r.days_label?'<span>'+E(r.window_label)+'</span>':'')+(r.passports&&r.passports.length>1?'<span class="muted">'+E(r.passports.join("/"))+'</span>':'')+'</div>'});
    (l.warnings||[]).forEach(function(w){h+='<div class="warn">⚠ '+E(w)+'</div>'});
    h+='</div></div>';
  });
  draw(h+'<div class="body"><div class="muted">'+E(t("disclaimer"))+'</div></div>'+btns([[t("open"),d.url]])+foot(""));
}
function renderVehicle(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("import"))+'</h1><div class="sub">'+E(d.name)+'</div></div><div class="body">';
  // Непроверенные правила прячем, если у страны есть проверенные: в тексте для модели они остаются.
  var rules=d.rules.some(function(r){return r.curated})?d.rules.filter(function(r){return r.curated}):d.rules;
  rules.forEach(function(r,i){h+=(i?'<div style="height:12px"></div>':'')+vehicleRows(r)+(r.curated?'':'<div class="muted">'+E(t("unverified"))+'</div>')+(r.source_url?'<div style="margin-top:6px"><a href="#" data-link="'+E(r.source_url)+'" class="muted">'+E(t("source"))+' ↗</a></div>':'')});
  h+='<div class="muted" style="margin-top:12px">'+E(t("disclaimer"))+'</div></div>';
  draw(h+btns([[t("open"),d.url]])+foot(""));
}
OV.onData(function(d){current=d;if(d.mode==="route")renderRoute(d);else if(d.mode==="vehicle")renderVehicle(d);else renderCheck(d)});
`;

// ------------------------------------------------------------------
// 3. Платные дороги (get_toll_rates, estimate_route_tolls)
// ------------------------------------------------------------------

const TOLLS_I18N = {
  en: { no_rates: "No tariff data for this vehicle class yet — do not assume it is free.", gate: "Toll section", it_vignette: "Vignette", it_bridge: "Toll bridge", it_tunnel: "Toll tunnel", it_ferry: "Ferry", it_section: "Toll section", no_data_in: "no toll data: {c}", unmeasured_in: "per-km tolls not measured: {c}", title: "Toll roads", route: "Tolls on the route", car: "Car", van: "Camper ≤3.5 t", heavy: "Over 3.5 t", closed: "Tickets: pay by distance at exits", open: "Pay at toll plazas on the road", free_flow: "No barriers: pay online by plate", vignette: "Vignette: pay for time", free: "No motorway tolls", mixed: "Mixed system", per_km: "Motorways per km", vignettes: "Vignettes", objects: "Tunnels, bridges and ferries", period_day: "1 day", partial: "Not all tolls are included — the real total may be higher.", estimate: "Estimate: on ticket motorways the price depends on the exits you use.", buy: "Buy online", verified: "checked {d}", open_btn: "Open toll calculator", km: "km", none: "No tolls found on this route", ferry: "Ferry", tunnel: "Tunnel", bridge: "Bridge", pass: "Mountain pass" },
  ru: { no_rates: "Тарифа для этого класса машин у нас пока нет — бесплатной дорога от этого не становится.", gate: "Платный участок", it_vignette: "Виньетка", it_bridge: "Платный мост", it_tunnel: "Платный тоннель", it_ferry: "Паром", it_section: "Платный участок", no_data_in: "нет данных: {c}", unmeasured_in: "плата за км не измерена: {c}", title: "Платные дороги", route: "Платные дороги на маршруте", car: "Легковая", van: "Автодом ≤3,5 т", heavy: "Свыше 3,5 т", closed: "Талоны: плата за расстояние на выезде", open: "Оплата на пунктах прямо на трассе", free_flow: "Без шлагбаумов: оплата онлайн по номеру", vignette: "Виньетка: плата за срок", free: "Платных автомагистралей нет", mixed: "Смешанная система", per_km: "Автомагистрали за км", vignettes: "Виньетки", objects: "Тоннели, мосты и паромы", period_day: "1 день", partial: "Учтены не все платные участки — итог может быть больше.", estimate: "Оценка: на трассах с талонами цена зависит от выездов.", buy: "Купить онлайн", verified: "проверено {d}", open_btn: "Открыть калькулятор дорог", km: "км", none: "Платных участков на маршруте нет", ferry: "Паром", tunnel: "Тоннель", bridge: "Мост", pass: "Перевал" },
  de: { no_rates: "Für diese Fahrzeugklasse fehlen uns noch Tarife — kostenlos ist die Strecke deshalb nicht.", gate: "Mautstrecke", it_vignette: "Vignette", it_bridge: "Mautbrücke", it_tunnel: "Mauttunnel", it_ferry: "Fähre", it_section: "Mautstrecke", no_data_in: "keine Mautdaten: {c}", unmeasured_in: "km-Maut nicht gemessen: {c}", title: "Mautstraßen", route: "Maut auf der Route", car: "Pkw", van: "Camper ≤3,5 t", heavy: "Über 3,5 t", closed: "Ticket: Zahlung nach Strecke an der Ausfahrt", open: "Zahlung an Mautstellen auf der Strecke", free_flow: "Ohne Schranken: online per Kennzeichen", vignette: "Vignette: Zahlung nach Zeit", free: "Keine Autobahnmaut", mixed: "Gemischtes System", per_km: "Autobahn pro km", vignettes: "Vignetten", objects: "Tunnel, Brücken und Fähren", period_day: "1 Tag", partial: "Nicht alle Mautkosten enthalten — die Summe kann höher sein.", estimate: "Schätzung: Bei Ticketsystemen hängt der Preis von den Ausfahrten ab.", buy: "Online kaufen", verified: "geprüft {d}", open_btn: "Mautrechner öffnen", km: "km", none: "Keine Maut auf dieser Route", ferry: "Fähre", tunnel: "Tunnel", bridge: "Brücke", pass: "Pass" },
  fr: { no_rates: "Pas encore de tarif pour cette catégorie — ce n’est pas pour autant gratuit.", gate: "Tronçon payant", it_vignette: "Vignette", it_bridge: "Pont à péage", it_tunnel: "Tunnel à péage", it_ferry: "Ferry", it_section: "Tronçon payant", no_data_in: "pas de données : {c}", unmeasured_in: "péage au km non mesuré : {c}", title: "Routes à péage", route: "Péages sur l’itinéraire", car: "Voiture", van: "Camping-car ≤3,5 t", heavy: "Plus de 3,5 t", closed: "Ticket : paiement selon la distance à la sortie", open: "Paiement aux barrières sur la route", free_flow: "Sans barrière : paiement en ligne par plaque", vignette: "Vignette : paiement à la durée", free: "Pas d’autoroutes payantes", mixed: "Système mixte", per_km: "Autoroutes au km", vignettes: "Vignettes", objects: "Tunnels, ponts et ferries", period_day: "1 jour", partial: "Tous les péages ne sont pas inclus — le total réel peut être plus élevé.", estimate: "Estimation : avec ticket, le prix dépend des sorties.", buy: "Acheter en ligne", verified: "vérifié le {d}", open_btn: "Ouvrir le calculateur", km: "km", none: "Aucun péage sur cet itinéraire", ferry: "Ferry", tunnel: "Tunnel", bridge: "Pont", pass: "Col" },
  es: { no_rates: "Aún no hay tarifas para esta clase de vehículo — no por eso es gratis.", gate: "Tramo de peaje", it_vignette: "Viñeta", it_bridge: "Puente de peaje", it_tunnel: "Túnel de peaje", it_ferry: "Ferri", it_section: "Tramo de peaje", no_data_in: "sin datos: {c}", unmeasured_in: "peaje por km no medido: {c}", title: "Carreteras de peaje", route: "Peajes en la ruta", car: "Coche", van: "Autocaravana ≤3,5 t", heavy: "Más de 3,5 t", closed: "Ticket: pago por distancia a la salida", open: "Pago en cabinas en la carretera", free_flow: "Sin barreras: pago online por matrícula", vignette: "Viñeta: pago por tiempo", free: "Sin autopistas de peaje", mixed: "Sistema mixto", per_km: "Autopistas por km", vignettes: "Viñetas", objects: "Túneles, puentes y ferris", period_day: "1 día", partial: "No se incluyen todos los peajes — el total real puede ser mayor.", estimate: "Estimación: con ticket el precio depende de las salidas.", buy: "Comprar online", verified: "verificado {d}", open_btn: "Abrir calculadora de peajes", km: "km", none: "No hay peajes en esta ruta", ferry: "Ferri", tunnel: "Túnel", bridge: "Puente", pass: "Puerto" },
  pt: { no_rates: "Ainda sem tarifas para esta classe de veículo — isso não a torna gratuita.", gate: "Troço com portagem", it_vignette: "Vinheta", it_bridge: "Ponte com portagem", it_tunnel: "Túnel com portagem", it_ferry: "Ferry", it_section: "Troço com portagem", no_data_in: "sem dados: {c}", unmeasured_in: "portagem por km não medida: {c}", title: "Estradas com portagem", route: "Portagens na rota", car: "Carro", van: "Autocaravana ≤3,5 t", heavy: "Mais de 3,5 t", closed: "Bilhete: paga pela distância à saída", open: "Paga nas praças de portagem", free_flow: "Sem barreiras: pagamento online pela matrícula", vignette: "Vinheta: paga pelo tempo", free: "Sem autoestradas com portagem", mixed: "Sistema misto", per_km: "Autoestradas por km", vignettes: "Vinhetas", objects: "Túneis, pontes e ferries", period_day: "1 dia", partial: "Nem todas as portagens estão incluídas — o total real pode ser maior.", estimate: "Estimativa: com bilhete o preço depende das saídas.", buy: "Comprar online", verified: "verificado {d}", open_btn: "Abrir calculadora", km: "km", none: "Sem portagens nesta rota", ferry: "Ferry", tunnel: "Túnel", bridge: "Ponte", pass: "Passo" },
  tr: { no_rates: "Bu araç sınıfı için henüz tarife yok — bu, ücretsiz olduğu anlamına gelmez.", gate: "Ücretli kesim", it_vignette: "Vinyet", it_bridge: "Ücretli köprü", it_tunnel: "Ücretli tünel", it_ferry: "Feribot", it_section: "Ücretli kesim", no_data_in: "veri yok: {c}", unmeasured_in: "km ücreti ölçülmedi: {c}", title: "Ücretli yollar", route: "Güzergâhtaki geçiş ücretleri", car: "Otomobil", van: "Karavan ≤3,5 t", heavy: "3,5 t üzeri", closed: "Bilet: çıkışta mesafeye göre ödeme", open: "Yol üzerindeki gişelerde ödeme", free_flow: "Bariyersiz: plakayla online ödeme", vignette: "Vinyet: süreye göre ödeme", free: "Ücretli otoyol yok", mixed: "Karma sistem", per_km: "Otoyol km başına", vignettes: "Vinyetler", objects: "Tüneller, köprüler ve feribotlar", period_day: "1 gün", partial: "Tüm geçiş ücretleri dahil değil — gerçek toplam daha yüksek olabilir.", estimate: "Tahmin: biletli otoyolda fiyat çıkışlara bağlıdır.", buy: "Online satın al", verified: "kontrol {d}", open_btn: "Hesaplayıcıyı aç", km: "km", none: "Bu güzergâhta ücretli yol yok", ferry: "Feribot", tunnel: "Tünel", bridge: "Köprü", pass: "Geçit" },
};

const TOLLS_JS = `
var T=${JSON.stringify(TOLLS_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
var vc=null;
function eur(v){if(v==null)return "—";try{return new Intl.NumberFormat(OV.hostLocale(),{style:"currency",currency:"EUR",maximumFractionDigits:v>=100?0:2}).format(v)}catch(e){return "€"+v}}
function loc(v,c){try{return new Intl.NumberFormat(OV.hostLocale(),{style:"currency",currency:c,maximumFractionDigits:v>=100?0:2}).format(v)}catch(e){return v+" "+c}}
function period(v){if(v.valid_days===1)return t("period_day");try{if(v.valid_days%365===0)return new Intl.NumberFormat(OV.locale(),{style:"unit",unit:"year",unitDisplay:"long"}).format(v.valid_days/365);if(v.valid_days%30===0&&v.valid_days>=30)return new Intl.NumberFormat(OV.locale(),{style:"unit",unit:"month",unitDisplay:"long"}).format(v.valid_days/30);return new Intl.NumberFormat(OV.locale(),{style:"unit",unit:"day",unitDisplay:"long"}).format(v.valid_days)}catch(e){return v.period}}
function seg(){var h='<div class="seg" role="group" style="margin-top:10px">';["car","van","heavy"].forEach(function(c){h+='<button data-vc="'+c+'" aria-pressed="'+(c===vc)+'">'+E(t(c))+'</button>'});return h+'</div>'}
function money(eurV,localV,cur){return '<div class="val">'+(cur&&cur!=="EUR"?loc(localV,cur):eur(eurV))+'</div>'+(cur&&cur!=="EUR"&&eurV!=null?'<div class="alt">≈ '+eur(eurV)+'</div>':'')}
function renderCountry(d){
  if(!vc)vc="van";
  var h='<div class="card"><div class="hero"><div class="row">'+flag(d.country_code)+'<h1 class="h1">'+E(t("title"))+': '+E(d.name)+'</h1></div><div class="sub">'+E(t(d.system_type)||d.system_type)+'</div>'+seg()+'</div><ul class="rows">';
  function forClass(list){var x=(list||[]).filter(function(r){return r.vehicle_class===vc});if(!x.length&&vc==="van")x=(list||[]).filter(function(r){return r.vehicle_class==="car"});return x}
  var rate=forClass(d.rates)[0];
  if(rate&&rate.rate_per_km_local)h+='<li class="r"><span class="lab">'+E(t("per_km"))+'<div class="alt" style="text-align:left">'+E(t("verified").replace("{d}",dt(rate.verified_at)))+'</div></span><span>'+money(rate.rate_per_km_eur,rate.rate_per_km_local,rate.currency)+'</span></li>';
  var vg=forClass(d.vignettes);
  if(vg.length){h+='</ul><div class="sec" style="padding:0 16px">'+E(t("vignettes"))+'</div><ul class="rows">';vg.forEach(function(v){h+='<li class="r"><span class="lab">'+E(period(v))+(v.buy_url?' <a href="#" class="muted" data-link="'+E(v.buy_url)+'">'+E(t("buy"))+' ↗</a>':'')+'</span><span>'+money(v.price_eur,v.price_local,v.currency)+'</span></li>'})}
  var ob=(d.objects||[]).filter(function(o){return o.prices_by_class&&(o.prices_by_class[vc]!=null||(vc==="van"&&o.prices_by_class.car!=null))}).map(function(o){var k=o.prices_by_class[vc]!=null?vc:"car";return Object.assign({},o,{_k:k})});
  if(ob.length){h+='</ul><div class="sec" style="padding:0 16px">'+E(t("objects"))+'</div><ul class="rows">';ob.slice(0,8).forEach(function(o){h+='<li class="r"><span class="lab">'+E(o.name)+'<div class="alt" style="text-align:left">'+E(t(o.kind)||o.kind)+'</div></span><span>'+money(o.prices_eur_by_class?o.prices_eur_by_class[o._k]:null,o.prices_by_class[o._k],o.currency)+'</span></li>'})}
  // Для класса нет ни ставки, ни виньеток, ни объектов: говорим, какая у него система и что тарифа нет.
  if(!(rate&&rate.rate_per_km_local)&&!vg.length&&!ob.length){var rc=(d.rates||[]).filter(function(r){return r.vehicle_class===vc})[0];h+='<li class="r"><span class="lab">'+E(rc?(t(rc.system_type)||rc.system_type):"")+'<div class="alt" style="text-align:left">'+E(t("no_rates"))+'</div></span></li>'}
  draw(h+'</ul>'+btns([[t("open_btn"),d.url]])+foot(d.verified_at?t("verified").replace("{d}",dt(d.verified_at)):""));
}
function renderRoute(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("route"))+'</h1><div class="sub">'+E(d.points.map(function(p){return p.name}).join(" → "))+' · '+E(Math.round(d.distance_km))+' '+t("km")+' · '+E(t(d.vehicle_class))+'</div>';
  h+='<div class="row" style="margin-top:10px;align-items:baseline;gap:10px"><span class="big" style="color:#fff">'+eur(d.total_eur||0)+'</span>'+(d.range_eur&&d.range_eur.min!==d.range_eur.max?'<span class="sub">'+eur(d.range_eur.min)+' – '+eur(d.range_eur.max)+'</span>':'')+'</div></div>';
  function names(l){return l.map(function(c){return cName(c,c)}).join(", ")}
  var why=[];if(d.unknown_countries&&d.unknown_countries.length)why.push(t("no_data_in").replace("{c}",names(d.unknown_countries)));if(d.unchecked_countries&&d.unchecked_countries.length)why.push(t("unmeasured_in").replace("{c}",names(d.unchecked_countries)));
  if(d.partial)h+='<div class="body" style="padding-bottom:0"><div class="box">⚠ '+E(t("partial"))+(why.length?' ('+E(why.join("; "))+')':'')+'</div></div>';
  h+='<ul class="rows">';
  if(!d.items.length)h+='<li class="r"><span class="lab">'+E(t("none"))+'</span></li>';
  d.items.forEach(function(i){h+='<li class="r">'+flag(i.country,"flag-sm")+'<span class="lab">'+E(i.label==="per_km"?t("per_km"):T.en["it_"+i.label]?t("it_"+i.label):i.label)+'</span><span>'+money(i.amount_eur,i.amount_local,i.currency)+'</span></li>'});
  draw(h+'</ul><div class="body" style="padding-top:4px"><div class="muted">'+E(t("estimate"))+'</div></div>'+btns([[t("open_btn"),d.url]])+foot(""));
}
function render(){if(current.mode==="route")renderRoute(current);else renderCountry(current)}
OV.onData(function(d){current=d;render()});
document.addEventListener("click",function(e){var b=e.target.closest("[data-vc]");if(b){vc=b.getAttribute("data-vc");render()}});
`;

// ------------------------------------------------------------------
// 4. Справка по стране: праздники, опасности, пожары, розетки, таможня
// ------------------------------------------------------------------

const INFO_I18N = {
  en: { plug_type: "type", declare: "declare", tp_alcohol: "Alcohol", tp_cash: "Cash", tp_food: "Food", tp_food_penalty: "Food: fines", tp_fuel: "Fuel in cans", tp_medicines: "Medicines", tp_other: "Other", tp_tobacco: "Tobacco", tp_value: "Goods value", holidays: "Holidays and peak traffic", hazards: "Travel hazards", fires: "Active fires", plugs: "Power plugs", customs: "Customs on entry by car", public: "Public holiday", school: "School holidays", traffic: "Heavy traffic", regions: "{n} regions", nationwide: "nationwide", dep: "departures", ret: "returns", green: "normal", orange: "heavy", red: "very heavy", black: "extreme", more: "and {n} more", none_h: "Nothing in this period", adv: "UK government travel advice", lvl0: "No warnings", lvl1: "Avoid all but essential travel to parts", lvl2: "Avoid all but essential travel to the whole country", lvl3: "Avoid all travel to parts", lvl4: "Avoid all travel to the whole country", events: "Current disasters (GDACS)", no_events: "No current disasters", now: "Situation now, not a forecast.", detections: "detections in 48 h", strong: "with power ≥ 10 MW", fires_note: "Satellite detections (NASA FIRMS), not confirmed fires. Single-digit MW is usually a small fire or a gas flare.", map: "Open fire map", voltage: "Voltage", freq: "Frequency", campsites: "Campsites", cee: "blue CEE 3-pin 16 A socket on {p}% of sites", amps: "usually {a} A", polarity: "reversed polarity is common — use a tester", differs: "Other references also list: {p}", no_customs: "No customs checks on this crossing", quote: "Official wording", from: "from {c}", ban: "ban", limit: "limit", info: "info", warning: "warning", source: "Source", open: "Open on OpenVan.camp", FL: "Flood", EQ: "Earthquake", TC: "Tropical cyclone", WF: "Wildfire", DR: "Drought", VO: "Volcano" },
  ru: { plug_type: "тип", declare: "декларировать", tp_alcohol: "Алкоголь", tp_cash: "Наличные", tp_food: "Продукты", tp_food_penalty: "Продукты: штрафы", tp_fuel: "Топливо в канистрах", tp_medicines: "Лекарства", tp_other: "Другое", tp_tobacco: "Табак", tp_value: "Стоимость вещей", holidays: "Праздники и пробки", hazards: "Опасности для поездки", fires: "Активные пожары", plugs: "Розетки", customs: "Таможня при въезде на машине", public: "Праздник", school: "Школьные каникулы", traffic: "Плотное движение", regions: "регионов: {n}", nationwide: "по всей стране", dep: "выезд", ret: "возвращение", green: "обычное", orange: "плотное", red: "очень плотное", black: "экстремальное", more: "и ещё {n}", none_h: "В этот период ничего нет", adv: "Рекомендации правительства Великобритании", lvl0: "Предупреждений нет", lvl1: "Без крайней нужды не ездить в отдельные районы", lvl2: "Без крайней нужды не ездить в страну", lvl3: "Не ездить в отдельные районы", lvl4: "Не ездить в страну", events: "Бедствия сейчас (GDACS)", no_events: "Бедствий сейчас нет", now: "Обстановка сейчас, не прогноз.", detections: "очагов за 48 ч", strong: "мощностью ≥ 10 МВт", fires_note: "Спутниковые точки (NASA FIRMS), не подтверждённые пожары. Единицы МВт — обычно небольшой огонь или факел.", map: "Открыть карту пожаров", voltage: "Напряжение", freq: "Частота", campsites: "Кемпинги", cee: "синяя розетка CEE 16 А на {p}% кемпингов", amps: "обычно {a} А", polarity: "часто перепутана полярность — возьмите тестер", differs: "Другие справочники называют ещё: {p}", no_customs: "На этом переходе таможенного контроля нет", quote: "Официальный текст", from: "откуда: {c}", ban: "запрет", limit: "лимит", info: "справка", warning: "внимание", source: "Источник", open: "Открыть на OpenVan.camp", FL: "Наводнение", EQ: "Землетрясение", TC: "Тропический циклон", WF: "Лесной пожар", DR: "Засуха", VO: "Вулкан" },
  de: { plug_type: "Typ", declare: "anmelden", tp_alcohol: "Alkohol", tp_cash: "Bargeld", tp_food: "Lebensmittel", tp_food_penalty: "Lebensmittel: Strafen", tp_fuel: "Kraftstoff im Kanister", tp_medicines: "Medikamente", tp_other: "Sonstiges", tp_tobacco: "Tabak", tp_value: "Warenwert", holidays: "Feiertage und Stauzeiten", hazards: "Reiserisiken", fires: "Aktive Brände", plugs: "Steckdosen", customs: "Zoll bei Einreise mit dem Auto", public: "Feiertag", school: "Schulferien", traffic: "Starker Verkehr", regions: "{n} Regionen", nationwide: "landesweit", dep: "Abreise", ret: "Rückreise", green: "normal", orange: "dicht", red: "sehr dicht", black: "extrem", more: "und {n} weitere", none_h: "In diesem Zeitraum nichts", adv: "Reisehinweise der britischen Regierung", lvl0: "Keine Warnungen", lvl1: "Nicht notwendige Reisen in Teile vermeiden", lvl2: "Nicht notwendige Reisen ins ganze Land vermeiden", lvl3: "Reisen in Teile vermeiden", lvl4: "Reisen ins ganze Land vermeiden", events: "Aktuelle Katastrophen (GDACS)", no_events: "Keine aktuellen Katastrophen", now: "Aktuelle Lage, keine Prognose.", detections: "Brandherde in 48 h", strong: "mit ≥ 10 MW", fires_note: "Satellitendaten (NASA FIRMS), keine bestätigten Brände. Einstellige MW sind meist kleine Feuer oder Fackeln.", map: "Brandkarte öffnen", voltage: "Spannung", freq: "Frequenz", campsites: "Campingplätze", cee: "blaue CEE-Steckdose 16 A auf {p}% der Plätze", amps: "meist {a} A", polarity: "oft vertauschte Polarität — Prüfer mitnehmen", differs: "Andere Quellen nennen auch: {p}", no_customs: "Keine Zollkontrolle an diesem Übergang", quote: "Amtlicher Wortlaut", from: "aus {c}", ban: "Verbot", limit: "Grenze", info: "Info", warning: "Achtung", source: "Quelle", open: "Auf OpenVan.camp öffnen", FL: "Überschwemmung", EQ: "Erdbeben", TC: "Tropensturm", WF: "Waldbrand", DR: "Dürre", VO: "Vulkan" },
  fr: { plug_type: "type", declare: "à déclarer", tp_alcohol: "Alcool", tp_cash: "Espèces", tp_food: "Nourriture", tp_food_penalty: "Nourriture : amendes", tp_fuel: "Carburant en bidon", tp_medicines: "Médicaments", tp_other: "Autre", tp_tobacco: "Tabac", tp_value: "Valeur des biens", holidays: "Jours fériés et trafic", hazards: "Risques de voyage", fires: "Feux actifs", plugs: "Prises électriques", customs: "Douane à l’entrée en voiture", public: "Jour férié", school: "Vacances scolaires", traffic: "Trafic dense", regions: "{n} régions", nationwide: "tout le pays", dep: "départs", ret: "retours", green: "fluide", orange: "dense", red: "très dense", black: "extrême", more: "et {n} de plus", none_h: "Rien sur cette période", adv: "Conseils aux voyageurs du gouvernement britannique", lvl0: "Aucune alerte", lvl1: "Éviter les voyages non essentiels dans certaines zones", lvl2: "Éviter les voyages non essentiels dans tout le pays", lvl3: "Éviter tout voyage dans certaines zones", lvl4: "Éviter tout voyage dans le pays", events: "Catastrophes en cours (GDACS)", no_events: "Aucune catastrophe en cours", now: "Situation actuelle, pas une prévision.", detections: "foyers en 48 h", strong: "de puissance ≥ 10 MW", fires_note: "Détections satellite (NASA FIRMS), pas des feux confirmés. Quelques MW = souvent un petit feu ou une torchère.", map: "Ouvrir la carte des feux", voltage: "Tension", freq: "Fréquence", campsites: "Campings", cee: "prise bleue CEE 16 A dans {p} % des campings", amps: "en général {a} A", polarity: "polarité souvent inversée — prenez un testeur", differs: "D’autres sources citent aussi : {p}", no_customs: "Pas de contrôle douanier à ce passage", quote: "Texte officiel", from: "depuis {c}", ban: "interdit", limit: "limite", info: "info", warning: "attention", source: "Source", open: "Ouvrir sur OpenVan.camp", FL: "Inondation", EQ: "Séisme", TC: "Cyclone tropical", WF: "Feu de forêt", DR: "Sécheresse", VO: "Volcan" },
  es: { plug_type: "tipo", declare: "declarar", tp_alcohol: "Alcohol", tp_cash: "Efectivo", tp_food: "Comida", tp_food_penalty: "Comida: multas", tp_fuel: "Combustible en bidón", tp_medicines: "Medicamentos", tp_other: "Otros", tp_tobacco: "Tabaco", tp_value: "Valor de los bienes", holidays: "Festivos y tráfico", hazards: "Riesgos de viaje", fires: "Incendios activos", plugs: "Enchufes", customs: "Aduana al entrar en coche", public: "Festivo", school: "Vacaciones escolares", traffic: "Tráfico intenso", regions: "{n} regiones", nationwide: "todo el país", dep: "salidas", ret: "regresos", green: "normal", orange: "denso", red: "muy denso", black: "extremo", more: "y {n} más", none_h: "Nada en este periodo", adv: "Consejos de viaje del gobierno británico", lvl0: "Sin avisos", lvl1: "Evitar viajes no esenciales a algunas zonas", lvl2: "Evitar viajes no esenciales a todo el país", lvl3: "Evitar viajar a algunas zonas", lvl4: "Evitar viajar al país", events: "Desastres actuales (GDACS)", no_events: "Sin desastres actuales", now: "Situación actual, no un pronóstico.", detections: "focos en 48 h", strong: "de ≥ 10 MW", fires_note: "Detecciones por satélite (NASA FIRMS), no incendios confirmados. Pocos MW suele ser un fuego pequeño o una antorcha.", map: "Abrir mapa de incendios", voltage: "Tensión", freq: "Frecuencia", campsites: "Campings", cee: "toma azul CEE 16 A en el {p} % de campings", amps: "normalmente {a} A", polarity: "la polaridad suele estar invertida — lleva un comprobador", differs: "Otras fuentes citan también: {p}", no_customs: "Sin control aduanero en este paso", quote: "Texto oficial", from: "desde {c}", ban: "prohibido", limit: "límite", info: "info", warning: "atención", source: "Fuente", open: "Abrir en OpenVan.camp", FL: "Inundación", EQ: "Terremoto", TC: "Ciclón tropical", WF: "Incendio forestal", DR: "Sequía", VO: "Volcán" },
  pt: { plug_type: "tipo", declare: "declarar", tp_alcohol: "Álcool", tp_cash: "Dinheiro", tp_food: "Comida", tp_food_penalty: "Comida: multas", tp_fuel: "Combustível em jerricã", tp_medicines: "Medicamentos", tp_other: "Outros", tp_tobacco: "Tabaco", tp_value: "Valor dos bens", holidays: "Feriados e trânsito", hazards: "Riscos de viagem", fires: "Incêndios ativos", plugs: "Tomadas", customs: "Alfândega ao entrar de carro", public: "Feriado", school: "Férias escolares", traffic: "Trânsito intenso", regions: "{n} regiões", nationwide: "todo o país", dep: "saídas", ret: "regressos", green: "normal", orange: "intenso", red: "muito intenso", black: "extremo", more: "e mais {n}", none_h: "Nada neste período", adv: "Conselhos de viagem do governo britânico", lvl0: "Sem avisos", lvl1: "Evitar viagens não essenciais a algumas zonas", lvl2: "Evitar viagens não essenciais ao país", lvl3: "Evitar viajar para algumas zonas", lvl4: "Evitar viajar para o país", events: "Desastres atuais (GDACS)", no_events: "Sem desastres atuais", now: "Situação atual, não uma previsão.", detections: "focos em 48 h", strong: "com ≥ 10 MW", fires_note: "Deteções por satélite (NASA FIRMS), não incêndios confirmados. Poucos MW costuma ser fogo pequeno ou tocha.", map: "Abrir mapa de incêndios", voltage: "Tensão", freq: "Frequência", campsites: "Parques de campismo", cee: "tomada azul CEE 16 A em {p}% dos parques", amps: "normalmente {a} A", polarity: "polaridade muitas vezes invertida — leve um testador", differs: "Outras fontes indicam também: {p}", no_customs: "Sem controlo aduaneiro nesta passagem", quote: "Texto oficial", from: "de {c}", ban: "proibido", limit: "limite", info: "info", warning: "atenção", source: "Fonte", open: "Abrir no OpenVan.camp", FL: "Inundação", EQ: "Sismo", TC: "Ciclone tropical", WF: "Incêndio florestal", DR: "Seca", VO: "Vulcão" },
  tr: { plug_type: "tip", declare: "beyan edin", tp_alcohol: "Alkol", tp_cash: "Nakit", tp_food: "Gıda", tp_food_penalty: "Gıda: cezalar", tp_fuel: "Bidonda yakıt", tp_medicines: "İlaçlar", tp_other: "Diğer", tp_tobacco: "Tütün", tp_value: "Eşya değeri", holidays: "Tatiller ve yoğun trafik", hazards: "Seyahat riskleri", fires: "Aktif yangınlar", plugs: "Prizler", customs: "Araçla girişte gümrük", public: "Resmî tatil", school: "Okul tatili", traffic: "Yoğun trafik", regions: "{n} bölge", nationwide: "tüm ülkede", dep: "gidiş", ret: "dönüş", green: "normal", orange: "yoğun", red: "çok yoğun", black: "aşırı", more: "ve {n} tane daha", none_h: "Bu dönemde bir şey yok", adv: "İngiltere hükümeti seyahat uyarısı", lvl0: "Uyarı yok", lvl1: "Bazı bölgelere zorunlu olmadıkça gitmeyin", lvl2: "Ülkeye zorunlu olmadıkça gitmeyin", lvl3: "Bazı bölgelere gitmeyin", lvl4: "Ülkeye gitmeyin", events: "Güncel afetler (GDACS)", no_events: "Güncel afet yok", now: "Şu anki durum, tahmin değil.", detections: "48 saatte yangın noktası", strong: "≥ 10 MW gücünde", fires_note: "Uydu tespitleri (NASA FIRMS), doğrulanmış yangın değil. Birkaç MW genelde küçük ateş veya meşaledir.", map: "Yangın haritasını aç", voltage: "Gerilim", freq: "Frekans", campsites: "Kamp alanları", cee: "kampların %{p}’inde mavi CEE 16 A priz", amps: "genelde {a} A", polarity: "kutup sıklıkla ters — test cihazı alın", differs: "Diğer kaynaklar şunları da sayar: {p}", no_customs: "Bu geçişte gümrük kontrolü yok", quote: "Resmî metin", from: "{c} çıkışlı", ban: "yasak", limit: "sınır", info: "bilgi", warning: "dikkat", source: "Kaynak", open: "OpenVan.camp’da aç", FL: "Sel", EQ: "Deprem", TC: "Tropik fırtına", WF: "Orman yangını", DR: "Kuraklık", VO: "Yanardağ" },
};

const INFO_CSS = `
.dbox{width:46px;flex:none;text-align:center;border-radius:8px;background:var(--ov-bg2);padding:4px 0;line-height:1.05}
.dbox b{display:block;font-size:17px}.dbox small{font-size:10px;text-transform:uppercase;color:var(--ov-text3)}
.plugs{display:flex;gap:10px;flex-wrap:wrap}
.plug{width:64px;height:64px;border-radius:12px;background:var(--ov-bg2);display:flex;flex-direction:column;align-items:center;justify-content:center}
.plug b{font-size:26px;line-height:1}.plug small{font-size:10px;color:var(--ov-text3)}
.lvl{display:inline-flex;gap:3px}.lvl i{width:16px;height:6px;border-radius:3px;background:rgba(255,255,255,.3)}
`;

const INFO_JS = `
var T=${JSON.stringify(INFO_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
function hero(d,title,sub){return '<div class="card"><div class="hero"><div class="row">'+(d.country_code?flag(d.country_code):'')+'<h1 class="h1">'+E(title)+(d.name?': '+E(d.name):'')+'</h1></div>'+(sub?'<div class="sub">'+E(sub)+'</div>':'')+'</div>'}
var TRAFFIC={green:"ok",orange:"mid",red:"bad",black:"blk"};
function holidays(d){
  var h=hero(d,t("holidays"),dt(d.from)+" – "+dt(d.to))+'<ul class="list">';
  if(!d.items.length)h+='<li class="li">'+E(t("none_h"))+'</li>';
  d.items.slice(0,12).forEach(function(i){
    var tag=i.kind==="traffic"?(TRAFFIC[i.category]||"mid"):i.kind==="public"?"bad":"neu";
    h+='<li class="li"><div class="dbox"><b>'+E(dt(i.start,{day:"numeric"}))+'</b><small>'+E(dt(i.start,{month:"short"}))+'</small></div><div class="grow"><div class="t1">'+E(i.name)+'</div><div class="t2"><span class="tag '+tag+'">'+E(t(i.kind))+'</span> '+(i.start!==i.end?E(dt(i.start,{day:"numeric",month:"short"})+" – "+dt(i.end,{day:"numeric",month:"short"}))+' · ':'')+E(i.nationwide?t("nationwide"):t("regions").replace("{n}",i.regions.length))+'</div>';
    if(i.kind==="traffic"&&i.details)h+='<div class="t2">'+t("dep")+': <span class="tag '+(TRAFFIC[i.details.departure]||"neu")+'">'+E(t(i.details.departure))+'</span> · '+t("ret")+': <span class="tag '+(TRAFFIC[i.details.return]||"neu")+'">'+E(t(i.details.return))+'</span></div>';
    h+='</div></li>';
  });
  h+='</ul>'+(d.items.length>12?'<div class="more">'+E(t("more").replace("{n}",d.items.length-12))+'</div>':'');
  draw(h+btns([[t("open"),d.url]])+foot("Nager.Date · OpenHolidays · Bison Futé"));
}
function hazards(d){
  var a=d.advisory,sev=a?a.severity:0;
  var h=hero(d,t("hazards"),t("now"))+'<div class="body"><div class="sec" style="margin-top:0">'+E(t("adv"))+'</div><div class="row"><span class="tag '+(sev>=3?"bad":sev>=1?"mid":"ok")+'">'+E(a?t("lvl"+Math.min(4,sev)):t("lvl0"))+'</span></div>';
  var enOnly=OV.locale()==="en";if(a&&a.summary&&enOnly)h+='<div class="t2" style="margin-top:6px">'+E(a.summary)+'</div>';
  h+='<div class="sec">'+E(t("events"))+'</div>';
  if(!d.events.length)h+='<div class="t2">'+E(t("no_events"))+'</div>';
  d.events.slice(0,8).forEach(function(e){h+='<div class="row" style="padding:4px 0"><span class="tag '+(e.alert_level==="red"?"bad":e.alert_level==="orange"?"mid":"ok")+'">'+E(t(e.type)||e.type)+'</span><span class="grow">'+(enOnly?E(e.name):'')+'</span><span class="muted">'+E(dt(e.starts_at,{day:"numeric",month:"short"}))+'</span></div>'});
  draw(h+'</div>'+btns([a?[t("source"),a.url]:null,[t("open"),d.url]].filter(Boolean))+foot("FCDO · GDACS"));
}
function fires(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("fires"))+'</h1><div class="row" style="margin-top:8px;align-items:baseline;gap:10px"><span class="big" style="color:#fff">'+d.count+'</span><span class="sub">'+E(t("detections"))+' · '+d.strong+' '+E(t("strong"))+'</span></div></div><ul class="rows">';
  d.top.slice(0,8).forEach(function(f){h+='<li class="r"><span class="lab">'+f.lat.toFixed(3)+', '+f.lng.toFixed(3)+'<div class="alt" style="text-align:left">'+E(dt(f.seen_at,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))+'</div></span><span class="val'+(f.frp>=10?' best':'')+'">'+f.frp+' MW</span></li>'});
  var c=d.center;
  draw(h+'</ul><div class="body" style="padding-top:4px"><div class="muted">'+E(t("fires_note"))+'</div></div>'+btns([[t("map"),"https://firms.modaps.eosdis.nasa.gov/map/#d:48hrs;@"+c[0]+","+c[1]+",8z"]])+foot("NASA FIRMS VIIRS"));
}
function plugs(d){
  var h=hero(d,t("plugs"),"")+'<div class="body"><div class="plugs">';
  (d.plugs||[]).forEach(function(p){h+='<div class="plug"><b>'+E(p)+'</b><small>'+E(t("plug_type"))+'</small></div>'});
  h+='</div><dl class="kv" style="margin-top:12px"><dt>'+E(t("voltage"))+'</dt><dd>'+E(d.voltage)+' V</dd><dt>'+E(t("freq"))+'</dt><dd>'+E(d.frequency)+' Hz</dd></dl>';
  var extra=(d.wikidata_plugs||[]).filter(function(p){return (d.plugs||[]).indexOf(p)<0});
  if(extra.length)h+='<div class="t2" style="margin-top:8px">'+E(t("differs").replace("{p}",extra.join(", ")))+'</div>';
  var c=d.campsites;
  if(c){h+='<div class="sec">'+E(t("campsites"))+'</div><div class="box">'+E(t("cee").replace("{p}",c.share_percent))+(c.amps&&c.amps.length?' · '+E(t("amps").replace("{a}",c.amps.join("–"))):'')+(c.reversed_polarity_common?'<br>⚠ '+E(t("polarity")):'')+'</div>'}
  draw(h+'</div>'+btns([[t("open"),d.url]])+foot(d.source_name||""));
}
function customs(d){
  var h=hero(d,t("customs"),d.from?t("from").replace("{c}",cName(d.from,d.from)):"")+'<ul class="list">';
  if(!d.items.length)h+='<li class="li">'+E(t("no_customs"))+(d.blocs&&d.blocs.length?' ('+E(d.blocs.join(", "))+')':'')+'</li>';
  d.items.forEach(function(i){
    h+='<li class="li"><div class="grow"><div class="row" style="gap:6px"><span class="tag '+(i.severity==="ban"?"bad":i.severity==="limit"||i.severity==="declare"?"mid":"neu")+'">'+E(t(i.severity)||i.severity)+'</span><span class="t1">'+E(T.en["tp_"+i.topic]?t("tp_"+i.topic):i.topic)+'</span><span class="muted">'+E(i.jurisdiction)+'</span></div><div style="margin-top:4px;color:var(--ov-text2)">'+E(i.summary)+'</div>';
    h+='<details class="q"><summary>'+E(t("quote"))+'</summary><blockquote>'+E(i.quote)+'<br><a href="#" data-link="'+E(i.source_url)+'">'+E(i.source_name)+' ↗</a> · '+E(dt(i.checked))+'</blockquote></details></div></li>';
  });
  draw(h+'</ul>'+btns([[t("open"),d.url]])+foot(""));
}
OV.onData(function(d){current=d;({holidays:holidays,hazards:hazards,fires:fires,plugs:plugs,customs:customs}[d.mode]||holidays)(d)});
`;

// ------------------------------------------------------------------
// 5. Номера машин
// ------------------------------------------------------------------

const PLATES_I18N = {
  en: { title: "License plates of the world", countries: "{n} countries", plates: "License plates", valid: "Valid format", invalid: "Does not match the format", region: "Region", reg_note: "Shows where the car was registered, not where the owner lives.", regions: "Region codes", filter: "Find a region or code", types: "Plate types", size: "Size", intl: "International code", standard: "Standard", open: "Open on OpenVan.camp", svg: "Download SVG", png: "Download PNG", ask: "Show the license plates of {c}", more: "and {n} more" },
  ru: { title: "Номера машин мира", countries: "стран: {n}", plates: "Номера машин", valid: "Формат правильный", invalid: "Не соответствует формату", region: "Регион", reg_note: "Код показывает, где машину зарегистрировали, а не где живёт владелец.", regions: "Коды регионов", filter: "Найти регион или код", types: "Типы номеров", size: "Размер", intl: "Международный код", standard: "Стандарт", open: "Открыть на OpenVan.camp", svg: "Скачать SVG", png: "Скачать PNG", ask: "Покажи номера машин: {c}", more: "и ещё {n}" },
  de: { title: "Kennzeichen der Welt", countries: "{n} Länder", plates: "Kennzeichen", valid: "Gültiges Format", invalid: "Entspricht nicht dem Format", region: "Region", reg_note: "Zeigt den Zulassungsort, nicht den Wohnort.", regions: "Regionscodes", filter: "Region oder Code suchen", types: "Kennzeichenarten", size: "Größe", intl: "Länderkennzeichen", standard: "Norm", open: "Auf OpenVan.camp öffnen", svg: "SVG laden", png: "PNG laden", ask: "Zeig die Kennzeichen von {c}", more: "und {n} weitere" },
  fr: { title: "Plaques du monde", countries: "{n} pays", plates: "Plaques d’immatriculation", valid: "Format valide", invalid: "Ne correspond pas au format", region: "Région", reg_note: "Indique le lieu d’immatriculation, pas le domicile.", regions: "Codes des régions", filter: "Chercher une région ou un code", types: "Types de plaques", size: "Taille", intl: "Code international", standard: "Norme", open: "Ouvrir sur OpenVan.camp", svg: "Télécharger SVG", png: "Télécharger PNG", ask: "Montre les plaques de {c}", more: "et {n} de plus" },
  es: { title: "Matrículas del mundo", countries: "{n} países", plates: "Matrículas", valid: "Formato válido", invalid: "No coincide con el formato", region: "Región", reg_note: "Indica dónde se matriculó, no dónde vive el dueño.", regions: "Códigos de región", filter: "Buscar región o código", types: "Tipos de matrícula", size: "Tamaño", intl: "Código internacional", standard: "Norma", open: "Abrir en OpenVan.camp", svg: "Descargar SVG", png: "Descargar PNG", ask: "Muestra las matrículas de {c}", more: "y {n} más" },
  pt: { title: "Matrículas do mundo", countries: "{n} países", plates: "Matrículas", valid: "Formato válido", invalid: "Não corresponde ao formato", region: "Região", reg_note: "Mostra onde o carro foi registado, não onde vive o dono.", regions: "Códigos de região", filter: "Procurar região ou código", types: "Tipos de matrícula", size: "Tamanho", intl: "Código internacional", standard: "Norma", open: "Abrir no OpenVan.camp", svg: "Descarregar SVG", png: "Descarregar PNG", ask: "Mostra as matrículas de {c}", more: "e mais {n}" },
  tr: { title: "Dünyanın plakaları", countries: "{n} ülke", plates: "Plakalar", valid: "Biçim doğru", invalid: "Biçime uymuyor", region: "Bölge", reg_note: "Aracın kaydedildiği yeri gösterir, sahibinin yaşadığı yeri değil.", regions: "Bölge kodları", filter: "Bölge veya kod ara", types: "Plaka türleri", size: "Boyut", intl: "Uluslararası kod", standard: "Standart", open: "OpenVan.camp’da aç", svg: "SVG indir", png: "PNG indir", ask: "{c} plakalarını göster", more: "ve {n} tane daha" },
};

const PLATES_CSS = `
.plate{display:flex;justify-content:center;padding:18px 16px 6px}
.plate img{max-width:100%;max-height:120px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:12px 16px}
.cell{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:var(--ov-bg2);border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:44px}
.cell:hover{outline:1px solid var(--ov-primary)}
.types{display:flex;gap:10px;overflow-x:auto;padding:4px 0}
.type{flex:0 0 auto;text-align:center;font-size:11px;color:var(--ov-text3)}
.type img{height:40px;display:block;margin:0 auto 4px}
.filter{width:100%;font:inherit;font-size:16px;padding:8px 10px;border-radius:var(--ov-radius-sm);border:1px solid var(--ov-border);background:var(--ov-bg);color:var(--ov-text);min-height:44px}
.regs{max-height:none}
.reg{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--ov-border);font-size:13px}
.reg b{font-variant-numeric:tabular-nums;text-align:right}
`;

const PLATES_JS = `
var T=${JSON.stringify(PLATES_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
function img(src,alt){return src?'<div class="plate"><img src="'+E(src)+'" alt="'+E(alt||"")+'"></div>':''}
function list(d){
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(t("title"))+'</h1><div class="sub">'+E(t("countries").replace("{n}",d.countries.length))+'</div></div><div class="grid">';
  d.countries.slice(0,24).forEach(function(c,i){h+='<button class="cell" data-i="'+i+'">'+flag(c.code,"flag-sm")+'<span class="grow ellipsis">'+E(c.name)+'</span><span class="muted">'+E(c.intl||"")+'</span></button>'});
  h+='</div>'+(d.countries.length>24?'<div class="more">'+E(t("more").replace("{n}",d.countries.length-24))+'</div>':'');
  draw(h+btns([[t("open"),d.url]])+foot(""));
}
var q="";
function regionsHtml(d){
  var rs=(d.regions||[]).filter(function(r){if(!q)return true;var s=q.toLowerCase();return r.name.toLowerCase().indexOf(s)>=0||r.codes.join(" ").toLowerCase().indexOf(s)>=0});
  var lim=q?30:10;var h="";rs.slice(0,lim).forEach(function(r){h+='<div class="reg"><span>'+E(r.name)+'</span><b>'+E(r.codes.join(", "))+'</b></div>'});
  if(rs.length>lim)h+='<div class="more" style="padding-left:0">'+E(t("more").replace("{n}",rs.length-lim))+'</div>';
  return h;
}
function country(d){
  var h='<div class="card"><div class="hero"><div class="row">'+flag(d.code)+'<h1 class="h1">'+E(t("plates"))+': '+E(d.name)+'</h1></div></div>'+img(d.example_svg,d.example)+'<div class="body"><dl class="kv">';
  if(d.intl)h+='<dt>'+E(t("intl"))+'</dt><dd>'+E(d.intl)+'</dd>';
  if(d.standard)h+='<dt>'+E(t("standard"))+'</dt><dd>'+E(d.standard)+'</dd>';
  if(d.size_mm)h+='<dt>'+E(t("size"))+'</dt><dd>'+E(d.size_mm.join(" × "))+' mm</dd>';
  h+='</dl>';
  if(d.types&&d.types.length>1){h+='<div class="sec">'+E(t("types"))+'</div><div class="types">';d.types.forEach(function(ty){h+='<div class="type">'+(ty.svg?'<img src="'+E(ty.svg)+'" alt="" loading="lazy">':'')+E(ty.name)+'</div>'});h+='</div>'}
  if(d.regions&&d.regions.length){h+='<div class="sec">'+E(t("regions"))+' · '+d.regions.length+'</div><input class="filter" id="flt" type="search" placeholder="'+E(t("filter"))+'"><div class="regs" id="regs">'+regionsHtml(d)+'</div>'}
  draw(h+'</div>'+btns([[t("open"),d.url]])+foot(""));
  var f=document.getElementById("flt");if(f)f.addEventListener("input",function(){q=f.value;document.getElementById("regs").innerHTML=regionsHtml(d)});
}
function check(d){
  var h='<div class="card"><div class="hero"><div class="row">'+flag(d.code)+'<h1 class="h1">'+E(d.plate)+'</h1></div><div class="verdict" style="font-size:20px;font-weight:800;margin-top:6px">'+(d.valid?'✓ ':'✕ ')+E(d.valid?t("valid"):t("invalid"))+'</div></div>'+img(d.svg,d.plate)+'<div class="body">';
  if(d.region_name)h+='<dl class="kv"><dt>'+E(t("region"))+'</dt><dd><b>'+E(d.region)+'</b> — '+E(d.region_name)+'</dd></dl><div class="muted" style="margin-top:6px">'+E(t("reg_note"))+'</div>';
  draw(h+'</div>'+btns([[t("open"),d.url]])+foot(""));
}
function image(d){
  var h='<div class="card"><div class="hero"><div class="row">'+flag(d.code)+'<h1 class="h1">'+E(d.plate)+'</h1></div></div>'+img(d.svg,d.plate);
  draw(h+btns([[t("png"),d.png],[t("svg"),d.svg]])+foot(""));
}
OV.onData(function(d){current=d;({list:list,country:country,check:check,image:image}[d.mode]||list)(d)});
document.addEventListener("click",function(e){var c=e.target.closest("[data-i]");if(c&&current&&current.mode==="list"){var x=current.countries[+c.getAttribute("data-i")];OV.ask(t("ask").replace("{c}",x.name))}});
`;

export const TRAVEL_HTML: Record<string, { name: string; description: string; html: string }> = {
  [TRAVEL_WIDGETS.news]: {
    name: "Vanlife news",
    description: "Carousel of vanlife news stories with headline, short summary and a link to the story page on OpenVan.camp.",
    html: page({ title: "Vanlife news", css: COMMON_CSS + NEWS_CSS, skeleton: SKELETON, script: NEWS_JS, pattern: 2 }),
  },
  [TRAVEL_WIDGETS.visa]: {
    name: "Visa and vehicle entry rules",
    description: "Visa rule for a passport and destination with a leave-by date calculator, visa rules along a route, or temporary vehicle import rules.",
    html: page({ title: "Visa rules", css: COMMON_CSS + VISA_CSS, skeleton: SKELETON, script: VISA_JS, pattern: 8 }),
  },
  [TRAVEL_WIDGETS.tolls]: {
    name: "Toll roads",
    description: "Toll system, per-km rates, vignettes and toll objects of a country with a vehicle class switch, or tolls on a route.",
    html: page({ title: "Toll roads", css: COMMON_CSS + TOLLS_CSS_EXTRA(), skeleton: SKELETON, script: TOLLS_JS, pattern: 4 }),
  },
  [TRAVEL_WIDGETS.country]: {
    name: "Country travel info",
    description: "Holidays and peak traffic, travel hazards, active fires, power plugs or customs rules of a country.",
    html: page({ title: "Country info", css: COMMON_CSS + INFO_CSS + TOLLS_CSS_EXTRA(), skeleton: SKELETON, script: INFO_JS, pattern: 10 }),
  },
  [TRAVEL_WIDGETS.plates]: {
    name: "License plates",
    description: "License plates of a country with region codes, a plate check, or a plate image.",
    html: page({ title: "License plates", css: COMMON_CSS + PLATES_CSS, skeleton: SKELETON, script: PLATES_JS, pattern: 6 }),
  },
};

/** Строки списка «название — сумма» (как в money.ts). */
function TOLLS_CSS_EXTRA(): string {
  return `
.rows{list-style:none;margin:0;padding:6px 0}
.r{display:flex;align-items:center;gap:10px;padding:9px 16px;min-height:44px}
.r+.r{border-top:1px solid var(--ov-border)}
.r .lab{flex:1;min-width:0}
.r .val{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.r .alt{font-size:11px;color:var(--ov-text3);text-align:right}
.big{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1}
.best{color:var(--ov-hard)}
.seg button{padding:0 10px}
`;
}

// ------------------------------------------------------------------
// 6. Сводка по поездке (plan_road_trip)
// ------------------------------------------------------------------

export const TRIP_WIDGET = `${UI_BASE}trip.html`;

const TRIP_I18N = {
  en: { passport: "Passport", borders: "Border crossings", hours_unknown: "opening hours unknown", sos: "Emergency", licence: "Licence", rules: "Road rules", winter: "Winter", notes: "Road notes", urban: "City access", residence: "Residence permit", no_residence: "None", full: "Full screen", collapse: "Collapse", currency: "Currency", my_car: "Your vehicle", diesel: "Diesel", gasoline: "Petrol", lpg: "LPG", per100: "l/100 km", calculating: "Calculating…", typical_note: "Fuel is estimated for a typical camper — set your vehicle’s consumption.", typical: "typical camper", recalc_err: "Could not recalculate — try again.", days_one: "1 driving day", more_info: "Rules, dates, power, customs", total_wo: "Total without fuel", title: "Road trip", back: "and back", km: "km", h: "h", days: "{n} driving days", fuel: "Fuel", tolls: "Tolls", vignettes: "Vignettes", ferries: "Ferries", total: "Total", unknown: "add consumption", visa: "You", car: "Vehicle", roads: "Roads", holidays: "Dates", hazards: "Safety", power: "Power", customs: "Customs", nights: "Overnights", day: "Day {n}", terms: "How long you can stay", you: "you", vehicle: "vehicle", schengen: "Schengen: {u} of 90 days, {l} left", checklist: "Check before you go", best: "Best weather to leave: {d}", open: "Open the roadbook", note: "Same plan as the OpenVan.camp roadbook. Estimates; visa data is reference only." },
  ru: { passport: "Паспорт", borders: "Границы", hours_unknown: "часы работы неизвестны", sos: "Экстренные", licence: "Права", rules: "Правила", winter: "Зима", notes: "Особенности дорог", urban: "Въезд в города", residence: "ВНЖ", no_residence: "Нет", full: "На весь экран", collapse: "Свернуть", currency: "Валюта", my_car: "Ваша машина", diesel: "Дизель", gasoline: "Бензин", lpg: "Газ", per100: "л/100 км", calculating: "Считаю…", typical_note: "Топливо посчитано для типичного кемпера — поставьте расход своей машины.", typical: "типичный кемпер", recalc_err: "Не удалось пересчитать — попробуйте ещё раз.", days_one: "1 день за рулём", more_info: "Правила, даты, розетки, таможня", total_wo: "Итого без топлива", title: "Поездка", back: "и обратно", km: "км", h: "ч", days: "дней за рулём: {n}", fuel: "Топливо", tolls: "Платные дороги", vignettes: "Виньетки", ferries: "Паромы", total: "Итого", unknown: "укажите расход", visa: "Вы", car: "Машина", roads: "Дороги", holidays: "Даты", hazards: "Безопасность", power: "Розетки", customs: "Таможня", nights: "Ночёвки", day: "День {n}", terms: "Сколько можно находиться", you: "вы", vehicle: "машина", schengen: "Шенген: {u} из 90 дней, осталось {l}", checklist: "Проверьте перед выездом", best: "Лучшая погода для выезда: {d}", open: "Открыть роудбук", note: "Тот же план, что в роудбуке OpenVan. Оценка; визовые данные справочные." },
  de: { passport: "Reisepass", borders: "Grenzübergänge", hours_unknown: "Öffnungszeiten unbekannt", sos: "Notruf", licence: "Führerschein", rules: "Verkehrsregeln", winter: "Winter", notes: "Straßenhinweise", urban: "Einfahrt in Städte", residence: "Aufenthaltstitel", no_residence: "Keiner", full: "Vollbild", collapse: "Verkleinern", currency: "Währung", my_car: "Ihr Fahrzeug", diesel: "Diesel", gasoline: "Benzin", lpg: "Autogas", per100: "l/100 km", calculating: "Berechne…", typical_note: "Kraftstoff für ein typisches Wohnmobil geschätzt — geben Sie Ihren Verbrauch an.", typical: "typisches Wohnmobil", recalc_err: "Neuberechnung fehlgeschlagen — bitte erneut versuchen.", days_one: "1 Fahrtag", more_info: "Regeln, Termine, Strom, Zoll", total_wo: "Gesamt ohne Kraftstoff", title: "Roadtrip", back: "und zurück", km: "km", h: "Std.", days: "{n} Fahrtage", fuel: "Kraftstoff", tolls: "Maut", vignettes: "Vignetten", ferries: "Fähren", total: "Gesamt", unknown: "Verbrauch angeben", visa: "Sie", car: "Fahrzeug", roads: "Straßen", holidays: "Termine", hazards: "Sicherheit", power: "Strom", customs: "Zoll", nights: "Übernachtungen", day: "Tag {n}", terms: "Wie lange Sie bleiben dürfen", you: "Sie", vehicle: "Fahrzeug", schengen: "Schengen: {u} von 90 Tagen, {l} übrig", checklist: "Vor der Abfahrt prüfen", best: "Bestes Wetter zur Abfahrt: {d}", open: "Roadbook öffnen", note: "Derselbe Plan wie im Roadbook von OpenVan.camp. Schätzung; Visadaten nur zur Orientierung." },
  fr: { passport: "Passeport", borders: "Frontières", hours_unknown: "horaires inconnus", sos: "Urgences", licence: "Permis", rules: "Code de la route", winter: "Hiver", notes: "Routes : à savoir", urban: "Accès aux villes", residence: "Titre de séjour", no_residence: "Aucun", full: "Plein écran", collapse: "Réduire", currency: "Devise", my_car: "Votre véhicule", diesel: "Gazole", gasoline: "Essence", lpg: "GPL", per100: "l/100 km", calculating: "Calcul…", typical_note: "Carburant estimé pour un camping-car type — indiquez la consommation de votre véhicule.", typical: "camping-car type", recalc_err: "Échec du recalcul — réessayez.", days_one: "1 jour de route", more_info: "Règles, dates, électricité, douane", total_wo: "Total hors carburant", title: "Road trip", back: "aller-retour", km: "km", h: "h", days: "{n} jours de route", fuel: "Carburant", tolls: "Péages", vignettes: "Vignettes", ferries: "Ferries", total: "Total", unknown: "indiquez la consommation", visa: "Vous", car: "Véhicule", roads: "Routes", holidays: "Dates", hazards: "Sécurité", power: "Électricité", customs: "Douane", nights: "Nuits", day: "Jour {n}", terms: "Durée de séjour autorisée", you: "vous", vehicle: "véhicule", schengen: "Schengen : {u} sur 90 jours, reste {l}", checklist: "À vérifier avant le départ", best: "Meilleure météo pour partir : {d}", open: "Ouvrir le road book", note: "Même plan que le road book OpenVan. Estimations ; visas à titre indicatif." },
  es: { passport: "Pasaporte", borders: "Fronteras", hours_unknown: "horario desconocido", sos: "Emergencias", licence: "Permiso", rules: "Normas", winter: "Invierno", notes: "Avisos de carretera", urban: "Acceso a ciudades", residence: "Permiso de residencia", no_residence: "Ninguno", full: "Pantalla completa", collapse: "Reducir", currency: "Moneda", my_car: "Tu vehículo", diesel: "Diésel", gasoline: "Gasolina", lpg: "GLP", per100: "l/100 km", calculating: "Calculando…", typical_note: "Combustible estimado para una autocaravana típica: indica el consumo de tu vehículo.", typical: "autocaravana típica", recalc_err: "No se pudo recalcular, inténtalo de nuevo.", days_one: "1 día al volante", more_info: "Normas, fechas, electricidad, aduana", total_wo: "Total sin combustible", title: "Viaje por carretera", back: "ida y vuelta", km: "km", h: "h", days: "{n} días al volante", fuel: "Combustible", tolls: "Peajes", vignettes: "Viñetas", ferries: "Ferris", total: "Total", unknown: "indica el consumo", visa: "Tú", car: "Vehículo", roads: "Carreteras", holidays: "Fechas", hazards: "Seguridad", power: "Electricidad", customs: "Aduana", nights: "Noches", day: "Día {n}", terms: "Cuánto puedes quedarte", you: "tú", vehicle: "vehículo", schengen: "Schengen: {u} de 90 días, quedan {l}", checklist: "Revisa antes de salir", best: "Mejor tiempo para salir: {d}", open: "Abrir el road book", note: "El mismo plan que el road book de OpenVan. Estimación; visados orientativos." },
  pt: { passport: "Passaporte", borders: "Fronteiras", hours_unknown: "horário desconhecido", sos: "Emergência", licence: "Carta", rules: "Regras", winter: "Inverno", notes: "Avisos de estrada", urban: "Acesso às cidades", residence: "Autorização de residência", no_residence: "Nenhuma", full: "Ecrã inteiro", collapse: "Reduzir", currency: "Moeda", my_car: "O seu veículo", diesel: "Gasóleo", gasoline: "Gasolina", lpg: "GPL", per100: "l/100 km", calculating: "A calcular…", typical_note: "Combustível estimado para uma autocaravana típica — indique o consumo do seu veículo.", typical: "autocaravana típica", recalc_err: "Não foi possível recalcular — tente novamente.", days_one: "1 dia ao volante", more_info: "Regras, datas, eletricidade, alfândega", total_wo: "Total sem combustível", title: "Viagem de estrada", back: "ida e volta", km: "km", h: "h", days: "{n} dias ao volante", fuel: "Combustível", tolls: "Portagens", vignettes: "Vinhetas", ferries: "Ferries", total: "Total", unknown: "indique o consumo", visa: "Você", car: "Veículo", roads: "Estradas", holidays: "Datas", hazards: "Segurança", power: "Eletricidade", customs: "Alfândega", nights: "Noites", day: "Dia {n}", terms: "Quanto tempo pode ficar", you: "você", vehicle: "veículo", schengen: "Schengen: {u} de 90 dias, restam {l}", checklist: "Verifique antes de partir", best: "Melhor tempo para partir: {d}", open: "Abrir o road book", note: "O mesmo plano do road book OpenVan. Estimativa; vistos indicativos." },
  tr: { passport: "Pasaport", borders: "Sınır kapıları", hours_unknown: "çalışma saatleri bilinmiyor", sos: "Acil", licence: "Ehliyet", rules: "Trafik kuralları", winter: "Kış", notes: "Yol notları", urban: "Şehirlere giriş", residence: "Oturma izni", no_residence: "Yok", full: "Tam ekran", collapse: "Küçült", currency: "Para birimi", my_car: "Aracınız", diesel: "Dizel", gasoline: "Benzin", lpg: "LPG", per100: "l/100 km", calculating: "Hesaplanıyor…", typical_note: "Yakıt tipik bir karavana göre hesaplandı — aracınızın tüketimini girin.", typical: "tipik karavan", recalc_err: "Yeniden hesaplanamadı — tekrar deneyin.", days_one: "1 sürüş günü", more_info: "Kurallar, tarihler, elektrik, gümrük", total_wo: "Yakıt hariç toplam", title: "Yol gezisi", back: "gidiş-dönüş", km: "km", h: "sa", days: "{n} sürüş günü", fuel: "Yakıt", tolls: "Geçiş ücretleri", vignettes: "Vinyetler", ferries: "Feribotlar", total: "Toplam", unknown: "tüketimi girin", visa: "Siz", car: "Araç", roads: "Yollar", holidays: "Tarihler", hazards: "Güvenlik", power: "Elektrik", customs: "Gümrük", nights: "Konaklamalar", day: "{n}. gün", terms: "Ne kadar kalabilirsiniz", you: "siz", vehicle: "araç", schengen: "Schengen: 90 günün {u}’i, {l} kaldı", checklist: "Yola çıkmadan kontrol edin", best: "Yola çıkmak için en iyi hava: {d}", open: "Yol kitabını aç", note: "OpenVan.camp yol kitabıyla aynı plan. Tahmindir; vize bilgisi bilgi amaçlıdır." },
};

const TRIP_CSS = `
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin-top:12px}
.stat{background:rgba(255,255,255,.16);border-radius:10px;padding:8px 10px;min-width:0}
.stat b{display:block;font-size:19px;font-weight:800;line-height:1.1;white-space:nowrap}
.stat span{font-size:11px;opacity:.85}
.alert{margin:12px 16px 0;padding:10px 12px;border-radius:var(--ov-radius-sm);font-size:13px}
.alert b{display:block;margin-bottom:2px}
.cty{padding:10px 16px}
.cty+.cty{border-top:1px solid var(--ov-border)}
.rw{display:flex;gap:8px;align-items:baseline;margin-top:5px;font-size:13px}
.rw .k{width:92px;flex:none;color:var(--ov-text3);font-size:12px}
.rw .v{min-width:0}
.rw .v small{display:block;color:var(--ov-text3);font-size:12px;margin-top:1px}
.rw .tag{white-space:normal;text-align:left}
.cty details{margin-top:4px}
.cty summary{cursor:pointer;font-size:12px;color:var(--ov-primary);min-height:32px;display:flex;align-items:center}
.nt{display:flex;flex-wrap:wrap;gap:6px}
.veh{margin:12px 16px 0;padding:12px;border-radius:var(--ov-radius-sm);background:var(--ov-bg2);display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.veh .lbl{font-size:12px;font-weight:600;color:var(--ov-text2);width:100%}
.opt{display:inline-flex;background:var(--ov-bg);border:1px solid var(--ov-border);border-radius:9999px;padding:2px}
.opt button{appearance:none;border:0;background:transparent;color:var(--ov-text2);font:inherit;font-size:13px;font-weight:600;min-height:36px;padding:0 12px;border-radius:9999px;cursor:pointer}
.opt button[aria-pressed=true]{background:var(--ov-primary);color:#fff}
.step{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ov-text2)}
.step button{appearance:none;width:36px;height:36px;border-radius:50%;border:1px solid var(--ov-border);background:var(--ov-bg);color:var(--ov-text);font:inherit;font-size:18px;cursor:pointer}
.step b{min-width:34px;text-align:center;font-size:16px;color:var(--ov-text)}
.veh .calc{margin-left:auto;font-size:12px;color:var(--ov-text3)}
.veh .muted{width:100%}
.busy{opacity:.55;pointer-events:none}
.veh .opt.wrap{flex-wrap:wrap;border-radius:20px}
.fs{position:absolute;top:10px;right:10px;appearance:none;border:0;background:rgba(255,255,255,.18);color:#fff;font:inherit;font-size:12px;font-weight:600;min-height:32px;padding:0 10px;border-radius:9999px;cursor:pointer}
.hero{position:relative}
.fs+.h1{padding-right:104px}
.bsteps{list-style:none;margin:0;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.bsteps li{display:flex;gap:10px;align-items:flex-start}
.bsteps .ic{width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;margin-top:1px}
.bsteps .dot{width:8px;height:8px;border-radius:50%;background:var(--ov-border)}
.bsteps .spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--ov-border);border-top-color:var(--ov-primary);animation:sp 0.8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.bsteps .spin{animation:none}}
.bsteps .chk{color:var(--ov-ideal);font-weight:800}
.bsteps .lab{font-size:14px;color:var(--ov-text3)}
.bsteps li.active .lab{color:var(--ov-text);font-weight:600}
.bsteps li.done .lab{color:var(--ov-text2)}
.bsteps .det{font-size:12px;color:var(--ov-text3);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.pbar{height:6px;margin:0 16px;border-radius:3px;background:var(--ov-bg2);overflow:hidden}
.pbar i{display:block;height:100%;background:var(--ov-primary);transition:width .3s}
.pfoot{display:flex;justify-content:space-between;padding:8px 16px 14px;font-size:12px;color:var(--ov-text3)}
`;

const TRIP_JS = `
var T=${JSON.stringify(TRIP_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
function cur(v,c){if(v==null)return "—";try{return new Intl.NumberFormat(OV.hostLocale(),{style:"currency",currency:c||"EUR",maximumFractionDigits:0}).format(v)}catch(e){return v+" "+c}}
var SC={ok:"ok",warn:"mid",bad:"bad"};
var car=null,busy=false,err=false;
function vehPanel(d){
  if(!d.args||!d.vehicle)return "";
  var dirty=car.fuel!==d.vehicle.fuel||car.cons!==d.vehicle.consumption;
  var h='<div class="veh'+(busy?' busy':'')+'"><span class="lbl">'+E(t("my_car"))+'</span><div class="opt" role="group">';
  ["diesel","gasoline","lpg"].forEach(function(f){h+='<button data-fuel="'+f+'" aria-pressed="'+(car.fuel===f)+'">'+E(t(f))+'</button>'});
  h+='</div><span class="step"><button data-cons="-1" aria-label="−0.5">−</button><b>'+car.cons+'</b>'+E(t("per100"))+'<button data-cons="1" aria-label="+0.5">+</button></span>';
  var opts=d.currency_options||[];
  var mine=(d.passports||[]).map(function(p){return p.value}),seen={},pp=[];
  (d.passports||[]).concat(d.passport_chips||[]).forEach(function(p){if(!seen[p.value]){seen[p.value]=1;pp.push(p)}});
  if(pp.length){h+='<span class="lbl">'+E(t("passport"))+'</span><div class="opt wrap" role="group" aria-label="'+E(t("passport"))+'">';pp.slice(0,8).forEach(function(p){h+='<button data-pass="'+E(p.value)+'" aria-pressed="'+(mine.indexOf(p.value)>=0)+'">'+flag(p.value,"flag-sm")+' '+E(p.label)+'</button>'});h+='</div>'}
  // ВНЖ: шенгенский снимает визу и счётчик 90/180, ВНЖ страны пути — «как дома» (plan.js → residenceTrack).
  if(mine.length){var res=resOf(d),rc=[];(d.countries||[]).map(function(c){return c.cc}).concat(res?[res]:[]).forEach(function(cc){if(rc.indexOf(cc)<0)rc.push(cc)});
    h+='<span class="lbl">'+E(t("residence"))+'</span><div class="opt wrap" role="group" aria-label="'+E(t("residence"))+'"><button data-res="" aria-pressed="'+(!res)+'">'+E(t("no_residence"))+'</button>';
    rc.slice(0,7).forEach(function(cc){var c=(d.countries||[]).find(function(x){return x.cc===cc});h+='<button data-res="'+E(cc)+'" aria-pressed="'+(res===cc)+'">'+flag(cc,"flag-sm")+' '+E(c?c.name:cc)+'</button>'});h+='</div>'}
  if(opts.length>1){h+='<div class="opt" role="group" aria-label="'+E(t("currency"))+'">';opts.slice(0,5).forEach(function(c){h+='<button data-cur="'+E(c)+'" aria-pressed="'+(c===d.currency)+'">'+E(c)+'</button>'});h+='</div>'}
  // Пересчёт сам: топливо и расход — через паузу после последнего нажатия, остальное — сразу.
  if(busy||pending)h+='<span class="calc">'+E(t("calculating"))+'</span>';
  if(err)h+='<span class="muted">'+E(t("recalc_err"))+'</span>';
  else if(d.vehicle.assumed&&d.vehicle.assumed.cons&&!dirty)h+='<span class="muted">'+E(t("typical_note"))+'</span>';
  return h+'</div>';
}
function resOf(d){var r=((d.args||{}).residence||"").split(",")[0].trim().toUpperCase();return /^[A-Z]{2}$/.test(r)?r:""}
var pending=null;
/** Запрос пересчёта: исходные аргументы + то, что человек поменял в карточке. */
function query(extra){
  // Расход и топливо — только если их указали или поменяли: иначе остаётся «типичный кемпер».
  var va=current.vehicle||{},asm=va.assumed||{},q=Object.assign({},current.args,{currency:current.currency},extra||{});
  if(!asm.cons||car.cons!==va.consumption)q.consumption=car.cons;
  if(!asm.fuel||car.fuel!==va.fuel)q.fuel=car.fuel;
  if(q.residence==="")delete q.residence;
  return q;
}
function later(){clearTimeout(pending);pending=setTimeout(function(){pending=null;var va=current.vehicle||{};if(car.fuel!==va.fuel||car.cons!==va.consumption)recalc(query());else draw(view(current))},700)}
document.addEventListener("click",function(e){
  if(!current||!current.args||busy)return;
  var f=e.target.closest("[data-fuel]");if(f){car.fuel=f.getAttribute("data-fuel");err=false;later();draw(view(current));return}
  // Шаг 0,5 л по сетке, как в мастере роудбука: с 5,5 «+» ведёт на 6, а не на 6,5.
  var c=e.target.closest("[data-cons]");if(c){var dir=Number(c.getAttribute("data-cons"));car.cons=Math.max(3,Math.min(40,(dir>0?Math.floor(car.cons*2+1e-9)+1:Math.ceil(car.cons*2-1e-9)-1)/2));err=false;later();draw(view(current));return}
  if(e.target.closest("[data-fs]")){OV.toggleFullscreen();return}
  var cu=e.target.closest("[data-cur]"),ps=e.target.closest("[data-pass]"),rs=e.target.closest("[data-res]");
  if(cu&&cu.getAttribute("data-cur")===current.currency)return;
  if(ps&&(current.passports||[]).length===1&&current.passports[0].value===ps.getAttribute("data-pass"))return;
  if(rs&&rs.getAttribute("data-res")===resOf(current))return;
  if(cu||ps||rs){
    clearTimeout(pending);pending=null;
    var x={};if(cu)x.currency=cu.getAttribute("data-cur");if(ps)x.passports=ps.getAttribute("data-pass");if(rs)x.residence=rs.getAttribute("data-res");
    recalc(query(x));
  }
});
/** Ключ поездки в состоянии карточки: исходные аргументы вызова, который нарисовал карточку. */
var origin=null;
function recalc(q,silent){
  busy=true;err=false;draw(view(current));
  OV.callTool("plan_road_trip",q).then(function(n){
    busy=false;
    if(n&&n.mode==="trip"){
      current=n;car={fuel:n.vehicle.fuel,cons:n.vehicle.consumption};
      if(origin){var st={};st[origin]=q;OV.state.set(st)}
      // Модель должна знать, что человек пересчитал поездку в карточке: следующий ответ — по новым цифрам.
      if(!silent)OV.updateContext(contextText(n),{trip:{title:n.title,currency:n.currency,totals:n.totals,vehicle:n.vehicle,passports:n.passports,args:n.args}});
    }else{err=true}
    draw(view(current));
  }).catch(function(){busy=false;err=true;draw(view(current))});
}
function contextText(n){
  var tt=n.totals||{},v=n.vehicle||{};
  return "The user recalculated the trip "+n.title+" in the OpenVan.camp card: "+v.fuel+", "+v.consumption+" l/100 km, currency "+n.currency
    +((n.passports||[]).length?", passport "+n.passports.map(function(p){return p.value}).join("+"):"")+(resOf(n)?", residence permit "+resOf(n):"")
    +". Totals: fuel "+(tt.fuel_unknown?"unknown":tt.fuel)+", tolls "+tt.tolls+", total "+tt.total+" "+n.currency+". Use these numbers from now on.";
}
// ── Пока инструмент ждёт сборку: этапы как на экране «Роудбук собирается» (building.blade.php) ──
var STEP_KEYS=["route","tolls","places","camps","weather","news"],prog=null,ptick=null;
function stopProg(){prog=null;clearInterval(ptick);ptick=null}
function stepPos(){if(!prog)return -1;if(prog.stage==="done")return STEP_KEYS.length;var i=STEP_KEYS.indexOf(prog.stage);return i}
function stepDetail(key){
  var st=prog.steps||{},tpl=st[key+"_done"]||"",f=prog.facts||{},keys=(tpl.match(/:([a-z_]+)/g)||[]).map(function(x){return x.slice(1)});
  if(!tpl||keys.some(function(k){return f[k]==null}))return "";
  return keys.reduce(function(txt,k){return txt.replace(":"+k,k==="km"?f[k]+" km":f[k])},tpl);
}
function progressView(){
  var st=prog.steps||{},pos=stepPos(),el=Math.round((Date.now()-prog.started)/1000);
  var h='<div class="card"><div class="hero"><h1 class="h1">'+E(prog.title||t("title"))+'</h1><div class="sub">'+E((prog.args.waypoints||[]).join(" → "))+'</div></div>';
  if(!prog.steps){h+='<div class="body"><div class="skel" style="height:160px"></div></div>'}
  else{
    h+='<ol class="bsteps">';
    STEP_KEYS.forEach(function(k,i){
      if(i>Math.max(0,pos)+1)return;
      var state=i<pos?"done":(i===pos||(pos===-1&&i===0)?"active":"todo");
      h+='<li class="'+state+'"><span class="ic">'+(state==="done"?'<span class="chk">✓</span>':state==="active"?'<span class="spin"></span>':'<span class="dot"></span>')+'</span><div><div class="lab">'+E(st[k]||k)+'</div>';
      if(state==="done"){var det=stepDetail(k),f=prog.facts||{};h+='<div class="det">'+(k==="tolls"&&f.countries?f.countries.map(function(c){return flag(c,"flag-sm")}).join(""):"")+(det?'<span>'+E(det)+'</span>':'')+(k==="tolls"&&f.tolls_eur>0&&st.tolls_sum?'<span>'+(det?'· ':'')+E(st.tolls_sum.replace(":sum",f.tolls_eur))+'</span>':'')+'</div>'}
      h+='</div></li>';
    });
    h+='</ol>';
    var pct=Math.max(4,Math.min(97,Math.round(((Math.max(0,pos)+0.5)/STEP_KEYS.length)*100)));if(prog.stage==="done")pct=100;
    h+='<div class="pbar"><i style="width:'+pct+'%"></i></div><div class="pfoot"><span>'+E(prog.stage==="queued"?(st.queued||""):prog.stage==="waiting"?(st.waiting||""):prog.stage==="done"?(st.done||""):pct+"%")+'</span><span>'+E((st.elapsed||":s s").replace(":s",el))+'</span></div>';
  }
  return h+'</div>';
}
function pollProg(){
  if(!prog||OV.hasData())return stopProg();
  var q=prog.code?{code:prog.code,locale:prog.args.locale}:prog.args;
  OV.callTool("get_roadbook_build_status",q).then(function(r){
    if(!prog||OV.hasData())return;
    if(r){prog.code=r.code||prog.code;prog.steps=r.steps||prog.steps;prog.title=r.title||prog.title;if(r.progress){prog.stage=r.progress.stage||prog.stage;prog.facts=r.progress.facts||prog.facts}if(r.status==="ready")prog.stage="done"}
    // Собрано, а результата инструмента нет (он ответил «ещё строится» — долгий маршрут):
    // через пару секунд берём готовый план сами, тем же инструментом.
    if(r&&r.status==="ready"&&!prog.fetching){prog.fetching=true;setTimeout(function(){if(!prog||OV.hasData())return;OV.callTool("plan_road_trip",prog.args).then(function(n){if(n&&n.mode==="trip"&&prog){stopProg();current=n;car={fuel:n.vehicle.fuel,cons:n.vehicle.consumption};draw(view(n))}}).catch(function(){})},4000)}
    draw(progressView());
    if(!r||(r.status!=="ready"&&r.status!=="failed"))setTimeout(pollProg,1500);
  }).catch(function(){if(prog)setTimeout(pollProg,3000)});
}
OV.onInput(function(a){
  if(OV.hasData()||prog||!a||!a.waypoints)return;
  prog={args:a,started:Date.now(),stage:"queued",facts:{},steps:null,title:null,code:null};
  draw(progressView());
  ptick=setInterval(function(){if(prog&&!OV.hasData())draw(progressView());else stopProg()},1000);
  pollProg();
});
OV.onData(function(d){
  // Тот же результат пришёл повторно (смена темы, полноэкранный режим) — не терять пересчёт человека.
  if(origin&&current&&d.args&&"trip:"+JSON.stringify(d.args)===origin){draw(view(current));return}
  stopProg();current=d;car={fuel:d.vehicle?d.vehicle.fuel:"diesel",cons:d.vehicle?d.vehicle.consumption:10};busy=false;err=false;
  // Карточку перерисовали (ChatGPT пересоздаёт её при прокрутке) — вернуть пересчёт, который человек уже делал.
  if(!origin&&d.args){origin="trip:"+JSON.stringify(d.args);var saved=OV.state.get(origin);if(saved&&JSON.stringify(saved)!==JSON.stringify(d.args)){recalc(saved,true);return}}
  draw(view(d));
});
function view(d){
  var h='<div class="card"><div class="hero">'+(OV.canFullscreen()?'<button class="fs" data-fs>'+E(OV.isFullscreen()?t("collapse"):t("full"))+'</button>':'')+'<h1 class="h1">'+E(t("title"))+': '+E(d.title)+(d.round_trip?' '+E(t("back")):'')+'</h1>';
  h+='<div class="sub">'+E(d.distance_km)+' '+t("km")+' · ~'+E(d.hours)+' '+t("h")+(d.drive_days?' · '+E(d.drive_days===1?t("days_one"):t("days").replace("{n}",d.drive_days)):'')+(d.first_day?' · '+E(dt(d.first_day,{day:"numeric",month:"short"}))+(d.end_date&&d.end_date!==d.first_day?' – '+E(dt(d.end_date,{day:"numeric",month:"short"})):''):'')+'</div>';
  var tt=d.totals;
  if(tt){h+='<div class="stats">';
    h+='<div class="stat"><b>'+(tt.fuel_unknown?'—':cur(tt.fuel,d.currency))+'</b><span>'+E(t("fuel"))+(tt.fuel_unknown?' · '+E(t("unknown")):(d.vehicle&&d.vehicle.assumed&&d.vehicle.assumed.cons?' · '+E(t("typical")):''))+'</span></div>';
    h+='<div class="stat"><b>'+cur(tt.tolls,d.currency)+'</b><span>'+E(t("tolls"))+'</span></div>';
    if(tt.vignettes)h+='<div class="stat"><b>'+cur(tt.vignettes,d.currency)+'</b><span>'+E(t("vignettes"))+'</span></div>';
    if(tt.ferries)h+='<div class="stat"><b>'+cur(tt.ferries,d.currency)+'</b><span>'+E(t("ferries"))+'</span></div>';
    h+='<div class="stat"><b>'+cur(tt.total,d.currency)+'</b><span>'+E(tt.fuel_unknown?t("total_wo"):t("total"))+'</span></div></div>';}
  h+='</div>'+vehPanel(d);
  if(d.alert)h+='<div class="alert '+(SC[d.alert.s]||"mid")+'"><b>'+E(d.alert.title)+'</b>'+E(d.alert.text)+'</div>';
  d.countries.forEach(function(c){
    h+='<div class="cty"><div class="row">'+flag(c.cc,"flag-sm")+'<span class="t1 grow">'+E(c.name)+'</span><span class="muted">'+E(c.km)+' '+t("km")+(c.cost!=null&&!(d.totals&&d.totals.fuel_unknown)?' · '+cur(c.cost,d.currency):'')+'</span></div>';
    function row(r){if(!r.big&&!r.lines.length)return "";return '<div class="rw"><span class="k">'+E(t(r.key))+'</span><span class="v">'+(r.big?'<span class="tag '+(SC[r.s]||"neu")+'">'+E(r.big)+'</span>':'')+(r.lines.length?'<small>'+E(r.lines[0])+'</small>':'')+(r.items||[]).map(function(x){return '<small><b>'+E(x.name)+':</b> '+E(x.text||"")+'</small>'}).join("")+'</span></div>'}
    var MAIN=["visa","car","roads","urban","winter","notes","hazards"];
    c.rows.filter(function(r){return MAIN.indexOf(r.key)>=0}).forEach(function(r){h+=row(r)});
    var rest=c.rows.filter(function(r){return MAIN.indexOf(r.key)<0}).map(row).join("");
    if(rest)h+='<details><summary>'+E(t("more_info"))+'</summary>'+rest+'</details>';
    h+='</div>';
  });
  // Границы: пункт, день, часы по службам и проверки (двусторонний пункт, будни, что везти).
  var bl=(d.borders||[]).filter(function(b){return !b.ferry});
  if(bl.length){h+='<div class="cty"><div class="sec" style="margin:0">'+E(t("borders"))+'</div>';bl.forEach(function(b){
    h+='<div class="rw"><span class="k">'+E(b.code)+'</span><span class="v">'+(b.name?'<b>'+E(b.name)+'</b>':'')+(b.day?' <span class="muted">· '+E(b.day)+'</span>':'')
      +(b.hours.length?b.hours.map(function(x){return '<small>'+E(x)+'</small>'}).join(""):b.hours_unknown?'<small>'+E(t("hours_unknown"))+'</small>':'')
      +b.checks.map(function(c){return '<small><span class="tag '+(SC[c.s]||"mid")+'">!</span> '+E(c.t)+'</small>'}).join("")+'</span></div>'});
    h+='</div>'}
  h+='<div class="body">';
  if(d.terms&&d.terms.length){h+='<div class="sec" style="margin-top:0">'+E(t("terms"))+'</div>';d.terms.forEach(function(x){h+='<div class="rw"><span class="k">'+E(x.names.join(", "))+'</span><span class="v"><span class="tag '+(x.you_bad?"bad":"neu")+'">'+E(t("you"))+': '+E(x.you)+'</span> <span class="tag '+(x.car_bad?"bad":"neu")+'">'+E(t("vehicle"))+': '+E(x.car)+'</span></span></div>'})}
  if(d.schengen)h+='<div class="note" style="margin-top:8px">'+E(t("schengen").replace("{u}",d.schengen.used).replace("{l}",d.schengen.left))+'</div>';
  if(d.nights&&d.nights.length){h+='<div class="sec">'+E(t("nights"))+'</div><div class="nt">';d.nights.forEach(function(n){h+='<span class="tag neu">'+E(t("day").replace("{n}",n.day))+' · '+E(n.city||"?")+(n.date?' · '+E(dt(n.date,{day:"numeric",month:"short"})):'')+'</span>'});h+='</div>'}
  if(d.weather_window&&d.weather_window.date)h+='<div class="note" style="margin-top:8px">☀ '+E(t("best").replace("{d}",dt(d.weather_window.date,{day:"numeric",month:"long"})))+'</div>';
  var warn=[];(d.checklist||[]).forEach(function(g){g.items.forEach(function(i){if(i.s==="bad"||i.s==="warn")warn.push(i)})});
  if(warn.length){h+='<div class="sec">'+E(t("checklist"))+'</div>';warn.slice(0,6).forEach(function(i){h+='<div class="note" style="margin-top:4px"><span class="tag '+(SC[i.s]||"mid")+'">!</span> '+E(i.t)+'</div>'})}
  h+='<div class="muted" style="margin-top:12px">'+E(t("note"))+'</div></div>';
  return h+btns([[t("open"),d.url]])+foot("");
}
`;

TRAVEL_HTML[TRIP_WIDGET] = {
  name: "Road trip summary",
  description: "Whole-route summary: distance, fuel and toll cost, and for every country on the way visas, weather, travel advice, power plugs and holidays.",
  html: page({ title: "Road trip", css: COMMON_CSS + TRIP_CSS, skeleton: SKELETON, script: TRIP_JS, pattern: 1 }),
};

// ------------------------------------------------------------------
// Справка по стране (get_country_travel_brief)
// ------------------------------------------------------------------

const BRIEF_I18N = {"en": {"plates": "Plates", "title": "Road trip to {c}", "visa": "Entry", "weather": "Weather", "fuel": "Fuel", "roads": "Roads", "dates": "Dates", "safety": "Safety", "power": "Power", "customs": "Customs", "food": "Food", "visa_free": "visa-free", "visa_required": "visa required", "e_visa": "e-visa", "eta": "travel authorisation", "on_arrival": "visa on arrival", "days": "up to {n} days", "of": "{n} of {w} days", "now": "now {s}/100", "week": "week {s}/100", "day_night": "day {d}°, night {n}°", "best": "best: {c}", "no_hol": "no public holidays in the next 30 days", "sys_vignette": "vignette", "sys_distance": "tolls by distance", "sys_free_flow": "electronic tolls (free-flow)", "sys_mixed": "tolls and vignettes", "sys_none": "no tolls", "van_rate": "campervan ≈ {r} €/km", "sev0": "no warnings", "sev1": "normal caution", "sev2": "increased caution", "sev3": "avoid parts of the country", "sev4": "avoid all travel", "food_more": "{p}% above world average", "food_less": "{p}% below world average", "passport_hint": "Tell me your passport to check entry and allowed stay.", "open": "Open on OpenVan.camp", "gasoline": "petrol", "diesel": "diesel", "lpg": "LPG"}, "ru": {"plates": "Номера", "title": "Поездка: {c}", "visa": "Въезд", "weather": "Погода", "fuel": "Топливо", "roads": "Дороги", "dates": "Даты", "safety": "Безопасность", "power": "Розетки", "customs": "Таможня", "food": "Продукты", "visa_free": "без визы", "visa_required": "нужна виза", "e_visa": "электронная виза", "eta": "разрешение на въезд", "on_arrival": "виза по прибытии", "days": "до {n} дней", "of": "{n} из {w} дней", "now": "сейчас {s}/100", "week": "неделя {s}/100", "day_night": "днём {d}°, ночью {n}°", "best": "лучше всего: {c}", "no_hol": "праздников в ближайшие 30 дней нет", "sys_vignette": "виньетка", "sys_distance": "платные дороги по километражу", "sys_free_flow": "электронная оплата (free-flow)", "sys_mixed": "платные дороги и виньетки", "sys_none": "платных дорог нет", "van_rate": "кемпер ≈ {r} €/км", "sev0": "предупреждений нет", "sev1": "обычная осторожность", "sev2": "повышенная осторожность", "sev3": "избегать части страны", "sev4": "не ездить", "food_more": "на {p}% дороже среднего по миру", "food_less": "на {p}% дешевле среднего по миру", "passport_hint": "Напишите свой паспорт — проверю въезд и сроки.", "open": "Открыть на OpenVan.camp", "gasoline": "бензин", "diesel": "дизель", "lpg": "газ"}, "de": {"plates": "Kennzeichen", "title": "Roadtrip: {c}", "visa": "Einreise", "weather": "Wetter", "fuel": "Kraftstoff", "roads": "Straßen", "dates": "Termine", "safety": "Sicherheit", "power": "Strom", "customs": "Zoll", "food": "Lebensmittel", "visa_free": "visumfrei", "visa_required": "Visum nötig", "e_visa": "E-Visum", "eta": "Reisegenehmigung", "on_arrival": "Visum bei Ankunft", "days": "bis {n} Tage", "of": "{n} von {w} Tagen", "now": "jetzt {s}/100", "week": "Woche {s}/100", "day_night": "tags {d}°, nachts {n}°", "best": "am besten: {c}", "no_hol": "keine Feiertage in den nächsten 30 Tagen", "sys_vignette": "Vignette", "sys_distance": "streckenabhängige Maut", "sys_free_flow": "elektronische Maut (Free-Flow)", "sys_mixed": "Maut und Vignetten", "sys_none": "keine Maut", "van_rate": "Camper ≈ {r} €/km", "sev0": "keine Warnungen", "sev1": "normale Vorsicht", "sev2": "erhöhte Vorsicht", "sev3": "Teile des Landes meiden", "sev4": "von Reisen abgeraten", "food_more": "{p}% über dem Weltdurchschnitt", "food_less": "{p}% unter dem Weltdurchschnitt", "passport_hint": "Nenne deinen Pass, dann prüfe ich Einreise und Aufenthaltsdauer.", "open": "Auf OpenVan.camp öffnen", "gasoline": "Benzin", "diesel": "Diesel", "lpg": "Autogas"}, "fr": {"plates": "Plaques", "title": "Road trip : {c}", "visa": "Entrée", "weather": "Météo", "fuel": "Carburant", "roads": "Routes", "dates": "Dates", "safety": "Sécurité", "power": "Électricité", "customs": "Douane", "food": "Alimentation", "visa_free": "sans visa", "visa_required": "visa obligatoire", "e_visa": "visa électronique", "eta": "autorisation de voyage", "on_arrival": "visa à l’arrivée", "days": "jusqu’à {n} jours", "of": "{n} sur {w} jours", "now": "maintenant {s}/100", "week": "semaine {s}/100", "day_night": "jour {d}°, nuit {n}°", "best": "le mieux : {c}", "no_hol": "pas de jours fériés dans les 30 prochains jours", "sys_vignette": "vignette", "sys_distance": "péages au kilomètre", "sys_free_flow": "péage électronique (flux libre)", "sys_mixed": "péages et vignettes", "sys_none": "pas de péages", "van_rate": "camping-car ≈ {r} €/km", "sev0": "aucun avertissement", "sev1": "prudence normale", "sev2": "vigilance renforcée", "sev3": "éviter certaines régions", "sev4": "déconseillé", "food_more": "{p} % au-dessus de la moyenne mondiale", "food_less": "{p} % sous la moyenne mondiale", "passport_hint": "Indiquez votre passeport pour vérifier l’entrée et la durée de séjour.", "open": "Ouvrir sur OpenVan.camp", "gasoline": "essence", "diesel": "gazole", "lpg": "GPL"}, "es": {"plates": "Matrículas", "title": "Viaje a {c}", "visa": "Entrada", "weather": "Tiempo", "fuel": "Combustible", "roads": "Carreteras", "dates": "Fechas", "safety": "Seguridad", "power": "Electricidad", "customs": "Aduana", "food": "Comida", "visa_free": "sin visado", "visa_required": "visado obligatorio", "e_visa": "visado electrónico", "eta": "autorización de viaje", "on_arrival": "visado a la llegada", "days": "hasta {n} días", "of": "{n} de {w} días", "now": "ahora {s}/100", "week": "semana {s}/100", "day_night": "día {d}°, noche {n}°", "best": "lo mejor: {c}", "no_hol": "sin festivos en los próximos 30 días", "sys_vignette": "viñeta", "sys_distance": "peajes por kilómetro", "sys_free_flow": "peaje electrónico (free-flow)", "sys_mixed": "peajes y viñetas", "sys_none": "sin peajes", "van_rate": "autocaravana ≈ {r} €/km", "sev0": "sin avisos", "sev1": "precaución normal", "sev2": "mayor precaución", "sev3": "evitar partes del país", "sev4": "no viajar", "food_more": "{p} % por encima de la media mundial", "food_less": "{p} % por debajo de la media mundial", "passport_hint": "Dime tu pasaporte y compruebo la entrada y la estancia.", "open": "Abrir en OpenVan.camp", "gasoline": "gasolina", "diesel": "diésel", "lpg": "GLP"}, "pt": {"plates": "Matrículas", "title": "Viagem a {c}", "visa": "Entrada", "weather": "Tempo", "fuel": "Combustível", "roads": "Estradas", "dates": "Datas", "safety": "Segurança", "power": "Eletricidade", "customs": "Alfândega", "food": "Comida", "visa_free": "sem visto", "visa_required": "visto obrigatório", "e_visa": "visto eletrónico", "eta": "autorização de viagem", "on_arrival": "visto à chegada", "days": "até {n} dias", "of": "{n} de {w} dias", "now": "agora {s}/100", "week": "semana {s}/100", "day_night": "dia {d}°, noite {n}°", "best": "melhor: {c}", "no_hol": "sem feriados nos próximos 30 dias", "sys_vignette": "vinheta", "sys_distance": "portagens por quilómetro", "sys_free_flow": "portagem eletrónica (free-flow)", "sys_mixed": "portagens e vinhetas", "sys_none": "sem portagens", "van_rate": "autocaravana ≈ {r} €/km", "sev0": "sem avisos", "sev1": "precaução normal", "sev2": "maior precaução", "sev3": "evitar partes do país", "sev4": "não viajar", "food_more": "{p}% acima da média mundial", "food_less": "{p}% abaixo da média mundial", "passport_hint": "Diga o seu passaporte para verificar a entrada e a estadia.", "open": "Abrir no OpenVan.camp", "gasoline": "gasolina", "diesel": "gasóleo", "lpg": "GPL"}, "tr": {"plates": "Plakalar", "title": "{c} yolculuğu", "visa": "Giriş", "weather": "Hava", "fuel": "Yakıt", "roads": "Yollar", "dates": "Tarihler", "safety": "Güvenlik", "power": "Elektrik", "customs": "Gümrük", "food": "Gıda", "visa_free": "vizesiz", "visa_required": "vize gerekli", "e_visa": "e-vize", "eta": "seyahat izni", "on_arrival": "kapıda vize", "days": "{n} güne kadar", "of": "{w} günde {n} gün", "now": "şu an {s}/100", "week": "hafta {s}/100", "day_night": "gündüz {d}°, gece {n}°", "best": "en iyi: {c}", "no_hol": "önümüzdeki 30 günde resmî tatil yok", "sys_vignette": "vinyet", "sys_distance": "kilometreye göre ücret", "sys_free_flow": "elektronik geçiş (free-flow)", "sys_mixed": "geçiş ücretleri ve vinyetler", "sys_none": "ücretli yol yok", "van_rate": "karavan ≈ {r} €/km", "sev0": "uyarı yok", "sev1": "normal dikkat", "sev2": "artırılmış dikkat", "sev3": "ülkenin bazı bölgelerinden kaçının", "sev4": "seyahat etmeyin", "food_more": "dünya ortalamasının %{p} üzerinde", "food_less": "dünya ortalamasının %{p} altında", "passport_hint": "Pasaportunuzu yazın, giriş ve kalış süresini kontrol edeyim.", "open": "OpenVan.camp’da aç", "gasoline": "benzin", "diesel": "motorin", "lpg": "LPG"}};

const BRIEF_CSS = `
.rw{display:flex;gap:10px;align-items:baseline;padding:9px 16px;font-size:13px}
.rw+.rw{border-top:1px solid var(--ov-border)}
.rw .k{width:92px;flex:none;color:var(--ov-text3);font-size:12px}
.rw .v{min-width:0}
.rw .v small{display:block;color:var(--ov-text3);font-size:12px;margin-top:2px}
.rw .tag{white-space:normal}
`;

const BRIEF_JS = `
var T=${JSON.stringify(BRIEF_I18N)};function t(k){return OV.t(T,k)}
${HELPERS_JS}
function eur(p,cur,rates){var r=rates&&rates[cur];return r?(p/r).toFixed(2)+" €":""}
function row(k,big,s,lines){if(!big&&!(lines&&lines.length))return "";return '<div class="rw"><span class="k">'+E(t(k))+'</span><span class="v">'+(big?'<span class="tag '+(s||"neu")+'">'+E(big)+'</span>':'')+(lines||[]).filter(Boolean).map(function(l){return '<small>'+E(l)+'</small>'}).join("")+'</span></div>'}
OV.onData(function(d){
  current=d;var c=d.country||{},h='<div class="card"><div class="hero"><div class="row">'+flag(c.code)+'<h1 class="h1">'+E(t("title").replace("{c}",cName(c.code,c.name)))+'</h1></div></div>';
  var v=d.visa;
  if(v){var st=v.stay||{},m=v.entry_mode||st.visa_type||"";var lim=st.max_continuous?t("days").replace("{n}",st.max_continuous):"";
    if(st.max_total&&st.window_days)lim+=(lim?", ":"")+t("of").replace("{n}",st.max_total).replace("{w}",st.window_days);
    h+=row("visa",t(m)!==m?t(m):m.replace(/_/g," "),m==="visa_free"?"ok":(m==="visa_required"?"bad":"mid"),[lim,st.note])}
  else h+=row("visa","",null,[t("passport_hint")]);
  var w=d.weather;
  if(w&&w.score!=null){var td=w.today||{},best=(w.best||[]).map(function(x){return x.name}).join(", ");
    h+=row("weather",t("now").replace("{s}",w.score),w.score>=60?"ok":(w.score>=40?"mid":"bad"),[(w.week_score!=null?t("week").replace("{s}",w.week_score)+" · ":"")+(td.temp_day!=null?t("day_night").replace("{d}",Math.round(td.temp_day)).replace("{n}",Math.round(td.temp_night)):""),best?t("best").replace("{c}",best):""])}
  var f=d.fuel;
  if(f&&f.grades&&f.grades.length){h+=row("fuel","",null,f.grades.map(function(g){var e=eur(g.price,g.currency,f.rates);return t(g.type)+": "+(+g.price).toFixed(2)+" "+g.currency+(e&&g.currency!=="EUR"?" ≈ "+e:"")}))}
  var r=d.tolls;
  if(r&&r.system_type){var sk="sys_"+r.system_type,lab=t(sk)!==sk?t(sk):r.system_type;var vr=r.van&&r.van.rate_per_km_eur?t("van_rate").replace("{r}",(+r.van.rate_per_km_eur).toFixed(3)):"";
    h+=row("roads",lab,r.system_type==="none"?"ok":"mid",[vr])}
  var ho=d.holidays;
  if(ho){var it=ho.items||[];h+=row("dates","",null,it.length?it.map(function(x){return dt(x.start,{day:"numeric",month:"short"})+" — "+x.name}):[t("no_hol")])}
  var hz=d.hazards;
  if(hz&&hz.advisory){var sv=Math.max(0,Math.min(4,hz.advisory.severity||0));h+=row("safety",t("sev"+sv),sv<=1?"ok":(sv===2?"mid":"bad"),(hz.events||[]).map(function(e){return e.name||e.type}))}
  var pl=d.plugs;
  if(pl&&pl.plugs){h+=row("power",pl.plugs.join(", ")+(pl.voltage?" · "+pl.voltage+" V":""),null,[pl.campsite?"⛺ "+pl.campsite:""])}
  var cu=d.customs;
  if(cu&&cu.items&&cu.items.length){h+=row("customs","",null,cu.items.slice(0,3).map(function(i){return i.summary}))}
  var fo=d.food;
  if(fo&&fo.index!=null){var pv=fo.pct_vs_world!=null?Math.round(fo.pct_vs_world):Math.round(fo.index-100);h+=row("food",String(Math.round(fo.index)),pv>15?"mid":"ok",[(pv>=0?t("food_more"):t("food_less")).replace("{p}",Math.abs(pv))])}
  var pt=d.plates;
  if(pt&&pt.svg){h+='<div class="rw"><span class="k">'+E(t("plates"))+'</span><span class="v"><a href="#" data-link="'+E(pt.url||"")+'"><img src="'+E(pt.svg)+'" alt="'+E(pt.example||"")+'" style="height:34px;max-width:100%;display:block;border-radius:4px"></a></span></div>'}
  h+='<div class="body" style="padding-top:4px"></div>';
  draw(h+btns([[t("open"),d.url]])+foot(""));
});
`;

TRAVEL_HTML[TRAVEL_WIDGETS.brief] = {
  name: "Country road-trip briefing",
  description: "One card per country for a road trip: entry and allowed stay, weather, fuel, tolls, holidays, safety, power plugs, customs and food prices.",
  html: page({ title: "Country briefing", css: COMMON_CSS + BRIEF_CSS, skeleton: SKELETON, script: BRIEF_JS, pattern: 3 }),
};
