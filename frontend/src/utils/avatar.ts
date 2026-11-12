import { API_ORIGIN } from '../api/client';

/** URL de la foto: el servidor la entrega relativa (/api/v1/public/avatar/…). Solo se aceptan rutas de ese tipo. */
export const avatarSrc = (url: string | null | undefined): string | null => {
  if (!url || !url.startsWith('/api/v1/public/avatar/')) return null;
  return `${API_ORIGIN}${url}`;
};
