import { createContext, useContext } from 'react';

// Contexto y hook de los avisos (ver components/Toast.tsx).

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

export const ToastContext = createContext<{ api: ToastApi; items: ToastItem[]; dismiss: (id: number) => void } | null>(null);

const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };

/** `const toast = useToast(); toast.success('Listo')`. Sin provider no hace nada. */
export function useToast(): ToastApi {
  return useContext(ToastContext)?.api ?? NOOP;
}
