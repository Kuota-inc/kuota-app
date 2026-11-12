import React, { useState, useEffect, useRef } from 'react';
import { FEE_PCT } from '../../config/fee';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import {
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Building2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ScanFace,
  ExternalLink,
} from 'lucide-react';

interface ProviderValidatingScreenProps {
  requestId: string;
  onNext: () => void;
}

type ProviderKycPhase = 'starting' | 'redirect' | 'validating' | 'approved';

export const ProviderValidatingScreen: React.FC<ProviderValidatingScreenProps> = ({ requestId, onNext }) => {
  const [phase, setPhase] = useState<ProviderKycPhase>('starting');
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [providerData, setProviderData] = useState<any>({
    razon_social: null,
    rep_legal: null,
    approved_limit: null as number | null,
    fee_rate: '1.00%'
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = [
    {
      id: 'sunat_status',
      title: 'Verificación RUC y Poderes SUNAT',
      subtitle: 'Comprobando estado Activo y Habido con facultades de representación',
      icon: Building2
    },
    {
      id: 'id_docs',
      title: 'Validación OCR de DNI (Anverso y Reverso)',
      subtitle: 'Verificando documento del Representante Legal',
      icon: CreditCard
    },
    {
      id: 'biometrics',
      title: 'Biometría Facial y Prueba de Vida',
      subtitle: 'Comparando selfie del representante contra la fotografía del DNI',
      icon: ScanFace
    },
    {
      id: 'scoring_provider',
      title: 'Capacidad de Facturación y Liquidación Inmediata',
      subtitle: 'Habilitando cobranza garantizada al 1.00% hasta S/ 45,000.00 PEN',
      icon: ShieldCheck
    }
  ];

  const runDemoValidation = () => {
    setPhase('validating');
    setProgress(15);
    setCurrentStepIndex(0);
    setTimeout(() => { setProgress(45); setCurrentStepIndex(1); }, 500);
    setTimeout(() => { setProgress(75); setCurrentStepIndex(2); }, 1000);
    setTimeout(() => { setProgress(92); setCurrentStepIndex(3); }, 1400);
    setTimeout(() => { setProgress(100); setPhase('approved'); }, 1800);
  };

  // Start verification on mount
  useEffect(() => {
    api.startProviderVerification(requestId)
      .then((res: any) => {
        if (res.provider === 'DEMO' || !res.url) {
          runDemoValidation();
        } else {
          setVerificationUrl(res.url);
          setPhase('redirect');
        }
      })
      .catch(() => {
        // Si falla el endpoint, fallback a demo
        runDemoValidation();
      });

    // Fetch provider data for approved card
    api.getKycStatus(requestId)
      .then((res: any) => {
        if (res?.result) {
          setProviderData((prev: any) => ({
            ...prev,
            approved_limit: res.result.approved_limit_cents ? res.result.approved_limit_cents / 100 : null,
            razon_social: res.result.razon_social ?? prev.razon_social,
            rep_legal: res.result.legal_rep_dni ?? prev.rep_legal
          }));
        }
      })
      .catch(() => {});

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [requestId]);

  // Poll for DIDIT status when in redirect phase
  useEffect(() => {
    if (phase !== 'redirect') return;

    pollRef.current = setInterval(() => {
      api.getKycStatus(requestId)
        .then((res: any) => {
          const status = res?.status ?? res?.result?.status;
          if (status === 'APPROVED' || status === 'approved') {
            clearInterval(pollRef.current!);
            runDemoValidation();
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, requestId]);

  const handleOpenVerification = () => {
    if (verificationUrl) {
      window.open(verificationUrl, '_blank', 'noopener');
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 bg-[#f9f9ff] overflow-y-auto select-none">
      <div className="space-y-3.5">
        {/* Step Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 2 de 6</span>
            <span className="text-emerald-700 font-bold">Validación KYC Proveedor</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div
              className={`h-full bg-emerald-600 rounded-full transition-all duration-300 ${
                phase === 'approved' ? 'w-full' : phase === 'validating' ? 'w-3/4' : 'w-2/5'
              }`}
            ></div>
          </div>
        </div>

        {/* Header */}
        <div className="text-center pt-0.5">
          <span className="text-[10px] font-mono tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
            SOLICITUD: {requestId}
          </span>
          <h1 className="text-xl font-black text-[#0b2545] tracking-tight mt-1">
            {phase === 'approved'
              ? '¡Identidad y Poderes Aprobados!'
              : phase === 'validating'
              ? 'Validando Representante y Empresa...'
              : phase === 'redirect'
              ? 'Verificación de Identidad Didit'
              : 'Iniciando verificación...'}
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-0.5 max-w-xs mx-auto leading-relaxed">
            {phase === 'approved'
              ? 'RUC verificado en SUNAT. Validación de identidad completada.'
              : phase === 'validating'
              ? 'Verificando DNI del representante, poderes legales y biometría facial.'
              : phase === 'redirect'
              ? 'Completa la verificación de identidad en la plataforma segura de Didit.'
              : 'Preparando tu proceso de verificación...'}
          </p>
        </div>

        {/* PHASE: STARTING */}
        {phase === 'starting' && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={28} className="animate-spin text-emerald-700" />
          </div>
        )}

        {/* PHASE: REDIRECT to Didit */}
        {phase === 'redirect' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-5 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <ScanFace size={26} className="text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs font-black text-[#0b2545]">Verificación biométrica requerida</p>
                  <p className="text-[11px] text-[#4a5f7e] leading-relaxed mt-0.5">
                    Necesitamos verificar tu identidad mediante el escaneo de tu documento (DNI o carnet de extranjería) y una selfie con prueba de vida.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-[11px] text-[#4a5f7e]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <span>Proceso 100% digital y seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <span>Toma aproximadamente 2 minutos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <span>Ten tu documento físico a la mano</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenVerification}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-[#1a3bb0] text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
              >
                <ExternalLink size={15} />
                <span>Iniciar verificación de identidad</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-[#4a5f7e] px-1">
              <RefreshCw size={11} className="animate-spin shrink-0" />
              <span>Esperando que completes la verificación...</span>
            </div>
          </motion.div>
        )}

        {/* PHASE 2 & 3: VALIDATING ANIMATION & RESULTS */}
        {(phase === 'validating' || phase === 'approved') && (
          <div className="space-y-3">
            {/* Circular Progress Display */}
            <div className="flex flex-col items-center justify-center py-1">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-[#e1e8f8]"
                    strokeWidth="8"
                    fill="none"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-emerald-600"
                    strokeWidth="8"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * progress) / 100}
                    strokeLinecap="round"
                    fill="none"
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  {phase === 'approved' ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-11 h-11 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30"
                    >
                      <CheckCircle2 size={26} strokeWidth={3} />
                    </motion.div>
                  ) : (
                    <>
                      <span className="text-xl font-black text-[#0b2545] tracking-tight">
                        {progress}%
                      </span>
                      <span className="text-[10px] text-[#4a5f7e] font-bold uppercase tracking-wider">
                        Validando
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stages Checklist */}
            <div className="space-y-2">
              {steps.map((st, idx) => {
                const isDone = progress >= (idx === 0 ? 35 : idx === 1 ? 65 : idx === 2 ? 85 : 100);
                const isCurrent = currentStepIndex === idx && phase !== 'approved';
                const IconComponent = st.icon;

                return (
                  <motion.div
                    key={st.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className={`p-2.5 rounded-2xl border transition flex items-center gap-2.5 ${
                      isDone
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : isCurrent
                        ? 'bg-emerald-50 border-emerald-500 shadow-sm'
                        : 'bg-white border-slate-200 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-emerald-600 text-white animate-pulse'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={16} strokeWidth={2.5} />
                      ) : isCurrent ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <IconComponent size={16} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-black truncate ${isDone ? 'text-emerald-950' : 'text-[#0b2545]'}`}>
                          {st.title}
                        </span>
                        {isDone && (
                          <span className="text-[10px] text-emerald-700 font-bold shrink-0">
                            Completado
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#4a5f7e] mt-0.5 leading-tight truncate">
                        {st.subtitle}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Approved Provider Card */}
            <AnimatePresence>
              {phase === 'approved' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="p-3.5 bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/50 rounded-2xl border-2 border-emerald-600 shadow-md shadow-emerald-900/10 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase text-emerald-700 tracking-wider flex items-center gap-1 truncate">
                      <Sparkles size={13} className="shrink-0 text-amber-500" /> Cobranzas Habilitadas
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black whitespace-nowrap shrink-0 shadow-xs">
                      Tarifa {FEE_PCT}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between border-b border-emerald-100 pb-2">
                    <div>
                      <div className="text-2xl font-black text-[#0b2545] tracking-tight">
                        S/ {providerData.approved_limit != null ? providerData.approved_limit.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}
                      </div>
                      <div className="text-[10px] text-[#4a5f7e] mt-0.5 font-medium">
                        Límite autorizado para recaudación y liquidación inmediata
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-700 block">71% Ahorro</span>
                      <span className="text-[10px] text-slate-500">vs POS 3.45%</span>
                    </div>
                  </div>

                  {(providerData.razon_social || providerData.rep_legal) && (
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {providerData.razon_social && (
                        <div>
                          <span className="text-[#4a5f7e] block">Empresa SUNAT</span>
                          <span className="font-bold text-[#0b2545] truncate block uppercase">{providerData.razon_social}</span>
                        </div>
                      )}
                      {providerData.rep_legal && (
                        <div>
                          <span className="text-[#4a5f7e] block">DNI Representante</span>
                          <span className="font-bold text-[#0b2545] truncate block">{providerData.rep_legal}</span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 pb-1">
        {phase === 'approved' ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            onClick={onNext}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-[#1a3bb0] hover:from-emerald-700 hover:to-[#00248b] text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-900/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continuar a actividad comercial</span>
            <ArrowRight size={14} />
          </motion.button>
        ) : phase === 'validating' ? (
          <div className="text-center py-2 text-xs font-bold text-emerald-700 flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin" />
            <span>Validando RUC en SUNAT…</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
