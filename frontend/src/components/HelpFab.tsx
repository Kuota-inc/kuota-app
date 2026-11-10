import React, { useEffect, useState } from 'react';
import { ChevronDown, HelpCircle, MessageCircle, X } from 'lucide-react';
import { getMerchantId } from '../api/client';
import { whatsappLink } from '../config/support';
import { feeLabel } from '../config/fee';

const FAQ: { q: string; a: string }[] = [
  {
    q: '¿Cuándo me llega mi plata?',
    a: 'Cuando se conecte el banco, Kuota te liquida en 48 horas hábiles. Mientras estamos en pruebas, los pagos son simulados y no mueven dinero real.'
  },
  { q: '¿Cuánto cobra Kuota?', a: `Cobramos ${feeLabel} por cada cobro. Antes de generar el link ves cuánto es la comisión y cuánto recibes neto.` },
  {
    q: '¿Qué pasa si mi cliente no paga?',
    a: 'El link vence a las 48 horas y queda como “Vencido”. Puedes generar uno nuevo desde Nuevo cobro. Si ya pagó y no lo ves, escríbenos.'
  }
];

/** Botón flotante de ayuda: 1 toque desde las pantallas principales. */
export const HelpFab: React.FC<{ screenName: string }> = ({ screenName }) => {
  const [open, setOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const account = getMerchantId();
  const message = `Hola Kuota, necesito ayuda.\nPantalla: ${screenName}${account ? `\nCuenta: …${account.slice(-6)}` : ''}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ayuda y soporte"
        className="fixed right-3.5 z-[55] w-12 h-12 rounded-full bg-white text-[#00248b] border-2 border-[#1a3bb0] shadow-lg shadow-blue-900/25 flex items-center justify-center cursor-pointer"
        style={{ bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}
      >
        <HelpCircle size={24} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/45" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ayuda y soporte"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-7 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#0b2545]">¿Necesitas ayuda?</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-[#eff3ff] flex items-center justify-center cursor-pointer">
                <X size={18} className="text-[#0b2545]" />
              </button>
            </div>

            <a
              href={whatsappLink(message)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              <MessageCircle size={18} />
              Escribir a soporte por WhatsApp
            </a>

            <div className="space-y-2">
              <p className="text-[11px] font-black text-[#4a5f7e] uppercase tracking-wider">Preguntas frecuentes</p>
              {FAQ.map((f, i) => (
                <div key={f.q} className="rounded-2xl border border-[#e1e8f8] overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openIdx === i}
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left text-sm font-bold text-[#0b2545] cursor-pointer"
                  >
                    {f.q}
                    <ChevronDown size={16} className={`shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openIdx === i && <p className="px-3.5 pb-3 text-[13px] text-[#4a5f7e] leading-relaxed">{f.a}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
