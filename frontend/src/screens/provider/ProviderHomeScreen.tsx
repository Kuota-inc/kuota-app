import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, ChevronRight, Clock, Landmark, LogOut, Package, QrCode, ShieldCheck, Zap } from 'lucide-react';
import { api, apiRequest, getMerchantId } from '../../api/client';
import { paymentsApi } from '../../api/payments';
import type { PaymentLink } from '../../api/payments';
import { ProfileSwitcher } from '../../components/ProfileSwitcher';

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

interface Order {
  id: string;
  customer: string;
  total_cents: number;
  installments_count: number;
  status: string;
  issued_at: string;
  settled: boolean;
}

const BANKS = ['BCP', 'Interbank', 'Scotiabank', 'BBVA', 'Banco de la Nación', 'BanBif'];

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

function soles(cents: number) {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

export const ProviderHomeScreen: React.FC<{ onLogout: () => void; onSell: () => void }> = ({ onLogout, onSell }) => {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cuenta de abono
  const [showSettForm, setShowSettForm] = useState(false);
  const [settBank, setSettBank] = useState('BCP');
  const [settCci, setSettCci] = useState('');
  const [settPin, setSettPin] = useState('');
  const [settSaving, setSettSaving] = useState(false);
  const [settError, setSettError] = useState<string | null>(null);

  // Pedidos
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [orderSummary, setOrderSummary] = useState<{ count: number; total_cents: number; settled_count: number } | null>(null);

  // Cobros (Kuota Payments)
  const [links, setLinks] = useState<PaymentLink[] | null>(null);

  useEffect(() => {
    api.getProviderOrders()
      .then((r: any) => { setOrders(r.orders); setOrderSummary(r.summary); })
      .catch(() => {/* no-op: no bloquea el panel */});

    if (getMerchantId()) {
      paymentsApi.listLinks()
        .then((r) => setLinks(r.data))
        .catch(() => {/* no-op */});
    }
  }, []);

  useEffect(() => {
    apiRequest<ProviderProfile>('/providers/me')
      .then(setProfile)
      .catch((e: any) => setError(e?.message || 'No pudimos cargar tu perfil.'));
  }, []);

  const handleSaveSettlement = async () => {
    setSettError(null);
    if (settCci.replace(/[\s-]/g, '').length !== 20) {
      setSettError('El CCI tiene 20 dígitos. Cópialo de tu banca por internet.');
      return;
    }
    if (!/^\d{6}$/.test(settPin)) {
      setSettError('Ingresa tu PIN de 6 dígitos.');
      return;
    }
    setSettSaving(true);
    try {
      const res = await api.saveSettlementAccount({ bank: settBank, cci: settCci, pin: settPin });
      setProfile((p) => p ? { ...p, settlement: { bank: res.bank, account_masked: res.account_masked } } : p);
      setShowSettForm(false);
      setSettCci('');
      setSettPin('');
    } catch (e: any) {
      setSettError(e?.message || 'No pudimos guardar la cuenta.');
    } finally {
      setSettSaving(false);
    }
  };

  const st = STATUS[profile?.kyc_status ?? 'IN_REVIEW'] ?? STATUS.IN_REVIEW;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd]">
      <div className="px-4.5 pt-6 pb-8 bg-gradient-to-br from-[#00248b] to-[#1a3bb0] text-white rounded-b-3xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
            <Building2 size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/80">Panel de proveedor</p>
            <h1 className="text-lg font-black leading-tight break-words">{profile?.business_name || 'Tu empresa'}</h1>
          </div>
          <div className="shrink-0">
            <ProfileSwitcher active="PROVIDER" />
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

        <button
          type="button"
          onClick={onSell}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.99]"
        >
          <QrCode size={18} /> Vender con Kuota Payments
        </button>

        {/* Datos */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Datos de la empresa</h2>
          <Row label="RUC" value={profile?.ruc_masked} />
          <Row label="Rubro" value={profile?.category} />
          <Row label="WhatsApp" value={profile?.whatsapp_masked} />
          <Row label="Tarifa por cobro" value={profile?.fee_bps != null ? `${profile.fee_bps / 100} % + IGV (mín. S/ 4.50)` : null} />
        </section>

        {/* Cuenta de abono */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-1.5">
              <Landmark size={14} /> Cuenta de abono
            </h2>
            <button
              type="button"
              onClick={() => { setShowSettForm((v) => !v); setSettError(null); }}
              className="text-[11px] font-bold text-[#1a3bb0] flex items-center gap-0.5"
            >
              {profile?.settlement ? 'Editar' : 'Registrar'}
              {showSettForm ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>

          {profile?.settlement ? (
            <Row label={profile.settlement.bank || 'Banco'} value={profile.settlement.account_masked} />
          ) : (
            <p className="text-xs text-[#4a5f7e]">Aún no registraste una cuenta para recibir tus pagos.</p>
          )}

          {showSettForm && (
            <div className="pt-2 space-y-2 border-t border-[#f0f4ff]">
              <div>
                <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Banco</label>
                <select
                  value={settBank}
                  onChange={(e) => setSettBank(e.target.value)}
                  className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27]"
                >
                  {BANKS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">CCI (20 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={24}
                  placeholder="002 123 456789012345 00"
                  value={settCci}
                  onChange={(e) => setSettCci(e.target.value)}
                  className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Tu PIN de 6 dígitos</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={settPin}
                  onChange={(e) => setSettPin(e.target.value)}
                  className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]"
                />
              </div>
              {settError && <p className="text-xs text-red-600">{settError}</p>}
              <button
                type="button"
                disabled={settSaving}
                onClick={handleSaveSettlement}
                className="w-full py-2.5 rounded-xl bg-[#00248b] text-white text-sm font-bold disabled:opacity-60"
              >
                {settSaving ? 'Guardando…' : 'Guardar cuenta'}
              </button>
            </div>
          )}
        </section>

        {/* Mis pedidos */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-1.5">
            <Package size={14} /> Mis pedidos
          </h2>
          {orderSummary && (
            <div className="flex gap-3 text-center">
              <Stat label="Pedidos" value={String(orderSummary.count)} />
              <Stat label="Total" value={soles(orderSummary.total_cents)} />
              <Stat label="Liquidados" value={String(orderSummary.settled_count)} />
            </div>
          )}
          {orders && orders.length === 0 && (
            <p className="text-xs text-[#4a5f7e]">Aún no tienes pedidos de comercios afiliados.</p>
          )}
          {orders && orders.length > 0 && (
            <div className="space-y-2">
              {orders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#151c27] truncate">{o.customer}</p>
                    <p className="text-[#4a5f7e]">{o.installments_count} cuotas · {new Date(o.issued_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-[#151c27]">{soles(o.total_cents)}</p>
                    <p className={`font-semibold ${o.settled ? 'text-emerald-600' : 'text-amber-600'}`}>{o.settled ? 'Liquidado' : 'Pendiente'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {orders === null && <p className="text-xs text-[#4a5f7e]">Cargando…</p>}
        </section>

        {/* Mis cobros */}
        {getMerchantId() && (
          <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
            <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={14} /> Mis cobros (Kuota Payments)
            </h2>
            {links === null && <p className="text-xs text-[#4a5f7e]">Cargando…</p>}
            {links && links.length === 0 && (
              <p className="text-xs text-[#4a5f7e]">Aún no generaste ningún link de cobro.</p>
            )}
            {links && links.length > 0 && (
              <div className="space-y-2">
                {links.slice(0, 5).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#151c27] truncate">{l.concept || 'Cobro'}</p>
                      <p className="text-[#4a5f7e]">{new Date(l.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-[#151c27]">{soles(l.amount_cents)}</p>
                      <p className={`font-semibold ${l.status === 'PAID' ? 'text-emerald-600' : l.status === 'EXPIRED' ? 'text-red-500' : 'text-amber-600'}`}>
                        {l.status === 'PAID' ? 'Pagado' : l.status === 'EXPIRED' ? 'Expirado' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] flex items-start gap-2 text-[11px] text-[#2b3f66] leading-snug">
          <ShieldCheck size={16} className="shrink-0 mt-0.5 text-[#1a3bb0]" />
          <span>Tu cuenta solo puede estar abierta en un equipo a la vez. Vendes con la misma clave en tus dos perfiles.</span>
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

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex-1 bg-[#f4f7ff] rounded-xl p-2 text-center">
    <p className="text-[11px] text-[#4a5f7e]">{label}</p>
    <p className="font-black text-[#151c27] text-sm">{value}</p>
  </div>
);
