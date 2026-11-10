import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api, apiRequest } from '../api/client';
import { useToast } from './toast-context';

interface Plan {
  id: 'BASIC' | 'PRO';
  name: string;
  price_with_igv_cents: number;
  price_cents: number;
  features: string[];
}
interface PlanView {
  current: 'BASIC' | 'PRO';
  plans: Plan[];
}

const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;

/** Plan de suscripción (Basic / Pro). El cobro de la suscripción se activa cuando haya banco real. */
export const PlanPanel: React.FC = () => {
  const toast = useToast();
  const [view, setView] = useState<PlanView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.getPlan().then(setView).catch(() => setView(null));
  }, []);

  if (!view) return null;

  const choose = async (id: 'BASIC' | 'PRO') => {
    if (busy || id === view.current) return;
    setBusy(true);
    try {
      setView(await api.setPlan(id));
      toast.success(`Plan ${id === 'PRO' ? 'Pro' : 'Basic'} activado.`);
    } catch (e: any) {
      toast.error(e?.message || 'No pudimos cambiar tu plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
      <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Tu plan de cobros</h3>
      <div className="space-y-2">
        {view.plans.map((p) => {
          const active = p.id === view.current;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              disabled={busy}
              aria-pressed={active}
              className={`w-full text-left rounded-2xl p-3 border-2 cursor-pointer ${active ? 'border-[#1a3bb0] bg-[#eff3ff]' : 'border-[#e1e8f8] bg-white'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#0b2545]">{p.name}</span>
                <span className="text-sm font-black text-[#0b2545]">
                  {soles(p.price_cents)} <span className="text-[11px] font-bold text-[#4a5f7e]">+ IGV al mes</span>
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {p.features.map((f) => (
                  <li key={f} className="text-[12px] text-[#4a5f7e] flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-700 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {active && <p className="mt-1.5 text-[11px] font-black text-[#1a3bb0]">Plan actual</p>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[#4a5f7e] leading-relaxed">
        Cada cobro: 1 % + IGV, con comisión mínima de S/ 4.50 + IGV. La suscripción se cobrará cuando se conecte el banco; por ahora es en modo simulado.
      </p>
    </section>
  );
};
