import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Delete, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { CancelledError, setPinHandler, type PinPromptOptions } from '../api/payments';
import { DialogPanel } from './DialogPanel';
import { PinPromptContext, type PinRequestState } from './pin-prompt-context';

// Pedido de PIN para abrir sesión o confirmar una operación sensible. El
// resumen de la operación es el que envía el backend y el que queda en el
// registro de consentimiento del comercio.

export const PinPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<PinRequestState | null>(null);
  const busy = useRef(false);
  const nextId = useRef(1);

  useEffect(() => {
    setPinHandler(
      (opts: PinPromptOptions) =>
        new Promise<void>((resolve, reject) => {
          if (busy.current) {
            reject(new ApiError(0, 'PIN_BUSY', 'Ya hay una confirmación con PIN en curso.'));
            return;
          }
          busy.current = true;
          const done = () => {
            busy.current = false;
            setRequest(null);
          };
          setRequest({
            id: nextId.current++,
            opts,
            resolve: () => {
              done();
              resolve();
            },
            reject: (e) => {
              done();
              reject(e);
            }
          });
        })
    );
    return () => setPinHandler(null);
  }, []);

  const close = useCallback(() => request?.reject(new CancelledError()), [request]);
  const value = useMemo(() => ({ request, close }), [request, close]);
  return <PinPromptContext.Provider value={value}>{children}</PinPromptContext.Provider>;
};

/** Va dentro de la pantalla del PhoneSimulator (como ToastViewport). */
export const PinPromptHost: React.FC = () => {
  const ctx = useContext(PinPromptContext);
  const request = ctx?.request ?? null;
  return (
    <AnimatePresence>
      {request && <PinSheet key={request.id} request={request} onCancel={ctx!.close} />}
    </AnimatePresence>
  );
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

const PinSheet: React.FC<{ request: PinRequestState; onCancel: () => void }> = ({ request, onCancel }) => {
  const { opts } = request;
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await opts.verify(value);
      request.resolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos verificar el PIN.');
      setPin('');
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (busy) return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 6) return;
    const next = pin + key;
    setPin(next);
    if (error) setError(null);
    if (next.length === 6) void submit(next);
  };

  // Teclado físico (PC o teclado Bluetooth).
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') pressRef.current('del');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <motion.div
        className="absolute inset-0 bg-[rgba(11,37,69,0.45)] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <motion.div
        className="relative w-full"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <DialogPanel
          onClose={busy ? () => {} : onCancel}
          labelledBy="pin-prompt-title"
          className="w-full bg-white rounded-t-[28px] shadow-[0_8px_24px_rgba(11,37,69,0.18)] px-5 pt-3 pb-6 space-y-4"
        >
          <div className="w-10 h-1 bg-[#b6ccfd] rounded-full mx-auto" />
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#e7eefe] text-[#1a3bb0] flex items-center justify-center shrink-0">
              <ShieldCheck size={22} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="pin-prompt-title" className="text-base font-black text-[#151c27]">
                {opts.title}
              </h2>
              <p className="text-[11px] text-[#4a5f7e]">PIN de seguridad de 6 dígitos</p>
            </div>
          </div>

          {opts.summary && opts.kind === 'session' && <p className="text-xs text-[#4a5f7e]">{opts.summary}</p>}
          {opts.summary && opts.kind === 'action' && (
            <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#4a5f7e]">Vas a autorizar</p>
              <p className="text-sm font-bold text-[#0b2545] leading-snug mt-0.5">{opts.summary}</p>
            </div>
          )}

          <div className="flex justify-center gap-3 py-1" aria-live="polite" aria-label={`${pin.length} de 6 dígitos ingresados`}>
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition ${
                  i < pin.length ? 'bg-[#1a3bb0] border-[#1a3bb0]' : error ? 'border-red-400' : 'border-[#c5c5d6]'
                }`}
              />
            ))}
          </div>

          <div className="min-h-[18px] text-center" role="alert">
            {busy ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a3bb0]">
                <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" /> Verificando…
              </span>
            ) : error ? (
              <span className="text-xs font-semibold text-red-600">{error}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key, i) =>
              key === '' ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => press(key)}
                  aria-label={key === 'del' ? 'Borrar último dígito' : key}
                  className="h-12 rounded-2xl bg-[#f9f9ff] border border-[#e1e8f8] text-lg font-black text-[#0b2545] flex items-center justify-center active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {key === 'del' ? <Delete size={20} aria-hidden="true" /> : key}
                </button>
              )
            )}
          </div>

          <p className="text-[10px] text-center text-[#4a5f7e]">Kuota nunca te pedirá tu PIN por WhatsApp, SMS ni llamada.</p>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full h-11 rounded-full text-sm font-bold text-[#4a5f7e] hover:text-[#151c27] disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
        </DialogPanel>
      </motion.div>
    </div>
  );
};
