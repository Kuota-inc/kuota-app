import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Fingerprint, Loader2, Settings, ShieldCheck, X } from 'lucide-react';
import { KuotaBiometric, biometricReasonText, type BiometricStatus } from '../plugins/kuotaBiometric';
import { useDialog } from '../hooks/useDialog';

type View = 'checking' | 'needs_phone' | 'ready' | 'registering' | 'done' | 'unsupported' | 'error';

/**
 * Registro de la huella en Kuota (no es solo un interruptor):
 *  1. Si el teléfono no tiene ninguna huella guardada, lleva a Ajustes para guardarla (solo el sistema puede hacerlo) y
 *     al volver continúa solo.
 *  2. Con huellas disponibles, pide pasar la huella una vez: ahí Kuota crea su vínculo seguro con ellas.
 *  3. Si luego cambian las huellas del teléfono, el vínculo se invalida y se registra de nuevo.
 */
export const BiometricSetupSheet: React.FC<{ onRegistered: () => void; onClose: () => void }> = ({ onRegistered, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('checking');
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [message, setMessage] = useState('');
  useDialog(ref, onClose, { enabled: view !== 'registering' });

  const check = useCallback(async () => {
    try {
      const st = await KuotaBiometric.status();
      setStatus(st);
      if (st.available) setView((v) => (v === 'registering' || v === 'done' ? v : 'ready'));
      else if (st.reason === 'NONE_ENROLLED') setView('needs_phone');
      else setView('unsupported');
    } catch {
      setView('unsupported');
    }
  }, []);

  useEffect(() => {
    void check();
    if (!Capacitor.isNativePlatform()) return;
    // Al volver de Ajustes (donde se guarda la huella) se revisa de nuevo y se pasa al registro.
    const sub = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void check();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [check]);

  const register = async () => {
    setMessage('');
    setView('registering');
    try {
      await KuotaBiometric.register({
        title: 'Registrar tu huella en Kuota',
        subtitle: 'Toca el sensor para vincular Kuota con las huellas de tu teléfono',
        negativeText: 'Cancelar'
      });
      setView('done');
      window.setTimeout(onRegistered, 1100);
    } catch (e: any) {
      setView('ready');
      if (e?.code === 'CANCELED') setMessage('Cancelaste el registro. Cuando quieras, vuelve a intentarlo.');
      else if (e?.code === 'LOCKOUT') setMessage('Demasiados intentos fallidos. Espera unos segundos o usa tu PIN.');
      else setMessage(e?.message || 'No pudimos registrar tu huella. Inténtalo otra vez.');
    }
  };

  const openSettings = async () => {
    try {
      await KuotaBiometric.openEnrollment();
    } catch {
      setMessage('No pudimos abrir los ajustes. Entra a Ajustes > Seguridad > Huella digital.');
    }
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-[#0b2545]/45" onClick={view === 'registering' ? undefined : onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Registrar huella" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#f9f9ff] rounded-t-[32px] px-5 pt-3 pb-7 space-y-4">
        <div className="mx-auto w-11 h-1.5 rounded-full bg-[#afc5f6]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#151c27] tracking-tight">Registrar tu huella</h2>
          {view !== 'registering' && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer"><X size={18} aria-hidden="true" /></button>
          )}
        </div>

        {view === 'checking' && (
          <p className="flex items-center gap-2 text-sm text-[#4a5f7e]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Revisando tu teléfono…</p>
        )}

        {view === 'needs_phone' && (
          <>
            <div className="p-4 rounded-2xl bg-white border border-[#e1e8f8] space-y-2">
              <p className="flex items-center gap-2 text-sm font-black text-[#151c27]"><Fingerprint size={18} className="text-[#1a3bb0]" aria-hidden="true" /> {biometricReasonText('NONE_ENROLLED')}</p>
              <ol className="text-xs text-[#4a5f7e] leading-relaxed list-decimal pl-4 space-y-0.5">
                <li>Toca “Abrir ajustes de huella”.</li>
                <li>Guarda tu huella en el teléfono (te pedirá tu bloqueo de pantalla).</li>
                <li>Vuelve a Kuota: seguimos con el registro automáticamente.</li>
              </ol>
            </div>
            <button type="button" onClick={() => void openSettings()} className="w-full h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.98] transition">
              <Settings size={17} aria-hidden="true" /> Abrir ajustes de huella
            </button>
          </>
        )}

        {(view === 'ready' || view === 'registering') && (
          <>
            <div className="p-4 rounded-2xl bg-white border border-[#e1e8f8] space-y-2.5">
              <p className="flex items-center gap-2 text-sm font-black text-[#151c27]"><ShieldCheck size={18} className="text-[#1a3bb0]" aria-hidden="true" /> Vincula Kuota con tus huellas</p>
              <ul className="text-xs text-[#4a5f7e] leading-relaxed space-y-1 list-disc pl-4">
                <li>Pasarás tu huella una vez para crear un vínculo seguro guardado en el teléfono. Tu huella nunca sale del teléfono ni llega a Kuota.</li>
                <li>Con ese vínculo desbloquearás Kuota sin escribir el PIN.</li>
                <li>Si agregas o quitas una huella en el teléfono, tendrás que registrarla de nuevo.</li>
                <li>Los cobros siguen pidiendo tu PIN.</li>
              </ul>
              {status?.invalidated && <p className="text-xs font-bold text-amber-800 bg-amber-50 rounded-xl p-2.5">Cambiaron las huellas guardadas en tu teléfono: por seguridad hay que registrarla de nuevo.</p>}
            </div>
            <button type="button" disabled={view === 'registering'} onClick={() => void register()} className="w-full h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.98] transition disabled:opacity-70">
              {view === 'registering' ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Esperando tu huella…</> : <><Fingerprint size={18} aria-hidden="true" /> Registrar huella ahora</>}
            </button>
          </>
        )}

        {view === 'done' && (
          <div className="py-4 text-center space-y-2" role="status">
            <span className="w-16 h-16 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center"><CheckCircle2 size={34} aria-hidden="true" /></span>
            <p className="text-lg font-black text-[#151c27]">¡Huella registrada!</p>
            <p className="text-xs text-[#4a5f7e]">Desde ahora desbloqueas Kuota con tu huella.</p>
          </div>
        )}

        {view === 'unsupported' && (
          <p className="p-4 rounded-2xl bg-white border border-[#e1e8f8] text-sm text-[#4a5f7e]">{biometricReasonText(status?.reason ?? 'UNSUPPORTED')}</p>
        )}

        {message && <p role="alert" className="text-xs font-bold text-[#93000a] bg-[#ffdad6] rounded-xl p-2.5">{message}</p>}
      </div>
    </div>
  );
};
