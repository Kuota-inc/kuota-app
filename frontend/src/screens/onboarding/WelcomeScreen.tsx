import { API_ORIGIN } from '../../api/client';
import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { CheckCircle2, ShieldCheck, Sparkles, Building2, Store, KeyRound } from 'lucide-react';

interface WelcomeScreenProps {
  onSelectRole: (role: 'MERCHANT' | 'PROVIDER', sessionId: string) => void;
  onLogin: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectRole, onLogin }) => {
  const [stats, setStats] = useState({ active_businesses: 18500 });

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error);
  }, []);

  const handleChoose = (role: 'MERCHANT' | 'PROVIDER') => {
    // Instantaneous optimistic navigation (0ms tap lag)
    const optimisticSessionId = `ses_${role.toLowerCase()}_${Date.now()}`;
    onSelectRole(role, optimisticSessionId);

    // Sync session creation in background
    api.createSession(role).catch((err) => {
      console.warn('Session background sync note:', err);
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4.5 bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd] overflow-y-auto">
      {/* Top Brand & Community Badge */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <img
            src="/brand/Kuotalogotiposvg.svg"
            alt="Kuota"
            className="h-9 object-contain drop-shadow-sm"
          />
        </div>

        {/* Community counter */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/80 backdrop-blur rounded-full border border-[#c5c5d6]/50 shadow-xs">
          <Sparkles size={13} className="text-[#1a3bb0]" />
          <span className="text-[11px] font-semibold text-[#0b2545]">
            Comunidad activa · +{stats.active_businesses.toLocaleString()} negocios
          </span>
        </div>

        {/* Hero Title & Subtitle */}
        <div className="pt-1">
          <h1 className="text-2xl font-black text-[#0b2545] tracking-tight leading-tight">
            El crédito inteligente para tu comercio
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1.5 leading-relaxed">
            Financia mercadería con proveedores aliados, cobra a tus clientes al 1% y haz crecer tu capital sin trámites bancarios.
          </p>
        </div>

        {/* Trust Badges */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="p-2.5 bg-white/70 rounded-2xl border border-blue-100 flex items-center gap-2 shadow-xs">
            <ShieldCheck size={18} className="text-[#1a3bb0] shrink-0" />
            <div className="text-[10px] font-semibold text-[#0b2545] leading-tight">
              Aprobación en 5 minutos
            </div>
          </div>
          <div className="p-2.5 bg-white/70 rounded-2xl border border-blue-100 flex items-center gap-2 shadow-xs">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <div className="text-[10px] font-semibold text-[#0b2545] leading-tight">
              Cero aval · 100% digital
            </div>
          </div>
        </div>
      </div>

      {/* Role Selector Actions */}
      <div className="space-y-2.5 pt-3 pb-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#4a5f7e] text-center mb-0.5">
          Elige cómo deseas operar
        </div>

        {/* Merchant Card */}
        <button
          onClick={() => handleChoose('MERCHANT')}
          className="w-full text-left p-3.5 bg-white rounded-2xl border-2 border-transparent hover:border-[#1a3bb0] shadow-md shadow-blue-900/5 active:scale-[0.98] transition group relative overflow-hidden cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#eff3ff] group-hover:bg-[#1a3bb0] text-[#1a3bb0] group-hover:text-white transition flex items-center justify-center shrink-0">
              <Store size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#0b2545]">Soy emprendedor</span>
                <span className="text-[10px] font-bold text-[#1a3bb0] bg-blue-50 px-2 py-0.5 rounded-full">
                  Línea S/ 1,400
                </span>
              </div>
              <p className="text-[11px] text-[#4a5f7e] mt-0.5 leading-snug">
                Compro mercadería al crédito y cobro con link al 1%
              </p>
            </div>
          </div>
        </button>

        {/* Provider Card */}
        <button
          onClick={() => handleChoose('PROVIDER')}
          className="w-full text-left p-3.5 bg-white rounded-2xl border-2 border-transparent hover:border-[#1a3bb0] shadow-md shadow-blue-900/5 active:scale-[0.98] transition group relative overflow-hidden cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#eff3ff] group-hover:bg-[#0b2545] text-[#0b2545] group-hover:text-white transition flex items-center justify-center shrink-0">
              <Building2 size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#0b2545]">Soy proveedor</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Tarifa 1.00%
                </span>
              </div>
              <p className="text-[11px] text-[#4a5f7e] mt-0.5 leading-snug">
                Vendo al por mayor y recibo abono inmediato garantizado
              </p>
            </div>
          </div>
        </button>

        {/* Ya tengo cuenta */}
        <button
          type="button"
          onClick={onLogin}
          className="w-full py-3 rounded-2xl border-2 border-[#1a3bb0]/20 bg-white/60 hover:bg-white text-[#1a3bb0] font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
        >
          <KeyRound size={15} />
          <span>Ya tengo cuenta · Iniciar sesión</span>
        </button>

        {/* Legal disclaimer */}
        <p className="text-[11.5px] leading-relaxed text-center text-[#4a5f7e] px-2 pb-1">
          Al continuar, aceptas nuestros{' '}
          <a href={`${API_ORIGIN}/legal/terminos`} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[#1a3bb0] hover:text-[#00248b]">Términos</a> y la{' '}
          <a href={`${API_ORIGIN}/legal/privacidad`} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[#1a3bb0] hover:text-[#00248b]">Privacidad</a>.
        </p>
      </div>
    </div>
  );
};
