import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { api, ApiError } from '../../api/client';
import { profilesApi } from '../../api/profiles';
import { isCancelled, newIdempotencyKey, paymentsApi, type PaymentLink } from '../../api/payments';
import { ArrowRight, CheckCircle2, Copy, ArrowLeft, ShieldCheck, Clock, XCircle, Hourglass, Share2, Store, MessageCircle, Link2, Lock, Phone, User, Package, QrCode as QrIcon, Plus, BadgeCheck } from 'lucide-react';
import { useToast } from '../../components/toast-context';
import { QrCode } from '../../components/QrCode';
import { FEE_PCT, MIN_AMOUNT_CENTS, localQuote } from '../../config/fee';
import { track } from '../../lib/analytics';
import type { ChargeContact } from './CobrosHubScreen';

interface PaymentLinkScreenProps {
  onBack: () => void;
  onNavigateTab: (tab: string) => void;
  /** Contacto elegido en "Cobrar y pagar": ya trae su celular y si tiene cuenta Kuota. */
  contact?: ChargeContact | null;
}

const formatSoles = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const Field: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-bold text-[#4a5f7e] tracking-wide">{label}</span>
    <span className="flex items-center gap-2.5 h-12 px-3.5 rounded-2xl bg-[#eff3ff] text-[#4a5f7e] focus-within:ring-2 focus-within:ring-[#1a3bb0]/40">
      {icon}
      {children}
    </span>
  </label>
);

export const PaymentLinkScreen: React.FC<PaymentLinkScreenProps> = ({ onBack, onNavigateTab, contact = null }) => {
  const toast = useToast();
  const [amountStr, setAmountStr] = useState<string>('50');
  const [concept, setConcept] = useState<string>('');
  // Cotización del backend, etiquetada con el monto que se pidió.
  const [apiQuote, setApiQuote] = useState<{ amount_cents: number; fee_cents: number; net_cents: number } | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [paying, setPaying] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  // Datos del comprador: solo sirven para armar el mensaje de WhatsApp (no se guardan en el servidor).
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>(contact?.phone ?? '');
  const [businessName, setBusinessName] = useState<string | null>(null);
  // Misma clave mientras no cambie el cobro: un reintento tras un corte de red no lo duplica.
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const paidLinkId = useRef<string | null>(null);

  const markPaymentSuccess = (paymentLinkId: string, confirmationSource: 'poll' | 'sandbox') => {
    setPaymentSuccess(true);
    if (paidLinkId.current === paymentLinkId) return;
    paidLinkId.current = paymentLinkId;
    track('payment_link_paid', { confirmation_source: confirmationSource });
  };

  useEffect(() => {
    profilesApi.access().then((a) => setBusinessName(a.business_name)).catch(() => {});
  }, []);

  const amountNumber = parseFloat(amountStr) || 0;
  const amountCents = Math.round(amountNumber * 100);

  // Cotización local inmediata mientras responde el backend; solo se usa la
  // respuesta de la API si corresponde al monto actual (evita respuestas fuera de orden).
  const quote =
    amountCents <= 0
      ? null
      : apiQuote && apiQuote.amount_cents === amountCents
        ? apiQuote
        : localQuote(amountCents);

  useEffect(() => {
    if (amountCents < MIN_AMOUNT_CENTS) return;
    let alive = true;
    const t = window.setTimeout(() => {
      api
        .quotePaymentLink(amountCents)
        .then((q) => alive && setApiQuote({ ...q, amount_cents: q.amount_cents ?? amountCents }))
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amountCents]);

  // El cliente paga desde su celular: se consulta el estado para confirmar el cobro al vendedor.
  const linkId = link?.id;
  const watching = !!link && link.status === 'ACTIVE' && !paymentSuccess;
  useEffect(() => {
    if (!watching || !linkId) return;
    const timer = window.setInterval(() => {
      paymentsApi
        .pollLink(linkId)
        .then((l) => {
          if (l.status === 'PAID') markPaymentSuccess(l.id, 'poll');
          else if (l.status === 'EXPIRED' || l.status === 'CANCELLED') {
            toast.info(l.status === 'EXPIRED' ? 'El link venció sin pago.' : 'El link fue cancelado.');
            setLink(null);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [watching, linkId, toast]);

  const handleQuickAdd = (val: number) => {
    const current = parseFloat(amountStr) || 0;
    setAmountStr(String(current + val));
  };

  const reportError = (err: unknown, fallback: string) => {
    if (isCancelled(err)) return;
    toast.error(err instanceof Error && err.message ? err.message : fallback);
  };

  const handleCreateAndIssue = async () => {
    if (amountCents < MIN_AMOUNT_CENTS) return;
    const finalConcept = concept.trim() || 'Cobro de venta';
    const fingerprint = `${amountCents}|${finalConcept}`;
    if (pendingKey.current?.fingerprint !== fingerprint) pendingKey.current = { fingerprint, key: newIdempotencyKey() };
    setLoading(true);
    try {
      const draft = await paymentsApi.createLink({ amount_cents: amountCents, concept: finalConcept }, pendingKey.current.key);
      if (draft.status === 'ON_HOLD') {
        setLink(draft);
        pendingKey.current = null;
        return;
      }
      const issued = await paymentsApi.issueLink(draft.id);
      setLink(issued);
      track('payment_link_issued', { amount_cents: issued.amount_cents });
      pendingKey.current = null;
    } catch (err) {
      reportError(err, 'No pudimos generar el link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Mantén presionado el link para copiarlo.');
    }
  };

  const handleShare = async () => {
    if (!link?.url) return;
    try {
      await navigator.share({ title: 'Cobro Kuota', text: `${link.concept ?? 'Cobro'} · ${formatSoles(link.amount_cents)}`, url: link.url });
    } catch {
      /* el usuario cerró el menú de compartir */
    }
  };

  const handleCancel = async () => {
    if (!link) return;
    try {
      await paymentsApi.cancelLink(link.id);
      toast.info('Cancelaste el link. Ya no se puede pagar.');
      setLink(null);
    } catch (err) {
      reportError(err, 'No pudimos cancelar el link.');
    }
  };

  const handleSimulateClientPay = async () => {
    if (!link?.code) return;
    setPaying(true);
    try {
      const r = await paymentsApi.sandboxPay(link.code, 'YAPE');
      if (r.webhook.status === 'PROCESSED') markPaymentSuccess(link.id, 'sandbox');
      else toast.error(`El pago fue rechazado (${r.webhook.reason ?? 'sin detalle'}).`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LINK_ALREADY_PAID') {
        markPaymentSuccess(link.id, 'sandbox');
        return;
      }
      reportError(err, 'Error al procesar el pago simulado.');
    } finally {
      setPaying(false);
    }
  };

  const resetFlow = () => {
    setLink(null);
    setPaymentSuccess(false);
    paidLinkId.current = null;
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const buyerDigits = buyerPhone.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '');
  const whatsappHref = link?.url
    ? `https://wa.me/${buyerDigits.length === 9 ? '51' + buyerDigits : ''}?text=${encodeURIComponent(
        `Hola${buyerName.trim() ? ' ' + buyerName.trim() : ''}, te envío el link para pagar ${formatSoles(link.amount_cents)}${link.concept ? ' por ' + link.concept : ''}: ${link.url}`
      )}`
    : '';
  const fieldInput = 'flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-[#0b2545] placeholder:text-[#4a5f7e]/70';

  return (
    <div className="flex-1 p-4 space-y-3.5 bg-[#f9f9ff] flex flex-col">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Volver al inicio"
          className="w-9 h-9 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] active:scale-95 transition shadow-xs cursor-pointer">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-black text-[#0b2545] tracking-tight">Nueva Venta</h1>
      </div>

      {/* Terminal activo */}
      <div className="flex items-center gap-3 p-3.5 rounded-3xl bg-[#eff3ff]">
        <span className="w-11 h-11 rounded-2xl bg-[#b6ccfd] text-[#1a3bb0] flex items-center justify-center shrink-0"><Store size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black tracking-[0.12em] text-[#4a5f7e]">TERMINAL ACTIVO</p>
          <p className="text-base font-black text-[#0b2545] truncate">{businessName || 'Tu negocio'}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[#b6ccfd] text-[#1a3bb0] text-[10px] font-black shrink-0">Kuota Payments</span>
      </div>

      {contact && (
        <div className="flex items-center gap-3 p-3 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm">
          <span className="w-10 h-10 rounded-xl bg-[#eff3ff] text-[#1a3bb0] font-black flex items-center justify-center shrink-0"><User size={18} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-[0.12em] text-[#4a5f7e]">COBRAR A</p>
            <p className="font-black text-sm text-[#0b2545] truncate">{contact.name || `+51 ••• ••• ${contact.phone.slice(-3)}`}</p>
          </div>
          {contact.registered ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black shrink-0"><BadgeCheck size={12} aria-hidden="true" /> Cuenta Kuota activa</span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black shrink-0">Aún sin Kuota</span>
          )}
        </div>
      )}

      {!link ? (
        <>
          <section className="p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-black text-[#0b2545]"><Package size={17} aria-hidden="true" /> Detalle del Cobro</h2>
              <span className="text-[10px] font-bold text-[#4a5f7e]">En vivo</span>
            </div>

            <div className="rounded-2xl bg-[#eff3ff] px-4 py-3 text-center space-y-1">
              <span className="text-[11px] font-bold text-[#4a5f7e]">Monto a cobrar (PEN)</span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-[#1a3bb0]">S/</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amountStr === '0' ? '' : amountStr}
                  onChange={(e) => setAmountStr(e.target.value || '0')}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  aria-label="Monto a cobrar"
                  className="text-4xl font-black text-[#0b2545] tracking-tight tabular-nums bg-transparent outline-none text-center w-36 min-w-0"
                />
              </div>
              {quote && (
                <div className="pt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] text-[#4a5f7e]">
                  <span>Comisión (mín. S/ 4.50 + IGV): <strong className="text-red-600">S/ {(quote.fee_cents / 100).toFixed(2)}</strong></span>
                  <span>Recibes neto: <strong className="text-emerald-700">S/ {(quote.net_cents / 100).toFixed(2)}</strong></span>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-1.5">
              {[20, 50, 100, 200].map((v) => (
                <motion.button key={v} whileTap={{ scale: 0.92 }} type="button" onClick={() => handleQuickAdd(v)}
                  className="flex-1 py-1.5 bg-white border border-[#e1e8f8] hover:border-[#1a3bb0] rounded-xl text-xs font-bold text-[#1a3bb0] cursor-pointer">+{v}</motion.button>
              ))}
            </div>

            <Field icon={<Package size={17} aria-hidden="true" />} label="Concepto o producto">
              <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={80} aria-label="Concepto del cobro" placeholder="Ej. 10 rollos de tela Pima" className={fieldInput} />
            </Field>
            <Field icon={<User size={17} aria-hidden="true" />} label="Nombre del comprador (opcional)">
              <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={60} aria-label="Nombre del comprador" placeholder="Ej. Juan Mendoza" className={fieldInput} />
            </Field>
            <Field icon={<Phone size={17} aria-hidden="true" />} label="Teléfono WhatsApp (opcional)">
              <input type="tel" inputMode="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} maxLength={16} aria-label="Teléfono WhatsApp del comprador" placeholder="+51 984 123 456" className={fieldInput} />
            </Field>
          </section>

          <div className="pt-1 space-y-2">
            <button type="button" onClick={handleCreateAndIssue} disabled={loading || amountCents < MIN_AMOUNT_CENTS}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white rounded-full font-bold text-sm shadow-lg shadow-blue-900/20 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              <QrIcon size={17} aria-hidden="true" />
              <span>{loading ? 'Generando link…' : 'Generar link y QR de cobro'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="text-[10px] text-center text-[#4a5f7e]">Tu cliente verá el nombre de tu negocio y el monto antes de pagar.</p>
          </div>
        </>
      ) : link.status === 'ON_HOLD' ? (
        <div className="p-5 bg-white rounded-3xl border border-amber-200 shadow-md space-y-3 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><Hourglass size={26} aria-hidden="true" /></div>
          <h2 className="text-base font-black text-[#0b2545]">Estamos revisando este cobro</h2>
          <p className="text-xs text-[#4a5f7e] leading-relaxed">
            Por tu seguridad validamos el cobro de <strong className="text-[#0b2545]">{formatSoles(link.amount_cents)}</strong> antes de activarlo. Te avisaremos en minutos; no necesitas hacer nada.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={resetFlow} className="flex-1 h-10 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-xs font-bold cursor-pointer">Entendido</button>
            <button type="button" onClick={handleCancel} className="flex-1 h-10 rounded-full text-red-600 text-xs font-bold cursor-pointer">Cancelar cobro</button>
          </div>
        </div>
      ) : !paymentSuccess ? (
        <section className="p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-md space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-black text-[#0b2545]"><QrIcon size={18} aria-hidden="true" /> QR dinámico generado</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-[10px] font-black"><Lock size={11} aria-hidden="true" /> Cifrado SSL</span>
          </div>

          {link.url && (
            <div className="flex justify-center p-3 bg-white rounded-2xl border border-[#e1e8f8]">
              <QrCode value={link.url} size={176} label={`QR para pagar ${formatSoles(link.amount_cents)}`} />
            </div>
          )}
          {link.url && link.url.includes('localhost') && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>Este QR apunta a localhost y solo funciona en red local. Configura <strong>KUOTA_PAY_BASE_URL</strong> en Railway para producción.</span>
            </div>
          )}

          {(link.payment_code || link.code) && (
            <button type="button" onClick={handleCopy} aria-label="Copiar link de cobro"
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-[#eff3ff] text-left cursor-pointer">
              <span className="text-[11px] font-bold text-[#4a5f7e]">{link.payment_code ? 'CÓDIGO 360PAY' : 'CÓDIGO DE PAGO'}: <strong className="font-mono text-sm text-[#1a3bb0]">{link.payment_code ?? link.code}</strong></span>
              <Copy size={15} className="text-[#4a5f7e] shrink-0" aria-hidden="true" />
            </button>
          )}

          <div className="rounded-2xl bg-[#eff3ff] p-3.5 text-sm space-y-1.5">
            {buyerName.trim() && <div className="flex justify-between gap-3"><span className="text-[#4a5f7e]">Cliente:</span><b className="text-[#0b2545] text-right">{buyerName.trim()}</b></div>}
            {link.concept && <div className="flex justify-between gap-3"><span className="text-[#4a5f7e]">Concepto:</span><b className="text-[#0b2545] text-right">{link.concept}</b></div>}
            <div className="flex justify-between gap-3 items-baseline"><span className="font-bold text-[#0b2545]">Total a cobrar:</span><b className="text-xl text-[#1a3bb0] tabular-nums">{formatSoles(link.amount_cents)}</b></div>
            <div className="flex justify-between gap-3 text-xs"><span className="text-[#4a5f7e]">Recibes neto:</span><b className="text-emerald-700">{formatSoles(link.net_cents)}</b></div>
          </div>

          <div className="flex items-center justify-center gap-3 text-[10px] text-[#4a5f7e]">
            <span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-emerald-700" aria-hidden="true" /> Monto fijo · un solo pago</span>
            <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" /> Vence {formatWhen(link.expires_at)}</span>
          </div>

          <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 active:scale-[0.98] transition">
            <MessageCircle size={18} aria-hidden="true" /> {contact?.registered ? 'Enviar solicitud por WhatsApp' : 'Enviar link por WhatsApp'}
          </a>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy} className="flex-1 py-3 rounded-full bg-[#b6ccfd]/60 text-[#1a3bb0] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
              <Link2 size={16} aria-hidden="true" /> Copiar link
            </button>
            {canShare && (
              <button type="button" onClick={handleShare} aria-label="Compartir link de cobro" className="w-12 rounded-full bg-[#b6ccfd]/60 text-[#1a3bb0] flex items-center justify-center cursor-pointer">
                <Share2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Simulación de la página de pago de 360pay (solo mientras no haya dinero real) */}
          <button type="button" onClick={handleSimulateClientPay} disabled={paying}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-xs font-bold shadow-md hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition disabled:opacity-60">
            <img src="/brand/yape-official.png" alt="" className="w-4 h-4 rounded-md object-cover inline" />
            <span>{paying ? 'Procesando pago…' : 'Simular pago del cliente con Yape'}</span>
          </button>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={handleCancel} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600 cursor-pointer">
              <XCircle size={13} aria-hidden="true" /> Cancelar este link
            </button>
            <button type="button" onClick={resetFlow} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1a3bb0] cursor-pointer">
              <Plus size={13} aria-hidden="true" /> Nuevo cobro
            </button>
          </div>
        </section>
      ) : (
        <section className="p-6 bg-white rounded-3xl border border-emerald-200 shadow-md text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center"><CheckCircle2 size={34} aria-hidden="true" /></div>
          <h3 className="text-lg font-black text-[#0b2545]">¡Cobro exitoso!</h3>
          <p className="text-3xl font-black text-[#1a3bb0] tabular-nums">{formatSoles(link.amount_cents)}</p>
          <p className="text-xs text-[#4a5f7e]">Se acreditaron {formatSoles(link.net_cents)} a tu cuenta y sumaste puntos a tu Score.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={resetFlow} className="flex-1 h-11 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-sm font-bold cursor-pointer">Nuevo cobro</button>
            <button type="button" onClick={() => { resetFlow(); onNavigateTab('ventas'); }} className="flex-1 h-11 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white text-sm font-bold cursor-pointer">Ver mis ventas</button>
          </div>
        </section>
      )}
    </div>
  );
};
