import React, { useState, useEffect, useRef } from 'react';
import { FEE_PCT } from '../../config/fee';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { X, ShoppingBag, QrCode, Calculator, ArrowRight } from 'lucide-react';
import { useToast } from '../../components/toast-context';
import { useDialog } from '../../hooks/useDialog';

interface KuotearModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTo: (screenKey: string) => void;
}

const DEFAULT_KUOTEAR_DATA = {
  line: {
    available_cents: 95000,
    total_cents: 140000
  },
  benefits: [
    { text: 'Sin cobro de comisiones sorpresa' },
    { text: 'Abono directo a cuenta del mayorista' }
  ]
};

export const KuotearModal: React.FC<KuotearModalProps> = ({ isOpen, onClose, onNavigateTo }) => {
  const toast = useToast();
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, onClose, { enabled: isOpen });
  const [data, setData] = useState<any>(DEFAULT_KUOTEAR_DATA);
  const [activeTab, setActiveTab] = useState<'menu' | 'simulator'>('menu');
  const [simAmount, setSimAmount] = useState<string>('236');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [loadingSim, setLoadingSim] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      api.getKuotearModal().then(setData).catch(console.error);
    }
  }, [isOpen]);

  const handleSimulate = async () => {
    const amount = parseFloat(simAmount);
    if (!amount || amount <= 0) return;
    setLoadingSim(true);
    try {
      const res = await api.simulatePlan(Math.round(amount * 100), 3);
      setSimulationResult(res);
    } catch (err: any) {
      toast.error(err.message || 'Error en la simulación');
    } finally {
      setLoadingSim(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop with Fade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
          />

          {/* Spring Bottom Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Kuotear: comprar o vender"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative bg-[#f9f9ff] w-full rounded-t-[36px] p-5 space-y-4 shadow-2xl border-t border-white/40 max-h-[90%] overflow-y-auto z-10"
          >
            {/* Drag Handle & Close */}
            <div className="flex justify-between items-center">
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto"></div>
              <motion.button
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.1 }}
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={18} aria-hidden="true" />
              </motion.button>
            </div>

            {/* Header Summary with Animated Balance */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="p-4 bg-gradient-to-br from-[#00248b] to-[#1a3bb0] rounded-3xl text-white shadow-lg space-y-2 relative overflow-hidden"
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                  Línea Kuota Activa
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                  {data?.score?.value || 720} pts · {data?.score?.label || 'Bueno'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black">
                  S/ <AnimatedNumber value={(data?.credit?.available_cents || 140000) / 100} decimals={2} />
                </div>
                <span className="text-xs text-blue-100 font-semibold">Disponible para compras</span>
              </div>
            </motion.div>

            {activeTab === 'menu' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-[#4a5f7e]">
                    Selector de Operación: Comprar o Vender
                  </div>
                  <span className="text-[10px] text-[#1a3bb0] font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                    2 opciones
                  </span>
                </div>

                {/* Option 1: Comprar al crédito */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ y: -2 }}
                  onClick={() => {
                    onClose();
                    onNavigateTo('buy_on_credit');
                  }}
                  className="w-full p-4 bg-white rounded-2xl border-2 border-blue-100 hover:border-[#1a3bb0] shadow-sm flex items-center justify-between text-left group transition cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#eff3ff] to-[#d8e2ff] text-[#1a3bb0] group-hover:bg-[#1a3bb0] group-hover:text-white transition-all flex items-center justify-center shrink-0 shadow-xs">
                      <ShoppingBag size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-[#0b2545] tracking-tight">
                          Comprar mercadería al crédito
                        </span>
                        <span className="text-[10px] font-black uppercase bg-blue-100 text-[#1a3bb0] px-1.5 py-0.2 rounded">
                          Plan 3X
                        </span>
                      </div>
                      <div className="text-[11px] text-[#4a5f7e] mt-0.5 leading-snug">
                        Financia tus compras mayoristas en 3 cuotas con tu línea Kuota disponible.
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-50 group-hover:bg-[#1a3bb0] text-[#1a3bb0] group-hover:text-white flex items-center justify-center shrink-0 transition ml-2">
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
                  </div>
                </motion.button>

                {/* Option 2: Vender y cobrar */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ y: -2 }}
                  onClick={() => {
                    onClose();
                    onNavigateTo('payment_link');
                  }}
                  className="w-full p-4 bg-white rounded-2xl border-2 border-emerald-100 hover:border-emerald-600 shadow-sm flex items-center justify-between text-left group transition cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-all flex items-center justify-center shrink-0 shadow-xs">
                      <QrCode size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-[#0b2545] tracking-tight">
                          Vender y cobrar a clientes
                        </span>
                        <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                          Tarifa {FEE_PCT}%
                        </span>
                      </div>
                      <div className="text-[11px] text-[#4a5f7e] mt-0.5 leading-snug">
                        Genera links de cobro para Yape, Plin y tarjetas con acreditación al instante.
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover:bg-emerald-600 text-emerald-700 group-hover:text-white flex items-center justify-center shrink-0 transition ml-2">
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
                  </div>
                </motion.button>

                {/* Option 3: Simulate before buying (Quick helper) */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setActiveTab('simulator');
                    handleSimulate();
                  }}
                  className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-center text-xs font-bold text-[#4a5f7e] hover:text-[#0b2545] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Calculator size={15} className="text-amber-700" />
                  <span>¿Deseas simular tus 3 cuotas antes de comprar?</span>
                </motion.button>
              </div>
            ) : (
              /* Simulator view with spring transition */
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#0b2545]">Simulador Plan Kuota 3X</span>
                  <button
                    onClick={() => setActiveTab('menu')}
                    className="text-xs font-bold text-[#1a3bb0] underline"
                  >
                    Volver
                  </button>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-[#c5c5d6] space-y-2 shadow-sm">
                  <label className="text-xs font-bold text-[#0b2545]">Monto de la compra (S/)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      className="w-full text-base font-bold text-[#0b2545] p-2 border border-slate-200 rounded-xl focus:outline-none"
                    />
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSimulate}
                      disabled={loadingSim}
                      className="px-4 py-2 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                    >
                      {loadingSim ? '...' : 'Calcular'}
                    </motion.button>
                  </div>
                </div>

                {simulationResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-white rounded-2xl border border-blue-100 shadow-sm space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-blue-50/50 rounded-xl">
                        <span className="text-[10px] text-[#4a5f7e]">Cuota inicial ({simulationResult.down_payment_pct}%)</span>
                        <div className="font-extrabold text-[#0b2545]">
                          S/ {(simulationResult.down_payment_cents / 100).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 bg-blue-50/50 rounded-xl">
                        <span className="text-[10px] text-[#4a5f7e]">Saldo financiado</span>
                        <div className="font-extrabold text-[#1a3bb0]">
                          S/ {(simulationResult.financed_cents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      <div className="text-[11px] font-bold text-[#0b2545]">Cronograma de 3 cuotas quincenales:</div>
                      {simulationResult.schedule.map((item: any) => (
                        <div key={item.number} className="flex justify-between items-center text-xs py-1 border-b border-slate-50">
                          <span className="text-[#4a5f7e]">Cuota {item.number} ({item.due_date})</span>
                          <span className="font-extrabold text-[#0b2545]">S/ {(item.amount_cents / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
