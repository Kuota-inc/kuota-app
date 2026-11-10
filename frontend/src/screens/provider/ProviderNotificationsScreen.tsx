import React, { useState } from 'react';
import { api } from '../../api/client';
import { Bell, ShieldCheck, Zap, ArrowRight, Building2 } from 'lucide-react';

interface ProviderNotificationsScreenProps {
  onNext: () => void;
}

export const ProviderNotificationsScreen: React.FC<ProviderNotificationsScreenProps> = ({ onNext }) => {
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleGrant = async () => {
    setSubmitting(true);
    try {
      await api.saveProviderNotifications('GRANTED');
      onNext();
    } catch {
      onNext();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await api.saveProviderNotifications('SKIPPED');
      onNext();
    } catch {
      onNext();
    }
  };

  return (
    <div className="flex-1 p-5 space-y-4 bg-[#f9f9ff] flex flex-col justify-between">
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 5 de 6</span>
            <span className="text-[#1a3bb0]">Configuración Final</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-full rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-1 pt-1">
          <div className="w-12 h-12 mx-auto bg-blue-100 text-[#1a3bb0] rounded-full flex items-center justify-center">
            <Bell size={24} />
          </div>
          <h1 className="text-xl font-black text-[#0b2545] tracking-tight">
            Notificaciones y Alertas en Vivo
          </h1>
          <p className="text-xs text-[#4a5f7e]">
            Entérate al instante cuando un comerciante solicite mercadería o pague una cuota.
          </p>
        </div>

        {/* Live Provider Dashboard Preview (PRD 15) */}
        <div className="p-4 bg-gradient-to-br from-[#0b2545] to-[#1a3bb0] rounded-3xl text-white shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-blue-300" />
              <span className="text-xs font-bold truncate max-w-[170px]">
                Distribuidora Textil Andina
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
              Sincronizando 95%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur">
              <div className="text-[10px] text-blue-200">Límite Aprobado</div>
              <div className="text-base font-black text-white mt-0.5">S/ 45,000.00</div>
            </div>
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur">
              <div className="text-[10px] text-blue-200">Comercios Asociados</div>
              <div className="text-base font-black text-white mt-0.5">38 clientes</div>
            </div>
          </div>

          <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10 text-[10px] flex items-center justify-between">
            <span className="truncate">Abarrotes San Juan · Orden #KQ-8912</span>
            <span className="font-bold text-emerald-300 shrink-0 ml-1">S/ 340.00</span>
          </div>
        </div>

        {/* 3 Pillars */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
            <Zap size={16} className="text-amber-500 mx-auto mb-1" />
            <div className="font-bold text-[#0b2545] text-[11px]">Alertas 0s</div>
            <div className="text-[10px] text-[#4a5f7e]">En tiempo real</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
            <ShieldCheck size={16} className="text-[#1a3bb0] mx-auto mb-1" />
            <div className="font-bold text-[#0b2545] text-[11px]">100% Seguro</div>
            <div className="text-[10px] text-[#4a5f7e]">Datos cifrados</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
            <Bell size={16} className="text-emerald-700 mx-auto mb-1" />
            <div className="font-bold text-[#0b2545] text-[11px]">Cero Spam</div>
            <div className="text-[10px] text-[#4a5f7e]">Solo operaciones</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-3 pb-1">
        <button
          onClick={handleGrant}
          disabled={submitting}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <span>Permitir notificaciones</span>
          <ArrowRight size={16} />
        </button>

        <button
          onClick={handleSkip}
          className="w-full py-2 text-xs font-bold text-[#4a5f7e] hover:text-[#0b2545] transition"
        >
          Ahora no, configurar luego
        </button>
      </div>
    </div>
  );
};
