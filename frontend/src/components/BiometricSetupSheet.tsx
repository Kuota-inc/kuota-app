import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Fingerprint, KeyRound, Loader2, Settings, ShieldCheck, X } from 'lucide-react';
import { KuotaBiometric, biometricReasonText, type BiometricStatus } from '../plugins/kuotaBiometric';
import { openSessionWithPin } from '../api/payments';
import { useDialog } from '../hooks/useDialog';

type View = 'checking' | 'needs_phone' | 'ready' | 'registering' | 'done' | 'unsupported';

/**
 * Registro de la huella en Kuota (no es solo un interruptor):
 *  1. Escribes tu PIN una vez: el servidor lo verifica (así se sabe que es el correcto).
 *  2. Si el teléfono no tiene ninguna huella guardada, te lleva a Ajustes para guardarla (solo el sistema puede hacerlo) y
 *     al volver continúa solo.
 *  3. Pasas tu huella una vez: Kuota sella tu PIN con una clave del teléfono que solo se abre con tu huella. Desde ahí,
 *     donde Kuota pide el PIN puedes usar la huella.
 *  4. Si luego cambian las huellas del teléfono o cambias tu PIN, el registro se borra y se hace de nuevo.
 */
export const BiometricSetupSheet: React.FC<{ onRegistered: () => void; onClose: () => void }> = ({ onRegistered, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pinRef = useRef(''); // solo en memoria y solo mientras dura el registro
  const [pin, setPin] = useState('');
  const [pinOk, setPinOk] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [view, setView] = useState<View>('checking');
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [message, setMessage] = useState('');
  useDialog(ref, onClose, { enabled: view !== 'registering' && !pinBusy });

  useEffect(() => () => {
    pinRef.current = '';
  }, []);

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
    if (!pinOk) return;
    void check();
    if (!Capacitor.isNativePlatform()) return;
    // Al volver de Ajustes (donde se guarda la huella) se revisa de nuevo y se pasa al registro.
    const sub = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void check();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [pinOk, check]);

  const submitPin = async () => {
    if (!/^\d{6}$/.test(pin) || pinBusy) return;
    setPinBusy(true);
    setMessage('');
    try {
      await openSessionWithPin(pin); // el servidor verifica el PIN (con su límite de intentos)
      pinRef.current = pin;
      setPin('');
      setPinOk(true);
    } catch (e: any) {
      setMessage(e?.message || 'No pudimos verificar tu PIN.');
      setPin('');
    } finally {
      setPinBusy(false);
    }
  };

  const register = async () => {
    setMessage('');
    setView('registering');
    try {
      await KuotaBiometric.register({
        pin: pinRef.current,
        title: 'Registrar tu huella en Kuota',
        subtitle: 'Toca el sensor para vincular Kuota con las huellas de tu teléfono',
        negativeText: 'Cancelar'
      });
      pinRef.current = '';
      setView('done');
      window.setTimeout(onRegistered, 1100);
    } catch (e: any) {
      setView('ready');
      if (e?.code === 'CANCELED') setMessage('Cancelaste el registro. Cuando quieras, vuelve a intentarlo.');
      else if (e?.code === 'LOCKOUT') setMessage('Demasiados intentos fallidos. Espera unos segundos e inténtalo de nuevo.');
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

  const busy = view === 'registering' || pinBusy;

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-[#0b2545]/45" onClick={busy ? undefined : onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Registrar huella" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#f9f9ff] rounded-t-[32px] px-5 pt-3 pb-7 space-y-4">
        <div className="mx-auto w-11 h-1.5 rounded-full bg-[#afc5f6]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#151c27] tracking-tight">Registrar tu huella</h2>
          {!busy && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer"><X size={18} aria-hidden="true" /></button>
          )}
        </div>

        {!pinOk && (
          <>
            <div className="p-4 rounded-2xl bg-white border border-[#e1e8f8] space-y-2">
              <p className="flex items-center gap-2 text-sm font-black text-[#151c27]"><KeyRound size={18} className="text-[#1a3bb0]" aria-hidden="true" /> Primero, tu PIN</p>
              <p className="text-xs text-[#4a5f7e] leading-relaxed">Lo verificamos una vez. Después, donde Kuota te pida el PIN podrás usar tu huella.</p>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && void submitPin()}
                aria-label="Tu PIN de 6 dígitos"
                placeholder="••••••"
                className="w-full h-12 px-4 rounded-2xl bg-[#eff3ff] text-center text-xl tracking-[0.5em] font-black text-[#0b2545] outline-none focus:ring-2 focus:ring-[#1a3bb0]/40"
              />
            </div>
            <button type="button" disabled={pin.length !== 6 || pinBusy} onClick={() => void submitPin()} className="w-full h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.98] transition disabled:opacity-50">
              {pinBusy ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Verificando…</> : 'Continuar'}
            </button>
          </>
        )}

        {pinOk && view === 'checking' && (
          <p className="flex items-center gap-2 text-sm text-[#4a5f7e]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Revisando tu teléfono…</p>
        )}

        {pinOk && view === 'needs_phone' && (
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

        {pinOk && (view === 'ready' || view === 'registering') && (
          <>
            <div className="p-4 rounded-2xl bg-white border border-[#e1e8f8] space-y-2.5">
              <p className="flex items-center gap-2 text-sm font-black text-[#151c27]"><ShieldCheck size={18} className="text-[#1a3bb0]" aria-hidden="true" /> Vincula Kuota con tus huellas</p>
              <ul className="text-xs text-[#4a5f7e] leading-relaxed space-y-1 list-disc pl-4">
                <li>Pasarás tu huella una vez. Tu huella nunca sale del teléfono ni llega a Kuota.</li>
                <li>Desbloquearás Kuota y, donde te pida el PIN (cobros, confirmaciones), podrás usar la huella.</li>
                <li>Si agregas o quitas una huella en el teléfono, o cambias tu PIN, tendrás que registrarla de nuevo.</li>
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
            <p className="text-xs text-[#4a5f7e]">Desde ahora puedes usar tu huella donde Kuota te pide el PIN.</p>
          </div>
        )}

        {pinOk && view === 'unsupported' && (
          <p className="p-4 rounded-2xl bg-white border border-[#e1e8f8] text-sm text-[#4a5f7e]">{biometricReasonText(status?.reason ?? 'UNSUPPORTED')}</p>
        )}

        {message && <p role="alert" className="text-xs font-bold text-[#93000a] bg-[#ffdad6] rounded-xl p-2.5">{message}</p>}
      </div>
    </div>
  );
};
