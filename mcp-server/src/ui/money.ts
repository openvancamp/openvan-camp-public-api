import { page, SITE } from "./bridge.js";
import { COUNTRY_JS } from "./snippets.js";

/**
 * Карточки «про деньги»: топливо, цены на продукты, валюта.
 *
 * Курсы приходят вместе с результатом инструмента (свежие, из /api/currency/rates),
 * и карточка пересчитывает цены в выбранную валюту на лету. Цены в данных — только
 * в местной валюте и местной единице; ничего пересчитанного заранее не хранится.
 */

export const MONEY_WIDGETS = {
  fuel: "ui://openvan/fuel.html",
  food: "ui://openvan/food-prices.html",
  currency: "ui://openvan/currency.html",
} as const;

/** Общий JS: форматирование денег и пересчёт по курсам «единиц валюты за 1 EUR». */
const MONEY_JS = `
function conv(v,from,to,rates){
  if(v==null)return null;from=String(from).toUpperCase();to=String(to).toUpperCase();
  if(from===to)return v;
  var rf=from==="EUR"?1:rates[from],rt=to==="EUR"?1:rates[to];
  if(!rf||!rt)return null;return v/rf*rt;
}
function money(v,cur,digits){
  if(v==null||isNaN(v))return "—";
  try{return new Intl.NumberFormat(OV.hostLocale(),{style:"currency",currency:cur,minimumFractionDigits:digits==null?2:digits,maximumFractionDigits:digits==null?2:digits}).format(v)}
  catch(e){return v.toFixed(digits==null?2:digits)+" "+cur}
}
function num(v,d){if(v==null||isNaN(v))return "—";try{return new Intl.NumberFormat(OV.hostLocale(),{maximumFractionDigits:d==null?2:d}).format(v)}catch(e){return String(v)}}
`;

const MONEY_CSS = `
.seg-host{margin-left:auto}
.rows{list-style:none;margin:0;padding:6px 0}
.r{display:flex;align-items:center;gap:10px;padding:9px 16px;min-height:44px}
.r+.r{border-top:1px solid var(--ov-border)}
.r .lab{flex:1;min-width:0}
.r .val{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.r .alt{font-size:11px;color:var(--ov-text3);text-align:right}
.bar{flex:none;width:72px;height:6px;border-radius:3px;background:var(--ov-bg2);overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px;background:var(--ov-primary)}
.best{color:var(--ov-green)}
:root[data-theme=dark] .best{color:#9fd36a}
.big{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1}
.pill{display:inline-block;border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:700}
@media (max-width:360px){.bar{display:none}}
`;

// ------------------------------------------------------------------
// Топливо: get_fuel_prices, compare_fuel_prices, find_cheapest_fuel
// ------------------------------------------------------------------

const FUEL_I18N = {
  en: { title_country: "Fuel prices", title_compare: "Fuel price comparison", title_cheapest: "Cheapest fuel", title_overview: "Fuel prices by country", per_l: "per liter", per_gal: "per gallon", per_kg: "per kg", per_m3: "per m³", local: "Local", open: "Open fuel prices", cheapest: "cheapest", updated: "Updated", world: "World", europe: "Europe", asia: "Asia", africa: "Africa", north_america: "North America", south_america: "South America", oceania: "Oceania", gasoline: "Gasoline", gasoline_regular: "Gasoline regular", gasoline_premium: "Gasoline premium", gasoline_super: "Gasoline super", premium: "Premium gasoline", diesel: "Diesel", diesel_regular: "Diesel regular", diesel_premium: "Diesel premium", lpg: "LPG (autogas)", cng: "CNG", e85: "E85", kerosene: "Kerosene", not_comparable: "not comparable per liter" },
  ru: { title_country: "Цены на топливо", title_compare: "Сравнение цен на топливо", title_cheapest: "Где дешевле топливо", title_overview: "Цены на топливо по странам", per_l: "за литр", per_gal: "за галлон", per_kg: "за кг", per_m3: "за м³", local: "Местная", open: "Открыть цены на топливо", cheapest: "дешевле всего", updated: "Обновлено", world: "Мир", europe: "Европа", asia: "Азия", africa: "Африка", north_america: "Северная Америка", south_america: "Южная Америка", oceania: "Океания", gasoline: "Бензин", gasoline_regular: "Бензин обычный", gasoline_premium: "Бензин премиум", gasoline_super: "Бензин супер", premium: "Бензин премиум", diesel: "Дизель", diesel_regular: "Дизель обычный", diesel_premium: "Дизель премиум", lpg: "Газ (пропан)", cng: "Метан (CNG)", e85: "E85", kerosene: "Керосин", not_comparable: "не сравнить за литр" },
  de: { title_country: "Kraftstoffpreise", title_compare: "Kraftstoffpreise im Vergleich", title_cheapest: "Günstigster Kraftstoff", title_overview: "Kraftstoffpreise nach Land", per_l: "pro Liter", per_gal: "pro Gallone", per_kg: "pro kg", per_m3: "pro m³", local: "Lokal", open: "Kraftstoffpreise öffnen", cheapest: "am günstigsten", updated: "Aktualisiert", world: "Welt", europe: "Europa", asia: "Asien", africa: "Afrika", north_america: "Nordamerika", south_america: "Südamerika", oceania: "Ozeanien", gasoline: "Benzin", gasoline_regular: "Benzin normal", gasoline_premium: "Benzin Premium", gasoline_super: "Super", premium: "Super Plus", diesel: "Diesel", diesel_regular: "Diesel normal", diesel_premium: "Diesel Premium", lpg: "Autogas (LPG)", cng: "Erdgas (CNG)", e85: "E85", kerosene: "Kerosin", not_comparable: "nicht pro Liter vergleichbar" },
  fr: { title_country: "Prix du carburant", title_compare: "Comparaison des prix du carburant", title_cheapest: "Carburant le moins cher", title_overview: "Prix du carburant par pays", per_l: "par litre", per_gal: "par gallon", per_kg: "par kg", per_m3: "par m³", local: "Locale", open: "Ouvrir les prix du carburant", cheapest: "le moins cher", updated: "Mis à jour", world: "Monde", europe: "Europe", asia: "Asie", africa: "Afrique", north_america: "Amérique du Nord", south_america: "Amérique du Sud", oceania: "Océanie", gasoline: "Essence", gasoline_regular: "Essence ordinaire", gasoline_premium: "Essence premium", gasoline_super: "Super", premium: "Essence premium", diesel: "Gazole", diesel_regular: "Gazole ordinaire", diesel_premium: "Gazole premium", lpg: "GPL", cng: "GNV", e85: "E85", kerosene: "Kérosène", not_comparable: "non comparable au litre" },
  es: { title_country: "Precios del combustible", title_compare: "Comparación de precios del combustible", title_cheapest: "Combustible más barato", title_overview: "Precios del combustible por país", per_l: "por litro", per_gal: "por galón", per_kg: "por kg", per_m3: "por m³", local: "Local", open: "Abrir precios del combustible", cheapest: "el más barato", updated: "Actualizado", world: "Mundo", europe: "Europa", asia: "Asia", africa: "África", north_america: "Norteamérica", south_america: "Sudamérica", oceania: "Oceanía", gasoline: "Gasolina", gasoline_regular: "Gasolina normal", gasoline_premium: "Gasolina premium", gasoline_super: "Gasolina súper", premium: "Gasolina premium", diesel: "Diésel", diesel_regular: "Diésel normal", diesel_premium: "Diésel premium", lpg: "GLP (autogás)", cng: "GNC", e85: "E85", kerosene: "Queroseno", not_comparable: "no comparable por litro" },
  pt: { title_country: "Preços dos combustíveis", title_compare: "Comparação de preços dos combustíveis", title_cheapest: "Combustível mais barato", title_overview: "Preços dos combustíveis por país", per_l: "por litro", per_gal: "por galão", per_kg: "por kg", per_m3: "por m³", local: "Local", open: "Abrir preços dos combustíveis", cheapest: "o mais barato", updated: "Atualizado", world: "Mundo", europe: "Europa", asia: "Ásia", africa: "África", north_america: "América do Norte", south_america: "América do Sul", oceania: "Oceania", gasoline: "Gasolina", gasoline_regular: "Gasolina comum", gasoline_premium: "Gasolina premium", gasoline_super: "Gasolina super", premium: "Gasolina premium", diesel: "Gasóleo", diesel_regular: "Gasóleo comum", diesel_premium: "Gasóleo premium", lpg: "GPL", cng: "GNV", e85: "E85", kerosene: "Querosene", not_comparable: "não comparável por litro" },
  tr: { title_country: "Akaryakıt fiyatları", title_compare: "Akaryakıt fiyat karşılaştırması", title_cheapest: "En ucuz akaryakıt", title_overview: "Ülkelere göre akaryakıt fiyatları", per_l: "litre başına", per_gal: "galon başına", per_kg: "kg başına", per_m3: "m³ başına", local: "Yerel", open: "Akaryakıt fiyatlarını aç", cheapest: "en ucuz", updated: "Güncellendi", world: "Dünya", europe: "Avrupa", asia: "Asya", africa: "Afrika", north_america: "Kuzey Amerika", south_america: "Güney Amerika", oceania: "Okyanusya", gasoline: "Benzin", gasoline_regular: "Normal benzin", gasoline_premium: "Premium benzin", gasoline_super: "Süper benzin", premium: "Premium benzin", diesel: "Motorin", diesel_regular: "Normal motorin", diesel_premium: "Premium motorin", lpg: "LPG (otogaz)", cng: "CNG", e85: "E85", kerosene: "Gazyağı", not_comparable: "litre başına karşılaştırılamaz" },
};

const FUEL_SKELETON = `<div class="card"><div class="hero"><div class="skel" style="height:22px;width:60%;opacity:.4"></div></div><div class="body"><div class="skel" style="height:160px"></div></div></div>`;

const FUEL_JS = `
var T=${JSON.stringify(FUEL_I18N)};
${COUNTRY_JS}
${MONEY_JS}
function t(k){return OV.t(T,k)}
var E=OV.esc,current=null,shown=null;
var LPU={liter:1,gallon:3.78541,imperial_gallon:4.54609};
function perLabel(u){return u==="gallon"||u==="imperial_gallon"?t("per_gal"):u==="kg"?t("per_kg"):u==="m3"?t("per_m3"):t("per_l")}
function choices(d){var c=["EUR","USD"];if(d.mode==="country"&&d.local_currency&&c.indexOf(d.local_currency)<0)c.unshift(d.local_currency);return c}
function seg(d){var h='<div class="seg seg-host" role="group">';choices(d).forEach(function(c){h+='<button data-cur="'+c+'" aria-pressed="'+(c===shown)+'">'+c+'</button>'});return h+'</div>'}
function head(d,title,sub){
  var h='<div class="card"><div class="hero"><div class="hero-row"><div class="grow"><div class="row">'+(d.country?flag(d.country.code):'')+'<h1 class="h1">'+E(title)+'</h1></div>';
  if(sub)h+='<div class="sub">'+E(sub)+'</div>';
  return h+'</div>'+seg(d)+'</div></div>';
}
function foot(d){return '<div class="actions" style="padding-top:12px"><button class="btn btn-primary" data-act="open">'+t("open")+'</button></div><div class="foot"><span>'+(d.updated_at?t("updated")+' '+E(String(d.updated_at).slice(0,10)):'')+'</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>'}
function renderCountry(d){
  var name=cName(d.country.code,d.country.name);
  var h=head(d,t("title_country")+": "+name,(d.sources&&d.sources.length?d.sources.slice(0,3).join(", "):""))+'<ul class="rows">';
  d.grades.forEach(function(g){
    var v=conv(g.price,g.currency,shown,d.rates);
    var orig=g.currency!==shown?money(g.price,g.currency,g.price>=100?0:2)+" "+perLabel(g.unit):"";
    h+='<li class="r"><span class="lab">'+E(t(g.type))+'</span><span><div class="val">'+money(v,shown,v!=null&&v>=100?0:2)+'</div><div class="alt">'+E(perLabel(g.unit))+(orig?' · '+E(orig):'')+'</div></span></li>';
  });
  document.getElementById("app").innerHTML=h+'</ul>'+foot(d);
}
function renderRanking(d){
  var gal=OV.imperial();
  var title=d.kind==="cheapest"?t("title_cheapest")+" · "+t(d.region||"world"):t("title_compare");
  var h=head(d,title,t(d.fuel_type)+" · "+(gal?t("per_gal"):t("per_l")))+'<ul class="rows">';
  var vals=d.rows.map(function(r){var e=r.eur_per_liter;return e==null?null:conv(e*(gal?3.78541:1),"EUR",shown,d.rates)});
  var max=Math.max.apply(null,vals.filter(function(v){return v!=null}).concat([0]));
  d.rows.forEach(function(r,i){
    var v=vals[i];var first=i===0&&v!=null;
    h+='<li class="r"><span class="muted" style="width:16px;text-align:right">'+(i+1)+'</span>'+flag(r.code,"flag-sm")+'<span class="lab ellipsis">'+E(cName(r.code,r.name))+(first?' <span class="pill best">'+t("cheapest")+'</span>':'')+'</span>';
    h+='<span class="bar"><i style="width:'+(v&&max?Math.round(v/max*100):0)+'%"></i></span>';
    h+='<span><div class="val'+(first?' best':'')+'">'+(v==null?'—':money(v,shown))+'</div><div class="alt">'+(v==null?E(t("not_comparable")):E(money(r.price,r.currency,r.price>=100?0:2)+" "+perLabel(r.unit)))+'</div></span></li>';
  });
  document.getElementById("app").innerHTML=h+'</ul>'+foot(d);
}
function renderOverview(d){
  var gal=OV.imperial();
  var h=head(d,t("title_overview"),t("diesel")+" / "+t("gasoline")+" · "+(gal?t("per_gal"):t("per_l")))+'<ul class="rows">';
  d.rows.slice(0,12).forEach(function(r){
    function c(e){return e==null?'—':money(conv(e*(gal?3.78541:1),"EUR",shown,d.rates),shown)}
    h+='<li class="r">'+flag(r.code,"flag-sm")+'<span class="lab ellipsis">'+E(cName(r.code,r.name))+'</span><span class="val">'+c(r.diesel_eur_per_liter)+'</span><span class="val muted" style="width:76px">'+c(r.gasoline_eur_per_liter)+'</span></li>';
  });
  document.getElementById("app").innerHTML=h+'</ul>'+foot(d);
}
function render(){var d=current;if(!d)return;if(shown==null||choices(d).indexOf(shown)<0)shown=d.mode==="country"&&d.local_currency?d.local_currency:"EUR";
  if(d.mode==="country")renderCountry(d);else if(d.mode==="overview")renderOverview(d);else renderRanking(d)}
OV.onData(function(d){current=d;render()});
document.addEventListener("click",function(e){
  var c=e.target.closest("[data-cur]");if(c){shown=c.getAttribute("data-cur");render();return}
  var a=e.target.closest("[data-act]");if(!a||!current)return;e.preventDefault();
  OV.openLink(a.getAttribute("data-act")==="open"?OV.siteUrl(current.url):"${SITE}/"+OV.locale());
});
`;

// ------------------------------------------------------------------
// Продукты: get_country_food_prices, compare_food_prices
// ------------------------------------------------------------------

const FOOD_I18N = {
  en: { title: "Food prices", world: "World average = 100", above: "{p}% more expensive than the world average", below: "{p}% cheaper than the world average", same: "About the world average", cheaper: "Food in {to} is {p}% cheaper than in {from}", pricier: "Food in {to} is {p}% more expensive than in {from}", basket: "A grocery basket that costs 100 at home costs about {b} there", open: "Open the food price index", official: "official statistics", estimated: "estimate", index: "index" },
  ru: { title: "Цены на продукты", world: "Среднее по миру = 100", above: "на {p}% дороже среднего по миру", below: "на {p}% дешевле среднего по миру", same: "Примерно как в среднем по миру", cheaper: "Продукты в стране «{to}» на {p}% дешевле, чем в стране «{from}»", pricier: "Продукты в стране «{to}» на {p}% дороже, чем в стране «{from}»", basket: "Корзина, которая дома стоит 100, там стоит примерно {b}", open: "Открыть индекс цен на продукты", official: "официальная статистика", estimated: "оценка", index: "индекс" },
  de: { title: "Lebensmittelpreise", world: "Weltdurchschnitt = 100", above: "{p}% teurer als der Weltdurchschnitt", below: "{p}% günstiger als der Weltdurchschnitt", same: "Etwa Weltdurchschnitt", cheaper: "Lebensmittel sind in {to} {p}% günstiger als in {from}", pricier: "Lebensmittel sind in {to} {p}% teurer als in {from}", basket: "Ein Einkauf, der zu Hause 100 kostet, kostet dort etwa {b}", open: "Lebensmittelindex öffnen", official: "amtliche Statistik", estimated: "Schätzung", index: "Index" },
  fr: { title: "Prix de l’alimentation", world: "Moyenne mondiale = 100", above: "{p} % plus cher que la moyenne mondiale", below: "{p} % moins cher que la moyenne mondiale", same: "Proche de la moyenne mondiale", cheaper: "L’alimentation est {p} % moins chère en {to} qu’en {from}", pricier: "L’alimentation est {p} % plus chère en {to} qu’en {from}", basket: "Un panier qui coûte 100 chez vous coûte environ {b} là-bas", open: "Ouvrir l’indice des prix alimentaires", official: "statistique officielle", estimated: "estimation", index: "indice" },
  es: { title: "Precios de la comida", world: "Media mundial = 100", above: "{p} % más caro que la media mundial", below: "{p} % más barato que la media mundial", same: "Cerca de la media mundial", cheaper: "La comida en {to} es un {p} % más barata que en {from}", pricier: "La comida en {to} es un {p} % más cara que en {from}", basket: "Una compra que en casa cuesta 100 allí cuesta unos {b}", open: "Abrir el índice de precios de la comida", official: "estadística oficial", estimated: "estimación", index: "índice" },
  pt: { title: "Preços da comida", world: "Média mundial = 100", above: "{p}% mais caro que a média mundial", below: "{p}% mais barato que a média mundial", same: "Perto da média mundial", cheaper: "A comida em {to} é {p}% mais barata do que em {from}", pricier: "A comida em {to} é {p}% mais cara do que em {from}", basket: "Um cabaz que em casa custa 100 lá custa cerca de {b}", open: "Abrir o índice de preços da comida", official: "estatística oficial", estimated: "estimativa", index: "índice" },
  tr: { title: "Gıda fiyatları", world: "Dünya ortalaması = 100", above: "Dünya ortalamasından %{p} pahalı", below: "Dünya ortalamasından %{p} ucuz", same: "Dünya ortalaması civarında", cheaper: "{to} ülkesinde gıda, {from} ülkesine göre %{p} daha ucuz", pricier: "{to} ülkesinde gıda, {from} ülkesine göre %{p} daha pahalı", basket: "Evde 100 tutan bir alışveriş orada yaklaşık {b} tutar", open: "Gıda fiyat endeksini aç", official: "resmî istatistik", estimated: "tahmin", index: "endeks" },
};

const FOOD_CSS = `
.cmp{display:flex;flex-direction:column;gap:10px}
.cmp .line{display:flex;align-items:center;gap:8px}
.cmp .track{flex:1;height:10px;border-radius:5px;background:var(--ov-bg2);overflow:hidden}
.cmp .track i{display:block;height:100%;border-radius:5px}
.cmp .n{width:44px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.cmp .who{width:110px;display:flex;align-items:center;gap:6px;min-width:0}
`;

const FOOD_JS = `
var T=${JSON.stringify(FOOD_I18N)};
${COUNTRY_JS}
${MONEY_JS}
function t(k){return OV.t(T,k)}
var E=OV.esc,current=null;
function line(cc,name,v,max,color){return '<div class="line"><span class="who">'+flag(cc,"flag-sm")+'<span class="ellipsis">'+E(name)+'</span></span><span class="track"><i style="width:'+Math.min(100,Math.round(v/max*100))+'%;background:'+color+'"></i></span><span class="n">'+num(v,0)+'</span></div>'}
function renderCountry(d){
  var c=d.country,name=cName(c.code,c.name),p=Math.round(Math.abs(d.pct_vs_world));
  var verdict=Math.abs(d.pct_vs_world)<3?t("same"):(d.pct_vs_world>0?t("above"):t("below")).replace("{p}",p);
  var max=Math.max(d.index,100)*1.1;
  var h='<div class="card"><div class="hero"><div class="row">'+flag(c.code)+'<h1 class="h1">'+E(t("title"))+': '+E(name)+'</h1></div><div class="sub">'+E(t("world"))+'</div></div>';
  h+='<div class="body"><div class="row" style="align-items:baseline;gap:10px"><span class="big">'+num(d.index,1)+'</span><span class="muted">'+t("index")+'</span></div><div style="margin:6px 0 14px;color:var(--ov-text2)">'+E(verdict)+'</div>';
  h+='<div class="cmp">'+line(c.code,name,d.index,max,"var(--ov-primary)")+line(null,t("world").replace(/\\s*=.*$/,""),100,max,"var(--ov-text3)")+'</div>';
  h+='<div class="muted" style="margin-top:10px">'+E(d.data_quality==="official"?t("official"):t("estimated"))+(d.updated_at?' · '+E(d.updated_at):'')+'</div></div>';
  document.getElementById("app").innerHTML=h+actions();
}
function renderCompare(d){
  var f=d.from,to=d.to,fn=cName(f.code,f.name),tn=cName(to.code,to.name),p=Math.round(Math.abs(d.diff_percent));
  var max=Math.max(f.index,to.index)*1.1;
  var h='<div class="card"><div class="hero"><div class="row">'+flag(f.code)+'<span style="opacity:.8">→</span>'+flag(to.code)+'<h1 class="h1 ellipsis">'+E(t("title"))+'</h1></div>';
  h+='<div class="sub">'+E((d.cheaper?t("cheaper"):t("pricier")).replace("{to}",tn).replace("{from}",fn).replace("{p}",p))+'</div></div>';
  h+='<div class="body"><div class="cmp">'+line(f.code,fn,f.index,max,"var(--ov-text3)")+line(to.code,tn,to.index,max,d.cheaper?"var(--ov-ideal)":"var(--ov-hard)")+'</div>';
  h+='<div class="note" style="margin-top:12px">'+E(t("basket").replace("{b}",num(d.budget_100,0)))+'</div><div class="muted" style="margin-top:6px">'+E(t("world"))+'</div></div>';
  document.getElementById("app").innerHTML=h+actions();
}
function actions(){return '<div class="actions"><button class="btn btn-primary" data-act="open">'+t("open")+'</button></div><div class="foot"><span>ICP · IMF CPI</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>'}
OV.onData(function(d){current=d;if(d.mode==="compare")renderCompare(d);else renderCountry(d)});
document.addEventListener("click",function(e){
  var a=e.target.closest("[data-act]");if(!a||!current)return;e.preventDefault();
  OV.openLink(a.getAttribute("data-act")==="open"?OV.siteUrl(current.url):"${SITE}/"+OV.locale());
});
`;

// ------------------------------------------------------------------
// Валюта: get_currency_rate
// ------------------------------------------------------------------

const CUR_I18N = {
  en: { title: "Currency converter", swap: "Swap", amount: "Amount", open: "Open the converter", updated: "Rates updated" },
  ru: { title: "Конвертер валют", swap: "Поменять", amount: "Сумма", open: "Открыть конвертер", updated: "Курсы обновлены" },
  de: { title: "Währungsrechner", swap: "Tauschen", amount: "Betrag", open: "Rechner öffnen", updated: "Kurse aktualisiert" },
  fr: { title: "Convertisseur de devises", swap: "Inverser", amount: "Montant", open: "Ouvrir le convertisseur", updated: "Taux mis à jour" },
  es: { title: "Conversor de divisas", swap: "Invertir", amount: "Importe", open: "Abrir el conversor", updated: "Tipos actualizados" },
  pt: { title: "Conversor de moedas", swap: "Trocar", amount: "Valor", open: "Abrir o conversor", updated: "Câmbio atualizado" },
  tr: { title: "Döviz çevirici", swap: "Değiştir", amount: "Tutar", open: "Çeviriciyi aç", updated: "Kurlar güncellendi" },
};

const CUR_CSS = `
.conv{display:flex;flex-direction:column;gap:10px}
.field{display:flex;align-items:center;gap:8px;background:var(--ov-bg2);border-radius:var(--ov-radius-sm);padding:6px 12px}
.field input{flex:1;min-width:0;border:0;background:transparent;color:var(--ov-text);font:inherit;font-size:22px;font-weight:700;padding:6px 0;outline:none}
.field b{font-size:15px}
.result{font-size:26px;font-weight:800;letter-spacing:-.01em}
.quick{display:flex;gap:6px;flex-wrap:wrap}
.quick button{appearance:none;border:1px solid var(--ov-border);background:var(--ov-bg);color:var(--ov-text);border-radius:9999px;min-height:36px;padding:0 12px;font:inherit;cursor:pointer}
`;

const CUR_JS = `
var T=${JSON.stringify(CUR_I18N)};
${MONEY_JS}
function t(k){return OV.t(T,k)}
var E=OV.esc,current=null,from,to,amount;
function render(){
  var d=current;var rate=from===d.from?d.rate:1/d.rate;var out=amount*rate;
  var h='<div class="card"><div class="hero"><h1 class="h1">'+t("title")+'</h1><div class="sub">1 '+E(from)+' = '+E(num(rate,rate<0.01?6:4))+' '+E(to)+'</div></div><div class="body conv">';
  h+='<label class="field"><input id="amt" type="text" inputmode="decimal" aria-label="'+E(t("amount"))+'" value="'+E(String(Math.round(amount*100)/100))+'"><b>'+E(from)+'</b></label>';
  h+='<div class="row"><span class="result grow" id="out">'+E(money(out,to))+'</span><button class="btn btn-ghost" data-act="swap" aria-label="'+E(t("swap"))+'">⇅ '+E(t("swap"))+'</button></div>';
  h+='<div class="quick">';[1,10,100,1000,10000].forEach(function(q){h+='<button data-q="'+q+'">'+num(q,0)+' '+E(from)+'</button>'});
  h+='</div></div><div class="actions"><button class="btn btn-primary" data-act="open">'+t("open")+'</button></div><div class="foot"><span>'+(d.updated_at?t("updated")+' '+E(String(d.updated_at).slice(0,16).replace("T"," ")):'')+'</span><a href="#" data-act="home">OpenVan.camp · CC BY 4.0</a></div></div>';
  document.getElementById("app").innerHTML=h;
}
function parseAmt(s){s=String(s).replace(/\\s/g,"");if(/,\\d{1,2}$/.test(s))s=s.replace(/\\./g,"").replace(",",".");else s=s.replace(/,/g,"");var v=parseFloat(s);return isNaN(v)?0:v}
OV.onData(function(d){current=d;from=d.from;to=d.to;amount=d.amount||1;render()});
document.addEventListener("input",function(e){if(e.target.id==="amt"){amount=parseAmt(e.target.value);var rate=from===current.from?current.rate:1/current.rate;document.getElementById("out").textContent=money(amount*rate,to)}});
document.addEventListener("click",function(e){
  if(!current)return;
  var q=e.target.closest("[data-q]");if(q){amount=+q.getAttribute("data-q");render();return}
  var a=e.target.closest("[data-act]");if(!a)return;e.preventDefault();var act=a.getAttribute("data-act");
  if(act==="swap"){var x=from;from=to;to=x;render();return}
  OV.openLink(act==="open"?OV.siteUrl(current.url):"${SITE}/"+OV.locale());
});
`;

export const MONEY_HTML: Record<string, { name: string; description: string; html: string }> = {
  [MONEY_WIDGETS.fuel]: {
    name: "Fuel prices",
    description: "Fuel prices of a country by grade, or a ranking of countries by fuel price, with a currency switch.",
    html: page({ title: "Fuel prices", css: MONEY_CSS, skeleton: FUEL_SKELETON, script: FUEL_JS, pattern: 5 }),
  },
  [MONEY_WIDGETS.food]: {
    name: "Food price index",
    description: "Food price level of a country against the world average, or a comparison of two countries.",
    html: page({ title: "Food prices", css: MONEY_CSS + FOOD_CSS, skeleton: FUEL_SKELETON, script: FOOD_JS, pattern: 14 }),
  },
  [MONEY_WIDGETS.currency]: {
    name: "Currency converter",
    description: "Currency converter with an editable amount and a swap button.",
    html: page({ title: "Currency converter", css: MONEY_CSS + CUR_CSS, skeleton: FUEL_SKELETON, script: CUR_JS, pattern: 7 }),
  },
};
