import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * QR generado en el dispositivo: el link de cobro no se envía a ningún
 * servicio externo para dibujarlo.
 */
export const QrCode: React.FC<{ value: string; size?: number; label: string }> = ({ value, size = 160, label }) => {
  const [src, setSrc] = useState<{ value: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size * 2, color: { dark: '#0b2545', light: '#ffffff' } })
      .then((url) => alive && setSrc({ value, url }))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src || src.value !== value) {
    return <div className="rounded-xl bg-slate-100 motion-safe:animate-pulse" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return <img src={src.url} alt={label} width={size} height={size} className="rounded-xl shadow-sm" />;
};
