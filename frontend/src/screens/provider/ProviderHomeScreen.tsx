import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock, Home, Info, Fingerprint, Landmark, LogOut, PiggyBank, Plus, Search, ShieldCheck, TrendingUp, User, Users, Wallet, X } from 'lucide-react';
import { api, apiRequest, getMerchantId } from '../../api/client';
import { paymentsApi } from '../../api/payments';
import type { PaymentLink } from '../../api/payments';
import { ProfileSwitcher, SWITCH_EVENT } from '../../components/ProfileSwitcher';
import { useDialog } from '../../hooks/useDialog';
import { VenderSheet } from '../../components/VenderSheet';
import { Avatar } from '../../components/Avatar';
import { PhotoSourceSheet } from '../../components/PhotoSourceSheet';
import { photoToAvatar } from '../../utils/image';
import { biometricPinAvailable, pinFromBiometric } from '../../services/biometricPin';
import { useToast } from '../../components/toast-context';

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
  avatar_url?: string | null;
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

interface SaleItem {
  id: string;
  who: string;
  channel: string;
  at: string;
  cents: number;
  feeCents: number;
  netCents: number;
  status: 'Por confirmar' | 'Liquidado' | 'Por cobrar' | 'Anulado' | 'Fallido' | 'Vencido';
  tone: string;
  detail: string;
  ok: boolean;
  overdue?: boolean;
  paidAt?: string | null;
  settledAt?: string | null;
  etaAt?: string | null;
  kind: 'PAYMENT_LINK' | 'AKUOTAS_ORDER';
}

type Tab = 'inicio' | 'ventas' | 'clientes' | 'perfil' | 'cuenta';
type Period = 'week' | 'month' | 'all';

const BANKS = ['BCP', 'Interbank', 'Scotiabank', 'BBVA', 'Banco de la Nación', 'BanBif'];
const PERIODS: [Period, string][] = [['week', 'Semana'], ['month', 'Mes'], ['all', 'Total acumulado']];

const STATUS: Record<string, { label: string; tone: string; icon: React.ReactNode; hint: string }> = {
  APPROVED: { label: 'Verificado', tone: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={14} />, hint: 'Tu empresa ya puede recibir pedidos de comercios afiliados.' },
  IN_REVIEW: { label: 'En revisión', tone: 'bg-amber-100 text-amber-900', icon: <Clock size={14} />, hint: 'Estamos validando tu empresa. Te avisaremos por WhatsApp cuando termine.' }
};

const soles = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
const sinceOf = (p: Period) => (p === 'week' ? Date.now() - 7 * 864e5 : p === 'month' ? Date.now() - 30 * 864e5 : 0);

const Hero: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-[28px] p-5 text-white bg-gradient-to-br from-[#00248b] to-[#1a3bb0] shadow-lg shadow-blue-900/20 space-y-3">{children}</section>
);

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-[#4a5f7e]">{label}</span>
    <span className="font-bold text-[#151c27] text-right">{value || '—'}</span>
  </div>
);

const Card: React.FC<{ title?: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
    {title && <h2 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-1.5">{icon}{title}</h2>}
    {children}
  </section>
);


const Empty: React.FC<{ text: string; loading: boolean }> = ({ text, loading }) => <p className="text-xs text-[#4a5f7e]">{loading ? 'Cargando…' : text}</p>;

export const ProviderHomeScreen: React.FC<{ onLogout: () => void; onSell: () => void }> = ({ onLogout, onSell }) => {
  const [tab, setTab] = useState<Tab>('inicio');
  const [period, setPeriod] = useState<Period>('all');
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [links, setLinks] = useState<PaymentLink[] | null>(null);
  const [q, setQ] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  const [venderOpen, setVenderOpen] = useState(false);
  const [actModal, setActModal] = useState(false);
  const [concView, setConcView] = useState(false);
  const [concSel, setConcSel] = useState<SaleItem | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [bioPin, setBioPin] = useState(false);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    void biometricPinAvailable().then(setBioPin);
  }, []);
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, () => setSel(null), { enabled: sel !== null });

  // Cuenta de abono
  const [showSettForm, setShowSettForm] = useState(false);
  const [settBank, setSettBank] = useState('BCP');
  const [settCci, setSettCci] = useState('');
  const [settPin, setSettPin] = useState('');
  const [settSaving, setSettSaving] = useState(false);
  const [settError, setSettError] = useState<string | null>(null);

  const mergeUniqueLinks = (incoming: PaymentLink[]) => {
    const map = new Map<string, PaymentLink>();
    for (const item of incoming) {
      if (item?.id) map.set(item.id, item);
    }
    return [...map.values()];
  };

  const loadProviderData = async (silent = true) => {
    let loadedLinksFromProvider = false;
    try {
      const r: any = await api.getProviderOrders();
      if (Array.isArray(r?.orders)) setOrders(r.orders);
      else setOrders((prev) => prev ?? []);
      if (Array.isArray(r?.payment_links)) {
        setLinks(mergeUniqueLinks(r.payment_links));
        setNeedsPin(false);
        loadedLinksFromProvider = true;
      }
    } catch {
      setOrders((prev) => prev ?? []);
    }

    if (getMerchantId()) {
      try {
        const res = await paymentsApi.listLinks(silent);
        setLinks(mergeUniqueLinks(res.data));
        setNeedsPin(false);
      } catch (e: any) {
        if (!loadedLinksFromProvider) {
          if (e?.code === 'SESSION_REQUIRED') setNeedsPin(true);
          setLinks((prev) => prev ?? []);
        }
      }
    } else if (!loadedLinksFromProvider) {
      setLinks((prev) => prev ?? []);
    }
  };

  useEffect(() => {
    apiRequest<ProviderProfile>('/providers/me').then(setProfile).catch((e: any) => setError(e?.message || 'No pudimos cargar tu perfil.'));
    void loadProviderData(true);
    const onSession = () => void loadProviderData(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadProviderData(true);
    };
    window.addEventListener('kuota:payments-session', onSession);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('kuota:payments-session', onSession);
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSandboxSettle = async () => {
    setSettling(true);
    try {
      const r = await paymentsApi.sandboxSettle();
      toast.success(
        r.settled > 0
          ? `${r.settled} cobro${r.settled === 1 ? '' : 's'} liquidado${r.settled === 1 ? '' : 's'}.`
          : 'Ningún cobro superó aún la ventana de 5 min en sandbox.'
      );
      await loadProviderData(true);
    } catch {
      toast.error('Error al simular liquidación.');
    } finally {
      setSettling(false);
    }
  };

  // Se recarga la fuente única de verdad al cambiar entre Inicio, Ventas y Conciliación.
  useEffect(() => {
    void loadProviderData(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, concView]);

  // Foto: se recorta y se reduce en el teléfono (sin ubicación); la ven quienes te pagan o te buscan por celular.
  const handlePhoto = async (file: File) => {
    try {
      const r = await api.setProviderAvatar(await photoToAvatar(file));
      setProfile((p) => (p ? { ...p, avatar_url: r.avatar_url } : p));
      toast.success('Foto actualizada. Ya la ven quienes te pagan.');
    } catch (e: any) {
      toast.error(e?.message || 'No pudimos guardar la foto.');
    }
  };
  const removePhoto = async () => {
    try {
      await api.removeProviderAvatar();
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
      toast.success('Quitaste tu foto.');
    } catch (e: any) {
      toast.error(e?.message || 'No pudimos quitar la foto.');
    }
  };

  const handleSaveSettlement = async () => {
    setSettError(null);
    if (settCci.replace(/[\s-]/g, '').length !== 20) return setSettError('El CCI tiene 20 dígitos. Cópialo de tu banca por internet.');
    if (!/^\d{6}$/.test(settPin)) return setSettError('Ingresa tu PIN de 6 dígitos.');
    setSettSaving(true);
    try {
      const res = await api.saveSettlementAccount({ bank: settBank, cci: settCci, pin: settPin });
      setProfile((p) => (p ? { ...p, settlement: { bank: res.bank, account_masked: res.account_masked } } : p));
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
  const name = profile?.business_name || 'Tu empresa';

  // Fuente única de verdad para Inicio, Ventas y Conciliación: cobros Kuota Payments + pedidos aKuotas!.
  const d = useMemo(() => {
    const since = sinceOf(period);
    const inPeriod = (iso: string) => Date.parse(iso) >= since;
    // Deduplicación estricta por id para impedir registros duplicados.
    const allLinks = [...new Map((links ?? []).map((l) => [l.id, l])).values()];
    const allOrders = [...new Map((orders ?? []).map((o) => [o.id, o])).values()];

    // Links donde el cliente YA pagó (distingue pago recibido del cliente vs. link aún no pagado).
    const paid = allLinks.filter((l) => l.status === 'PAID' && inPeriod(l.paid_at ?? l.created_at));
    // Links liquidados al proveedor (360pay confirmó la transferencia o sandbox tras ventana de 5 min).
    const settled = paid.filter((l) => Boolean(l.settled_at));
    // Links con pago recibido del cliente pero esperando liquidación al vendedor ("Por confirmar").
    const awaitingSettlement = paid.filter((l) => !l.settled_at);
    // Links generados que el cliente todavía NO ha pagado (no se marcan como recibidos ni entran a Por confirmar).
    const unpaidLinks = allLinks.filter(
      (l) => (l.status === 'ACTIVE' || l.status === 'ON_HOLD' || l.status === 'DRAFT') && !l.last_attempt_failed && l.settlement_status !== 'FAILED'
    );
    // Links anulados o con intento fallido en el periodo (distinguidos de "Liquidado" = liquidado al vendedor).
    const cancelledOrFailed = allLinks.filter(
      (l) => inPeriod(l.created_at) && (l.status === 'CANCELLED' || l.last_attempt_failed || l.settlement_status === 'FAILED')
    );

    // Pedidos aKuotas! mantenidos separados de Kuota Payments.
    const ord = allOrders.filter((o) => inPeriod(o.issued_at));
    const toCollect = ord.filter((o) => !o.settled);
    const settledOrders = ord.filter((o) => o.settled);

    // Bruto cobrado a clientes en Kuota Payments (antes de comisiones).
    const gross = paid.reduce((a, l) => a + l.amount_cents, 0);
    const fees = paid.reduce((a, l) => a + l.fee_cents, 0);
    // Bruto, comisión y neto EXCLUSIVAMENTE de cobros ya liquidados al proveedor (sin mezclar con bruto vendido).
    const settledGross = settled.reduce((a, l) => a + l.amount_cents, 0);
    const settledFees = settled.reduce((a, l) => a + l.fee_cents, 0);
    const net = settled.reduce((a, l) => a + l.net_cents, 0);
    // Monto de pagos recibidos en espera de liquidación ("Por confirmar").
    const awaitingGross = awaitingSettlement.reduce((a, l) => a + l.amount_cents, 0);
    const awaitingNet = awaitingSettlement.reduce((a, l) => a + l.net_cents, 0);
    // Monto de pedidos aKuotas! pendientes de cobro ("Por cobrar", separado de Kuota Payments).
    const toCollectTotal = toCollect.reduce((a, o) => a + o.total_cents, 0);
    const ordersTotal = ord.reduce((a, o) => a + o.total_cents, 0);
    // Total vendido (bruto): cobros pagados Kuota Payments + pedidos aKuotas!
    const sold = gross + ordersTotal;
    const pos = Math.round(gross * 0.035); // 3.5 % promedio de un POS tradicional
    const overdueCount = awaitingSettlement.filter((l) => Boolean(l.settlement_overdue)).length;

    const sales: SaleItem[] = [
      ...paid.map((l): SaleItem => {
        const isSettled = Boolean(l.settled_at);
        const isOverdue = !isSettled && Boolean(l.settlement_overdue);
        return {
          id: l.id,
          who: l.concept || 'Cobro',
          channel: 'Kuota Payments',
          at: l.paid_at ?? l.created_at,
          cents: l.amount_cents,
          feeCents: l.fee_cents,
          netCents: l.net_cents,
          // "Liquidado" = liquidación completada al vendedor. "Por confirmar" = pago recibido, pendiente de liquidación.
          status: isSettled ? 'Liquidado' : 'Por confirmar',
          tone: isSettled
            ? 'bg-emerald-100 text-emerald-800'
            : isOverdue
            ? 'bg-amber-100 text-amber-900'
            : 'bg-[#e1e8f8] text-[#1a3bb0]',
          detail: isSettled
            ? `Liquidado al vendedor · Neto ${soles(l.net_cents)}`
            : isOverdue
            ? 'Pago recibido · Plazo estimado cumplido (pendiente 360)'
            : `Pago recibido (Cobrado) · En liquidación (neto ${soles(l.net_cents)})`,
          ok: isSettled,
          overdue: isOverdue,
          paidAt: l.paid_at,
          settledAt: l.settled_at,
          etaAt: l.settlement_eta_at ?? null,
          kind: 'PAYMENT_LINK'
        };
      }),
      ...cancelledOrFailed.map((l): SaleItem => {
        const isFailed = Boolean(l.last_attempt_failed || l.settlement_status === 'FAILED');
        return {
          id: l.id,
          who: l.concept || 'Cobro',
          channel: 'Kuota Payments',
          at: l.created_at,
          cents: l.amount_cents,
          feeCents: 0,
          netCents: 0,
          status: isFailed ? 'Fallido' : 'Anulado',
          tone: isFailed ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600',
          detail: isFailed ? 'Operación fallida · Sin cargo al cliente' : 'Link anulado · Sin cobro recibido',
          ok: false,
          paidAt: null,
          settledAt: null,
          etaAt: null,
          kind: 'PAYMENT_LINK'
        };
      }),
      ...ord.map((o): SaleItem => ({
        id: o.id,
        who: o.customer,
        channel: `aKuotas! (${o.installments_count} cuotas)`,
        at: o.issued_at,
        cents: o.total_cents,
        feeCents: 0,
        netCents: o.total_cents,
        status: o.settled ? 'Liquidado' : 'Por cobrar',
        tone: o.settled ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800',
        detail: o.settled ? 'Pedido aKuotas! liquidado' : 'Pedido aKuotas! pendiente de cobro',
        ok: o.settled,
        paidAt: o.issued_at,
        settledAt: o.settled ? o.issued_at : null,
        etaAt: null,
        kind: 'AKUOTAS_ORDER'
      }))
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const byCustomer = new Map<string, { total: number; count: number; last: string; orders: Order[] }>();
    for (const o of allOrders) {
      const c = byCustomer.get(o.customer) ?? { total: 0, count: 0, last: o.issued_at, orders: [] as Order[] };
      c.total += o.total_cents;
      c.count += 1;
      c.orders.push(o);
      if (Date.parse(o.issued_at) > Date.parse(c.last)) c.last = o.issued_at;
      byCustomer.set(o.customer, c);
    }
    const customers = [...byCustomer.entries()].map(([who, c]) => ({ who, ...c })).sort((a, b) => b.total - a.total);
    const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
    const nd = period === 'week' ? 7 : 30;
    const bars = Array.from({ length: nd }, (_, i) => {
      const t = new Date(Date.now() - (nd - 1 - i) * 864e5);
      return { key: t.toLocaleDateString('en-CA'), label: String(t.getDate()), pay: 0, ak: 0 };
    });
    for (const l of paid) { const b = bars.find((x) => x.key === dayKey(l.paid_at ?? l.created_at)); if (b) b.pay += l.amount_cents; }
    for (const o of ord) { const b = bars.find((x) => x.key === dayKey(o.issued_at)); if (b) b.ak += o.total_cents; }
    const peak = bars.reduce((m, b) => (b.pay + b.ak > m.pay + m.ak ? b : m), bars[0]);
    const byProduct = new Map<string, { total: number; count: number }>();
    for (const l of paid) { const k = l.concept?.trim() || 'Cobro sin concepto'; const p = byProduct.get(k) ?? { total: 0, count: 0 }; p.total += l.amount_cents; p.count += 1; byProduct.set(k, p); }
    const products = [...byProduct.entries()].map(([name, p]) => ({ name, ...p })).sort((a, b) => b.total - a.total);
    const byDay = new Map<string, { key: string; at: string; n: number; gross: number; fee: number; net: number }>();
    for (const l of settled) {
      const at = l.settled_at!; const k = dayKey(at);
      const x = byDay.get(k) ?? { key: k, at, n: 0, gross: 0, fee: 0, net: 0 };
      x.n += 1; x.gross += l.amount_cents; x.fee += l.fee_cents; x.net += l.net_cents; byDay.set(k, x);
    }
    const settlements = [...byDay.values()].sort((a, b) => b.key.localeCompare(a.key));
    return {
      bars,
      peak,
      products,
      settlements,
      paid,
      settled,
      awaitingSettlement,
      unpaidLinks,
      settledOrders,
      gross,
      fees,
      settledGross,
      settledFees,
      net,
      awaitingGross,
      awaitingNet,
      toCollectTotal,
      ordersTotal,
      pos,
      toCollect,
      sales,
      customers,
      sold,
      overdueCount
    };
  }, [links, orders, period]);

  const shownCustomers = d.customers.filter((c) => c.who.toLowerCase().includes(q.trim().toLowerCase()));
  const selC = d.customers.find((c) => c.who === sel) ?? null;
  const maxBar = Math.max(1, ...d.bars.map((b) => b.pay + b.ak));
  const loading = orders === null || (!!getMerchantId() && links === null);

  const Chips = (
    <div role="group" aria-label="Periodo" className="flex gap-2 overflow-x-auto">
      {PERIODS.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}
          className={`px-3.5 h-9 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${period === k ? 'bg-white text-[#1a3bb0]' : 'bg-white/15 text-white'}`}>{label}</button>
      ))}
    </div>
  );

  const navItem = (k: Tab, label: string, Icon: typeof Home) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold cursor-pointer ${tab === k ? 'text-[#1a3bb0]' : 'text-[#4a5f7e]'}`}>
      <Icon size={22} aria-hidden="true" />{label}
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd]">
      <header className="shrink-0 px-4.5 pt-4 pb-2 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 leading-none">
            <span className="text-2xl font-black tracking-tight text-[#1a3bb0]">kuota</span>
            <span className="px-2 py-0.5 rounded-full bg-[#b6ccfd] text-[#1a3bb0] text-[10px] font-black">PRO</span>
          </p>
          <p className="text-xs text-[#4a5f7e] truncate mt-0.5">{name}</p>
        </div>
        <ProfileSwitcher active="PROVIDER" />
        <button type="button" onClick={() => setTab('cuenta')} aria-label="Mi cuenta"
          className="w-10 h-10 rounded-full bg-[#00248b] text-white flex items-center justify-center cursor-pointer shrink-0 overflow-hidden">{profile?.avatar_url ? <Avatar url={profile.avatar_url} name={name} size={40} /> : <User size={18} aria-hidden="true" />}</button>
      </header>

      <div className="flex-1 overflow-y-auto px-4.5 pb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${st.tone}`}>{st.icon}{st.label}</span>
          {profile?.ruc_masked && <span className="px-3 py-1 rounded-full bg-[#b6ccfd] text-[#1a3bb0] text-xs font-black">RUC {profile.ruc_masked}</span>}
        </div>
        {error && <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
        {needsPin && (
          <button type="button" onClick={() => void loadProviderData(false)} className="w-full p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] text-xs font-bold text-[#1a3bb0] text-left cursor-pointer">
            Tus cobros de Kuota Payments están cerrados. Toca para verlos con tu PIN.
          </button>
        )}

        {tab === 'inicio' && (
          <>
            <Hero>
              <h2 className="text-sm font-bold flex items-center gap-2"><PiggyBank size={16} aria-hidden="true" /> Ahorraste con Kuota Payments</h2>
              <div>
                <p className="text-[11px] tracking-wider text-white/80">AHORRO TOTAL GENERADO</p>
                <p className="text-4xl font-black tabular-nums">{soles(Math.max(d.pos - d.fees, 0))}</p>
                <p className="text-[11px] text-white/80 mt-1 flex items-center gap-1"><Info size={12} aria-hidden="true" /> vs. 3.5 % promedio de comisión en POS tradicional</p>
              </div>
              {Chips}
              <div className="rounded-2xl bg-white/10 p-3.5 text-xs space-y-2">
                <div className="flex justify-between gap-3"><span>Lo que habrías pagado en POS (3.5 %)</span><span className="font-bold shrink-0 whitespace-nowrap">{soles(d.pos)}</span></div>
                <div className="flex justify-between gap-3"><span>Lo que pagaste con Kuota (1 % + IGV)</span><span className="font-bold shrink-0 whitespace-nowrap">-{soles(d.fees)}</span></div>
                <div className="flex justify-between gap-3 pt-2 border-t border-white/20 text-sm font-black"><span className="flex items-center gap-1.5"><Wallet size={14} aria-hidden="true" /> Tu ahorro neto en el bolsillo</span><span className="shrink-0 whitespace-nowrap">{soles(Math.max(d.pos - d.fees, 0))}</span></div>
              </div>
              {!getMerchantId() && <p className="text-[11px] text-white/80">Toca Vender para abrir Kuota Payments y empezar a ahorrar.</p>}
            </Hero>

            <div className="flex items-center justify-between pt-1">
              <h2 className="text-base font-black text-[#0b2545]">Operaciones de fondos</h2>
              <button
                type="button"
                onClick={() => { setTab('ventas'); setConcView(true); }}
                className="text-[11px] font-bold text-[#1a3bb0] underline cursor-pointer"
              >
                Ir a Conciliación
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card>
                <p className="text-xs font-bold text-[#4a5f7e] flex items-center gap-1"><TrendingUp size={13} aria-hidden="true" /> Total vendido</p>
                <p className="text-xl font-black text-[#0b2545] tabular-nums">{soles(d.sold)}</p>
                <p className="text-[11px] text-[#4a5f7e]">Monto bruto de ventas</p>
              </Card>
              <Card>
                <p className="text-xs font-bold text-[#4a5f7e] flex items-center gap-1"><CheckCircle2 size={13} aria-hidden="true" /> Liquidado (neto)</p>
                <p className="text-xl font-black text-emerald-700 tabular-nums">{soles(d.net)}</p>
                <p className="text-[11px] text-[#4a5f7e]">{d.settled.length} cobro{d.settled.length === 1 ? '' : 's'} cancelado{d.settled.length === 1 ? '' : 's'}</p>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card>
                <p className="text-xs font-bold text-[#4a5f7e] flex items-center gap-1"><Clock size={13} aria-hidden="true" /> Por cobrar</p>
                <p className="text-xl font-black text-[#0b2545] tabular-nums">{soles(d.toCollectTotal)}</p>
                <p className="text-[11px] text-[#4a5f7e]">{d.toCollect.length} pedido{d.toCollect.length === 1 ? '' : 's'} aKuotas! pendiente{d.toCollect.length === 1 ? '' : 's'}</p>
              </Card>
              <Card>
                <p className="text-xs font-bold text-[#4a5f7e] flex items-center gap-1"><Wallet size={13} aria-hidden="true" /> Por confirmar</p>
                <p className="text-xl font-black text-[#0b2545] tabular-nums">{soles(d.awaitingGross)}</p>
                <p className="text-[11px] text-[#4a5f7e]">
                  {d.awaitingSettlement.length > 0
                    ? `${d.awaitingSettlement.length} pago${d.awaitingSettlement.length === 1 ? '' : 's'} recibido${d.awaitingSettlement.length === 1 ? '' : 's'} · neto ${soles(d.awaitingNet)}`
                    : '0 pagos recibidos por liquidar'}
                </p>
              </Card>
            </div>

            {d.overdueCount > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                <b>Plazo estimado cumplido:</b> {d.overdueCount} pago{d.overdueCount === 1 ? '' : 's'} recibido{d.overdueCount === 1 ? '' : 's'} superó el plazo estimado y sigue <b>Por confirmar</b> a la espera de evidencia de 360pay (plazo definitivo y horas hábiles/calendario pendientes de validar con 360).
              </div>
            )}

            <Card title="Ventas">
              {d.sales.length === 0 && <Empty loading={loading} text="Aún no hay ventas registradas en este periodo." />}
              <div className="divide-y divide-[#f0f4ff]">
                {d.sales.slice(0, 20).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setTab('ventas'); setConcView(true); setConcSel(s); }}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-xs text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#151c27] truncate text-sm">{s.who}</p>
                      <p className="text-[#4a5f7e]">{s.channel} · {day(s.at)}</p>
                      <p className="text-[10px] text-[#4a5f7e] truncate">{s.detail}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-[#151c27] text-sm">{soles(s.cents)}</p>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${s.tone}`}>{s.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === 'ventas' && !concView && (
          <>
            <Hero>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] tracking-wider text-white/80">TOTAL VENDIDO CON KUOTA (BRUTO)</p>
                  <p className="text-4xl font-black tabular-nums">{soles(d.sold)}</p>
                  <p className="text-[11px] text-white/80 mt-0.5">Neto liquidado: {soles(d.net)} · Por confirmar: {soles(d.awaitingGross)}</p>
                </div>
                <button type="button" onClick={() => setActModal(true)} aria-label="Ver actividad diaria"
                  className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center cursor-pointer">
                  <Activity size={18} aria-hidden="true" />
                </button>
              </div>
              {Chips}
            </Hero>
            <button type="button" onClick={() => setConcView(true)}
              className="w-full py-3.5 rounded-2xl bg-white border border-[#c9d5f3] text-[#00248b] font-black text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
              <TrendingUp size={16} aria-hidden="true" /> Conciliación
            </button>
            <Card title="Ventas recientes">
              {d.sales.length === 0 && <Empty loading={loading} text="Aún no hay ventas en este periodo." />}
              <div className="divide-y divide-[#f0f4ff]">
                {d.sales.slice(0, 20).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-[#151c27] truncate text-sm">{s.who}</p>
                      <p className="text-[#4a5f7e]">{s.channel} · {day(s.at)}</p>
                      <p className="text-[10px] text-[#4a5f7e] truncate">{s.detail}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-[#151c27] text-sm">{soles(s.cents)}</p>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${s.tone}`}>{s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === 'ventas' && concView && (
          <>
            <div className="flex items-center gap-2 pb-1">
              <button type="button" onClick={() => { setConcView(false); setConcSel(null); }} aria-label="Volver"
                className="w-9 h-9 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer">
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <h2 className="text-base font-black text-[#0b2545]">Conciliación</h2>
              <button type="button" onClick={() => void handleSandboxSettle()} disabled={settling}
                className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer disabled:opacity-50">
                {settling ? '...' : '⚡ Simular liquidación (5m)'}
              </button>
            </div>
            <Hero>
              <div className="space-y-1">
                <p className="text-[11px] tracking-wider text-white/80">VOLUMEN LIQUIDADO AL PROVEEDOR (NETO)</p>
                <p className="text-4xl font-black tabular-nums">{soles(d.net)}</p>
                <p className="text-[11px] text-white/80">
                  Bruto liquidado: {soles(d.settledGross)} · Comisión Kuota: -{soles(d.settledFees)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/10 p-3 text-xs">
                <div>
                  <p className="text-white/70 text-[10px]">Total vendido</p>
                  <p className="font-black">{soles(d.sold)}</p>
                </div>
                <div>
                  <p className="text-white/70 text-[10px]">Por confirmar</p>
                  <p className="font-black">{soles(d.awaitingGross)}</p>
                </div>
                <div>
                  <p className="text-white/70 text-[10px]">Por cobrar (aKuotas!)</p>
                  <p className="font-black">{soles(d.toCollectTotal)}</p>
                </div>
              </div>
            </Hero>
            {d.overdueCount > 0 && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                <b>Plazo estimado cumplido:</b> Se conserva el estado <b>Por confirmar</b> hasta recibir confirmación del proveedor de pagos. Plazo real y cómputo (horas hábiles vs. calendario) pendientes de validar con 360.
              </div>
            )}
            {!concSel ? (
              <Card title="Ventas">
                {d.sales.length === 0 && <Empty loading={loading} text="Aún no hay ventas en este periodo." />}
                <div className="divide-y divide-[#f0f4ff]">
                  {d.sales.map((s) => (
                    <button key={s.id} type="button" onClick={() => setConcSel(s)}
                      className="w-full flex items-center justify-between gap-3 py-2.5 text-xs text-left cursor-pointer">
                      <div className="min-w-0">
                        <p className="font-bold text-[#151c27] truncate">{s.who}</p>
                        <p className="text-[#4a5f7e]">{s.channel} · {day(s.at)}</p>
                        <p className="text-[10px] text-[#4a5f7e] truncate">{s.detail}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-sm text-[#151c27]">{soles(s.cents)}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${s.tone}`}>{s.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            ) : (
              <>
                <button type="button" onClick={() => setConcSel(null)}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#00248b] cursor-pointer">
                  <ArrowLeft size={16} aria-hidden="true" /> Volver a ventas
                </button>
                <Card title="Detalle de la venta">
                  {(() => {
                    const bruto = concSel.cents;
                    const feeTotal = concSel.kind === 'PAYMENT_LINK' && concSel.feeCents > 0
                      ? concSel.feeCents
                      : concSel.kind === 'AKUOTAS_ORDER'
                      ? 0
                      : Math.round(Math.max(Math.round(bruto * 0.01), 450) * 1.18);
                    const comBase = feeTotal > 0 ? Math.round(feeTotal / 1.18) : 0;
                    const igv = feeTotal - comBase;
                    const neto = concSel.netCents > 0 ? concSel.netCents : bruto - feeTotal;
                    return (
                      <div className="space-y-2">
                        <Row label="Concepto / Cliente" value={concSel.who} />
                        <Row label="Canal" value={concSel.channel} />
                        <Row label="Estado en conciliación" value={concSel.status} />
                        {concSel.kind === 'PAYMENT_LINK' && (
                          <Row
                            label="Pago del cliente"
                            value={
                              concSel.status === 'Anulado'
                                ? 'Anulado (sin cobro)'
                                : concSel.status === 'Fallido'
                                ? 'Fallido (rechazado)'
                                : 'Cobrado al cliente'
                            }
                          />
                        )}
                        {concSel.paidAt && <Row label="Fecha de cobro" value={day(concSel.paidAt)} />}
                        {concSel.settledAt && <Row label="Fecha de liquidación" value={day(concSel.settledAt)} />}
                        {!concSel.settledAt && concSel.etaAt && (
                          <Row
                            label="Liquidación estimada"
                            value={concSel.overdue ? 'Plazo cumplido · pendiente 360' : day(concSel.etaAt)}
                          />
                        )}
                        <Row label="Monto vendido (bruto)" value={soles(bruto)} />
                        {concSel.kind === 'PAYMENT_LINK' && concSel.status !== 'Anulado' && concSel.status !== 'Fallido' && (
                          <>
                            <Row label="Comisión Kuota (1 %, mín. S/ 4.50)" value={`-${soles(comBase)}`} />
                            <Row label="IGV sobre la comisión (18 %)" value={`-${soles(igv)}`} />
                          </>
                        )}
                        <div className="pt-2 border-t border-[#f0f4ff] flex justify-between text-sm font-black">
                          <span>{concSel.ok ? 'Monto liquidado (neto)' : 'Monto neto a liquidar'}</span>
                          <span className="text-emerald-700">{soles(neto)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              </>
            )}
          </>
        )}

        {tab === 'clientes' && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs tracking-wider text-[#4a5f7e]">CARTERA DE NEGOCIOS</p>
                <h2 className="text-2xl font-black text-[#0b2545]">Clientes Activos</h2>
              </div>
              <span className="px-3 py-1.5 rounded-full bg-[#b6ccfd] text-[#1a3bb0] text-xs font-black flex items-center gap-1"><ShieldCheck size={13} aria-hidden="true" />{d.customers.length} comercios</span>
            </div>
            <label className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-white border border-[#e1e8f8] text-[#4a5f7e]">
              <Search size={18} aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nombre" aria-label="Buscar cliente" className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#151c27] placeholder:text-[#4a5f7e]" />
            </label>
            <p className="text-[11px] text-[#4a5f7e]">Mostrando {shownCustomers.length} de {d.customers.length} comercios</p>
            <Card>
              {d.customers.length === 0 && <Empty loading={loading} text="Aún no tienes pedidos de comercios afiliados." />}
              <div className="divide-y divide-[#f0f4ff]">
                {shownCustomers.map((c) => (
                  <div key={c.who} role="button" tabIndex={0} onClick={() => setSel(c.who)} onKeyDown={(e) => e.key === 'Enter' && setSel(c.who)} className="py-3 flex items-center gap-3 cursor-pointer">
                    <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00248b] to-[#1a3bb0] text-white font-black flex items-center justify-center shrink-0">{c.who.trim().slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-[#151c27] truncate">{c.who}</p>
                      <p className="text-[11px] text-[#4a5f7e]">{c.count} pedido{c.count === 1 ? '' : 's'} · ticket prom. {soles(Math.round(c.total / c.count))} · último {day(c.last)}</p>
                    </div>
                    <p className="font-black text-sm text-[#1a3bb0] shrink-0">{soles(c.total)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === 'perfil' && (
          <>
            <Card title="Foto de perfil">
              <div className="flex items-center gap-3.5">
                <Avatar url={profile?.avatar_url} name={name} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#4a5f7e] leading-snug">La ven quienes te pagan o te buscan por celular.</p>
                  <button type="button" onClick={() => setPhotoSheet(true)} className="mt-1 py-2 text-sm font-bold text-[#1a3bb0] underline cursor-pointer">
                    {profile?.avatar_url ? 'Cambiar foto' : 'Agregar foto'}
                  </button>
                </div>
              </div>
            </Card>
            <Card title="Datos de la empresa">
              <Row label="RUC" value={profile?.ruc_masked} />
              <Row label="Rubro" value={profile?.category} />
              <Row label="WhatsApp" value={profile?.whatsapp_masked} />
              <Row label="Tarifa por cobro" value={profile?.fee_bps != null ? `${profile.fee_bps / 100} % + IGV (mín. S/ 4.50)` : null} />
              <p className="text-[11px] text-[#4a5f7e]">{st.hint}</p>
            </Card>
            <Card title="Cuenta de abono" icon={<Landmark size={14} />}>
              <div className="flex items-center justify-between">
                {profile?.settlement ? <Row label={profile.settlement.bank || 'Banco'} value={profile.settlement.account_masked} /> : <p className="text-xs text-[#4a5f7e]">Aún no registraste una cuenta para recibir tus pagos.</p>}
                <button type="button" onClick={() => { setShowSettForm((v) => !v); setSettError(null); }} className="text-[11px] font-bold text-[#1a3bb0] flex items-center gap-0.5 shrink-0 ml-3 cursor-pointer">
                  {profile?.settlement ? 'Editar' : 'Registrar'}{showSettForm ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </div>
              {showSettForm && (
                <div className="pt-2 space-y-2 border-t border-[#f0f4ff]">
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Banco</label>
                    <select value={settBank} onChange={(e) => setSettBank(e.target.value)} className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27]">
                      {BANKS.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">CCI (20 dígitos)</label>
                    <input type="text" inputMode="numeric" maxLength={24} placeholder="002 123 456789012345 00" value={settCci} onChange={(e) => setSettCci(e.target.value)}
                      className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Tu PIN de 6 dígitos</label>
                    <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={settPin} onChange={(e) => setSettPin(e.target.value)}
                      className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]" />
                    {bioPin && (
                      <button
                        type="button"
                        onClick={() => void pinFromBiometric({ title: 'Confirmar con tu huella', subtitle: 'Guardar tu cuenta de abono' }).then(setSettPin).catch(() => {})}
                        className="mt-1.5 py-2 text-xs font-bold text-[#1a3bb0] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Fingerprint size={15} aria-hidden="true" /> Usar mi huella
                      </button>
                    )}
                  </div>
                  {settError && <p className="text-xs text-red-600">{settError}</p>}
                  <button type="button" disabled={settSaving} onClick={handleSaveSettlement} className="w-full py-2.5 rounded-xl bg-[#00248b] text-white text-sm font-bold disabled:opacity-60">
                    {settSaving ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
            </Card>
            <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] flex items-start gap-2 text-[11px] text-[#2b3f66] leading-snug">
              <ShieldCheck size={16} className="shrink-0 mt-0.5 text-[#1a3bb0]" aria-hidden="true" />
              <span>Tu cuenta solo puede estar abierta en un equipo a la vez. Vendes con la misma clave en tus dos perfiles.</span>
            </div>
            <button type="button" onClick={onLogout} className="w-full py-3.5 rounded-2xl bg-white border border-[#e1e8f8] text-red-600 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]">
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
          </>
        )}

        {tab === 'cuenta' && (
          <>
            <Card title="Foto de perfil">
              <div className="flex items-center gap-3.5">
                <Avatar url={profile?.avatar_url} name={name} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#4a5f7e] leading-snug">La ven quienes te pagan o te buscan por celular.</p>
                  <button type="button" onClick={() => setPhotoSheet(true)} className="mt-1 py-2 text-sm font-bold text-[#1a3bb0] underline cursor-pointer">
                    {profile?.avatar_url ? 'Cambiar foto' : 'Agregar foto'}
                  </button>
                </div>
              </div>
            </Card>
            <Card title="Datos de la empresa">
              <Row label="RUC" value={profile?.ruc_masked} />
              <Row label="Rubro" value={profile?.category} />
              <Row label="WhatsApp" value={profile?.whatsapp_masked} />
              <Row label="Tarifa por cobro" value={profile?.fee_bps != null ? `${profile.fee_bps / 100} % + IGV (mín. S/ 4.50)` : null} />
              <p className="text-[11px] text-[#4a5f7e]">{st.hint}</p>
            </Card>
            <Card title="Cuenta de abono" icon={<Landmark size={14} />}>
              <div className="flex items-center justify-between">
                {profile?.settlement ? <Row label={profile.settlement.bank || 'Banco'} value={profile.settlement.account_masked} /> : <p className="text-xs text-[#4a5f7e]">Aún no registraste una cuenta para recibir tus pagos.</p>}
                <button type="button" onClick={() => { setShowSettForm((v) => !v); setSettError(null); }} className="text-[11px] font-bold text-[#1a3bb0] flex items-center gap-0.5 shrink-0 ml-3 cursor-pointer">
                  {profile?.settlement ? 'Editar' : 'Registrar'}{showSettForm ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </div>
              {showSettForm && (
                <div className="pt-2 space-y-2 border-t border-[#f0f4ff]">
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Banco</label>
                    <select value={settBank} onChange={(e) => setSettBank(e.target.value)} className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27]">
                      {BANKS.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">CCI (20 dígitos)</label>
                    <input type="text" inputMode="numeric" maxLength={24} placeholder="002 123 456789012345 00" value={settCci} onChange={(e) => setSettCci(e.target.value)}
                      className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#4a5f7e] font-semibold mb-1 block">Tu PIN de 6 dígitos</label>
                    <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={settPin} onChange={(e) => setSettPin(e.target.value)}
                      className="w-full border border-[#e1e8f8] rounded-xl px-3 py-2 text-sm bg-[#f9f9ff] text-[#151c27] placeholder:text-[#b0bdd0]" />
                    {bioPin && (
                      <button
                        type="button"
                        onClick={() => void pinFromBiometric({ title: 'Confirmar con tu huella', subtitle: 'Guardar tu cuenta de abono' }).then(setSettPin).catch(() => {})}
                        className="mt-1.5 py-2 text-xs font-bold text-[#1a3bb0] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Fingerprint size={15} aria-hidden="true" /> Usar mi huella
                      </button>
                    )}
                  </div>
                  {settError && <p className="text-xs text-red-600">{settError}</p>}
                  <button type="button" disabled={settSaving} onClick={handleSaveSettlement} className="w-full py-2.5 rounded-xl bg-[#00248b] text-white text-sm font-bold disabled:opacity-60">
                    {settSaving ? 'Guardando…' : 'Guardar cuenta'}
                  </button>
                </div>
              )}
            </Card>
            <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] flex items-start gap-2 text-[11px] text-[#2b3f66] leading-snug">
              <ShieldCheck size={16} className="shrink-0 mt-0.5 text-[#1a3bb0]" aria-hidden="true" />
              <span>Tu cuenta solo puede estar abierta en un equipo a la vez. Vendes con la misma clave en tus dos perfiles.</span>
            </div>
            <button type="button" onClick={onLogout} className="w-full py-3.5 rounded-2xl bg-white border border-[#e1e8f8] text-red-600 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]">
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
          </>
        )}
      </div>

      {selC && (
        <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/45" onClick={() => setSel(null)}>
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={`Ficha de ${selC.who}`} onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#f9f9ff] rounded-t-3xl p-5 pb-7 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black tracking-wider text-[#1a3bb0]">FICHA DE CLIENTE</p>
              <button type="button" onClick={() => setSel(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer"><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="flex items-center gap-3 bg-white rounded-3xl p-4 border border-[#e1e8f8]">
              <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00248b] to-[#1a3bb0] text-white font-black text-lg flex items-center justify-center shrink-0">{selC.who.trim().slice(0, 2).toUpperCase()}</span>
              <p className="font-black text-lg text-[#0b2545] leading-tight">{selC.who}</p>
            </div>
            <Card title="Resumen comercial acumulado">
              <div className="grid grid-cols-3 gap-2 text-center rounded-2xl bg-[#eff3ff] p-3">
                <div><p className="text-[11px] text-[#4a5f7e]">Total comprado</p><p className="font-black text-[#1a3bb0] text-sm">{soles(selC.total)}</p><p className="text-[10px] text-[#4a5f7e]">{selC.count} pedido{selC.count === 1 ? '' : 's'}</p></div>
                <div><p className="text-[11px] text-[#4a5f7e]">Ticket prom.</p><p className="font-black text-sm">{soles(Math.round(selC.total / selC.count))}</p></div>
                <div><p className="text-[11px] text-[#4a5f7e]">Frecuencia</p><p className="font-black text-sm">{selC.count > 1 ? `Cada ${Math.max(1, Math.round((Date.parse(selC.last) - Math.min(...selC.orders.map((o) => Date.parse(o.issued_at)))) / (selC.count - 1) / 864e5))} días` : '—'}</p></div>
              </div>
            </Card>
            <Card title="Historial reciente">
              {[...selC.orders].sort((x, y) => Date.parse(y.issued_at) - Date.parse(x.issued_at)).slice(0, 3).map((o) => (
                <div key={o.id} className="flex justify-between gap-3 text-xs">
                  <span className="text-[#4a5f7e]">{day(o.issued_at)} · {o.installments_count} cuota{o.installments_count === 1 ? '' : 's'}</span>
                  <span className="font-bold text-[#151c27]">{soles(o.total_cents)} · {o.settled ? 'Liquidado' : 'Por cobrar'}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {actModal && (
        <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/45" onClick={() => setActModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#f9f9ff] rounded-t-3xl p-5 pb-7 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-[#0b2545]">Actividad diaria</h2>
              <button type="button" onClick={() => setActModal(false)} aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {d.bars.every((b) => b.pay + b.ak === 0) ? (
              <p className="text-xs text-[#4a5f7e]">Aún no hay ventas en este periodo.</p>
            ) : (
              <>
                <p className="text-[11px] text-[#4a5f7e]">Pico máximo: <b className="text-[#1a3bb0]">{d.peak.label} · {soles(d.peak.pay + d.peak.ak)}</b></p>
                <div className="flex items-end gap-0.5 h-28" role="img" aria-label="Ventas por día">
                  {d.bars.map((b) => (
                    <div key={b.key} className="flex-1 min-w-0 flex flex-col justify-end h-full" title={`${b.label}: ${soles(b.pay + b.ak)}`}>
                      <div className="w-full bg-[#afc5f6] rounded-t-sm" style={{ height: `${(b.ak / maxBar) * 100}%` }} />
                      <div className="w-full bg-[#1a3bb0]" style={{ height: `${(b.pay / maxBar) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-[#4a5f7e]"><span>{d.bars[0].label}</span><span>{d.bars[d.bars.length - 1].label}</span></div>
                <div className="flex gap-4 text-[11px] text-[#4a5f7e]">
                  <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-[#1a3bb0]" />Kuota Payments</span>
                  <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-[#afc5f6]" />aKuotas!</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {photoSheet && <PhotoSourceSheet hasPhoto={!!profile?.avatar_url} onFile={(f) => void handlePhoto(f)} onRemove={() => void removePhoto()} onClose={() => setPhotoSheet(false)} />}

      {venderOpen && (
        <VenderSheet
          onClose={() => setVenderOpen(false)}
          onCobrar={() => { setVenderOpen(false); onSell(); }}
          onPedidos={() => { setVenderOpen(false); setTab('ventas'); }}
        />
      )}

      <nav aria-label="Navegación del proveedor" className="shrink-0 mx-3 mb-2 bg-white rounded-full shadow-lg shadow-blue-900/15 border border-[#e1e8f8] px-2 grid grid-cols-5 items-end">
        {navItem('inicio', 'Inicio', Home)}
        {navItem('ventas', 'Ventas', TrendingUp)}
        <button type="button" onClick={() => setVenderOpen(true)} aria-haspopup="dialog" className="flex flex-col items-center gap-0.5 pb-1.5 text-[11px] font-black text-[#00248b] cursor-pointer">
          <span className="-mt-6 w-14 h-14 rounded-full bg-gradient-to-br from-[#00248b] to-[#1a3bb0] text-white flex items-center justify-center shadow-lg"><Plus size={28} aria-hidden="true" /></span>Vender
        </button>
        {navItem('clientes', 'Clientes', Users)}
        {navItem('perfil', 'Perfil', User)}
      </nav>
    </div>
  );
};
