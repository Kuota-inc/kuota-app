import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Clock, Landmark, LogOut, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../api/client';

interface ProviderProfile {
  id: string;
  business_name: string | null;
  ruc_masked: string | null;
  category: string | null;
  kyc_status: string | null;
  fee_bps: number | null;
  approved_limit_cents: number | null;
  settlement: { bank: string | null; account_masked: string | null } | null;
  whatsapp_masked: string | null;
}

const STATUS: Record<string, { label: string; tone: string; icon: React.ReactNode; hint: string }> = {
  APPROVED: {
    label: 'Verificado',
    tone: 'bg-emerald-100 text-emerald-800',
    icon: <CheckCircle2 size={14} />,
    hint: 'Tu empresa ya puede recibir pedidos de comercios afiliados.'
  },
  IN_REVIEW: {
    label: 'En revisión',
    tone: 'bg-amber-100 text-amber-900',
    icon: <Clock size={14} />,
    hint: 'Estamos validando tu empresa. Te avisaremos por WhatsApp cuando termine.'
  }
};

export const ProviderHomeScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<ProviderProfile>('/providers/me')
      .then(setProfile)
      .catch((e: any) => setError(e?.message || 'No pudimos cargar tu perfil.'));
  }, []);

  const st = STATUS[profile?.kyc_status ?? 'IN_REVIEW'] ?? STATUS.IN_REVIEW;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd]">
      <div className="px-4.5 pt-6 pb-8 bg-gradient-to-br from-[#00248b] to-[#1a3bb0] text-white rounded-b-3xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
            <Building2 size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-white/80">Panel de proveedor</p>
            <h1 className="text-lg font-black leading-tight truncate">{profile?.business_name || 'Tu empresa'}</h1>
          </div>
        </div>
        <span className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${st.tone}`}>
          {st.icon}
          {st.label}
        </span>
        <p className="mt-2 text-sm text-white/90 leading-snug">{st.hint}</p>
      </div>

      <div className="px-4.5 -mt-4 space-y-3 pb-6">
        {error && <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Datos de la empresa</h2>
          <Row label="RUC" value={profile?.ruc_masked} />
          <Row label="Rubro" value={profile?.category} />
          <Row label="WhatsApp" value={profile?.whatsapp_masked} />
          <Row label="Tarifa" value={profile?.fee_bps != null ? `${(profile.fee_bps / 100).toFixed(2)} %` : null} />
        </section>

        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-1.5">
            <Landmark size={14} /> Cuenta de abono
          </h2>
          {profile?.settlement ? (
            <Row label={profile.settlement.bank || 'Banco'} value={profile.settlement.account_masked} />
          ) : (
            <p className="text-xs text-[#4a5f7e]">Aún no registraste una cuenta para recibir tus pagos.</p>
          )}
        </section>

        <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] flex items-start gap-2 text-[11px] text-[#2b3f66] leading-snug">
          <ShieldCheck size={16} className="shrink-0 mt-0.5 text-[#1a3bb0]" />
          <span>Tu cuenta solo puede estar abierta en un equipo a la vez. Pronto verás aquí tus pedidos y tus abonos.</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3.5 rounded-2xl bg-white border border-[#e1e8f8] text-red-600 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-[#4a5f7e]">{label}</span>
    <span className="font-bold text-[#151c27] text-right break-all">{value || '—'}</span>
  </div>
);
