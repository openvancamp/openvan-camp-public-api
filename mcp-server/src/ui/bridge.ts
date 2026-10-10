/**
 * Общая часть интерактивных карточек (MCP Apps): мост к хосту и фирменные стили.
 *
 * Карточка — HTML-страница в песочнице хоста. Данные приходят из structuredContent
 * результата инструмента. Хосты говорят по-разному, поэтому мост понимает оба диалекта:
 *  - стандарт MCP Apps (Claude, ChatGPT, VS Code и др.): JSON-RPC через postMessage,
 *    ui/initialize → ui/notifications/tool-result;
 *  - window.openai (старый Apps SDK ChatGPT): toolOutput + событие openai:set_globals.
 * Своих сетевых запросов карточка не делает — только картинки с доменов из CSP.
 */

export const SITE = "https://openvan.camp";

/** Языки сайта; язык хоста вне списка → английский. */
export const UI_LOCALES = ["en", "ru", "de", "fr", "es", "pt", "tr"] as const;

/**
 * Фирменные стили. Структурные цвета — токены хоста (Claude передаёт их в hostContext,
 * у ChatGPT их нет → срабатывают запасные значения). Бренд — только в шапке и акцентах:
 * градиент и узор из дорожных иконок как у карточки «Главное сейчас» на главной сайта.
 */
export const BASE_CSS = `
:root{
  color-scheme:light dark;
  --ov-bg:var(--color-background-primary,#fff);
  --ov-bg2:var(--color-background-secondary,#f5f6f7);
  --ov-text:var(--color-text-primary,#111827);
  --ov-text2:var(--color-text-secondary,#374151);
  --ov-text3:var(--color-text-tertiary,#6b7280);
  --ov-border:var(--color-border-tertiary,rgba(17,24,39,.12));
  --ov-radius:var(--border-radius-xl,12px);
  --ov-radius-sm:var(--border-radius-md,8px);
  --ov-font:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
  --ov-primary:#467187;
  --ov-green:#5E8D34;
  --ov-ideal:#76B041;
  --ov-comfy:#4E8097;
  --ov-ok:#E2B714;
  --ov-hard:#C0392B;
}
:root[data-theme=dark]{
  --ov-bg:var(--color-background-primary,#1f2937);
  --ov-bg2:var(--color-background-secondary,#111827);
  --ov-text:var(--color-text-primary,#f9fafb);
  --ov-text2:var(--color-text-secondary,#d1d5db);
  --ov-text3:var(--color-text-tertiary,#9ca3af);
  --ov-border:var(--color-border-tertiary,rgba(255,255,255,.14));
  --ov-primary:#7FA9BE;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent}
body{font-family:var(--ov-font);color:var(--ov-text);font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased}
#app{padding:var(--ov-safe-top,0) var(--ov-safe-right,0) var(--ov-safe-bottom,0) var(--ov-safe-left,0)}
.card{background:var(--ov-bg);border:1px solid var(--ov-border);border-radius:var(--ov-radius);overflow:hidden}
.hero{position:relative;color:#fff;background:linear-gradient(135deg,#4E8097 0%,#5E8D34 100%);padding:16px;overflow:hidden;isolation:isolate}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--ov-pat) center/cover no-repeat;opacity:.16;pointer-events:none;
  -webkit-mask-image:linear-gradient(to top,transparent 0%,rgba(0,0,0,.5) 40%,#000 85%);mask-image:linear-gradient(to top,transparent 0%,rgba(0,0,0,.5) 40%,#000 85%)}
.hero-row{display:flex;align-items:center;gap:14px}
.flag{width:28px;height:20px;border-radius:3px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.flag-sm{width:20px;height:14px;border-radius:2px;object-fit:cover;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.h1{font-size:20px;font-weight:700;line-height:1.2;margin:0;letter-spacing:-.01em}
.sub{font-size:13px;color:rgba(255,255,255,.88);margin-top:2px}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;border-radius:9999px;padding:3px 9px;white-space:nowrap}
.chip-glass{background:rgba(255,255,255,.2);color:#fff;backdrop-filter:blur(4px)}
.chip-soft{background:var(--ov-bg2);color:var(--ov-text2)}
.ring{--v:0;--c:#fff;width:68px;height:68px;border-radius:50%;flex:none;display:grid;place-items:center;
  background:conic-gradient(var(--c) calc(var(--v)*1%),rgba(255,255,255,.22) 0)}
.ring>div{width:56px;height:56px;border-radius:50%;background:rgba(20,40,40,.35);display:grid;place-items:center;text-align:center;line-height:1}
.ring b{font-size:22px;font-weight:800}
.ring small{display:block;font-size:10px;opacity:.8;margin-top:2px}
.body{padding:14px 16px}
.muted{color:var(--ov-text3);font-size:12px}
.row{display:flex;align-items:center;gap:8px}
.grow{flex:1;min-width:0}
.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 14px}
.btn{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:600;font-size:14px;min-height:44px;padding:10px 16px;border-radius:var(--ov-radius-sm);
  display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}
.btn-primary{background:var(--ov-primary);color:#fff}
:root[data-theme=dark] .btn-primary{color:#0b1720}
.btn-ghost{background:var(--ov-bg2);color:var(--ov-text)}
.btn:focus-visible,.tap:focus-visible{outline:2px solid var(--ov-primary);outline-offset:2px}
.seg{display:inline-flex;background:rgba(255,255,255,.2);border-radius:9999px;padding:2px}
.seg button{appearance:none;border:0;background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:600;min-width:36px;min-height:28px;border-radius:9999px;cursor:pointer}
.seg button[aria-pressed=true]{background:#fff;color:#1f3b47}
.foot{display:flex;justify-content:space-between;gap:8px;padding:10px 16px;border-top:1px solid var(--ov-border);font-size:11px;color:var(--ov-text3)}
.foot a{color:inherit}
.skel{background:linear-gradient(90deg,var(--ov-bg2) 25%,var(--ov-border) 37%,var(--ov-bg2) 63%);background-size:400% 100%;animation:sk 1.4s ease infinite;border-radius:6px}
@keyframes sk{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){.skel{animation:none}}
.tap{cursor:pointer}
.note{font-size:12px;color:var(--ov-text2);display:flex;gap:6px;align-items:flex-start}
`;

/**
 * Клиентский мост. Даёт виджету объект OV:
 *   OV.onData(fn)       — fn(structuredContent, ctx) при каждом новом результате;
 *   OV.openLink(url)    — открыть ссылку через хост;
 *   OV.ask(text)        — отправить сообщение от имени пользователя (продолжить разговор);
 *   OV.locale()         — 'en' | 'ru' | … (язык хоста, сведённый к языкам сайта);
 *   OV.t(dict, key)     — строка интерфейса на языке хоста.
 * Пишется на чистом JS без сборки: строка уходит в карточку как есть.
 */
export const BRIDGE_JS = `
(function(){
  var LOCALES=${JSON.stringify(UI_LOCALES)};
  var pending={},nextId=1,handlers=[],lastData=null,ctx={},rendered=false;
  var oa=window.openai;
  function post(m){try{window.parent.postMessage(m,"*")}catch(e){}}
  function request(method,params){
    return new Promise(function(res,rej){
      var id=nextId++;pending[id]={res:res,rej:rej};
      post({jsonrpc:"2.0",id:id,method:method,params:params||{}});
      setTimeout(function(){if(pending[id]){delete pending[id];rej(new Error("timeout"))}},10000);
    });
  }
  function notify(method,params){post({jsonrpc:"2.0",method:method,params:params||{}})}
  function emit(data){
    if(!data||typeof data!=="object")return;
    if(typeof data.locale==="string")ctx.dataLocale=data.locale;
    lastData=data;rendered=true;
    handlers.forEach(function(fn){try{fn(data,ctx)}catch(e){console.error(e)}});
    sizeSoon();
  }
  function applyCtx(c){
    if(!c)return;
    for(var k in c){ctx[k]=c[k]}
    var root=document.documentElement;
    if(c.theme)root.setAttribute("data-theme",c.theme);
    var vars=c.styles&&c.styles.variables;
    if(vars)for(var v in vars){if(vars[v])root.style.setProperty(v,vars[v])}
    var fonts=c.styles&&c.styles.css&&c.styles.css.fonts;
    if(fonts&&!document.getElementById("ov-fonts")){var s=document.createElement("style");s.id="ov-fonts";s.textContent=fonts;document.head.appendChild(s)}
    var sa=c.safeAreaInsets;
    if(sa)["top","right","bottom","left"].forEach(function(p){root.style.setProperty("--ov-safe-"+p,(sa[p]||0)+"px")});
    if(lastData&&(c.locale||c.theme))emit(lastData);
  }
  window.addEventListener("message",function(e){
    var m=e.data;if(!m||m.jsonrpc!=="2.0")return;
    if(m.id!=null&&!m.method&&pending[m.id]){
      var p=pending[m.id];delete pending[m.id];
      if(m.error)p.rej(m.error);else p.res(m.result);return;
    }
    if(m.method==="ui/notifications/tool-result"){
      var r=m.params||{};
      if(r.structuredContent)emit(r.structuredContent);
      else if(!rendered)fallback(r);
      return;
    }
    if(m.method==="ui/notifications/host-context-changed"){applyCtx(m.params);return}
    if(m.method&&m.id!=null){post({jsonrpc:"2.0",id:m.id,result:{}})}
  });
  function fallback(r){
    var txt=(r.content||[]).filter(function(c){return c.type==="text"}).map(function(c){return c.text}).join("\\n");
    var el=document.getElementById("app");
    if(el&&txt){el.innerHTML="";var pre=document.createElement("div");pre.className="card body";pre.style.whiteSpace="pre-wrap";pre.textContent=txt;el.appendChild(pre);sizeSoon()}
  }
  var lastH=0,sizeTimer=null;
  function size(){
    var h=Math.ceil(document.documentElement.getBoundingClientRect().height);
    if(!h||h===lastH)return;lastH=h;
    notify("ui/notifications/size-changed",{width:Math.ceil(document.documentElement.scrollWidth),height:h});
    if(oa&&oa.notifyIntrinsicHeight)try{oa.notifyIntrinsicHeight(h)}catch(e){}
  }
  function sizeSoon(){clearTimeout(sizeTimer);sizeTimer=setTimeout(size,30)}
  if(window.ResizeObserver)new ResizeObserver(sizeSoon).observe(document.documentElement);
  window.addEventListener("load",sizeSoon);

  function locale(){
    // Язык разговора (его передаёт модель в locale инструмента) важнее языка интерфейса хоста:
    // у человека интерфейс Claude может быть английским, а пишет он по-русски.
    var raw=String(ctx.dataLocale||ctx.locale||(oa&&oa.locale)||navigator.language||"en").toLowerCase().slice(0,2);
    return LOCALES.indexOf(raw)>=0?raw:"en";
  }
  window.OV={
    onData:function(fn){handlers.push(fn);if(lastData)fn(lastData,ctx)},
    locale:locale,
    /** Полная локаль хоста (en-US): по региону выбираем °F и мили. */
    hostLocale:function(){return String(ctx.locale||(oa&&oa.locale)||navigator.language||"en")},
    // Мили и °F — только для англоязычного разговора в США; русский текст с английским
    // интерфейсом Claude (регион en-US) получает °C и км/ч.
    imperial:function(){if(ctx.dataLocale&&ctx.dataLocale!=="en")return false;return /-(US|LR|MM)$/i.test(this.hostLocale())},
    t:function(dict,key){var l=locale();return (dict[l]&&dict[l][key])||(dict.en&&dict.en[key])||key},
    openLink:function(url){
      if(oa&&oa.openExternal){try{oa.openExternal({href:url});return}catch(e){}}
      request("ui/open-link",{url:url}).catch(function(){window.open(url,"_blank","noopener")});
    },
    ask:function(text){
      if(oa&&oa.sendFollowUpMessage){try{oa.sendFollowUpMessage({prompt:text});return}catch(e){}}
      request("ui/message",{role:"user",content:[{type:"text",text:text}]}).catch(function(){});
    },
    siteUrl:function(url){
      try{var u=new URL(url);var p=u.pathname.split("/");if(LOCALES.indexOf(p[1])>=0){p[1]=locale();u.pathname=p.join("/")}return u.toString()}catch(e){return url}
    },
    esc:function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  };

  if(oa){
    applyCtx({theme:oa.theme,locale:oa.locale});
    if(oa.toolOutput)setTimeout(function(){emit(oa.toolOutput)},0);
    window.addEventListener("openai:set_globals",function(e){
      var g=(e.detail&&e.detail.globals)||{};
      if(g.theme||g.locale)applyCtx({theme:g.theme,locale:g.locale});
      if(g.toolOutput)emit(g.toolOutput);
    });
  }
  request("ui/initialize",{
    protocolVersion:"2026-01-26",
    appInfo:{name:"OpenVan",version:"1"},
    clientInfo:{name:"OpenVan",version:"1"},
    appCapabilities:{availableDisplayModes:["inline"]},
    capabilities:{}
  }).then(function(r){
    applyCtx(r&&r.hostContext);
    notify("ui/notifications/initialized",{});
  }).catch(function(){});
})();
`;

/** Собрать страницу карточки: стили, разметка-заглушка (скелетон), мост, код виджета. */
export function page(opts: { title: string; css: string; skeleton: string; script: string; pattern: number }): string {
  const pat = `${SITE}/images/patterns/travel-${String(opts.pattern).padStart(2, "0")}.webp`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${opts.title}</title>
<style>${BASE_CSS}:root{--ov-pat:url(${pat})}${opts.css}</style></head>
<body><div id="app">${opts.skeleton}</div>
<script>${BRIDGE_JS}</script>
<script>${opts.script}</script>
</body></html>`;
}
