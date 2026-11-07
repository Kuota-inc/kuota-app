// Página HTML de cobro para clientes: se abre al escanear el QR o el link
// de pago. No requiere sesión. CSP más permisiva que la API (renderiza HTML).
// Nota: el script va dentro de una plantilla de TypeScript; no usar comillas invertidas,
// "${" ni barras invertidas dentro de él.
import { Router } from 'express';

export const payPageRouter = Router();

function payHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#00248b">
<title>Pagar con Kuota</title>
<style>
:root{--brand:#00248b;--brand2:#1a3bb0;--ink:#0b1d4d;--mut:#5a6b8c;--line:#e1e8f8;--bg:#eef2ff;--ok:#0e9f6e;--err:#d92d20}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{min-height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:radial-gradient(120% 60% at 50% 0%,#dfe7ff 0%,var(--bg) 55%,#f8faff 100%);display:flex;justify-content:center;padding:max(18px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
.wrap{width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 0}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:19px;color:var(--brand);letter-spacing:-.3px}
.brand i{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:17px;box-shadow:0 6px 14px rgba(0,36,139,.28)}
.secure{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--ok);background:#e7f8f1;border:1px solid #c5eedd;border-radius:999px;padding:5px 10px}
.secure svg{width:13px;height:13px}
.card{background:#fff;border-radius:26px;box-shadow:0 18px 40px rgba(0,36,139,.12),0 2px 6px rgba(0,36,139,.06);overflow:hidden}
.hero{background:linear-gradient(150deg,var(--brand) 0%,var(--brand2) 70%,#3d5bd6 100%);color:#fff;padding:22px 22px 26px;position:relative}
.hero:after{content:"";position:absolute;right:-40px;top:-40px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.08)}
.merchant{display:flex;align-items:center;gap:12px;position:relative;z-index:1}
.avatar{width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
.m-name{font-size:16px;font-weight:700;line-height:1.2;display:flex;align-items:center;gap:6px}
.m-sub{font-size:12px;opacity:.82;margin-top:2px}
.vbadge{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;background:rgba(255,255,255,.18);border-radius:999px;padding:2px 8px}
.vbadge svg{width:11px;height:11px}
.amount-label{font-size:12.5px;opacity:.85;margin-top:20px;position:relative;z-index:1}
.amount{font-size:44px;font-weight:800;letter-spacing:-1.5px;line-height:1.1;margin-top:2px;position:relative;z-index:1}
.amount small{font-size:22px;font-weight:700;opacity:.9;margin-right:4px;letter-spacing:0}
.concept{display:inline-block;margin-top:12px;font-size:12.5px;background:rgba(255,255,255,.16);border-radius:10px;padding:6px 11px;position:relative;z-index:1;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.body{padding:20px 20px 22px}
.sec-label{font-size:12px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
.methods{display:grid;grid-template-columns:1fr;gap:9px}
.method{display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:16px;padding:13px 14px;cursor:pointer;font:inherit;color:var(--ink);transition:border-color .15s,box-shadow .15s,transform .05s}
.method:active{transform:scale(.99)}
.method .ico{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}
.method .ico svg{width:24px;height:24px}
.method .t{flex:1}
.method .t b{display:block;font-size:15px;font-weight:700}
.method .t span{font-size:12px;color:var(--mut)}
.radio{width:22px;height:22px;border-radius:50%;border:2px solid #c5cfe8;flex:none;display:flex;align-items:center;justify-content:center;transition:.15s}
.radio:after{content:"";width:10px;height:10px;border-radius:50%;background:#fff;transform:scale(0);transition:.15s}
.method.sel{border-color:var(--brand2);box-shadow:0 0 0 3px rgba(26,59,176,.12);background:#f6f8ff}
.method.sel .radio{border-color:var(--brand2);background:var(--brand2)}
.method.sel .radio:after{transform:scale(1)}
.pay{width:100%;margin-top:18px;border:0;border-radius:16px;padding:17px;font:inherit;font-size:16.5px;font-weight:800;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 12px 24px rgba(0,36,139,.3);transition:transform .08s,box-shadow .15s,opacity .15s}
.pay:active{transform:scale(.985)}
.pay:disabled{opacity:.7;cursor:progress;box-shadow:none}
.pay svg{width:18px;height:18px}
.spin{width:20px;height:20px;border:3px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.meta{display:flex;justify-content:space-between;gap:8px;margin-top:14px;font-size:11.5px;color:var(--mut)}
.err{margin-top:12px;background:#fef3f2;border:1px solid #fecdca;color:#b42318;border-radius:12px;padding:10px 12px;font-size:13px;display:none}
.foot{text-align:center;font-size:11.5px;color:#7a89aa;line-height:1.55;padding:0 10px}
.foot b{color:var(--brand)}
.center{padding:34px 24px 30px;text-align:center}
.bigico{width:76px;height:76px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
.bigico svg{width:38px;height:38px}
.bigico.ok{background:#e7f8f1;color:var(--ok);animation:pop .45s cubic-bezier(.2,1.4,.4,1)}
.bigico.bad{background:#fef3f2;color:var(--err)}
.bigico.wait{background:#fff6e5;color:#b54708}
@keyframes pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.center h2{font-size:21px;font-weight:800;margin-bottom:6px}
.center p{font-size:14px;color:var(--mut);line-height:1.55}
.receipt{margin-top:20px;border:1px dashed #c5cfe8;border-radius:16px;padding:6px 16px;text-align:left;background:#fafbff}
.receipt div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.receipt div:last-child{border:0}
.receipt span{color:var(--mut)}
.receipt b{font-weight:700;text-align:right;word-break:break-word}
.skel{padding:22px}
.sk{border-radius:12px;background:linear-gradient(90deg,#eef2ff 25%,#f8faff 50%,#eef2ff 75%);background-size:200% 100%;animation:sh 1.2s infinite}
@keyframes sh{to{background-position:-200% 0}}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand"><i>K</i>Kuota</div>
    <div class="secure"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Pago seguro</div>
  </div>
  <div class="card" id="card">
    <div class="skel">
      <div class="sk" style="height:56px;margin-bottom:18px"></div>
      <div class="sk" style="height:84px;margin-bottom:18px"></div>
      <div class="sk" style="height:58px;margin-bottom:10px"></div>
      <div class="sk" style="height:58px"></div>
    </div>
  </div>
  <div class="foot">Tu pago se procesa de forma cifrada. <b>Kuota</b> nunca te pedirá tu clave ni tu PIN.</div>
</div>
<script>
(function(){
var code=location.pathname.split("/").filter(Boolean).pop();
var method="YAPE";
var link=null;
var ICONS={
  YAPE:'<svg viewBox="0 0 24 24" fill="none" stroke="#7a1fd1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  PLIN:'<svg viewBox="0 0 24 24" fill="none" stroke="#0a9ac9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  CARD:'<svg viewBox="0 0 24 24" fill="none" stroke="#1a3bb0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>'
};
var BG={YAPE:"#f3e8ff",PLIN:"#e0f6fd",CARD:"#e8edff"};
var LABEL={YAPE:["Yape","Paga con tu celular"],PLIN:["Plin","Paga con tu banco"],CARD:["Tarjeta","Débito o crédito"]};
var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var CROSS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
var CLOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
var LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
var SHIELD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function money(c){return (c/100).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}
function lima(iso,opts){return new Date(iso).toLocaleString("es-PE",Object.assign({timeZone:"America/Lima"},opts))}
function initials(n){var p=String(n||"K").trim().split(" ");return ((p[0]||"K").charAt(0)+(p[1]?p[1].charAt(0):"")).toUpperCase()}
function card(html){document.getElementById("card").innerHTML=html}

function showState(kind,title,msg){
  var ico=kind==="ok"?CHECK:kind==="wait"?CLOCK:CROSS;
  card('<div class="center"><div class="bigico '+kind+'">'+ico+'</div><h2>'+title+'</h2><p>'+msg+'</p></div>');
}

function showPaid(l,paymentId){
  var rows='<div><span>Comercio</span><b>'+esc((l.merchant&&l.merchant.name)||"Comercio Kuota")+'</b></div>'+
    '<div><span>Monto pagado</span><b>S/ '+money(l.amount_cents)+'</b></div>'+
    (l.concept?'<div><span>Concepto</span><b>'+esc(l.concept)+'</b></div>':"")+
    '<div><span>Fecha</span><b>'+lima(new Date().toISOString(),{day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit"})+'</b></div>'+
    (paymentId?'<div><span>Operación</span><b>'+esc(String(paymentId).slice(-10).toUpperCase())+'</b></div>':"");
  card('<div class="center"><div class="bigico ok">'+CHECK+'</div><h2>¡Pago completado!</h2><p>Tu pago fue recibido. El comercio ya fue notificado.</p><div class="receipt">'+rows+'</div><p style="margin-top:16px;font-size:12.5px">Ya puedes cerrar esta página.</p></div>');
}

function methodHtml(m){
  var l=LABEL[m];
  return '<button type="button" class="method'+(m===method?" sel":"")+'" data-m="'+m+'"><span class="ico" style="background:'+BG[m]+'">'+ICONS[m]+'</span><span class="t"><b>'+l[0]+'</b><span>'+l[1]+'</span></span><span class="radio"></span></button>';
}

function showReady(l){
  link=l;
  var mer=l.merchant||{};
  var name=mer.name||"Comercio Kuota";
  var verified=mer.verification==="VERIFIED";
  var sub=[mer.city,mer.ruc_masked?("RUC "+mer.ruc_masked):null].filter(Boolean).join(" · ")||"Comercio afiliado a Kuota";
  var html='<div class="hero">'+
    '<div class="merchant"><div class="avatar">'+esc(initials(name))+'</div><div><div class="m-name">'+esc(name)+(verified?' <span class="vbadge">'+SHIELD+'Verificado</span>':"")+'</div><div class="m-sub">'+esc(sub)+'</div></div></div>'+
    '<div class="amount-label">Total a pagar</div>'+
    '<div class="amount"><small>S/</small>'+money(l.amount_cents)+'</div>'+
    (l.concept?'<div class="concept">'+esc(l.concept)+'</div>':"")+
    '</div>'+
    '<div class="body">'+
    '<div class="sec-label">Elige cómo pagar</div>'+
    '<div class="methods" id="methods">'+methodHtml("YAPE")+methodHtml("PLIN")+methodHtml("CARD")+'</div>'+
    '<div class="err" id="err"></div>'+
    '<button type="button" class="pay" id="pay-btn">'+LOCK+'<span id="pay-txt">Pagar S/ '+money(l.amount_cents)+'</span></button>'+
    '<div class="meta"><span>Válido hasta '+lima(l.expires_at,{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})+'</span><span>Pago único</span></div>'+
    '</div>';
  card(html);
  var list=document.querySelectorAll(".method");
  Array.prototype.forEach.call(list,function(b){
    b.addEventListener("click",function(){
      method=b.getAttribute("data-m");
      Array.prototype.forEach.call(list,function(x){x.className="method"+(x.getAttribute("data-m")===method?" sel":"")});
    });
  });
  document.getElementById("pay-btn").addEventListener("click",doPay);
}

function setBusy(on){
  var b=document.getElementById("pay-btn");
  if(!b||!link)return;
  b.disabled=on;
  b.innerHTML=on?'<span class="spin"></span><span>Procesando pago…</span>':LOCK+'<span id="pay-txt">Pagar S/ '+money(link.amount_cents)+'</span>';
}
function showErr(msg){
  var e=document.getElementById("err");
  if(!e)return;
  e.textContent=msg;e.style.display="block";
}

function doPay(){
  if(!link)return;
  var e=document.getElementById("err");if(e)e.style.display="none";
  setBusy(true);
  fetch("/api/v1/sandbox/360pay/pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code,method:method})})
  .then(function(r){return r.json()})
  .then(function(d){
    var st=d.webhook&&d.webhook.status;
    if(d.error||st==="REJECTED"||st==="IGNORED"){
      var c=d.error&&d.error.code;
      if(c==="LINK_ALREADY_PAID"){showPaid(link,null);return;}
      setBusy(false);
      showErr(c==="NOT_FOUND"?"El pago en línea aún no está disponible para este comercio.":((d.error&&d.error.message)||"No se pudo completar el pago. Inténtalo de nuevo."));
      return;
    }
    showPaid(link,d.webhook&&d.webhook.payment_id);
  })
  .catch(function(){setBusy(false);showErr("Error de red. Revisa tu conexión e inténtalo de nuevo.")});
}

fetch("/api/v1/payment-links/public/"+code)
  .then(function(r){
    if(r.status===404)throw {code:"LINK_NOT_FOUND"};
    return r.json();
  })
  .then(function(d){
    if(d.error){
      var c=d.error.code||"";
      if(c==="LINK_ALREADY_PAID")showState("ok","Este cobro ya fue pagado","No necesitas hacer nada más. Si crees que es un error, contacta al comercio.");
      else showState("wait","Link no disponible","Este link venció o fue cancelado. Pide al comercio que genere uno nuevo.");
      return;
    }
    showReady(d);
  })
  .catch(function(e){
    if(e&&e.code==="LINK_NOT_FOUND")showState("bad","Link no encontrado","Revisa que el enlace o el QR esté completo. Si el problema sigue, pide un link nuevo al comercio.");
    else showState("bad","No pudimos cargar el cobro","Revisa tu conexión e inténtalo de nuevo en unos minutos.");
  });
})();
</script>
</body>
</html>`;
}

// GET /pay/:code — página HTML sin sesión
payPageRouter.get('/:code', (_req, res) => {
  // Headers específicos para la página web del cliente (distinto del API)
  res.removeHeader('Content-Security-Policy');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  );
  res.removeHeader('Cache-Control');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(payHtml());
});
