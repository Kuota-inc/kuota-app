import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

/**
 * Elegir la foto de perfil: cámara o galería. El selector del teléfono solo ofrece la cámara si el campo lo pide
 * (capture); por eso son dos botones. La primera vez Android pide permiso de cámara; si se niega, la galería sigue disponible.
 * Los campos de archivo se quedan montados hasta que llega la foto: si la hoja se cerrara al tocar, el teléfono
 * perdería el resultado.
 */
export const PhotoSourceSheet: React.FC<{ hasPhoto: boolean; onFile: (file: File) => void; onRemove?: () => void; onClose: () => void }> = ({
  hasPhoto,
  onFile,
  onRemove,
  onClose
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  useDialog(ref, onClose, { enabled: true });

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onFile(file);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-[#0b2545]/45" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Foto de perfil" onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#f9f9ff] rounded-t-[32px] px-5 pt-3 pb-7 space-y-3">
        <div className="mx-auto w-11 h-1.5 rounded-full bg-[#afc5f6]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#151c27] tracking-tight">Foto de perfil</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#e1e8f8] flex items-center justify-center cursor-pointer"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="text-xs text-[#4a5f7e] leading-snug">La ven quienes te pagan o te buscan por celular. La recortamos y le quitamos los datos de ubicación antes de subirla.</p>

        <button type="button" onClick={() => cameraRef.current?.click()} className="w-full p-4 rounded-2xl bg-white border border-[#e1e8f8] flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition">
          <span className="w-11 h-11 rounded-full bg-[#e1e8f8] text-[#00248b] flex items-center justify-center"><Camera size={20} aria-hidden="true" /></span>
          <span><b className="block text-sm text-[#151c27]">Tomar una foto</b><span className="text-[11px] text-[#4a5f7e]">Android te pedirá permiso de cámara la primera vez</span></span>
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} className="w-full p-4 rounded-2xl bg-white border border-[#e1e8f8] flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition">
          <span className="w-11 h-11 rounded-full bg-[#e1e8f8] text-[#00248b] flex items-center justify-center"><ImageIcon size={20} aria-hidden="true" /></span>
          <span><b className="block text-sm text-[#151c27]">Elegir de la galería</b><span className="text-[11px] text-[#4a5f7e]">Una foto que ya tengas en tu teléfono</span></span>
        </button>
        {hasPhoto && onRemove && (
          <button type="button" onClick={() => { onRemove(); onClose(); }} className="w-full h-12 rounded-full text-red-600 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
            <Trash2 size={16} aria-hidden="true" /> Quitar mi foto
          </button>
        )}
        <p className="text-[10px] text-[#4a5f7e] text-center leading-snug">¿No se abre la cámara? Actívala en Ajustes &gt; Aplicaciones &gt; Kuota &gt; Permisos, o usa la galería.</p>

        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={picked} aria-label="Tomar foto" />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={picked} aria-label="Elegir foto de la galería" />
      </div>
    </div>
  );
};
