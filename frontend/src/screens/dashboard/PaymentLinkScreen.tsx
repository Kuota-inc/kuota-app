import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { api, ApiError } from '../../api/client';
import { isCancelled, newIdempotencyKey, paymentsApi, type PaymentLink } from '../../api/payments';
import { Delete, ArrowRight, CheckCircle2, Copy, ArrowLeft, ShieldCheck, Clock, XCircle, Hourglass, Share2 } from 'lucide-react';
import { useToast } from '../../components/toast-context';
import { QrCode } from '../../components/QrCode';
import { FEE_PCT, MIN_AMOUNT_CENTS, localQuote } from '../../config/fee';

interface PaymentLinkScreenProps {
  onBack: () => void;
  onNavigateTab: (tab: string) => void;
}

const formatSoles = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const PaymentLinkScreen: React.FC<PaymentLinkScreenProps> = ({ onBack, onNavigateTab }) => {
  const toast = useToast();
  const [amountStr, setAmountStr] = useState<string>('50');
  const [concept, setConcept] = useState<string>('');
  // Cotización del backend, etiquetada con el monto que se pidió.
  const [apiQuote, setApiQuote] = useState<{ amount_cents: number; fee_cents: number; net_cents: number } | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [paying, setPaying] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  // Misma clave mientras no cambie el cobro: un reintento tras un corte de red no lo duplica.
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);

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
          if (l.status === 'PAID') setPaymentSuccess(true);
          else if (l.status === 'EXPIRED' || l.status === 'CANCELLED') {
            toast.info(l.status === 'EXPIRED' ? 'El link venció sin pago.' : 'El link fue cancelado.');
            setLink(null);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [watching, linkId, toast]);

  const handleKeyPress = (num: string) => {
    if (num === '.') {
      if (!amountStr.includes('.') && amountStr.length < 7) {
        setAmountStr((amountStr === '0' ? '0' : amountStr) + '.');
      }
      return;
    }
    if (amountStr.includes('.')) {
      const decimals = amountStr.split('.')[1] ?? '';
      if (decimals.length < 2) setAmountStr(amountStr + num);
      return;
    }
    if (amountStr === '0') {
      setAmountStr(num);
    } else if (amountStr.length < 6) {
      setAmountStr(amountStr + num);
    }
  };

  const handleDelete = () => {
    if (amountStr.length > 1) {
      setAmountStr(amountStr.slice(0, -1));
    } else {
      setAmountStr('0');
    }
  };

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
      if (r.webhook.status === 'PROCESSED') setPaymentSuccess(true);
      else toast.error(`El pago fue rechazado (${r.webhook.reason ?? 'sin detalle'}).`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LINK_ALREADY_PAID') {
        setPaymentSuccess(true);
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
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff] flex flex-col justify-between">
      {/* Clean Flow Header (Sin switcher: flujo independiente de vender y cobrar) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] hover:bg-blue-50 active:scale-95 transition shadow-xs cursor-pointer"
              aria-label="Volver al inicio"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-base font-black text-[#0b2545] tracking-tight">Vender y Cobrar</h1>
              <p className="text-[10px] text-[#4a5f7e]">Genera links de cobro · Tarifa {FEE_PCT}% · <b className="text-amber-800">Simulado</b>, sin banco real aún</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            Tarifa {FEE_PCT}%
          </span>
        </div>

        {!link ? (
          <>
            {/* Amount Display */}
            <div className="p-4 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm text-center space-y-1">
              <span className="text-[10px] font-bold text-[#4a5f7e] uppercase tracking-wider">
                Monto a cobrar
              </span>
              <div className="text-4xl font-black text-[#0b2545] tracking-tight">
                <span className="text-2xl text-[#1a3bb0] mr-1">S/</span>
                {amountStr.endsWith('.') ? amountStr : parseFloat(amountStr || '0').toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </div>

              {/* Commission breakdown (PRD 08) */}
              {quote && (
                <div className="pt-2 flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[11px] text-[#4a5f7e] border-t border-slate-100">
                  <div>
                    Comisión ({FEE_PCT}% + IGV, mín. S/ 4.50):{' '}
                    <strong className="text-red-600">S/ {(quote.fee_cents / 100).toFixed(2)}</strong>
                  </div>
                  <div>
                    Recibes neto:{' '}
                    <strong className="text-emerald-700">S/ {(quote.net_cents / 100).toFixed(2)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Concept Input */}
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              aria-label="Concepto del cobro"
              maxLength={80}
              placeholder="Concepto: Ej. Lote de polos, vestido lino..."
              className="w-full px-4 py-2.5 bg-white rounded-2xl border border-[#e1e8f8] text-xs font-semibold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0]"
            />

            {/* Quick add chips */}
            <div className="flex justify-between gap-1.5">
              {[20, 50, 100, 200].map((v) => (
                <motion.button
                  key={v}
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.05 }}
                  type="button"
                  onClick={() => handleQuickAdd(v)}
                  className="flex-1 py-1.5 bg-white border border-[#e1e8f8] hover:border-[#1a3bb0] rounded-xl text-xs font-bold text-[#1a3bb0] shadow-sm cursor-pointer"
                >
                  +{v}
                </motion.button>
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((digit) => (
                <motion.button
                  key={digit}
                  whileTap={{ scale: 0.88 }}
                  type="button"
                  onClick={() => handleKeyPress(digit)}
                  className="py-3 bg-white hover:bg-slate-50 text-[#0b2545] font-black text-lg rounded-2xl border border-[#e1e8f8] shadow-sm transition cursor-pointer select-none"
                >
                  {digit}
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.88 }}
                type="button"
                onClick={handleDelete}
                aria-label="Borrar último dígito"
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl flex items-center justify-center transition cursor-pointer"
              >
                <Delete size={20} aria-hidden="true" />
              </motion.button>
            </div>
          </>
        ) : link.status === 'ON_HOLD' ? (
          /* Retenido por el motor antifraude */
          <div className="p-5 bg-white rounded-3xl border border-amber-200 shadow-md space-y-3 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <Hourglass size={26} aria-hidden="true" />
            </div>
            <h2 className="text-base font-black text-[#0b2545]">Estamos revisando este cobro</h2>
            <p className="text-xs text-[#4a5f7e] leading-relaxed">
              Por tu seguridad validamos el cobro de <strong className="text-[#0b2545]">{formatSoles(link.amount_cents)}</strong> antes de
              activarlo. Te avisaremos en minutos; no necesitas hacer nada.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={resetFlow} className="flex-1 h-10 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-xs font-bold cursor-pointer">
                Entendido
              </button>
              <button type="button" onClick={handleCancel} className="flex-1 h-10 rounded-full text-red-600 text-xs font-bold cursor-pointer">
                Cancelar cobro
              </button>
            </div>
          </div>
        ) : (
          /* Issued Link View */
          <div className="p-4 bg-white rounded-3xl border border-blue-100 shadow-md space-y-4 text-center">
            {!paymentSuccess ? (
              <>
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 size={28} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0b2545]">¡Link de Cobro Listo!</h2>
                  <div className="text-2xl font-black text-[#1a3bb0] mt-1">{formatSoles(link.amount_cents)}</div>
                  {link.concept && <p className="text-[11px] text-[#4a5f7e] mt-0.5">{link.concept}</p>}
                </div>

                {link.url && (
                  <div className="flex justify-center p-2 bg-slate-50 rounded-2xl border border-slate-100">
                    <QrCode value={link.url} label={`QR para pagar ${formatSoles(link.amount_cents)}`} />
                  </div>
                )}
                {link.url && link.url.includes('localhost') && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span>Este QR apunta a localhost y solo funciona en red local. Configura <strong>KUOTA_PAY_BASE_URL</strong> en Railway para producción.</span>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 text-[10px] text-[#4a5f7e]">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={12} className="text-emerald-700" aria-hidden="true" /> Monto fijo · un solo pago
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} aria-hidden="true" /> Vence {formatWhen(link.expires_at)}
                  </span>
                </div>

                {link.payment_code && (
                  <div className="p-2.5 rounded-xl bg-[#eff3ff] text-[11px] text-[#304670]">
                    Código de pago 360pay (bancos y agentes): <strong className="font-mono text-[#0b2545]">{link.payment_code}</strong>
                  </div>
                )}

                <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-700 flex items-center justify-between gap-2">
                  <span className="truncate">{link.url}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={handleCopy} aria-label="Copiar link de cobro" className="w-7 h-7 rounded-lg flex items-center justify-center text-[#1a3bb0] hover:bg-white cursor-pointer">
                      <Copy size={14} aria-hidden="true" />
                    </button>
                    {canShare && (
                      <button type="button" onClick={handleShare} aria-label="Compartir link de cobro" className="w-7 h-7 rounded-lg flex items-center justify-center text-[#1a3bb0] hover:bg-white cursor-pointer">
                        <Share2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulación de la página de pago de 360pay (solo desarrollo) */}
                <button
                  type="button"
                  onClick={handleSimulateClientPay}
                  disabled={paying}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition disabled:opacity-60"
                >
                  <img src="/brand/yape-official.png" alt="" className="w-4 h-4 rounded-md object-cover inline shadow-xs" />
                  <span>{paying ? 'Procesando pago…' : 'Simular pago del cliente con Yape'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-red-600 cursor-pointer"
                >
                  <XCircle size={13} aria-hidden="true" /> Cancelar este link
                </button>
              </>
            ) : (
              <div className="space-y-3 py-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <CheckCircle2 size={32} aria-hidden="true" />
                </div>
                <h3 className="text-base font-black text-[#0b2545]">¡Cobro Exitoso Acreditado!</h3>
                <p className="text-xs text-[#4a5f7e]">
                  Se acreditaron {formatSoles(link.net_cents)} a tu cuenta y sumaste puntos a tu Score.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetFlow();
                    onNavigateTab('ventas');
                  }}
                  className="px-4 py-2 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Ver en Ventas
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Submit Button */}
      {!link && (
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handleCreateAndIssue}
            disabled={loading || amountCents < MIN_AMOUNT_CENTS}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{loading ? 'Generando link...' : 'Generar Link y QR de Cobro'}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <p className="text-[10px] text-center text-[#4a5f7e]">Tus clientes verán el nombre de tu negocio y el monto antes de pagar.</p>
        </div>
      )}
    </div>
  );
};
