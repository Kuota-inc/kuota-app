// Detección automática de abonos Yape/Plin a partir de las notificaciones del celular.
//
// Dos condiciones para estar ACTIVO:
//   1. Permiso de Android "Acceso a notificaciones" concedido a Kuota (lo da la persona en Ajustes).
//   2. Preferencia encendida (interruptor de Perfil).
// Cada notificación de pago reconocida registra una venta DECLARADA (no verificada) en la cuenta:
// una notificación no es un comprobante, así que no suma como venta verificada.
import { Capacitor } from '@capacitor/core';
import { api } from '../api/client';
import { KuotaNotifications } from '../plugins/kuotaNotifications';
import { isListenerPreferred, onSettingsChange, setListenerPreferred } from './appSettings';

export type ListenerStatus = 'UNSUPPORTED' | 'NO_PERMISSION' | 'OFF' | 'ACTIVE';

let granted = false;
let handle: { remove: () => void } | null = null;
let onCaptured: ((info: { amountCents: number; source: 'YAPE' | 'PLIN' }) => void) | null = null;
const subscribers = new Set<() => void>();
const SEEN_KEY = 'kuota.listener.seen';

const emit = () => subscribers.forEach((fn) => fn());
export const onListenerChange = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
export const setCaptureHandler = (fn: typeof onCaptured) => {
  onCaptured = fn;
};

export function listenerStatus(): ListenerStatus {
  if (!Capacitor.isNativePlatform()) return 'UNSUPPORTED';
  if (!granted) return 'NO_PERMISSION';
  return isListenerPreferred() ? 'ACTIVE' : 'OFF';
}

function seenBefore(key: string): boolean {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    if (list.includes(key)) return true;
    list.push(key);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* sin almacenamiento: se registra igual */
  }
  return false;
}

function detach() {
  handle?.remove();
  handle = null;
}

async function attach() {
  if (handle) return;
  handle = await KuotaNotifications.addListener('notificationCaptured', (data) => {
    if (!isListenerPreferred() || !data.amountCents || data.amountCents <= 0) return;
    // Android repite una notificación al actualizarla: se ignora la misma en el mismo minuto.
    const minute = Math.floor(Date.now() / 60_000);
    const key = `${data.appPackage}|${data.amountCents}|${(data.text ?? '').slice(0, 40)}|${minute}`;
    if (seenBefore(key)) return;
    const source: 'YAPE' | 'PLIN' = /yape/i.test(data.appPackage ?? '') ? 'YAPE' : 'PLIN';
    api
      .simulateOcr({
        amount_cents: data.amountCents,
        source,
        concept: `Abono ${source === 'YAPE' ? 'Yape' : 'Plin'} detectado${data.title ? ` · ${data.title}`.slice(0, 60) : ''}`,
        operation_ref: `NTF-${Date.now().toString(36).toUpperCase()}`
      })
      .then(() => onCaptured?.({ amountCents: data.amountCents, source }))
      .catch(() => {
        /* sin sesión o sin red: la venta se puede registrar a mano */
      });
  });
}

/** Vuelve a leer el permiso del sistema y ajusta la suscripción. Llamar al abrir y al volver a la app. */
export async function refreshListener(): Promise<ListenerStatus> {
  if (!Capacitor.isNativePlatform()) return 'UNSUPPORTED';
  try {
    granted = (await KuotaNotifications.checkPermission()).granted;
  } catch {
    granted = false;
  }
  if (granted && isListenerPreferred()) await attach();
  else detach();
  emit();
  return listenerStatus();
}

/** Enciende: sin permiso abre los ajustes de Android; con permiso, activa. */
export async function enableListener(): Promise<'ACTIVE' | 'NEEDS_PERMISSION'> {
  setListenerPreferred(true);
  await refreshListener();
  if (!granted) {
    await KuotaNotifications.openSettings().catch(() => {});
    return 'NEEDS_PERMISSION';
  }
  return 'ACTIVE';
}

export async function disableListener() {
  setListenerPreferred(false);
  await refreshListener();
}

onSettingsChange(() => {
  void refreshListener();
});
