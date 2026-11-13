import React, { useEffect, useRef, useState } from 'react';
import { X, ScanLine } from 'lucide-react';
import jsQR from 'jsqr';
import { useDialog } from '../hooks/useDialog';

/** Lector de QR con la cámara trasera. Devuelve el texto del primer QR legible; no envía nada a ningún servidor. */
export const QrScannerModal: React.FC<{
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}> = ({ onResult, onClose, title, hint }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useDialog(sheetRef, onClose, { enabled: true });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este dispositivo no permite usar la cámara aquí.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        timer = window.setInterval(() => {
          if (!ctx || video.videoWidth === 0) return;
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) onResult(code.data);
        }, 250);
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Kuota no tiene permiso para usar la cámara. Actívalo en Ajustes del teléfono > Aplicaciones > Kuota > Permisos.'
            : e?.message || 'No pudimos abrir la cámara.'
        );
      }
    })();

    return () => {
      alive = false;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  // onResult cambia en cada render del padre: el lector se abre una sola vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[68] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Escanear código QR">
      <div ref={sheetRef} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 text-white">
          <p className="font-black text-base flex items-center gap-2"><ScanLine size={18} aria-hidden="true" /> {title ?? 'Escanea el QR de cobro'}</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center cursor-pointer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <div className="relative w-64 h-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.55)]" />
        </div>
        <p className="p-5 text-center text-sm text-white/90 min-h-[72px]">
          {error ?? (hint ?? 'Apunta la cámara al código QR del cobro. Verás los datos antes de pagar.')}
        </p>
      </div>
    </div>
  );
};
