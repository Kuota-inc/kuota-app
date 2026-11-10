import React, { useState, useEffect } from 'react';

import { api } from '../../api/client';
import {
  ShoppingBag, CheckCircle2, MapPin, AlertCircle, ArrowLeft,
  Search, Star, ChevronRight, Package, ArrowRight, Check
} from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface BuyOnCreditScreenProps {
  onBack: () => void;
  onNavigateTab: (tab: string) => void;
}

type CreateStep = 'select_provider' | 'enter_amount' | 'confirm' | 'success';

export const BuyOnCreditScreen: React.FC<BuyOnCreditScreenProps> = ({ onBack }) => {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Creation flow state
  const [createStep, setCreateStep] = useState<CreateStep | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [amountInput, setAmountInput] = useState('');
  const [simulation, setSimulation] = useState<any>(null);
  const [loadingSim, setLoadingSim] = useState(false);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<boolean>(false);

  const loadData = () => {
    setLoading(true);
    api.getActivePurchase()
      .then((res) => {
        setData(res && res.id ? res : null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const startNewPurchase = async () => {
    setLoadingProviders(true);
    try {
      const list = await api.getAffiliatedProviders();
      setProviders(list);
    } catch {
      toast.error('No se pudieron cargar los proveedores aliados.');
    } finally {
      setLoadingProviders(false);
    }
    setCreateStep('select_provider');
    setSelectedProvider(null);
    setAmountInput('');
    setSimulation(null);
  };

  const handleSelectProvider = (prov: any) => {
    setSelectedProvider(prov);
    setCreateStep('enter_amount');
    setAmountInput('');
    setSimulation(null);
  };

  const handleSimulate = async () => {
    const amount = parseFloat(amountInput);
    if (!amount || amount <= 0) return;
    setLoadingSim(true);
    try {
      const res = await api.simulatePlan(Math.round(amount * 100), 3);
      setSimulation(res);
    } catch (err: any) {
      toast.error(err.message || 'Error en simulación');
    } finally {
      setLoadingSim(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedProvider || !simulation) return;
    setCreating(true);
    try {
      await api.createPurchase({
        provider_id: selectedProvider.id,
        total_cents: simulation.purchase_cents,
        installments: 3
      });
      setCreateStep('success');
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la compra');
    } finally {
      setCreating(false);
    }
  };

  const handleSuccessDone = () => {
    setCreateStep(null);
    loadData();
  };

  const handlePayInstallment = async (installmentId: string) => {
    const amount = ((data?.next_installment?.amount_cents ?? 0) / 100).toFixed(2);
    if (!confirm(`¿Pagar esta cuota de S/ ${amount} para recargar tu cupo y sumar a tu Score?`)) return;
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-[#4a5f7e]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a3bb0]"></div>
      </div>
    );
  }

  // ── CREATION FLOW ─────────────────────────────────────────────────────────

  // Step: Select provider
  if (createStep === 'select_provider') {
    const filtered = providers.filter(p =>
      p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(providerSearch.toLowerCase())
    );
    return (
      <div className="flex-1 p-4 space-y-3 bg-[#f9f9ff]">
        <div className="flex items-center gap-2.5 pb-1">
          <button
            type="button"
            onClick={() => setCreateStep(null)}
            className="w-8 h-8 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] hover:bg-blue-50 active:scale-95 transition shadow-xs cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-[#0b2545] tracking-tight">Elige tu proveedor</h1>
            <p className="text-[10px] text-[#4a5f7e]">Paso 1 de 3 · Selecciona de la red Kuota</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5f7e]" />
          <input
            type="text"
            value={providerSearch}
            onChange={e => setProviderSearch(e.target.value)}
            placeholder="Buscar por nombre o categoría..."
            className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-[#e1e8f8] rounded-xl focus:outline-none focus:border-[#1a3bb0] text-[#0b2545]"
          />
        </div>

        {loadingProviders ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-b-2 border-[#1a3bb0] rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(prov => (
              <button
                key={prov.id}
                type="button"
                onClick={() => handleSelectProvider(prov)}
                className="w-full p-3.5 bg-white rounded-2xl border border-[#e1e8f8] hover:border-[#1a3bb0] flex items-start gap-3 text-left transition group cursor-pointer shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 text-[#1a3bb0] group-hover:bg-[#1a3bb0] group-hover:text-white transition">
                  <Package size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-[#0b2545] leading-tight">{prov.name}</span>
                    <span className="text-[10px] font-bold uppercase bg-blue-50 text-[#1a3bb0] px-1.5 py-0.5 rounded">
                      {prov.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#4a5f7e] mt-0.5">{prov.category}</div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-[#4a5f7e]">
                    <MapPin size={10} className="text-[#1a3bb0] shrink-0" />
                    <span className="truncate">{prov.zone}</span>
                    <span className="ml-auto flex items-center gap-0.5 text-amber-700 font-bold shrink-0">
                      <Star size={10} fill="currentColor" />
                      {prov.rating}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                    Pedido: S/ {(prov.min_order_cents / 100).toFixed(0)}–{(prov.max_order_cents / 100).toFixed(0)}
                  </div>
                </div>
                <ChevronRight size={16} className="text-[#4a5f7e] group-hover:text-[#1a3bb0] mt-2 shrink-0 transition" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Step: Enter amount
  if (createStep === 'enter_amount' && selectedProvider) {
    const amountNum = parseFloat(amountInput) || 0;
    const amountCents = Math.round(amountNum * 100);
    const withinRange = amountCents >= selectedProvider.min_order_cents && amountCents <= selectedProvider.max_order_cents;

    return (
      <div className="flex-1 p-4 space-y-3 bg-[#f9f9ff]">
        <div className="flex items-center gap-2.5 pb-1">
          <button
            type="button"
            onClick={() => setCreateStep('select_provider')}
            className="w-8 h-8 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] hover:bg-blue-50 active:scale-95 transition shadow-xs cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-[#0b2545] tracking-tight">Monto de compra</h1>
            <p className="text-[10px] text-[#4a5f7e]">Paso 2 de 3 · Ingresa el monto total</p>
          </div>
        </div>

        {/* Selected provider summary */}
        <div className="p-3 bg-white rounded-2xl border border-blue-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#1a3bb0] shrink-0">
            <Package size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-[#0b2545] truncate">{selectedProvider.name}</div>
            <div className="text-[10px] text-[#4a5f7e]">{selectedProvider.zone}</div>
          </div>
        </div>

        {/* Amount input */}
        <div className="p-4 bg-white rounded-2xl border border-[#e1e8f8] space-y-3 shadow-sm">
          <label className="text-xs font-bold text-[#0b2545] block">Monto total de la compra (S/)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-black text-[#4a5f7e]">S/</span>
            <input
              type="number"
              inputMode="decimal"
              value={amountInput}
              onChange={e => { setAmountInput(e.target.value); setSimulation(null); }}
              placeholder="0.00"
              className="w-full pl-10 pr-4 py-3 text-2xl font-black text-[#0b2545] bg-blue-50/50 border border-blue-100 rounded-xl focus:outline-none focus:border-[#1a3bb0]"
            />
          </div>
          <p className="text-[10px] text-[#4a5f7e]">
            Rango permitido: S/ {(selectedProvider.min_order_cents / 100).toFixed(0)} – S/ {(selectedProvider.max_order_cents / 100).toFixed(0)}
          </p>
        </div>

        {/* Simulation result */}
        {simulation && (
          <div className="p-3.5 bg-white rounded-2xl border border-blue-100 shadow-sm space-y-2.5">
            <div className="text-[11px] font-black text-[#0b2545] uppercase tracking-wider">Desglose Plan Kuota 3X</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-blue-50/50 rounded-xl">
                <span className="text-[10px] text-[#4a5f7e]">Cuota inicial (50%)</span>
                <div className="font-extrabold text-[#0b2545]">S/ {(simulation.down_payment_cents / 100).toFixed(2)}</div>
                <span className="text-[10px] text-amber-700 font-bold">Pago al confirmar</span>
              </div>
              <div className="p-2 bg-blue-50/50 rounded-xl">
                <span className="text-[10px] text-[#4a5f7e]">Saldo financiado</span>
                <div className="font-extrabold text-[#1a3bb0]">S/ {(simulation.financed_cents / 100).toFixed(2)}</div>
                <span className="text-[10px] text-[#4a5f7e]">en 3 cuotas quincenales</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-700">Interés total</span>
                <div className="font-extrabold text-amber-900">S/ {((simulation.interest_cents ?? 0) / 100).toFixed(2)}</div>
              </div>
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-700">Total en cuotas</span>
                <div className="font-extrabold text-amber-900">S/ {((simulation.total_repayment_cents ?? 0) / 100).toFixed(2)}</div>
              </div>
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                <span className="text-[10px] text-amber-700">TEA / TCEA</span>
                <div className="font-extrabold text-amber-900">{simulation.tea_pct != null ? `${Number(simulation.tea_pct).toFixed(1)} %` : '—'}</div>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t border-slate-100">
              {simulation.schedule.map((item: any) => (
                <div key={item.number} className="flex justify-between items-center text-xs py-0.5">
                  <span className="text-[#4a5f7e]">Cuota {item.number} · {item.due_date}</span>
                  <span className="font-extrabold text-[#0b2545]">S/ {(item.amount_cents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1">
          {!simulation ? (
            <button
              type="button"
              onClick={handleSimulate}
              disabled={!amountInput || amountNum <= 0 || loadingSim}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-[#0b2545] rounded-2xl text-sm font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {loadingSim ? 'Calculando...' : 'Ver simulación de cuotas'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreateStep('confirm')}
              disabled={!withinRange}
              className="w-full py-3 bg-[#1a3bb0] hover:bg-[#163299] text-white rounded-2xl text-sm font-bold transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Continuar a confirmación</span>
              <ArrowRight size={16} />
            </button>
          )}
          {simulation && !withinRange && (
            <p className="text-[10px] text-red-600 text-center font-bold">
              El monto debe estar entre S/ {(selectedProvider.min_order_cents / 100).toFixed(0)} y S/ {(selectedProvider.max_order_cents / 100).toFixed(0)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Step: Confirm
  if (createStep === 'confirm' && selectedProvider && simulation) {
    return (
      <div className="flex-1 p-4 space-y-3 bg-[#f9f9ff]">
        <div className="flex items-center gap-2.5 pb-1">
          <button
            type="button"
            onClick={() => setCreateStep('enter_amount')}
            className="w-8 h-8 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#1a3bb0] hover:bg-blue-50 active:scale-95 transition shadow-xs cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-[#0b2545] tracking-tight">Confirmar compra</h1>
            <p className="text-[10px] text-[#4a5f7e]">Paso 3 de 3 · Revisa y confirma</p>
          </div>
        </div>

        {/* Summary card */}
        <div className="p-4 bg-white rounded-3xl border border-blue-100 shadow-md space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#1a3bb0] shrink-0">
              <Package size={20} />
            </div>
            <div>
              <div className="text-sm font-black text-[#0b2545]">{selectedProvider.name}</div>
              <div className="text-[10px] text-[#4a5f7e] flex items-center gap-1 mt-0.5">
                <MapPin size={10} className="text-[#1a3bb0]" />
                {selectedProvider.zone}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-[#4a5f7e]">Total de la compra</span>
              <span className="font-black text-[#0b2545] text-base">S/ {(simulation.purchase_cents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#4a5f7e]">Plan de pago</span>
              <span className="font-bold text-[#1a3bb0]">Kuota 3X quincenal</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
              <div className="text-[10px] text-amber-700">Pagas ahora (50%)</div>
              <div className="font-extrabold text-amber-900 text-sm">S/ {(simulation.down_payment_cents / 100).toFixed(2)}</div>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-200">
              <div className="text-[10px] text-[#4a5f7e]">3 cuotas de</div>
              <div className="font-extrabold text-[#1a3bb0] text-sm">S/ {(simulation.installment_cents / 100).toFixed(2)}</div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between pb-1 mb-1 border-b border-slate-200">
              <span className="text-[#4a5f7e]">Interés total del financiamiento</span>
              <span className="font-bold text-[#0b2545]">S/ {((simulation.interest_cents ?? 0) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pb-1 mb-1 border-b border-slate-200">
              <span className="text-[#4a5f7e]">Total a pagar en cuotas</span>
              <span className="font-bold text-[#0b2545]">S/ {((simulation.total_repayment_cents ?? 0) / 100).toFixed(2)}</span>
            </div>
            {simulation.tea_pct != null && (
              <div className="flex justify-between pb-1 mb-1 border-b border-slate-200">
                <span className="text-[#4a5f7e]">TEA / TCEA (tasa efectiva anual)</span>
                <span className="font-bold text-[#0b2545]">{Number(simulation.tea_pct).toFixed(1)} %</span>
              </div>
            )}
            {simulation.schedule.map((item: any) => (
              <div key={item.number} className="flex justify-between">
                <span className="text-[#4a5f7e]">Cuota {item.number} · {item.due_date}</span>
                <span className="font-bold text-[#0b2545]">S/ {(item.amount_cents / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
          <AlertCircle size={15} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong>Regla 3.2:</strong> Al confirmar, esta será tu única compra activa hasta saldar las 3 cuotas.
            El proveedor recibirá el pago completo de S/ {(simulation.purchase_cents / 100).toFixed(2)} desde Kuota.
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirmPurchase}
          disabled={creating}
          className="w-full py-3.5 bg-[#1a3bb0] hover:bg-[#163299] text-white rounded-2xl text-sm font-black transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 shadow-md"
        >
          {creating ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Check size={18} />
              <span>Confirmar y pagar S/ {(simulation.down_payment_cents / 100).toFixed(2)}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Step: Success
  if (createStep === 'success') {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-5 bg-[#f9f9ff]">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-700" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-black text-[#0b2545]">¡Compra realizada!</h2>
          <p className="text-sm text-[#4a5f7e]">
            Tu cuota inicial fue procesada. {selectedProvider?.name} recibirá el pago completo desde Kuota.
          </p>
        </div>
        {simulation && (
          <div className="w-full p-4 bg-white rounded-2xl border border-emerald-200 text-xs space-y-1 shadow-sm">
            <div className="flex justify-between font-bold">
              <span className="text-[#4a5f7e]">Total de la compra</span>
              <span className="text-[#0b2545]">S/ {(simulation.purchase_cents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4a5f7e]">Cuota inicial pagada</span>
              <span className="text-emerald-700 font-bold">S/ {(simulation.down_payment_cents / 100).toFixed(2)} ✓</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4a5f7e]">Saldo en 3 cuotas</span>
              <span className="text-[#1a3bb0] font-bold">S/ {(simulation.financed_cents / 100).toFixed(2)}</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleSuccessDone}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold transition cursor-pointer"
        >
          Ver mi compra activa
        </button>
      </div>
    );
  }

  // ── DETAIL / EMPTY VIEW ────────────────────────────────────────────────────

  const isPaid = !data || (data.status === 'PAID' && !data.next_installment);

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff]">
      {/* Header */}
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

            <div>
              <div className="text-sm font-black text-[#0b2545]">
                {data?.provider?.name || 'Confecciones Don Lucho & Hnos. S.A.C.'}
              </div>
              <div className="text-xs text-[#4a5f7e] flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="text-[#1a3bb0]" />
                <span className="truncate">{data?.provider?.address || 'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840'}</span>
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 bg-blue-50/50 rounded-xl">
                <div className="text-[10px] text-[#4a5f7e]">Cuota inicial ({data?.down_payment_pct ?? 50}%)</div>
                <div className="font-extrabold text-[#0b2545]">
                  S/ {(((data?.down_payment_cents ?? 11800)) / 100).toFixed(2)}
                </div>
                <span className="text-[10px] text-emerald-700 font-bold">✓ Pagada al inicio</span>
              </div>

              <div className="p-2.5 bg-blue-50/50 rounded-xl">
                <div className="text-[10px] text-[#4a5f7e]">Saldo financiado</div>
                <div className="font-extrabold text-[#1a3bb0]">
                  S/ {(((data?.financed_cents ?? 11800)) / 100).toFixed(2)}
                </div>
                <span className="text-[10px] text-[#4a5f7e]">en {data?.installments_count ?? 3} cuotas</span>
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

          <div className="text-center">
            <button
              type="button"
              onClick={() => handleSettle(data.id)}
              className="text-xs font-bold text-[#1a3bb0] hover:underline cursor-pointer"
            >
              Liquidar compra anticipadamente
            </button>
          </div>

          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
            <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Regla 3.2 de Crédito Responsable:</strong> Solo puedes mantener 1 compra activa a la vez. Al saldar tus cuotas, tu cupo de hasta S/ 1,400 se libera inmediatamente.
            </div>
          </div>
        </>
      ) : (
        <div className="p-6 bg-white rounded-3xl border border-dashed border-[#c5c5d6] text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 text-[#1a3bb0] flex items-center justify-center">
            <ShoppingBag size={28} />
          </div>
          <div>
            <h2 className="text-base font-black text-[#0b2545]">¡Tu línea está lista!</h2>
            <p className="text-xs text-[#4a5f7e] mt-1">
              No tienes compras activas. Busca un proveedor aliado de la red Kuota para comprar tu mercadería al crédito con 50% ahora y el resto en 3 cuotas.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewPurchase}
            className="w-full py-3 bg-[#1a3bb0] hover:bg-[#163299] text-white rounded-2xl text-sm font-black transition cursor-pointer flex items-center justify-center gap-2 shadow-md"
          >
            <Search size={16} />
            <span>Buscar proveedor aliado</span>
          </button>
        </div>
      )}
    </div>
  );
};
