import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { KuotaNotifications } from '../../plugins/kuotaNotifications';
import { api } from '../../api/client';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Info } from 'lucide-react';
import { useToast } from '../../components/toast-context';
import { DialogPanel } from '../../components/DialogPanel';

// Respaldo con la misma forma que GET /credit/line y GET /credit/levels
// (se muestra en la primera carga y si el backend no responde).
const DEFAULT_LINE_DATA = {
  line: {
    status: 'ACTIVE',
    total_limit_cents: 140000,
    used_cents: 45000,
    available_cents: 95000
  },
  level: { level: 1, name: 'Brote', down_payment_pct: 50 },
  next_level: {
    level: 2,
    name: 'Raíz',
    down_payment_pct: 40,
    max_line_cents: 350000,
    progress: { current: 2, target: 3 }
  },
  pending_installments_count: 1
};

const DEFAULT_LEVELS = [
  { level: 1, name: 'Brote', down_payment_pct: 50, max_line_cents: 140000 },
  { level: 2, name: 'Raíz', down_payment_pct: 40, max_line_cents: 350000 },
  { level: 3, name: 'Tallo', down_payment_pct: 30, max_line_cents: 700000 },
  { level: 4, name: 'Rama', down_payment_pct: 20, max_line_cents: 1200000 },
  { level: 5, name: 'Fruto', down_payment_pct: 10, max_line_cents: 2000000 },
  { level: 6, name: 'Cosecha', down_payment_pct: 0, max_line_cents: 3500000 }
];

interface CreditLineScreenProps {
  /** Abre el detalle de la compra y sus cuotas. */
  onViewInstallments?: () => void;
  /** Calendario de pagos y cobros. */
  onOpenCalendar?: () => void;
}

export const CreditLineScreen: React.FC<CreditLineScreenProps> = ({ onViewInstallments, onOpenCalendar }) => {
  const toast = useToast();
  const [lineData, setLineData] = useState<any>(DEFAULT_LINE_DATA);
  const [levels, setLevels] = useState<any[]>(DEFAULT_LEVELS);
  const [activePurchase, setActivePurchase] = useState<any>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [paying, setPaying] = useState<boolean>(false);
  const [listenerGranted, setListenerGranted] = useState<boolean | null>(null);

  const loadData = () => {
    api.getCreditLine().then(setLineData).catch(console.error);
    api.getCreditLevels().then(setLevels).catch(console.error);
    api.getActivePurchase().then(setActivePurchase).catch(console.error);
  };

  useEffect(() => {
    loadData();
    if (Capacitor.isNativePlatform()) {
      KuotaNotifications.checkPermission()
        .then(({ granted }) => setListenerGranted(granted))
        .catch(() => setListenerGranted(false));
    }
  }, []);

  const handlePay = async (instId: string) => {
    setPaying(true);
    try {
      await api.payInstallment(instId);
      toast.success('¡Pago procesado y línea recargada!');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al pagar');
    } finally {
      setPaying(false);
    }
  };

  const line = lineData?.line;
  const currentLevel = lineData?.level;
  const pendingCount = Math.max(1, lineData?.pending_installments_count || 0);

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff]">
      {/* Title */}
      <div className="pt-1">
        <h1 className="text-xl font-black text-[#0b2545] tracking-tight">
          Mi línea de crédito
        </h1>
        <p className="text-[11px] text-[#4a5f7e]">
          Crédito rotativo inteligente que crece con tu puntualidad.
        </p>
      </div>

      {/* Main Credit Balance Card */}
      <div className="p-4 bg-gradient-to-br from-[#00248b] via-[#1a3bb0] to-[#254bdb] rounded-3xl text-white shadow-xl shadow-blue-900/15 space-y-3 relative">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider">
            Crédito disponible
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold whitespace-nowrap shrink-0">
            Nivel {currentLevel?.level} · {currentLevel?.name}
          </span>
        </div>

        <div className="text-3xl font-black tracking-tight flex items-baseline">
          <span className="text-2xl mr-1 text-blue-200 font-bold">S/</span>
          <AnimatedNumber value={(line?.available_cents || 0) / 100} decimals={2} />
        </div>

        {/* Breakdown bar */}
        <div className="space-y-1 pt-1">
          <div className="h-2 w-full bg-blue-950/40 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round(((line?.available_cents || 0) / (line?.total_limit_cents || 140000)) * 100))}%`
              }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-blue-200">
            <span>En uso: S/ {((line?.used_cents || 0) / 100).toFixed(2)}</span>
            <span>Total asignado: S/ {((line?.total_limit_cents || 140000) / 100).toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={() => setShowExplanation(true)}
          className="pt-1 flex items-center gap-1 text-[11px] text-blue-200 hover:text-white font-medium"
        >
          <Info size={13} />
          <span>¿Cómo funciona la recarga de tu cupo?</span>
        </button>
      </div>

      {onOpenCalendar && (
        <button
          type="button"
          onClick={onOpenCalendar}
          className="w-full p-3 rounded-2xl bg-white border-2 border-[#1a3bb0]/25 text-[#00248b] font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl">calendar_month</span>
          Calendario de pagos y cobros
        </button>
      )}

      {/* Cuotas Pendientes Section */}
      {activePurchase?.next_installment && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-[#0b2545]">
            <span>
              Mis pagos pendientes ({pendingCount} {pendingCount === 1 ? 'activo' : 'activos'})
            </span>
            <span className="flex items-center gap-3">
              {onViewInstallments && (
                <button
                  type="button"
                  onClick={onViewInstallments}
                  className="text-[11px] text-[#1a3bb0] font-bold underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
                >
                  Ver todas
                </button>
              )}
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[#0b2545]">
                {activePurchase.provider?.name || 'Confecciones Don Lucho & Hnos.'}
              </div>
              <div className="text-[10px] text-[#4a5f7e]">
                Cuota {activePurchase.next_installment.number} de {activePurchase.next_installment.total} · Vence el {activePurchase.next_installment.due_date}
              </div>
            </div>

            <div className="text-right flex items-center gap-2">
              <span className="text-sm font-black text-[#0b2545]">
                S/ {(activePurchase.next_installment.amount_cents / 100).toFixed(2)}
              </span>
              <button
                onClick={() => handlePay(activePurchase.next_installment.id)}
                disabled={paying}
                className="px-3 py-1.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white rounded-xl text-xs font-bold shadow-sm"
              >
                {paying ? '...' : 'Pagar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bloque 3: Banner listener de pagos */}
      {Capacitor.isNativePlatform() && listenerGranted === false && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-700 text-xl mt-0.5 shrink-0">notifications_active</span>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-xs font-bold text-amber-900">Detecta pagos Yape/Plin automáticamente</div>
            <p className="text-[10px] text-amber-800 leading-snug">
              Activa el acceso a notificaciones y Kuota registrará tus cobros para mejorar tu score sin que hagas nada.
            </p>
            <button
              type="button"
              onClick={() => KuotaNotifications.openSettings()}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-bold"
            >
              Activar ahora
            </button>
          </div>
        </div>
      )}

      {/* Escala de Crecimiento de 6 Niveles (PRD 00 / 10) */}
      <div className="space-y-2.5 pb-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-[#0b2545]">Escala de 6 Niveles Kuota</div>
          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
            Regla de Cuotas
          </span>
        </div>

        <div className="space-y-1.5">
          {levels.map((lvl) => {
            const isCurrent = lvl.level === (currentLevel?.level || 1);
            return (
              <div
                key={lvl.level}
                className={`p-3 rounded-2xl border flex items-center justify-between transition ${
                  isCurrent
                    ? 'bg-blue-50/70 border-[#1a3bb0] shadow-sm'
                    : 'bg-white border-[#e1e8f8]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                      isCurrent
                        ? 'bg-[#1a3bb0] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    N{lvl.level}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0b2545] flex items-center gap-1.5">
                      <span>{lvl.name}</span>
                      {isCurrent && (
                        <span className="text-[10px] bg-[#1a3bb0] text-white px-1.5 py-0.2 rounded font-bold">
                          Tu nivel actual
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#4a5f7e]">
                      Inicial: <strong>{lvl.down_payment_pct}%</strong> · Límite hasta S/{' '}
                      {(lvl.max_line_cents / 100).toLocaleString('es-PE')}
                    </div>
                  </div>
                </div>

                {lvl.down_payment_pct === 0 ? (
                  <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                    100% financiado
                  </span>
                ) : (
                  <span className="text-xs font-bold text-[#0b2545]">
                    {lvl.down_payment_pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanation Modal */}
      {showExplanation && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowExplanation(false)}>
          <DialogPanel
            onClose={() => setShowExplanation(false)}
            labelledBy="credit-explainer-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl"
          >
            <h3 id="credit-explainer-title" className="text-base font-black text-[#0b2545]">¿Cómo funciona tu cupo?</h3>
            <p className="text-xs text-[#4a5f7e] leading-relaxed">
              Tu línea de <strong>S/ 1,400.00</strong> es un crédito rotativo inteligente: cada vez que pagas una cuota, el capital amortizado se recarga de forma automática en tu saldo disponible para tus próximas compras.
            </p>
            <p className="text-xs text-[#4a5f7e] leading-relaxed">
              Al mantener 3 compras consecutivas sin retrasos, asciendes de nivel, reduciendo el pago inicial requerido hasta llegar al <strong>Nivel 6 (Cosecha) con 0% de inicial</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowExplanation(false)}
              className="w-full py-2.5 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold"
            >
              Entendido
            </button>
          </DialogPanel>
        </div>
      )}
    </div>
  );
};
