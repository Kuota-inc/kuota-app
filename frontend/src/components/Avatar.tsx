import React, { useEffect, useState } from 'react';
import { API_ORIGIN } from '../api/client';

/** URL de la foto: el servidor la entrega relativa (/api/v1/public/avatar/…). Solo se aceptan rutas de ese tipo. */
export const avatarSrc = (url: string | null | undefined): string | null => {
  if (!url || !url.startsWith('/api/v1/public/avatar/')) return null;
  return `${API_ORIGIN}${url}`;
};

const initialsOf = (name: string | null | undefined) =>
  (name ?? '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/** Foto del comercio o, si no tiene (o no carga), sus iniciales. */
export const Avatar: React.FC<{ url?: string | null; name?: string | null; size?: number; rounded?: string; className?: string }> = ({
  url,
  name,
  size = 48,
  rounded = 'rounded-full',
  className = ''
}) => {
  const src = avatarSrc(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#e7eefe] text-[#00248b] font-black ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {src && !failed ? (
        <img src={src} alt={name ? `Foto de ${name}` : 'Foto de perfil'} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
};
