import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BellRing, Hourglass, Laptop, Loader2, Smartphone, X } from 'lucide-react';
import { isCancelled, paymentsApi, type LinkedDevice, type PaymentLimits, type SecurityAlert } from '../../api/payments';
import { useToast } from '../../components/toast-context';

// Paneles de Perfil › Seguridad conectados a Kuota Payments: cambio de PIN,
// dispositivos vinculados (cierre remoto), límites de cobro y actividad.

const soles = (cents: number) => `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const Header: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div className="flex items-center justify-between">
    <h4 className="text-base font-black text-[#151c27]">{title}</h4>
    <button type="button" onClick={onClose} aria-label="Cerrar" className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e] cursor-pointer">
      <X size={16} aria-hidden="true" />
    </button>
  </div>
);

const Loading = () => (
  <div className="py-8 flex justify-center" role="status" aria-label="Cargando">
    <Loader2 size={22} className="text-[#1a3bb0] motion-safe:animate-spin" />
  </div>
);

/** Carga con manejo de cancelación del PIN y de errores. */
function useSecureLoad<T>(load: () => Promise<T>, onCancel: () => void) {
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handlers = useRef({ load, onCancel });
  useEffect(() => {
    handlers.current = { load, onCancel };
  });
  const reload = useCallback(() => {
    handlers.current
      .load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (isCancelled(e)) handlers.current.onCancel();
        else setError(e instanceof Error ? e.message : 'No pudimos cargar la información.');
      });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, reload, toast };
}

const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <p className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold flex items-start gap-2" role="alert">
    <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> {message}
  </p>
);

// ---------------------------------------------------------------- PIN
const PinField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void }> = ({ id, label, value, onChange }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="text-[11px] font-bold text-[#4a5f7e]">
      {label}
    </label>
    <input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="w-full h-11 px-4 rounded-xl bg-[#eff3ff] border border-[#c5c5d6] focus:border-[#00248b] focus:outline-none text-lg tracking-[0.5em] font-bold"
    />
  </div>
);

export const ChangePinPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = current.length === 6 && next.length === 6 && confirm.length === 6;

  const submit = async () => {
    if (next !== confirm) {
      setError('El nuevo PIN y su confirmación no coinciden.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await paymentsApi.changePin(current, next);
      toast.success(
        r.sessions_closed
          ? `PIN actualizado. Cerramos ${r.sessions_closed} sesión(es) en otros dispositivos.`
          : 'PIN actualizado. Tus límites estarán reducidos por 24 h por seguridad.'
      );
      onClose();
    } catch (e) {
      if (!isCancelled(e)) setError(e instanceof Error ? e.message : 'No pudimos cambiar el PIN.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Header title="Cambiar PIN Kuota" onClose={onClose} />
      <PinField id="pin-actual" label="PIN actual" value={current} onChange={setCurrent} />
      <PinField id="pin-nuevo" label="Nuevo PIN (6 dígitos)" value={next} onChange={setNext} />
      <PinField id="pin-confirmar" label="Confirma el nuevo PIN" value={confirm} onChange={setConfirm} />
      <p className="text-[10px] text-[#4a5f7e]">
        Al cambiarlo cerramos tus sesiones en otros dispositivos y, durante 24 horas, tus límites de cobro quedan reducidos.
      </p>
      {error && <ErrorNote message={error} />}
      <button
        type="button"
        disabled={!ready || busy}
        onClick={submit}
        className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer"
      >
        {busy ? 'Guardando…' : 'Confirmar nuevo PIN'}
      </button>
    </div>
  );
};

// ----------------------------------------------------------- dispositivos
export const DevicesPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { data, error, reload, toast } = useSecureLoad(() => paymentsApi.getDevices(), onClose);
  const [busyRef, setBusyRef] = useState<string | null>(null);

  const revoke = async (d: LinkedDevice) => {
    setBusyRef(d.ref);
    try {
      await paymentsApi.revokeDevice(d.ref);
      toast.success(`${d.label} ya no puede operar tu cuenta.`);
      reload();
    } catch (e) {
      if (!isCancelled(e)) toast.error(e instanceof Error ? e.message : 'No pudimos desvincular el dispositivo.');
    } finally {
      setBusyRef(null);
    }
  };

  return (
    <div className="space-y-4">
      <Header title="Dispositivos vinculados" onClose={onClose} />
      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {data && (
        <ul className="space-y-2.5">
          {data.data.map((d) => (
            <li key={d.ref} className="p-3 rounded-2xl bg-[#eff3ff] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/Android|iPhone|App/i.test(d.label) ? (
                  <Smartphone size={24} className="text-[#00248b] shrink-0" aria-hidden="true" />
                ) : (
                  <Laptop size={24} className="text-[#4a5f7e] shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#151c27] truncate">
                    {d.label}
                    {d.current && ' (este dispositivo)'}
                  </p>
                  <p className="text-[10px] text-[#4a5f7e]">
                    ···{d.id_suffix} · {d.current ? 'Activo ahora' : `Última vez ${when(d.last_seen_at)}`}
                  </p>
                  {d.cooldown_until && (
                    <p className="text-[10px] font-semibold text-amber-700 inline-flex items-center gap-1">
                      <Hourglass size={10} aria-hidden="true" /> Límites reducidos hasta {when(d.cooldown_until)}
                    </p>
                  )}
                </div>
              </div>
              {d.current ? (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  disabled={busyRef === d.ref}
                  onClick={() => revoke(d)}
                  className="text-red-600 text-[11px] font-bold shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  Desvincular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[#4a5f7e]">
        Un dispositivo nuevo opera con límites reducidos durante 24 horas. Si no reconoces uno, desvincúlalo y cambia tu PIN.
      </p>
    </div>
  );
};

// ------------------------------------------------------------- límites
const toCents = (s: string) => Math.round((parseFloat(s.replace(',', '.')) || 0) * 100);
const toSoles = (c: number) => String(c / 100);

const Usage: React.FC<{ label: string; used: number; max: number; format: (n: number) => string }> = ({ label, used, max, format }) => {
  const pct = Math.min(100, max ? (used / max) * 100 : 0);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#4a5f7e]">{label}</span>
        <span className="font-bold text-[#151c27]">
          {format(used)} / {format(max)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#e1e8f8] overflow-hidden">
        <div className={`h-full rounded-full ${pct > 85 ? 'bg-amber-500' : 'bg-[#1a3bb0]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const LimitsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { data, setData, error, toast } = useSecureLoad(() => paymentsApi.getLimits(), onClose);
  const [form, setForm] = useState<{ perTx: string; daily: string; count: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (l: PaymentLimits) => setForm({ perTx: toSoles(l.own.per_tx_cents), daily: toSoles(l.own.daily_cents), count: String(l.own.daily_count) });

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await paymentsApi.updateLimits({ per_tx_cents: toCents(form.perTx), daily_cents: toCents(form.daily), daily_count: parseInt(form.count, 10) || 0 });
      setData(r);
      setForm(null);
      toast.success(r.pending ? `Listo. Las subidas rigen desde ${when(r.pending.effective_at)}.` : 'Límites actualizados.');
    } catch (e) {
      if (!isCancelled(e)) toast.error(e instanceof Error ? e.message : 'No pudimos guardar los límites.');
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    try {
      setData(await paymentsApi.cancelPendingLimits());
      toast.info('Cancelaste la subida pendiente.');
    } catch (e) {
      if (!isCancelled(e)) toast.error(e instanceof Error ? e.message : 'No pudimos cancelarla.');
    }
  };

  return (
    <div className="space-y-4">
      <Header title="Límites de cobro" onClose={onClose} />
      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {data && !form && (
        <>
          <div className="p-3 rounded-2xl bg-[#eff3ff] space-y-3">
            <p className="text-[11px] text-[#4a5f7e]">
              Nivel <strong className="text-[#151c27]">{data.tier_label}</strong> · hasta {soles(data.per_tx_cents)} por cobro
            </p>
            <Usage label="Cobrado hoy" used={data.usage_today.amount_cents} max={data.daily_cents} format={soles} />
            <Usage label="Cobros hoy" used={data.usage_today.count} max={data.daily_count} format={(n) => String(n)} />
            <p className="text-[10px] text-[#4a5f7e]">Te pedimos el PIN en cobros desde {soles(data.step_up_over_cents)}.</p>
          </div>
          {data.cooldown_until && (
            <p className="p-3 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-semibold">
              Por un cambio de seguridad reciente (dispositivo nuevo o PIN), tus límites están reducidos hasta {when(data.cooldown_until)}.
            </p>
          )}
          {data.pending && (
            <div className="p-3 rounded-xl bg-[#e7eefe] text-[11px] text-[#304670] flex items-center justify-between gap-2">
              <span>
                Subida pendiente a {soles(data.pending.per_tx_cents)} por cobro y {soles(data.pending.daily_cents)} por día · rige desde el {when(data.pending.effective_at)}
              </span>
              <button type="button" onClick={cancelPending} className="text-red-600 font-bold shrink-0 cursor-pointer">
                Cancelar
              </button>
            </div>
          )}
          <button type="button" onClick={() => edit(data)} className="w-full h-11 rounded-full bg-[#1a3bb0] text-white text-xs font-bold cursor-pointer">
            Ajustar mis límites
          </button>
          <p className="text-[10px] text-[#4a5f7e]">
            Bajar un límite rige al instante. Subirlo requiere tu PIN y se aplica 24 horas después, para que un tercero no pueda usarlo de inmediato.
          </p>
        </>
      )}
      {data && form && (
        <div className="space-y-3">
          {(
            [
              ['perTx', 'Máximo por cobro (S/)', data.tier_max.per_tx_cents / 100],
              ['daily', 'Máximo por día (S/)', data.tier_max.daily_cents / 100],
              ['count', 'Cobros por día', data.tier_max.daily_count]
            ] as const
          ).map(([key, label, max]) => (
            <div key={key} className="space-y-1">
              <label htmlFor={`lim-${key}`} className="text-[11px] font-bold text-[#4a5f7e]">
                {label} <span className="font-normal">· tu nivel permite hasta {key === 'count' ? max : max.toLocaleString('es-PE')}</span>
              </label>
              <input
                id={`lim-${key}`}
                type="number"
                inputMode="decimal"
                min={1}
                max={max}
                step={key === 'count' ? 1 : 0.01}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full h-11 px-4 rounded-xl bg-[#eff3ff] border border-[#c5c5d6] focus:border-[#00248b] focus:outline-none text-sm font-bold"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="flex-1 h-11 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-xs font-bold cursor-pointer">
              Volver
            </button>
            <button type="button" disabled={busy} onClick={save} className="flex-1 h-11 rounded-full bg-[#1a3bb0] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------- actividad
const ALERT_STYLE: Record<string, string> = {
  PAYMENT_RECEIVED: 'text-emerald-700 bg-emerald-50',
  NEW_DEVICE: 'text-amber-700 bg-amber-50',
  PIN_LOCKED: 'text-red-700 bg-red-50',
  SECURITY: 'text-red-700 bg-red-50'
};

export const SecurityActivityPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { data, error } = useSecureLoad(() => paymentsApi.getAlerts(), onClose);
  return (
    <div className="space-y-4">
      <Header title="Actividad de seguridad" onClose={onClose} />
      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {data && data.data.length === 0 && <p className="text-xs text-[#4a5f7e] py-4 text-center">Aún no hay actividad.</p>}
      {data && data.data.length > 0 && (
        <ul className="space-y-2">
          {data.data.map((a: SecurityAlert) => (
            <li key={a.id} className="p-3 rounded-2xl bg-[#f9f9ff] border border-[#e1e8f8] flex gap-3">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ALERT_STYLE[a.kind] ?? 'text-[#1a3bb0] bg-[#e7eefe]'}`}>
                <BellRing size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#151c27]">{a.title}</p>
                {a.body && <p className="text-[11px] text-[#4a5f7e] leading-snug">{a.body}</p>}
                <p className="text-[10px] text-[#4a5f7e] mt-0.5">{when(a.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[#4a5f7e]">Kuota nunca te pedirá tu PIN, claves ni códigos por WhatsApp, SMS o llamada.</p>
    </div>
  );
};
