import React from 'react';
import { Building2, Store } from 'lucide-react';
import { getActiveProfile, PROFILE_META, type ProfileKind } from '../api/profiles';

/** Tras teléfono y clave, quien tiene dos perfiles elige con cuál entrar. No se puede cerrar sin elegir. */
export const ProfileChooser: React.FC<{ onChoose: (p: ProfileKind) => void; onLogout: () => void }> = ({ onChoose, onLogout }) => {
  const last = getActiveProfile();
  const order: ProfileKind[] = ['EMPRENDEDOR', 'PROVIDER'];
  return (
    <div role="dialog" aria-modal="true" aria-label="Elige tu perfil" className="fixed inset-0 z-[70] bg-gradient-to-b from-[#00248b] to-[#1a3bb0] flex flex-col items-center justify-center px-6 text-white">
      <h1 className="text-2xl font-black tracking-tight text-center">¿Cómo quieres entrar?</h1>
      <p className="text-sm text-white/80 mt-1.5 text-center">Tu cuenta tiene dos perfiles.</p>
      <div className="mt-6 w-full max-w-sm space-y-3">
        {order.map((p) => {
          const m = PROFILE_META[p];
          const isLast = last === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChoose(p)}
              className={`w-full p-4 rounded-3xl text-left flex items-center gap-3.5 cursor-pointer bg-white text-[#0b2545] shadow-lg ${isLast ? 'ring-4 ring-white/60' : ''}`}
            >
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: m.color }}>
                {p === 'EMPRENDEDOR' ? <Store size={24} aria-hidden="true" /> : <Building2 size={24} aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-black">{m.label}</span>
                <span className="block text-[12px] text-[#4a5f7e] leading-snug">{m.hint}</span>
                {isLast && <span className="block text-[11px] font-bold mt-0.5" style={{ color: m.color }}>Último que usaste</span>}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onLogout} className="mt-6 text-sm font-bold text-white underline cursor-pointer">
        Cerrar sesión
      </button>
    </div>
  );
};
