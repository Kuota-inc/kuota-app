import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { Delete, ArrowRight, CheckCircle2, Copy, ArrowLeft } from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface PaymentLinkScreenProps {
  onBack: () => void;
  onNavigateTab: (tab: string) => void;
}

export const PaymentLinkScreen: React.FC<PaymentLinkScreenProps> = ({ onBack, onNavigateTab }) => {
  const toast = useToast();
  const [amountStr, setAmountStr] = useState<string>('50');
  const [concept, setConcept] = useState<string>('');
  // Cotización del backend, etiquetada con el monto que se pidió.
  const [apiQuote, setApiQuote] = useState<{ amount_cents: number; fee_cents: number; net_cents: number } | null>(null);
  const [issuedLink, setIssuedLink] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);

  const amountNumber = parseFloat(amountStr) || 0;
  const amountCents = Math.round(amountNumber * 100);

  // Cotización local inmediata (1%) mientras responde el backend; solo se usa la
  // respuesta de la API si corresponde al monto actual (evita respuestas fuera de orden).
  const localFee = Math.round(amountCents * 0.01);
  const quote =
    amountCents <= 0
      ? null
      : apiQuote && apiQuote.amount_cents === amountCents
        ? apiQuote
        : { amount_cents: amountCents, fee_cents: localFee, net_cents: amountCents - localFee };

  useEffect(() => {
    if (amountCents <= 0) return;
    let alive = true;
    const t = window.setTimeout(() => {
      api
        .quotePaymentLink(amountCents)
        .then((q) => alive && setApiQuote({ ...q, amount_cents: q.amount_cents ?? amountCents }))
        .catch(console.error);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amountCents]);

  const handleKeyPress = (num: string) => {
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

  const handleCreateAndIssue = async () => {
    if (amountCents <= 0) return;
    setLoading(true);
    try {
      const draft = await api.createPaymentLink({
        amount_cents: amountCents,
        concept: concept || 'Cobro de venta'
      });
      const issued = await api.issuePaymentLink(draft.id);
      setIssuedLink({ ...draft, ...issued });
    } catch (err: any) {
      toast.error(err.message || 'Error al generar link');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateClientPay = async () => {
    if (!issuedLink?.token) return;
    try {
      await api.simulateWebhookPayment(issuedLink.token, 'YAPE');
      setPaymentSuccess(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar pago simulado');
    }
  };

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
              <p className="text-[10px] text-[#4a5f7e]">Genera links de cobro · Tarifa 1%</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            Tarifa 1%
          </span>
        </div>

        {!issuedLink ? (
          <>
            {/* Amount Display */}
            <div className="p-4 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm text-center space-y-1">
              <span className="text-[10px] font-bold text-[#4a5f7e] uppercase tracking-wider">
                Monto a cobrar
              </span>
              <div className="text-4xl font-black text-[#0b2545] tracking-tight">
                <span className="text-2xl text-[#1a3bb0] mr-1">S/</span>
                {parseFloat(amountStr || '0').toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </div>

              {/* Commission breakdown (PRD 08) */}
              {quote && (
                <div className="pt-2 flex justify-center gap-4 text-[11px] text-[#4a5f7e] border-t border-slate-100">
                  <div>
                    Comisión (1%):{' '}
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
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((digit) => (
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
        ) : (
          /* Issued Link View */
          <div className="p-4 bg-white rounded-3xl border border-blue-100 shadow-md space-y-4 text-center">
            {!paymentSuccess ? (
              <>
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#0b2545]">¡Link de Cobro Listo!</h2>
                  <div className="text-2xl font-black text-[#1a3bb0] mt-1">
                    S/ {(issuedLink.amount_cents / 100).toFixed(2)}
                  </div>
                </div>

                <div className="flex justify-center p-2 bg-slate-50 rounded-2xl border border-slate-100">
                  <img
                    src={issuedLink.qr_url}
                    alt="QR Cobro"
                    className="w-40 h-40 rounded-xl shadow-sm"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl text-[11px] font-mono break-all text-slate-700 flex items-center justify-between">
                  <span className="truncate">{issuedLink.url}</span>
                  <Copy size={14} className="text-[#1a3bb0] shrink-0 ml-1 cursor-pointer" />
                </div>

                {/* Simulation button */}
                <button
                  onClick={handleSimulateClientPay}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition"
                >
                  <img
                    src="/brand/yape-official.png"
                    alt="Yape"
                    className="w-4 h-4 rounded-md object-cover inline shadow-xs"
                  />
                  <span>Simular pago del cliente con Yape</span>
                </button>
              </>
            ) : (
              <div className="space-y-3 py-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-base font-black text-[#0b2545]">¡Cobro Exitoso Acreditado!</h3>
                <p className="text-xs text-[#4a5f7e]">
                  Se acreditaron S/ {(issuedLink.net_cents / 100).toFixed(2)} a tu cuenta y sumaste puntos a tu Score.
                </p>
                <button
                  onClick={() => {
                    setIssuedLink(null);
                    setPaymentSuccess(false);
                    onNavigateTab('ventas');
                  }}
                  className="px-4 py-2 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold"
                >
                  Ver en Ventas
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Submit Button */}
      {!issuedLink && (
        <div className="pt-2">
          <button
            onClick={handleCreateAndIssue}
            disabled={loading || amountCents <= 0}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{loading ? 'Generando link...' : 'Generar Link y QR de Cobro'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
