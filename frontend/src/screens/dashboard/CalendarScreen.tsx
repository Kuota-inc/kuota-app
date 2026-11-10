import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, List } from 'lucide-react';
import { api } from '../../api/client';
import { paymentsApi } from '../../api/payments';

type Kind = 'PAGO' | 'COBRO';
type Status = 'PENDIENTE' | 'PAGADO' | 'VENCIDO';
interface Item {
  id: string;
  date: string; // YYYY-MM-DD (hora de Lima)
  kind: Kind;
  title: string;
  amount_cents: number;
  status: Status;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const limaDay = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const money = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const pad = (n: number) => String(n).padStart(2, '0');

// Estado = color + ícono + texto (nunca solo color).
const STATUS: Record<Status, { label: string; chip: string; dot: string; icon: React.ReactNode }> = {
  PENDIENTE: { label: 'Pendiente', chip: 'bg-amber-100 text-amber-900', dot: 'bg-amber-600', icon: <Clock size={12} /> },
  PAGADO: { label: 'Pagado', chip: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-600', icon: <CheckCircle2 size={12} /> },
  VENCIDO: { label: 'Vencido', chip: 'bg-red-100 text-red-900', dot: 'bg-red-600', icon: <AlertTriangle size={12} /> }
};

export const CalendarScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const today = limaDay(new Date());
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState<string>(today);
  const [view, setView] = useState<'calendario' | 'lista'>('calendario');
  const [filter, setFilter] = useState<'TODO' | Kind>('TODO');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const out: Item[] = [];
    const load = async () => {
      try {
        const purchase: any = await api.getActivePurchase();
        for (const i of purchase?.installments ?? []) {
          const overdue = i.status !== 'PAID' && i.due_date < today;
          out.push({
            id: `i_${i.id}`,
            date: String(i.due_date).slice(0, 10),
            kind: 'PAGO',
            title: `Cuota ${i.number} de ${purchase.installments_count ?? purchase.installments.length}`,
            amount_cents: i.amount_cents,
            status: i.status === 'PAID' ? 'PAGADO' : overdue ? 'VENCIDO' : 'PENDIENTE'
          });
        }
      } catch {
        /* sin compra activa */
      }
      try {
        // Cobros: solo si hay sesión de cobros abierta (no se pide el PIN desde aquí).
        const links = await paymentsApi.listLinks();
        for (const l of links.data) {
          if (l.status === 'CANCELLED' || l.status === 'DRAFT') continue;
          const paid = l.status === 'PAID';
          out.push({
            id: `l_${l.id}`,
            date: limaDay(paid && l.paid_at ? l.paid_at : l.expires_at),
            kind: 'COBRO',
            title: l.concept || 'Cobro por link',
            amount_cents: l.amount_cents,
            status: paid ? 'PAGADO' : l.status === 'EXPIRED' ? 'VENCIDO' : 'PENDIENTE'
          });
        }
      } catch {
        /* sin sesión de cobros: se muestran solo los pagos */
      }
      if (alive) {
        setItems(out);
        setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [today]);

  const visible = useMemo(() => items.filter((i) => filter === 'TODO' || i.kind === filter), [items, filter]);
  const prefix = `${cursor.y}-${pad(cursor.m + 1)}`;
  const monthItems = useMemo(() => visible.filter((i) => i.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date)), [visible, prefix]);
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of monthItems) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [monthItems]);

  // Semanas desde el lunes.
  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const move = (delta: number) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  const dayItems = byDay.get(selected) ?? [];

  const Row: React.FC<{ item: Item }> = ({ item }) => {
    const st = STATUS[item.status];
    return (
      <li className="p-3 rounded-2xl bg-white border border-[#e1e8f8] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#4a5f7e]">
            {item.kind === 'PAGO' ? 'Pago' : 'Cobro'} · {item.date.slice(8, 10)}/{item.date.slice(5, 7)}
          </p>
          <p className="text-sm font-bold text-[#0b2545] truncate">{item.title}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-[#0b2545]">{money(item.amount_cents)}</p>
          <span className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${st.chip}`}>
            {st.icon}
            {st.label}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-gradient-to-b from-[#f9f9ff] to-[#eff3ff] px-4.5 pt-4 pb-6 space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Volver" className="w-9 h-9 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center cursor-pointer">
          <ArrowLeft size={18} className="text-[#0b2545]" />
        </button>
        <div>
          <h1 className="text-lg font-black text-[#0b2545] leading-tight">Calendario</h1>
          <p className="text-[11px] text-[#4a5f7e]">Tus pagos de cuotas y tus cobros</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Filtro">
          {([['TODO', 'Todo'], ['PAGO', 'Pagos'], ['COBRO', 'Cobros']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${filter === k ? 'bg-[#1a3bb0] text-white' : 'bg-white border border-[#e1e8f8] text-[#0b2545]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setView(view === 'calendario' ? 'lista' : 'calendario')}
          aria-label={view === 'calendario' ? 'Ver como lista' : 'Ver como calendario'}
          className="w-9 h-9 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#0b2545] cursor-pointer"
        >
          {view === 'calendario' ? <List size={16} /> : <CalendarDays size={16} />}
        </button>
      </div>

      <div className="flex items-center justify-between bg-white rounded-2xl border border-[#e1e8f8] px-2 py-1.5">
        <button type="button" onClick={() => move(-1)} aria-label="Mes anterior" className="w-9 h-9 flex items-center justify-center rounded-full text-[#0b2545] cursor-pointer">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-black text-[#0b2545] capitalize">
          {MONTHS[cursor.m]} {cursor.y}
        </p>
        <button type="button" onClick={() => move(1)} aria-label="Mes siguiente" className="w-9 h-9 flex items-center justify-center rounded-full text-[#0b2545] cursor-pointer">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading && <p className="text-xs text-[#4a5f7e] text-center py-6">Cargando…</p>}

      {!loading && view === 'calendario' && (
        <>
          <div className="bg-white rounded-2xl border border-[#e1e8f8] p-2.5">
            <div className="grid grid-cols-7 text-center text-[11px] font-bold text-[#4a5f7e] mb-1">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((d, idx) => {
                if (d === null) return <span key={`e${idx}`} />;
                const key = `${prefix}-${pad(d)}`;
                const list = byDay.get(key) ?? [];
                const isToday = key === today;
                const isSel = key === selected;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-label={`${d} de ${MONTHS[cursor.m]}${list.length ? `, ${list.length} movimiento${list.length > 1 ? 's' : ''}` : ''}`}
                    aria-pressed={isSel}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-bold cursor-pointer ${
                      isSel ? 'bg-[#1a3bb0] text-white' : isToday ? 'bg-[#eff3ff] text-[#00248b] ring-1 ring-[#1a3bb0]' : 'text-[#0b2545]'
                    }`}
                  >
                    {d}
                    <span className="flex gap-0.5 h-1.5">
                      {list.slice(0, 3).map((i) => (
                        <span key={i.id} className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : STATUS[i.status].dot}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <h2 className="text-xs font-black text-[#0b2545] uppercase tracking-wider">
            {selected === today ? 'Hoy' : `${Number(selected.slice(8, 10))} de ${MONTHS[Number(selected.slice(5, 7)) - 1]}`}
          </h2>
          {dayItems.length ? (
            <ul className="space-y-2">{dayItems.map((i) => <Row key={i.id} item={i} />)}</ul>
          ) : (
            <p className="text-xs text-[#4a5f7e] bg-white rounded-2xl border border-[#e1e8f8] p-4 text-center">Nada programado este día.</p>
          )}
        </>
      )}

      {!loading && view === 'lista' && (
        monthItems.length ? (
          <ul className="space-y-2">{monthItems.map((i) => <Row key={i.id} item={i} />)}</ul>
        ) : (
          <p className="text-xs text-[#4a5f7e] bg-white rounded-2xl border border-[#e1e8f8] p-4 text-center">Nada programado este mes.</p>
        )
      )}

      {!loading && view === 'calendario' && monthItems.length === 0 && (
        <p className="text-[11px] text-[#4a5f7e] text-center">Nada programado este mes.</p>
      )}
    </div>
  );
};
