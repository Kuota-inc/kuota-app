import { createContext } from 'react';
import type { PinPromptOptions } from '../api/payments';

// Estado compartido entre PinPromptProvider (registra el pedido de PIN para la
// capa de API) y PinPromptHost (dibuja el panel dentro del teléfono).
export interface PinRequestState {
  id: number;
  opts: PinPromptOptions;
  resolve: () => void;
  reject: (e: unknown) => void;
}

export const PinPromptContext = createContext<{ request: PinRequestState | null; close: () => void } | null>(null);
