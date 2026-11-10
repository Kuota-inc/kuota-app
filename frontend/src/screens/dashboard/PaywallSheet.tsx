import React, { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ApiError } from '../../api/client';
import { profilesApi } from '../../api/profiles';
import { FEE_PCT } from '../../config/fee';
import { useDialog } from '../../hooks/useDialog';

/** Paywall de Kuota Payments. Solo bloquea Vender: omitirlo no cierra Comprar, el inventario ni el historial. */
export const PaywallSheet: React.FC<{ onClose: () => void; onActivated: () => void }> = ({ onClose, onActivated }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { enabled: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await profilesApi.activateSales('BASIC');
      onActivated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos activar Kuota Payments.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/45" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Activar Kuota Payments" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-7 space-y-3">
        <h2 className="text-lg font-black text-[#0b2545]">Cobra con tarjeta, Yape y Plin</h2>
        <p className="text-sm text-[#4a5f7e] leading-snug">Activa Kuota Payments y genera links de cobro con una comisión más baja que un POS.</p>

        <div className="p-4 rounded-2xl bg-[#eff3ff] border border-[#c5cfe8]">
          <p className="text-[11px] font-black text-[#1a3bb0] uppercase tracking-wider">Plan Basic</p>
          <p className="text-2xl font-black text-[#0b2545]">S/ 80 <span className="text-sm font-bold text-[#4a5f7e]">+ IGV al mes</span></p>
          <ul className="mt-2 space-y-1 text-[13px] text-[#0b2545]">
            {[`Comisión ${FEE_PCT} % + IGV por cobro (mínimo S/ 4.50 + IGV)`, 'Hasta S/ 5,000 por transacción', 'Liquidación en 48 horas hábiles'].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 size={15} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[#4a5f7e]">Modo de pruebas: hoy no se cobra la suscripción.</p>
        </div>

        {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void activate()} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-sm cursor-pointer disabled:opacity-60">
          {busy ? 'Activando…' : 'Activar Kuota Payments'}
        </button>
        <button type="button" onClick={onClose} className="w-full py-2 text-sm font-bold text-[#4a5f7e] cursor-pointer">Ahora no</button>
      </div>
    </div>
  );
};
