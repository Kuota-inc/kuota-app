import React, { useState } from 'react';
import { avatarSrc } from '../utils/avatar';

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
  // Se recuerda cuál foto falló: si la persona cambia de foto, la nueva se intenta de nuevo.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#e7eefe] text-[#00248b] font-black ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {src && failedSrc !== src ? (
        <img src={src} alt={name ? `Foto de ${name}` : 'Foto de perfil'} className="w-full h-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
};
