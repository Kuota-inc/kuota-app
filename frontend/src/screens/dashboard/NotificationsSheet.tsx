import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { api, type Workshop } from '../../api/client';
import { workshopWhen } from '../../utils/workshopWhen';
import { useDialog } from '../../hooks/useDialog';

// Bottom sheet "Notificaciones en Kuota" (Stitch · Kuota Fintech Design System).
// Se abre desde la campana del Home. Carga y guarda las preferencias en
// /merchants/me/notifications/preferences y marca las notificaciones como vistas.

interface NotificationsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama cuando el backend confirma que las notificaciones quedaron vistas. */
  onSeen?: () => void;
}

const BENEFITS = [
  {
    icon: 'payments',
    title: 'Confirmamos tus ventas al instante',
    text: 'Alertas inmediatas de pagos con Yape, Plin y tarjeta.'
  },
  {
    icon: 'trending_up',
    title: 'Aviso de aumento de crédito',
    text: 'Notificación cuando tu línea en Kuota suba de nivel y puedas comprar más insumos.'
  },
  {
    icon: 'groups',
    title: 'Conecta con más emprendedores',
    text: 'Invitaciones exclusivas a ferias, compras grupales y networking comercial.'
  }
];

// Respaldo si el backend no responde: mañana 7:00 PM (Lima).
const FALLBACK_WORKSHOP: Workshop = {
  id: 'wk_sunat_formalizacion',
  title: 'Mentorías y Formalización: Cómo declarar tus ingresos ante SUNAT sin enredos',
  speaker: 'Especialista Contable B2B',
  channel: 'Vía Zoom',
  seats_note: 'Cupos limitados',
  starts_at: (() => {
    const d = new Date(Date.now() + 86_400_000);
    return `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)}T19:00:00-05:00`;
  })(),
  free_for_clients: true,
  reminder_set: false
};

const FILL = { fontVariationSettings: "'FILL' 1" } as const;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({ isOpen, onClose, onSeen }) => (
  <AnimatePresence>{isOpen && <SheetContent onClose={onClose} onSeen={onSeen} />}</AnimatePresence>
);

// Se monta en cada apertura: el estado empieza limpio y se recarga del backend.
const SheetContent: React.FC<{ onClose: () => void; onSeen?: () => void }> = ({ onClose, onSeen }) => {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [pushActive, setPushActive] = useState(true);
  const [reminderSet, setReminderSet] = useState(false);
  const [workshop, setWorkshop] = useState<Workshop>(FALLBACK_WORKSHOP);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  });

  // Carga inicial + marcar como vistas (una vez por apertura).
  useEffect(() => {
    let alive = true;
    api
      .getNotificationPreferences()
      .then((s) => {
        if (!alive) return;
        setPushActive(s.push_enabled);
        setReminderSet(s.workshop.reminder_set);
        setWorkshop(s.workshop);
      })
      .catch(() => alive && setOffline(true))
      .finally(() => alive && setLoading(false));
    api
      .markNotificationsSeen()
      .then(() => alive && onSeenRef.current?.())
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Escape, foco atrapado y devolución del foco a la campana (hooks/useDialog).
  useDialog(sheetRef, onClose, { initialFocus: closeBtnRef });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const handleSave = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    try {
      const s = await api.saveNotificationPreferences({ push_enabled: pushActive, workshop_reminder: reminderSet });
      setPushActive(s.push_enabled);
      setReminderSet(s.workshop.reminder_set);
      setOffline(false);
      setSaveState('saved');
      timers.current.push(window.setTimeout(onClose, reduceMotion ? 300 : 700));
    } catch {
      setSaveState('error');
    }
  }, [saveState, pushActive, reminderSet, onClose, reduceMotion]);

  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, damping: 28, stiffness: 280 };
  const when = workshopWhen(workshop.starts_at);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Scrim */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-[rgba(11,37,69,0.45)] backdrop-blur-sm cursor-pointer"
      />

      {/* Sheet: se arrastra hacia abajo solo desde el asa para no chocar con el scroll. */}
      <motion.section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-sheet-title"
        aria-describedby="notif-sheet-desc"
        aria-busy={loading}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 550) onClose();
        }}
        className="relative z-10 w-full bg-[#FFFEFF] rounded-t-[28px] shadow-[0_8px_24px_rgba(11,37,69,0.18)] flex flex-col pt-3 pb-8 px-5 max-h-[92%] overflow-y-auto overscroll-contain font-['Inter'] text-[#151c27]"
      >
        {/* Drag handle */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="w-full flex justify-center py-1 touch-none cursor-grab active:cursor-grabbing"
          aria-hidden="true"
        >
          <div className="w-10 h-1 bg-[#b6ccfd] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mt-2 mb-3">
          <div className="w-12 h-12 rounded-full bg-[#e7eefe] flex items-center justify-center text-[#1a3bb0]" aria-hidden="true">
            <span className="material-symbols-outlined text-[26px]" style={FILL}>
              {pushActive ? 'notifications_active' : 'notifications_paused'}
            </span>
          </div>
          <motion.button
            ref={closeBtnRef}
            type="button"
            aria-label="Cerrar notificaciones"
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4A5F7E] hover:bg-[#e7eefe] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </motion.button>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1 mb-5">
          <h2 id="notif-sheet-title" className="font-['Plus_Jakarta_Sans'] text-[22px] leading-7 font-semibold tracking-tight">
            Notificaciones en Kuota
          </h2>
          <p id="notif-sheet-desc" className="text-sm text-[#4A5F7E]">
            Mantente al día con el crecimiento de tu negocio
          </p>
        </div>

        {offline && (
          <div role="status" className="mb-4 -mt-1 flex items-center gap-2 rounded-xl bg-[#fff4e5] px-3 py-2 text-xs text-[#7a4b00]">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">cloud_off</span>
            Sin conexión con Kuota: mostramos tus valores por defecto.
          </div>
        )}

        {/* Master toggle */}
        <div className="w-full bg-[#eff3ff] rounded-[20px] p-4 flex items-center justify-between mb-5 shadow-sm">
          <div className="flex flex-col gap-1 pr-3">
            <span id="push-label" className="font-['Plus_Jakarta_Sans'] text-[17px] leading-6 font-semibold">
              Activar notificaciones push
            </span>
            <div className="flex items-center gap-1.5">
              <span
                aria-live="polite"
                className={`px-2 py-0.5 rounded-full font-['Plus_Jakarta_Sans'] text-[13px] leading-4 font-semibold transition-colors ${
                  pushActive ? 'bg-[#d8e2ff] text-[#001a41]' : 'bg-[#e7eefe] text-[#4A5F7E]'
                }`}
              >
                {pushActive ? 'Activadas' : 'Pausadas'}
              </span>
              <span className="text-xs text-[#4A5F7E]">Canal instantáneo</span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushActive}
            aria-labelledby="push-label"
            disabled={loading}
            onClick={() => {
              setPushActive((v) => !v);
              if (saveState === 'error') setSaveState('idle');
            }}
            className={`w-[52px] h-[32px] shrink-0 rounded-full p-1 flex items-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff] disabled:opacity-60 ${
              pushActive ? 'bg-[#1a3bb0] justify-end' : 'bg-[#c5c5d6] justify-start'
            }`}
          >
            <motion.span
              layout={!reduceMotion}
              transition={{ type: 'spring', damping: 26, stiffness: 420 }}
              className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
            >
              {pushActive && <span className="material-symbols-outlined text-[14px] text-[#1a3bb0]" aria-hidden="true">check</span>}
            </motion.span>
          </button>
        </div>

        {/* Value proposition */}
        <div className={`flex flex-col gap-3 mb-6 transition-opacity duration-200 ${pushActive ? '' : 'opacity-55'}`}>
          <div className="p-3.5 bg-[#e7eefe] rounded-xl">
            <p className="text-sm leading-snug">
              Con las notificaciones confirmamos tus ventas, te avisamos cuando tu crédito aumente, y la próxima
              oportunidad de conectar con más emprendedores
            </p>
          </div>
          <ul className="flex flex-col gap-3 mt-1">
            {BENEFITS.map((b) => (
              <li key={b.icon} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#e1e8f8] shrink-0 flex items-center justify-center text-[#1a3bb0] mt-0.5" aria-hidden="true">
                  <span className="material-symbols-outlined text-[20px]" style={FILL}>{b.icon}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-['Plus_Jakarta_Sans'] text-[13px] leading-4 font-semibold tracking-[0.01em]">{b.title}</span>
                  <span className="text-xs text-[#4A5F7E] leading-tight mt-0.5">{b.text}</span>
                </div>
              </li>
            ))}
          </ul>
          {!pushActive && (
            <p className="text-xs text-[#4A5F7E]">
              Con las notificaciones pausadas solo verás estos avisos dentro de la app.
            </p>
          )}
        </div>

        {/* Workshop */}
        <div className="w-full flex flex-col gap-2 mb-6">
          <div className="flex items-center justify-between">
            <span className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold text-[#4A5F7E] uppercase tracking-wider">
              Nuestro próximo taller
            </span>
            {workshop.free_for_clients && <span className="text-xs font-medium text-[#00248b]">Gratis para clientes</span>}
          </div>
          <div className="w-full bg-[#eff3ff] rounded-[22px] p-4 flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="relative flex w-2 h-2" aria-hidden="true">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#ba1a1a] opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-[#ba1a1a]" />
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-tight">
                Taller en vivo{when && ` · ${when}`}
              </span>
            </div>
            <h3 className="font-['Plus_Jakarta_Sans'] text-[17px] leading-snug font-semibold">{workshop.title}</h3>
            <div className="flex items-center gap-2 text-[#4A5F7E]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">videocam</span>
              <span className="text-xs leading-tight">
                Expositor: {workshop.speaker} · {workshop.channel} ({workshop.seats_note})
              </span>
            </div>
            <motion.button
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              disabled={loading}
              onClick={() => {
                setReminderSet((v) => !v);
                if (saveState === 'error') setSaveState('idle');
              }}
              aria-pressed={reminderSet}
              className={`mt-1 w-full h-11 rounded-full flex items-center justify-center gap-2 font-['Plus_Jakarta_Sans'] text-base font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff] disabled:opacity-60 ${
                reminderSet ? 'bg-[#1a3bb0] text-white' : 'bg-[#d8e2ff] text-[#001a41] hover:bg-[#b6ccfd]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{reminderSet ? 'task_alt' : 'add_alert'}</span>
              <span>{reminderSet ? '¡Recordatorio agendado!' : 'Recordarme este taller'}</span>
            </motion.button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 w-full pt-1">
          {saveState === 'error' && (
            <p role="alert" className="text-center text-xs font-medium text-[#93000a]">
              No pudimos guardar tus preferencias. Revisa tu conexión e inténtalo otra vez.
            </p>
          )}
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={handleSave}
            disabled={loading || saveState === 'saving' || saveState === 'saved'}
            className={`w-full h-14 rounded-full text-white font-['Plus_Jakarta_Sans'] text-base font-semibold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(26,59,176,0.24)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff] disabled:cursor-default ${
              saveState === 'saved' ? 'bg-[#33496b]' : saveState === 'error' ? 'bg-[#ba1a1a]' : 'bg-[#1a3bb0] hover:opacity-95'
            } ${loading ? 'opacity-70' : ''}`}
          >
            <span aria-live="polite" className="flex items-center gap-2">
              {saveState === 'idle' && (
                <>
                  <span>Guardar preferencias</span>
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>
                </>
              )}
              {saveState === 'saving' && (
                <>
                  <span className="material-symbols-outlined text-[20px] motion-safe:animate-spin" aria-hidden="true">progress_activity</span>
                  <span>Guardando...</span>
                </>
              )}
              {saveState === 'saved' && (
                <>
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">check_circle</span>
                  <span>Preferencias guardadas</span>
                </>
              )}
              {saveState === 'error' && (
                <>
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">refresh</span>
                  <span>Reintentar</span>
                </>
              )}
            </span>
          </motion.button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-full text-[#4A5F7E] font-['Plus_Jakarta_Sans'] text-base font-semibold hover:text-[#151c27] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
          >
            Configurar más tarde
          </button>
        </div>
      </motion.section>
    </div>
  );
};
