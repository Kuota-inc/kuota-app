import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Lock, Plus, Repeat } from 'lucide-react';
import { ApiError } from '../api/client';
import { availableProfiles, PROFILE_META, profilesApi, setActiveProfile, type ProfileAccess, type ProfileKind } from '../api/profiles';
import { setProviderId, setProviderToken } from '../api/client';
import { useDialog } from '../hooks/useDialog';
import { useToast } from './toast-context';

export const SWITCH_EVENT = 'kuota:switch-profile';
export const ADD_RUC_EVENT = 'kuota:add-ruc';

/** Botón de perfil (arriba a la derecha): muestra el perfil activo y permite cambiar sin volver a iniciar sesión. */
export const ProfileSwitcher: React.FC<{ active: ProfileKind }> = ({ active }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<ProfileAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, () => setOpen(false), { enabled: open });

  const dual = availableProfiles().length === 2;
  const other: ProfileKind = active === 'EMPRENDEDOR' ? 'PROVIDER' : 'EMPRENDEDOR';

  useEffect(() => {
    if (!open || active !== 'EMPRENDEDOR') return;
    profilesApi.access().then(setAccess).catch(() => setAccess(null));
  }, [open, active]);

  const doSwitch = (p: ProfileKind) => {
    setOpen(false);
    setActiveProfile(p);
    window.dispatchEvent(new CustomEvent(SWITCH_EVENT, { detail: p }));
  };

  const createProvider = async () => {
    setBusy(true);
    try {
      const r = await profilesApi.createProvider();
      setProviderId(r.provider_id);
      setProviderToken(r.provider_token);
      toast.success('Tu perfil Provider está listo.');
      doSwitch('PROVIDER');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No pudimos crear tu perfil Provider.');
    } finally {
      setBusy(false);
    }
  };

  // Un solo perfil y sin RUC verificado: el botón igual invita a abrir el otro perfil (solo desde Emprendedor).
  if (!dual && active === 'PROVIDER') return null;
  const meta = PROFILE_META[active];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Perfil activo: ${meta.label}. Cambiar de perfil`}
        className="cursor-pointer h-9 pl-2.5 pr-2 rounded-full text-white text-[11px] font-black flex items-center gap-1 shadow-sm"
        style={{ background: meta.color }}
      >
        {meta.label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/45" onClick={() => setOpen(false)}>
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Cambiar de perfil"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-7 space-y-3"
          >
            <h2 className="text-lg font-black text-[#0b2545] flex items-center gap-2">
              <Repeat size={18} aria-hidden="true" /> Tus perfiles
            </h2>

            <div className="p-3.5 rounded-2xl border-2 flex items-center justify-between" style={{ borderColor: meta.color, background: meta.soft }}>
              <div>
                <p className="text-sm font-black text-[#0b2545]">{meta.label}</p>
                <p className="text-[11px] text-[#4a5f7e]">Perfil activo</p>
              </div>
              <Check size={18} style={{ color: meta.color }} aria-hidden="true" />
            </div>

            {dual ? (
              <button
                type="button"
                onClick={() => doSwitch(other)}
                className="w-full p-3.5 rounded-2xl border border-[#e1e8f8] text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="text-sm font-black text-[#0b2545]">{PROFILE_META[other].label}</p>
                  <p className="text-[11px] text-[#4a5f7e]">{PROFILE_META[other].hint}</p>
                </div>
                <span className="text-xs font-black" style={{ color: PROFILE_META[other].color }}>Cambiar</span>
              </button>
            ) : access?.can_have_provider ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createProvider()}
                className="w-full p-3.5 rounded-2xl border border-[#e1e8f8] text-left flex items-center justify-between cursor-pointer disabled:opacity-60"
              >
                <div>
                  <p className="text-sm font-black text-[#0b2545]">Crear perfil Provider</p>
                  <p className="text-[11px] text-[#4a5f7e]">Usamos tu RUC ya validado, no se pide de nuevo.</p>
                </div>
                <Plus size={18} className="text-[#0f766e]" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent(ADD_RUC_EVENT, { detail: 'profile' }));
                }}
                className="w-full p-3.5 rounded-2xl border border-dashed border-[#9aa8c9] text-left flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="text-sm font-black text-[#0b2545]">Abre tu perfil Provider</p>
                  <p className="text-[11px] text-[#4a5f7e]">Agrega tu RUC para vender y abrir tu perfil Provider.</p>
                </div>
                <Lock size={18} className="text-[#4a5f7e]" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
