import React, { useRef, useState } from 'react';
import { BadgeCheck, X } from 'lucide-react';
import { ApiError } from '../../api/client';
import { profilesApi } from '../../api/profiles';
import { useDialog } from '../../hooks/useDialog';

/** "Agregar mi RUC": se valida en SUNAT, se muestra la razón social para confirmar y se guarda en el mismo usuario. */
export const AddRucSheet: React.FC<{ reason: 'sell' | 'profile'; onClose: () => void; onDone: () => void }> = ({ reason, onClose, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { enabled: true });
  const [ruc, setRuc] = useState('');
  const [found, setFound] = useState<{ razon_social: string; direccion: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const lookup = async () => {
    setError(null);
    setBusy(true);
    try {
      setFound(await profilesApi.lookupRuc(ruc));
    } catch (e) {
      setFound(null);
      setError(e instanceof ApiError ? e.message : 'No pudimos validar el RUC. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await profilesApi.addRuc(ruc);
      // RUC de empresa: queda en revisión de titularidad; se avisa y no se habilita vender todavía.
      if (r.review === 'PENDING') setPending(r.message ?? 'Recibimos tu RUC. Lo verificamos y te avisamos para que puedas vender.');
      else onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar el RUC. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/45" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Agregar mi RUC" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-7 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0b2545]">Agregar mi RUC</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-[#eff3ff] flex items-center justify-center cursor-pointer">
            <X size={18} className="text-[#0b2545]" />
          </button>
        </div>
        <p className="text-sm text-[#4a5f7e] leading-snug">
          {reason === 'sell'
            ? 'Para vender y cobrar con tarjeta necesitas un RUC. Sigues con el mismo teléfono, clave e historial.'
            : 'Con tu RUC puedes vender y abrir tu perfil Proveedor, sin crear otra cuenta.'}
        </p>

        <label className="block text-xs font-bold text-[#0b2545]" htmlFor="ruc-input">RUC (11 dígitos)</label>
        <input
          id="ruc-input"
          inputMode="numeric"
          maxLength={11}
          value={ruc}
          onChange={(e) => {
            setRuc(e.target.value.replace(/\D/g, ''));
            setFound(null);
            setError(null);
          }}
          className="w-full px-3.5 py-3 rounded-2xl border border-[#c5cfe8] text-base font-bold text-[#0b2545] outline-none focus:border-[#1a3bb0]"
          placeholder="20123456789"
        />

        {found && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-2">
            <BadgeCheck size={18} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">¿Es tu negocio?</p>
              <p className="text-sm font-black text-[#0b2545]">{found.razon_social}</p>
              {found.direccion && <p className="text-[11px] text-[#4a5f7e]">{found.direccion}</p>}
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        {pending && (
          <div role="status" className="rounded-2xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-sm font-bold text-amber-900">RUC en revisión</p>
            <p className="text-xs text-amber-900 leading-snug">{pending}</p>
            <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl bg-[#1a3bb0] text-white text-sm font-black cursor-pointer">Entendido</button>
          </div>
        )}

        {found ? (
          <button type="button" disabled={busy} onClick={() => void confirm()} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-sm cursor-pointer disabled:opacity-60">
            {busy ? 'Guardando…' : 'Sí, es mi negocio'}
          </button>
        ) : (
          <button type="button" disabled={busy || ruc.length !== 11} onClick={() => void lookup()} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-sm cursor-pointer disabled:opacity-50">
            {busy ? 'Validando en SUNAT…' : 'Validar RUC'}
          </button>
        )}
        <button type="button" onClick={onClose} className="w-full py-2 text-sm font-bold text-[#4a5f7e] cursor-pointer">Ahora no</button>
      </div>
    </div>
  );
};
