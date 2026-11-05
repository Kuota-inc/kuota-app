import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { CheckCircle2, ArrowRight, CreditCard } from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface ProviderSavingsScreenProps {
  onFinish: () => void;
}

export const ProviderSavingsScreen: React.FC<ProviderSavingsScreenProps> = ({ onFinish }) => {
  const toast = useToast();
  const [savings, setSavings] = useState<any>(null);
  const [cci, setCci] = useState<string>('00219400123456789012');
  const [bank] = useState<string>('BCP');
  const [activating, setActivating] = useState<boolean>(false);
  const [savedCci, setSavedCci] = useState<boolean>(false);

  useEffect(() => {
    api.getSavingsEstimate().then(setSavings).catch(console.error);
  }, []);

  const handleSaveCci = async () => {
    if (cci.length !== 20) {
      toast.error('El código CCI debe tener exactamente 20 dígitos.');
      return;
    }
    try {
      await api.saveSettlementAccount({ bank, cci, holder_name: 'Empresa Titular', holder_doc: '20601234567' });
      setSavedCci(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar cuenta');
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await api.activateProvider();
      toast.success('¡Cuenta de Proveedor Verificado activada con éxito! Ya puedes emitir links con tarifa 1.00%.');
      onFinish();
    } catch (err: any) {
      toast.error(err.message || 'Error al activar');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="flex-1 p-5 space-y-4 bg-[#f9f9ff] flex flex-col justify-between">
      <div className="space-y-4">
        {/* Success Seal Header with bounce */}
        <div className="text-center space-y-1 pt-1">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260 }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shadow-sm"
          >
            <CheckCircle2 size={14} />
            <span>Proveedor Verificado</span>
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl font-black text-[#0b2545] tracking-tight"
          >
            ¡Tu cuenta está lista!
          </motion.h1>
          <p className="text-xs text-[#4a5f7e]">
            Ya puedes generar enlaces de cobro mayorista y emitir facturas en segundos.
          </p>
        </div>

        {/* Big Savings Breakdown Card (PRD 16) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="p-4 bg-gradient-to-br from-[#00248b] to-[#1a3bb0] rounded-3xl text-white shadow-xl space-y-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
              Ahorro anual proyectado
            </span>
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="text-xs font-extrabold bg-emerald-400 text-emerald-950 px-2.5 py-0.5 rounded-full shadow-sm"
            >
              71% de ahorro
            </motion.span>
          </div>

          <div className="text-3xl font-black tracking-tight text-white flex items-baseline">
            <span className="text-2xl mr-1 text-emerald-300">S/</span>
            <AnimatedNumber value={(savings?.savings_cents || 58800) / 100} decimals={2} />
            <span className="text-xs font-semibold text-blue-200 ml-1.5">al año</span>
          </div>
          <p className="text-[10px] text-blue-100">
            Calculado sobre una facturación estimada de S/ 24,000.00 al año.
          </p>

          {/* Comparison Table */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
            <div className="p-2.5 bg-white/10 rounded-xl space-y-0.5">
              <span className="text-[10px] text-blue-200">Mercado tradicional (3.45%)</span>
              <div className="text-sm font-bold text-red-300">Pagas S/ 828.00</div>
            </div>
            <div className="p-2.5 bg-white/15 rounded-xl border border-white/20 space-y-0.5">
              <span className="text-[10px] text-emerald-300 font-bold">Kuota Proveedor (1.00%)</span>
              <div className="text-sm font-black text-emerald-300">Solo pagas S/ 240.00</div>
            </div>
          </div>
        </motion.div>

        {/* Benefits List (PRD 16) */}
        <div className="space-y-1.5 text-xs text-[#0b2545]">
          <motion.div whileHover={{ x: 2 }} className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Comisión fija de 1.00% garantizada por contrato.</span>
          </motion.div>
          <motion.div whileHover={{ x: 2 }} className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Abono inmediato a tu cuenta bancaria sin retenciones de fin de semana.</span>
          </motion.div>
          <motion.div whileHover={{ x: 2 }} className="p-2.5 bg-white rounded-xl border border-blue-100 flex items-center gap-2 shadow-xs">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Cero costos fijos, sin mensualidades ni costo por terminal POS.</span>
          </motion.div>
        </div>

        {/* Bank Account for Instant Payout */}
        <div className="p-3 bg-white rounded-2xl border border-[#c5c5d6] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#0b2545]">
            <span className="flex items-center gap-1.5">
              <CreditCard size={15} className="text-[#1a3bb0]" />
              <span>Cuenta bancaria para abonos inmediatos (CCI)</span>
            </span>
            {savedCci && (
              <span className="text-[10px] text-emerald-700 font-bold">✓ Guardado</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              aria-label="Código de cuenta interbancario (CCI), 20 dígitos"
              value={cci}
              onChange={(e) => setCci(e.target.value.replace(/\D/g, ''))}
              placeholder="Código CCI de 20 dígitos"
              className="w-full text-xs font-mono font-bold text-[#0b2545] p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handleSaveCci}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#0b2545] rounded-xl shrink-0 cursor-pointer"
            >
              Guardar
            </motion.button>
          </div>
        </div>
      </div>

      {/* Button */}
      <div className="pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleActivate}
          disabled={activating}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{activating ? 'Activando...' : 'Empezar a vender ahora'}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
