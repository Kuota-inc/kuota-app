import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Hourglass, Loader2, ScanFace, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';

// Verificación de identidad real con Didit: el usuario fotografía su DNI y hace
// la prueba de vida en la página segura del proveedor. Kuota no recibe ni guarda
// las imágenes; solo el resultado. Mientras tanto, la app consulta el estado.

type Status = 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'IN_REVIEW';

const REASONS: Record<string, string> = {
  DNI_MISMATCH: 'El DNI del documento no coincide con el que registraste.',
  DOCUMENT_NUMBER_MISSING: 'No pudimos leer el número de tu DNI.',
  DIDIT_DECLINED: 'No pudimos validar tu documento o tu rostro.',
  DIDIT_EXPIRED: 'La verificación venció antes de completarse.',
  DIDIT_ABANDONED: 'La verificación quedó incompleta.'
};

export const IdentityVerification: React.FC<{ requestId: string; sessionId: string; url: string; onNext: () => void }> = ({ requestId, sessionId, url, onNext }) => {
  const [status, setStatus] = useState<Status>('IN_PROGRESS');
  const [reason, setReason] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const tick = () =>
      api
        .getMerchantKycStatus(requestId, sessionId)
        .then((r: any) => {
          if (!alive.current) return;
          setStatus(r.status as Status);
          setReason(r.reason ?? null);
        })
        .catch(() => {});
    tick();
    const t = window.setInterval(tick, 3000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [requestId, sessionId]);

  const open = () => {
    window.open(currentUrl, '_blank', 'noopener');
    setOpened(true);
  };

  const retry = async () => {
    setRestarting(true);
    try {
      const r = await api.startMerchantVerification(requestId, sessionId);
      if (r?.url) {
        setCurrentUrl(r.url);
        setStatus('IN_PROGRESS');
        setReason(null);
        window.open(r.url, '_blank', 'noopener');
        setOpened(true);
      }
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 bg-[#f9f9ff]">
      <div className="space-y-4">
        <div className="text-center space-y-1 pt-2">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#e7eefe] text-[#1a3bb0] flex items-center justify-center">
            <ScanFace size={28} aria-hidden="true" />
          </div>
          <h1 className="text-lg font-black text-[#0b2545]">Verifica tu identidad</h1>
          <p className="text-xs text-[#4a5f7e]">Toma una foto de tu DNI y una selfie. Toma menos de 2 minutos.</p>
        </div>

        <ol className="space-y-2">
          {[
            ['DNI por ambos lados', 'Con buena luz y sin reflejos'],
            ['Selfie con prueba de vida', 'Comparamos tu rostro con la foto del DNI'],
            ['Validación con tus datos', 'El DNI debe coincidir con el que registraste']
          ].map(([title, sub], i) => (
            <li key={title} className="p-3 rounded-2xl bg-white border border-[#e1e8f8] flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-[#eff3ff] text-[#1a3bb0] text-xs font-black flex items-center justify-center">{i + 1}</span>
              <div>
                <p className="text-xs font-bold text-[#151c27]">{title}</p>
                <p className="text-[10px] text-[#4a5f7e]">{sub}</p>
              </div>
            </li>
          ))}
        </ol>

        <div role="status" aria-live="polite">
          {status === 'IN_PROGRESS' && opened && (
            <p className="p-3 rounded-2xl bg-[#eff3ff] text-xs text-[#304670] flex items-center gap-2">
              <Loader2 size={14} className="motion-safe:animate-spin shrink-0" aria-hidden="true" /> Esperando el resultado de la verificación…
            </p>
          )}
          {status === 'IN_REVIEW' && (
            <p className="p-3 rounded-2xl bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
              <Hourglass size={14} className="shrink-0" aria-hidden="true" /> Tu verificación está en revisión. Te avisaremos; mientras tanto operas con el nivel Básico.
            </p>
          )}
          {status === 'REJECTED' && (
            <p className="p-3 rounded-2xl bg-red-50 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" /> {REASONS[reason ?? ''] ?? 'No pudimos verificar tu identidad.'} Puedes intentarlo otra vez.
            </p>
          )}
          {status === 'APPROVED' && (
            <p className="p-3 rounded-2xl bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" /> ¡Identidad verificada! Ya tienes el nivel Ampliado.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-4">
        {status === 'APPROVED' || status === 'IN_REVIEW' ? (
          <button type="button" onClick={onNext} className="w-full h-12 rounded-2xl bg-[#1a3bb0] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
            Continuar <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : status === 'REJECTED' ? (
          <button type="button" disabled={restarting} onClick={retry} className="w-full h-12 rounded-2xl bg-[#1a3bb0] text-white text-sm font-bold disabled:opacity-50 cursor-pointer">
            {restarting ? 'Preparando…' : 'Intentar otra vez'}
          </button>
        ) : (
          <button type="button" onClick={open} className="w-full h-12 rounded-2xl bg-[#1a3bb0] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
            {opened ? 'Abrir de nuevo la verificación' : 'Empezar verificación'} <ExternalLink size={16} aria-hidden="true" />
          </button>
        )}
        <p className="text-[10px] text-center text-[#4a5f7e] flex items-center justify-center gap-1">
          <ShieldCheck size={12} aria-hidden="true" /> Verificación segura con Didit. Kuota no guarda las fotos de tu DNI ni tu selfie.
        </p>
      </div>
    </div>
  );
};
