import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

/** Pantalla de espera o de error con "Reintentar". Reemplaza a los datos de ejemplo: en una app de dinero nunca se muestran cifras inventadas. */
export const LoadState: React.FC<{ error?: boolean; onRetry?: () => void }> = ({ error = false, onRetry }) => (
  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-[#f9f9ff]" role={error ? 'alert' : 'status'} aria-live="polite">
    {error ? (
      <>
        <span className="w-14 h-14 rounded-full bg-[#eff3ff] text-[#1a3bb0] flex items-center justify-center"><WifiOff size={26} aria-hidden="true" /></span>
        <div>
          <p className="font-black text-[#0b2545]">No pudimos cargar tus datos</p>
          <p className="text-xs text-[#4a5f7e] mt-1 max-w-[260px]">Revisa tu conexión a internet e inténtalo otra vez. No mostramos cifras hasta confirmarlas.</p>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="h-11 px-5 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white text-sm font-bold flex items-center gap-2 cursor-pointer active:scale-[0.98] transition">
            <RefreshCw size={15} aria-hidden="true" /> Reintentar
          </button>
        )}
      </>
    ) : (
      <>
        <span className="w-9 h-9 border-[3px] border-[#1a3bb0] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <span className="text-xs font-semibold text-[#4a5f7e]">Cargando Kuota…</span>
      </>
    )}
  </div>
);
