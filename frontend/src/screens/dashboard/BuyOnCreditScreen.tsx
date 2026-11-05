import React, { useState, useEffect } from 'react';

import { api } from '../../api/client';
import { ShoppingBag, CheckCircle2, MapPin, AlertCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface BuyOnCreditScreenProps {
  onBack: () => void;
  onNavigateTab: (tab: string) => void;
}

const DEFAULT_PURCHASE_DATA = {
  id: 'pur_demo_01',
  plan: 'Plan 3X',
  status: 'ACTIVE_ON_TIME',
  provider: {
    id: 'prov_donlucho',
    name: 'Confecciones Don Lucho & Hnos. S.A.C.',
    address: 'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840, La Victoria',
    phone: '+51 984 521 893'
  },
  total_cents: 23600,
  down_payment_cents: 11800,
  down_payment_pct: 50,
  financed_cents: 11800,
  installments_count: 3,
  amortized_pct: 67,
  installments: [
    { id: 'inst_01', number: 1, amount_cents: 4326, principal_cents: 3933, interest_cents: 393, due_date: '2026-10-31', status: 'PAID' },
    { id: 'inst_02', number: 2, amount_cents: 4326, principal_cents: 3933, interest_cents: 393, due_date: '2026-11-07', status: 'PENDING' },
    { id: 'inst_03', number: 3, amount_cents: 4326, principal_cents: 3934, interest_cents: 392, due_date: '2026-11-21', status: 'PENDING' }
  ],
  next_installment: {
    id: 'inst_02',
    number: 2,
    total: 3,
    due_date: '07 Nov 2026',
    amount_cents: 4326
  },
  receipt_number: 'KQ-REC-8921-PE',
  issued_at: '2026-10-24'
};

export const BuyOnCreditScreen: React.FC<BuyOnCreditScreenProps> = ({ onBack }) => {
  const toast = useToast();
  const [data, setData] = useState<any>(DEFAULT_PURCHASE_DATA);
  const [loading, setLoading] = useState<boolean>(false);
  const [paying, setPaying] = useState<boolean>(false);

  const loadData = () => {
    api.getActivePurchase()
      .then((res) => {
        if (res && res.id) {
          setData(res);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePayInstallment = async (installmentId: string) => {
    if (!confirm('¿Pagar esta cuota de S/ 43.26 para recargar tu cupo y sumar a tu Score?')) return;
    setPaying(true);
    try {
      await api.payInstallment(installmentId);
      toast.success('¡Cuota pagada con éxito! Tu línea disponible se ha recargado.');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al pagar cuota');
    } finally {
      setPaying(false);
    }
  };

  const handleSettle = async (purchaseId: string) => {
    if (!confirm('¿Deseas liquidar anticipadamente toda la compra? Se liberará la Regla 3.2 para comprar nuevamente.')) return;
    try {
      await api.settlePurchase(purchaseId);
      toast.success('¡Compra liquidada con éxito! Has desbloqueado una nueva compra.');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al liquidar compra');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-[#4a5f7e]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a3bb0]"></div>
      </div>
    );
  }

  const isPaid = data?.status === 'PAID' && !data?.next_installment;

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff]">
      {/* Clean Flow Header (Sin switcher: flujo independiente de compra al crédito) */}
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
            <h1 className="text-base font-black text-[#0b2545] tracking-tight">Comprar al crédito</h1>
            <p className="text-[10px] text-[#4a5f7e]">Flujo exclusivo · Plan Kuota 3X</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-[#1a3bb0] border border-blue-200">
          Plan 3X
        </span>
      </div>

      {!isPaid ? (
        <>
          {/* Main Card: Active purchase */}
          <div className="p-4 bg-white rounded-3xl border border-blue-100 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1a3bb0] bg-blue-50 px-2.5 py-0.5 rounded-full">
                {data?.plan || 'Plan 3X'} · En curso
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={12} />
                Al día
              </span>
            </div>

            {/* Provider info */}
            <div>
              <div className="text-sm font-black text-[#0b2545]">
                {data?.provider?.name || 'Confecciones Don Lucho & Hnos. S.A.C.'}
              </div>
              <div className="text-xs text-[#4a5f7e] flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="text-[#1a3bb0]" />
                <span className="truncate">{data?.provider?.address || 'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840'}</span>
              </div>
            </div>

            {/* Total and Progress Bar */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[#4a5f7e]">Total de la compra:</span>
                <span className="text-lg font-black text-[#0b2545]">
                  S/ {(((data?.total_cents ?? 23600)) / 100).toFixed(2)}
                </span>
              </div>

              <div className="h-2 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${data?.amortized_pct ?? 67}%` }}
                ></div>
              </div>

              <div className="flex justify-between text-[10px] text-[#4a5f7e]">
                <span>Amortizado {data?.amortized_pct ?? 67}%</span>
                <span>Restante {100 - (data?.amortized_pct ?? 67)}%</span>
              </div>
            </div>

            {/* Financial Details Table */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 bg-blue-50/50 rounded-xl">
                <div className="text-[10px] text-[#4a5f7e]">Cuota inicial ({data?.down_payment_pct ?? 50}%)</div>
                <div className="font-extrabold text-[#0b2545]">
                  S/ {(((data?.down_payment_cents ?? 11800)) / 100).toFixed(2)}
                </div>
                <span className="text-[9px] text-emerald-700 font-bold">✓ Pagada al inicio</span>
              </div>

              <div className="p-2.5 bg-blue-50/50 rounded-xl">
                <div className="text-[10px] text-[#4a5f7e]">Saldo financiado</div>
                <div className="font-extrabold text-[#1a3bb0]">
                  S/ {(((data?.financed_cents ?? 11800)) / 100).toFixed(2)}
                </div>
                <span className="text-[9px] text-[#4a5f7e]">en {data?.installments_count ?? 3} cuotas</span>
              </div>
            </div>
          </div>

          {/* Next Installment Action Card */}
          {data?.next_installment && (
            <div className="p-3.5 bg-gradient-to-r from-blue-900 to-[#1a3bb0] rounded-2xl text-white shadow-md flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-200 uppercase">
                  Cuota {data.next_installment.number} de {data.next_installment.total || data.installments_count || 3}
                </span>
                <div className="text-xl font-black">
                  S/ {((data.next_installment.amount_cents || 4326) / 100).toFixed(2)}
                </div>
                <div className="text-[11px] text-blue-100">
                  Vence el <strong>{data.next_installment.due_date}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handlePayInstallment(data.next_installment.id)}
                disabled={paying}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {paying ? '...' : 'Pagar ahora'}
              </button>
            </div>
          )}

          {/* Settle Early CTA */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => handleSettle(data?.id || 'pur_active_01')}
              className="text-xs font-bold text-[#1a3bb0] hover:underline cursor-pointer"
            >
              Liquidar compra anticipadamente
            </button>
          </div>

          {/* Regla 3.2 Notice Box */}
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Regla 3.2 de Crédito Responsable:</strong> Solo puedes mantener 1 compra activa a la vez. Al saldar tus cuotas, tu cupo de hasta S/ 1,400 se libera inmediatamente.
            </div>
          </div>
        </>
      ) : (
        <div className="p-8 bg-white rounded-3xl border border-dashed border-[#c5c5d6] text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 text-[#1a3bb0] flex items-center justify-center">
            <ShoppingBag size={24} />
          </div>
          <h2 className="text-base font-black text-[#0b2545]">¡No tienes compras activas!</h2>
          <p className="text-xs text-[#4a5f7e]">
            Tu línea está 100% disponible. Puedes acudir a un comercio aliado de Gamarra o el Mercado Central para comprar tu mercadería al crédito.
          </p>
        </div>
      )}
    </div>
  );
};
