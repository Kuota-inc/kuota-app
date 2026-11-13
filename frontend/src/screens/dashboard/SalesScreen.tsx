import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Plus, TrendingUp, ShoppingBag, Search, X } from 'lucide-react';
import { useToast } from '../../components/toast-context';
import { DialogPanel } from '../../components/DialogPanel';
import { LoadState } from '../../components/LoadState';
import { monthLabel } from '../../utils/dates';
import { track } from '../../lib/analytics';

export const SalesScreen: React.FC = () => {
  const toast = useToast();
  const [summary, setSummary] = useState<any>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [score, setScore] = useState<any>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualConcept, setManualConcept] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [listVersion, setListVersion] = useState(0);

  // Espera 300 ms después de la última tecla antes de consultar.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadSummary = useCallback(() => {
    api.getSalesSummary().then((s) => { setSummary(s); setSummaryError(false); }).catch(() => setSummaryError(true));
    // Mismo score que el Home (calculado en el servidor).
    api.getMyScore().then(setScore).catch(() => {});
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Lista: se recarga al cambiar filtro, búsqueda o tras registrar una venta.
  useEffect(() => {
    let alive = true;
    api
      .getSalesList(filter === 'ALL' ? undefined : filter, debouncedSearch || undefined)
      .then((list) => alive && setSales(list))
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [filter, debouncedSearch, listVersion]);

  const loadData = () => {
    loadSummary();
    setListVersion((v) => v + 1);
  };

  const handleManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAmount || parseFloat(manualAmount) <= 0) return;
    try {
      const amountCents = Math.round(parseFloat(manualAmount) * 100);
      await api.createManualSale(amountCents, manualConcept || 'Venta rápida');
      track('manual_sale_recorded', { amount_cents: amountCents });
      setShowManualModal(false);
      setManualAmount('');
      setManualConcept('');
      toast.success('¡Venta rápida registrada!');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar venta');
    }
  };

  // Sin respuesta del servidor no se muestran ventas de ejemplo.
  if (!summary) return <LoadState error={summaryError} onRetry={loadSummary} />;

  return (
    <div className="flex-1 p-4 space-y-4 bg-[#f9f9ff]">
      {/* Title */}
      <div className="pt-1">
        <h1 className="text-xl font-black text-[#0b2545] tracking-tight">
          Ventas de mi negocio
        </h1>
        <p className="text-[11px] text-[#4a5f7e]">
          Registra cobros para aumentar tu Score Kuota y ampliar tu línea.
        </p>
      </div>

      {/* Monthly Sales Summary Card */}
      <div className="p-4 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#4a5f7e]">
          Ingresos este mes ({monthLabel()})
        </div>
        <div className="text-3xl font-black text-[#0b2545]">
          S/ {(((summary?.total_revenue_cents || 0)) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
        </div>

        {/* Breakdown 2 cols */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e1e8f8]">
          <div className="p-2.5 bg-blue-50/60 rounded-xl">
            <div className="text-[10px] font-bold text-[#1a3bb0]">
              ✓ Comprobadas (Yape/Plin)
            </div>
            <div className="text-sm font-extrabold text-[#0b2545] mt-0.5">
              S/ {((summary?.verified?.total_cents || 0) / 100).toFixed(2)}
            </div>
            <div className="text-[10px] text-[#4a5f7e]">{summary?.verified?.count || 0} operaciones</div>
          </div>

          <div className="p-2.5 bg-slate-50 rounded-xl">
            <div className="text-[10px] font-bold text-slate-700">
              ✎ Declaradas manual
            </div>
            <div className="text-sm font-extrabold text-[#0b2545] mt-0.5">
              S/ {((summary?.declared?.total_cents || 0) / 100).toFixed(2)}
            </div>
            <div className="text-[10px] text-[#4a5f7e]">{summary?.declared?.count || 0} registradas</div>
          </div>
        </div>
      </div>

      {/* Action Buttons: Venta rápida + Scan OCR */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowManualModal(true)}
          className="w-full p-3.5 bg-[#1a3bb0] text-white rounded-2xl font-bold text-sm shadow-md shadow-blue-900/10 hover:bg-[#00248b] flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
        >
          <Plus size={16} />
          <span>Venta Rápida</span>
        </button>

        <p className="text-[11px] text-[#4a5f7e] px-1 leading-snug">
          ¿Cobras por Yape o Plin? Activa el listener en <b>Mi cuenta</b> y tus abonos se registran solos como comprobados.
        </p>
      </div>

      {/* Score Kuota Card */}
      {score && (
      <div className="p-3.5 bg-gradient-to-r from-indigo-900 to-[#1a3bb0] rounded-2xl text-white shadow-md flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider">
            Score Kuota
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black">{score.total} pts</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
              {score.label}
            </span>
          </div>
          <div className="text-[10px] text-blue-200">Se actualiza con tus pagos y ventas comprobadas</div>
        </div>
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
          <TrendingUp size={24} className="text-emerald-400" />
        </div>
      </div>
      )}

      {/* Search + Filter Tabs */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5f7e]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar ventas por concepto o número de operación"
            placeholder="Buscar por concepto u operación"
            maxLength={60}
            className="w-full pl-8 pr-8 py-2 bg-white rounded-xl border border-[#e1e8f8] text-xs font-semibold text-[#0b2545] placeholder:text-slate-500 focus:outline-none focus:border-[#1a3bb0] [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[#4a5f7e] hover:bg-slate-100"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div role="group" aria-label="Filtrar ventas" className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'VERIFIED', label: 'Comprobadas (Yape/Plin)' },
            { id: 'DECLARED', label: 'Declaradas' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-2.5 rounded-xl font-bold whitespace-nowrap transition text-xs ${
                filter === tab.id
                  ? 'bg-[#1a3bb0] text-white shadow-sm'
                  : 'bg-white border border-[#e1e8f8] text-[#4a5f7e]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sales List */}
        <div className="space-y-2">
          {sales.length === 0 ? (
            <div className="p-6 bg-white rounded-2xl border border-dashed border-[#c5c5d6] text-center text-xs text-[#4a5f7e]">
              {debouncedSearch
                ? `No encontramos ventas para “${debouncedSearch}”.`
                : 'No tienes ventas registradas este mes. ¡Agrega tu primera venta rápida o activa el listener de Yape/Plin en Mi cuenta!'}
            </div>
          ) : (
            sales.map((sale) => (
              <div
                key={sale.id}
                className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-xs flex items-center justify-between gap-3 hover:border-blue-200 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden p-0.5 shadow-2xs ${
                    sale.source === 'YAPE' ? 'border-purple-200 bg-[#742284]' : 'border-slate-100 bg-slate-50'
                  }`}>
                    {sale.source === 'YAPE' ? (
                      <img
                        src="/brand/yape-official.png"
                        alt="Yape"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : sale.source === 'PLIN' ? (
                      <img
                        src="/brand/plin-icon.png"
                        alt="Plin"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <ShoppingBag size={15} className="text-[#1a3bb0]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0b2545] truncate">{sale.concept || 'Venta'}</div>
                    <div className="text-[10px] text-[#4a5f7e] truncate">
                      {sale.source} {sale.operation_ref ? `· ${sale.operation_ref}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-[#0b2545]">
                    S/ {(sale.amount_cents / 100).toFixed(2)}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      sale.verified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {sale.verified ? '✓ Verificada' : '✎ Declarada'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manual Sale Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowManualModal(false)}>
          <DialogPanel
            onClose={() => setShowManualModal(false)}
            labelledBy="manual-sale-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <h2 id="manual-sale-title" className="text-base font-black text-[#0b2545]">Registrar Venta Rápida</h2>
            <form onSubmit={handleManualSale} className="space-y-3">
              <div>
                <label htmlFor="manual-sale-amount" className="text-xs font-bold text-[#0b2545]">Monto en Soles (S/)</label>
                <input
                  id="manual-sale-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full mt-1 p-2.5 rounded-xl border border-[#c5c5d6] text-sm font-bold focus:outline-none focus:border-[#1a3bb0]"
                />
              </div>
              <div>
                <label htmlFor="manual-sale-concept" className="text-xs font-bold text-[#0b2545]">Concepto (opcional)</label>
                <input
                  id="manual-sale-concept"
                  type="text"
                  maxLength={80}
                  value={manualConcept}
                  onChange={(e) => setManualConcept(e.target.value)}
                  placeholder="Ej. Blusa blanca, 2 sacos de arroz"
                  className="w-full mt-1 p-2.5 rounded-xl border border-[#c5c5d6] text-sm focus:outline-none focus:border-[#1a3bb0]"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-[#4a5f7e] font-bold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#1a3bb0] text-white font-bold text-xs rounded-xl shadow-md"
                >
                  Guardar Venta
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      )}

      {/* OCR Scanner Modal (Android APK & Mobile Ready) */}
    </div>
  );
};
