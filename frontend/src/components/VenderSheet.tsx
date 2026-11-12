import React, { useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, ChevronRight, HandCoins, Percent, QrCode, ShieldCheck, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

/** "Vender": hoja inferior con los dos canales (diseño Stitch). Cobrar con QR o link abre "Cobrar y pagar". */
export const VenderSheet: React.FC<{ onClose: () => void; onCobrar: () => void; onPedidos: () => void }> = ({ onClose, onCobrar, onPedidos }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState(false);
  useDialog(ref, onClose, { enabled: true });

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-[#0b2545]/45" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Vender" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#f9f9ff] rounded-t-[32px] px-5 pt-3 pb-7 space-y-4">
        <div className="mx-auto w-11 h-1.5 rounded-full bg-[#afc5f6]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e1e8f8] text-[#00248b] text-[11px] font-black tracking-wide">
            <i className="w-2 h-2 rounded-full bg-[#00248b]" /> ACCIÓN RÁPIDA
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full bg-[#e1e8f8] flex items-center justify-center text-[#0b2545] cursor-pointer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {!info ? (
          <>
            <div>
              <h2 className="text-2xl font-black text-[#151c27] tracking-tight">Vender</h2>
              <p className="text-sm text-[#4a5f7e] mt-1 leading-snug">¿Qué canal deseas usar para concretar la venta de tu negocio?</p>
            </div>

            <button type="button" onClick={() => setInfo(true)}
              className="w-full text-left p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm space-y-3 active:scale-[0.99] transition cursor-pointer">
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e1e8f8] text-[#00248b] text-[11px] font-black"><BadgeCheck size={13} aria-hidden="true" /> Crédito a tus compradores</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">Próximamente</span>
              </span>
              <span className="flex items-start gap-3.5">
                <span className="w-12 h-12 rounded-full bg-[#e1e8f8] text-[#00248b] flex items-center justify-center shrink-0"><HandCoins size={22} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black text-[#151c27]">Vender aKuotas!</span>
                  <span className="block text-sm text-[#4a5f7e] leading-snug mt-1">Financia las compras de tus clientes emprendedores en cuotas. El proveedor recibe el monto total en 48 horas.</span>
                </span>
                <span className="w-8 h-8 rounded-full bg-[#e1e8f8] text-[#00248b] flex items-center justify-center shrink-0"><ChevronRight size={16} aria-hidden="true" /></span>
              </span>
            </button>

            <button type="button" onClick={onCobrar}
              className="w-full text-left p-4 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm space-y-3 active:scale-[0.99] transition cursor-pointer">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e1e8f8] text-[#00248b] text-[11px] font-black"><Percent size={12} aria-hidden="true" /> Comisión 1% + IGV</span>
              <span className="flex items-start gap-3.5">
                <span className="w-12 h-12 rounded-full bg-[#e1e8f8] text-[#00248b] flex items-center justify-center shrink-0"><QrCode size={22} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black text-[#151c27]">Cobrar con QR o Link</span>
                  <span className="block text-sm text-[#4a5f7e] leading-snug mt-1">Busca a tu cliente por nombre o celular, o escanea su QR. Comparte el cobro por WhatsApp o muestra tu QR.</span>
                </span>
                <span className="w-8 h-8 rounded-full bg-[#00248b] text-white flex items-center justify-center shrink-0"><ChevronRight size={16} aria-hidden="true" /></span>
              </span>
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => setInfo(false)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#00248b] cursor-pointer">
              <ArrowLeft size={16} aria-hidden="true" /> Volver
            </button>
            <div>
              <h2 className="text-2xl font-black text-[#151c27] tracking-tight">Vender aKuotas!</h2>
              <p className="text-sm text-[#4a5f7e] mt-2 leading-relaxed">
                Tus clientes emprendedores piden a cuotas desde su app: entran a <b>Comprar a crédito</b> y te eligen entre los proveedores afiliados.
                Cuando lo hagan, el pedido aparece en tu panel y Kuota te liquida el cobro.
              </p>
            </div>
            <button type="button" onClick={onPedidos}
              className="w-full h-12 rounded-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-bold text-sm shadow-lg shadow-blue-900/20 cursor-pointer active:scale-[0.98] transition">
              Ver mis pedidos aKuotas!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
