import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ToastContext, type ToastApi, type ToastItem, type ToastKind } from './toast-context';

// Avisos breves dentro del teléfono (reemplazan a window.alert, que bloquea la
// interfaz y se sale del diseño). `ToastViewport` va dentro de la pantalla del
// PhoneSimulator: su `position: fixed` queda relativo a ella.

const DURATION_MS: Record<ToastKind, number> = { success: 3200, info: 3200, error: 4800 };
const MAX_VISIBLE = 3;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.filter((t) => t.message !== message), { id, kind, message }].slice(-MAX_VISIBLE));
      timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION_MS[kind]));
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m)
    }),
    [push]
  );

  const value = useMemo(() => ({ api, items, dismiss }), [api, items, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

const ICON: Record<ToastKind, { name: string; color: string }> = {
  success: { name: 'check_circle', color: 'text-emerald-400' },
  error: { name: 'error', color: 'text-red-400' },
  info: { name: 'info', color: 'text-blue-300' }
};

export const ToastViewport: React.FC = () => {
  const ctx = useContext(ToastContext);
  const reduceMotion = useReducedMotion();
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed top-10 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {ctx.items.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            layout={!reduceMotion}
            role={t.kind === 'error' ? 'alert' : 'status'}
            aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            onClick={() => ctx.dismiss(t.id)}
            title="Cerrar aviso"
            className="pointer-events-auto max-w-full bg-[#0b2545] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-start gap-2 text-xs font-bold text-left border border-blue-400/30 cursor-pointer"
          >
            <span className={`material-symbols-outlined material-symbols-filled text-[18px] leading-none shrink-0 ${ICON[t.kind].color}`} aria-hidden="true">
              {ICON[t.kind].name}
            </span>
            <span className="leading-snug">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};
