import { SITE } from "./bridge.js";

/** Общие кусочки клиентского JS карточек (строки — без сборки). */

/** Иконки погоды по коду WMO: контур, цвет от текста. */
export const WEATHER_ICON_JS = `
function wIcon(code,size){
  size=size||22;code=Number(code);
  var s='<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  var cloud='<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/>';
  var p;
  if(code===0)p=sun;
  else if(code<=2)p='<path d="M8 3v1.5M3.5 7.5H5M4.6 4.1l1 1"/><circle cx="8.5" cy="8" r="2.6"/><path d="M9 19h8a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 9 19z"/>';
  else if(code===3)p=cloud;
  else if(code===45||code===48)p='<path d="M4 9h16M3 13h18M5 17h14"/>';
  else if(code>=51&&code<=67||code>=80&&code<=82)p='<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>';
  else if(code>=71&&code<=77||code===85||code===86)p='<path d="M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M8 19h.01M12 20h.01M16 19h.01M10 22h.01M14 22h.01"/>';
  else if(code>=95)p='<path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M12 14l-2 4h4l-2 4"/>';
  else p=cloud;
  return s+p+'</svg>';
}`;

/** Название страны на языке хоста (Intl), иначе — запасное имя из данных. */
export const COUNTRY_JS = `
function cName(cc,fallback){
  try{var n=new Intl.DisplayNames([OV.locale()],{type:"region"}).of(String(cc).toUpperCase());if(n&&n.toUpperCase()!==String(cc).toUpperCase())return n}catch(e){}
  return fallback||cc;
}
function flag(cc,cls){return cc?'<img class="'+(cls||"flag")+'" src="${SITE}/images/flags/w40/'+String(cc).toLowerCase()+'.webp" alt="" loading="lazy">':""}
var LABEL_COLOR={ideal:"var(--ov-ideal)",comfortable:"var(--ov-comfy)",acceptable:"var(--ov-ok)",hard:"var(--ov-hard)",extreme:"var(--ov-hard)"};
`;
