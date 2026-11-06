// Página HTML de cobro para clientes: se abre al escanear el QR o el link
// de pago. No requiere sesión. CSP más permisiva que la API (renderiza HTML).
import { Router } from 'express';

export const payPageRouter = Router();

function payHtml(apiBase: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#00248b">
<title>Pagar con Kuota</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:24px;padding:28px 24px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,36,139,.1)}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
.logo-icon{width:40px;height:40px;background:#00248b;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800}
.logo-text{font-size:22px;font-weight:800;color:#00248b}
.merchant{font-size:16px;font-weight:700;color:#151c27;margin-bottom:4px}
.concept{font-size:13px;color:#4a5f7e;margin-bottom:20px}
.amount-box{background:#eff3ff;border-radius:16px;padding:16px;margin-bottom:20px;text-align:center}
.amount-label{font-size:12px;color:#4a5f7e;margin-bottom:4px}
.amount{font-size:36px;font-weight:900;color:#00248b}
.fee{font-size:11px;color:#8a9abc;margin-top:4px}
.methods{margin-bottom:20px}
.methods-label{font-size:12px;font-weight:600;color:#4a5f7e;margin-bottom:8px}
.method-btn{width:100%;padding:14px;border-radius:12px;border:2px solid #dde6ff;background:#fff;font-size:14px;font-weight:700;color:#00248b;cursor:pointer;margin-bottom:8px;transition:.15s}
.method-btn.active{background:#00248b;color:#fff;border-color:#00248b}
.method-btn:hover{border-color:#00248b}
.pay-btn{width:100%;padding:16px;background:#00248b;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;transition:.15s}
.pay-btn:hover{background:#001a6b}
.pay-btn:disabled{background:#9eb2d8;cursor:not-allowed}
.status{text-align:center;padding:20px 0}
.status-icon{font-size:56px;margin-bottom:12px}
.status-title{font-size:20px;font-weight:800;color:#151c27;margin-bottom:8px}
.status-msg{font-size:13px;color:#4a5f7e;line-height:1.5}
.loader{display:inline-block;width:32px;height:32px;border:3px solid #dde6ff;border-top-color:#00248b;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.expiry{font-size:11px;color:#8a9abc;text-align:center;margin-top:12px}
</style>
</head>
<body>
<div class="card" id="card">
  <div id="loading" class="status">
    <div class="loader"></div>
    <p style="margin-top:12px;color:#4a5f7e;font-size:14px">Cargando…</p>
  </div>
</div>
<script>
(function(){
var code=location.pathname.split('/').filter(Boolean).pop();
var apiBase='${apiBase}';
var method='YAPE';

function fmt(cents){return'S/ '+(cents/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtExp(iso){return new Date(iso).toLocaleString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'})}

function showError(title,msg){
  document.getElementById('card').innerHTML=
    '<div class="logo"><div class="logo-icon">K</div><div class="logo-text">Kuota</div></div>'+
    '<div class="status"><div class="status-icon">❌</div>'+
    '<div class="status-title">'+title+'</div>'+
    '<p class="status-msg">'+msg+'</p></div>';
}
function showPaid(link){
  document.getElementById('card').innerHTML=
    '<div class="logo"><div class="logo-icon">K</div><div class="logo-text">Kuota</div></div>'+
    '<div class="status"><div class="status-icon">✅</div>'+
    '<div class="status-title">¡Pago completado!</div>'+
    '<p class="status-msg">Este cobro ya fue pagado. No necesitas hacerlo de nuevo.</p></div>';
}
function showReady(link){
  var fee=Math.ceil((link.amount_cents*100)/10000);
  var html=
    '<div class="logo"><div class="logo-icon">K</div><div class="logo-text">Kuota</div></div>'+
    '<div class="merchant">'+escHtml(link.merchant_name||'Comercio verificado')+'</div>'+
    (link.concept?'<div class="concept">'+escHtml(link.concept)+'</div>':'')+
    '<div class="amount-box">'+
      '<div class="amount-label">Total a pagar</div>'+
      '<div class="amount">'+fmt(link.amount_cents)+'</div>'+
      '<div class="fee">Comisión de servicio: '+fmt(fee)+'</div>'+
    '</div>'+
    '<div class="methods">'+
      '<div class="methods-label">Elige cómo pagar</div>'+
      '<button class="method-btn active" id="btn-yape" onclick="setMethod(\'YAPE\')">📱 Yape</button>'+
      '<button class="method-btn" id="btn-plin" onclick="setMethod(\'PLIN\')">📱 Plin</button>'+
      '<button class="method-btn" id="btn-card" onclick="setMethod(\'CARD\')">💳 Tarjeta</button>'+
    '</div>'+
    '<button class="pay-btn" id="pay-btn" onclick="doPay()">Pagar '+fmt(link.amount_cents)+'</button>'+
    '<div class="expiry">Válido hasta: '+fmtExp(link.expires_at)+'</div>';
  document.getElementById('card').innerHTML=html;
  window._link=link;
}
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
window.setMethod=function(m){
  method=m;
  ['YAPE','PLIN','CARD'].forEach(function(x){
    var el=document.getElementById('btn-'+x.toLowerCase());
    if(el)el.className='method-btn'+(x===m?' active':'');
  });
};
window.doPay=function(){
  if(!window._link)return;
  var btn=document.getElementById('pay-btn');
  if(btn){btn.disabled=true;btn.textContent='Procesando…';}
  fetch(apiBase+'/api/v1/payment-links/pay/'+code,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({method:method,client_ip:null})
  })
  .then(function(r){return r.json()})
  .then(function(d){
    if(d.redirect_url){location.href=d.redirect_url;return;}
    if(d.error){
      if(btn){btn.disabled=false;btn.textContent='Pagar '+fmt(window._link.amount_cents);}
      alert(d.error.message||'Error al iniciar el pago.');return;
    }
    document.getElementById('card').innerHTML=
      '<div class="logo"><div class="logo-icon">K</div><div class="logo-text">Kuota</div></div>'+
      '<div class="status"><div class="status-icon">✅</div>'+
      '<div class="status-title">¡Pago en proceso!</div>'+
      '<p class="status-msg">Sigue las instrucciones de tu app de pagos.</p></div>';
  })
  .catch(function(){
    if(btn){btn.disabled=false;btn.textContent='Pagar '+fmt(window._link.amount_cents);}
    alert('Error de red. Inténtalo de nuevo.');
  });
};

fetch(apiBase+'/api/v1/payment-links/public/'+code)
  .then(function(r){
    if(r.status===404||r.status===410)throw{code:'LINK_NOT_FOUND'};
    return r.json();
  })
  .then(function(d){
    if(d.error){
      var c=d.error.code||'';
      if(c==='LINK_ALREADY_PAID')showPaid(d);
      else showError('Link no disponible','Este link no existe, venció o fue cancelado. Pide al comercio uno nuevo.');
      return;
    }
    if(d.status==='PAID'||d.status==='EXPIRED'||d.status==='CANCELLED'){
      showError(d.status==='PAID'?'Ya pagado':'Link vencido',
        d.status==='PAID'?'Este cobro ya fue pagado.':'Este link ya no está disponible. Pide uno nuevo al comercio.');
      return;
    }
    showReady(d);
  })
  .catch(function(e){
    if(e&&e.code==='LINK_NOT_FOUND')
      showError('Link no disponible','Este link no existe, venció o fue cancelado. Pide al comercio uno nuevo.');
    else
      showError('No pudimos cargar','Inténtalo de nuevo en unos minutos.');
  });
})();
</script>
</body>
</html>`;
}

// GET /pay/:code — página HTML sin sesión
payPageRouter.get('/:code', (req, res) => {
  // Headers específicos para la página web del cliente (distinto del API)
  res.removeHeader('Content-Security-Policy');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  );
  res.removeHeader('Cache-Control');
  res.setHeader('Cache-Control', 'no-store');

  const apiBase = `https://${req.headers.host}`;
  res.type('html').send(payHtml(apiBase));
});
