import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import {
  ShieldCheck,
  Lock,
  Fingerprint,
  Delete,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  KeyRound,
} from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

interface SecurityPinScreenProps {
  sessionId: string;
  role?: 'MERCHANT' | 'PROVIDER';
  initialStep?: 'create' | 'confirm';
  onComplete: () => void;
  onBack?: () => void;
}

const WEAK_PINS = [
  '123456',
  '654321',
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999'
];

export const SecurityPinScreen: React.FC<SecurityPinScreenProps> = ({
  sessionId,
  initialStep = 'create',
  onComplete,
  onBack
}) => {
  const [subStep, setSubStep] = useState<'create' | 'confirm'>(initialStep);
  const [createdPin, setCreatedPin] = useState<string[]>([]);
  const [confirmedPin, setConfirmedPin] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showBiometricToast, setShowBiometricToast] = useState(false);
  const infoModalRef = useRef<HTMLDivElement>(null);
  useDialog(infoModalRef, () => setShowInfoModal(false), { enabled: showInfoModal });

  // Si cambia initialStep, App remonta la pantalla (key) y el estado empieza limpio.

  const currentPin = subStep === 'create' ? createdPin : confirmedPin;

  const handleDigitPress = (digit: string) => {
    setErrorMessage(null);
    if (subStep === 'create') {
      if (createdPin.length < 6) {
        setCreatedPin((prev) => [...prev, digit]);
      }
    } else {
      if (confirmedPin.length < 6) {
        const next = [...confirmedPin, digit];
        setConfirmedPin(next);

        // Auto-check on 6th digit
        if (next.length === 6) {
          const pinA = createdPin.join('');
          const pinB = next.join('');
          if (pinA !== pinB) {
            triggerMismatch();
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    setErrorMessage(null);
    if (subStep === 'create') {
      setCreatedPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmedPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setErrorMessage(null);
    if (subStep === 'create') {
      setCreatedPin([]);
    } else {
      setConfirmedPin([]);
    }
  };

  const triggerMismatch = () => {
    setShake(true);
    setErrorMessage('Los PINs no coinciden. Inténtalo de nuevo.');
    setTimeout(() => {
      setShake(false);
      setConfirmedPin([]);
    }, 900);
  };

  const handleProceedToConfirm = () => {
    const pinStr = createdPin.join('');
    if (pinStr.length !== 6) return;

    if (WEAK_PINS.includes(pinStr)) {
      setShake(true);
      setErrorMessage('Por seguridad, evita números consecutivos como 123456 o dígitos repetidos.');
      setTimeout(() => setShake(false), 600);
      return;
    }

    setErrorMessage(null);
    setConfirmedPin([]);
    setSubStep('confirm');
  };

  const handleFinalSubmit = async () => {
    const pinA = createdPin.join('');
    const pinB = confirmedPin.join('');

    if (pinA.length !== 6 || pinB.length !== 6) {
      setErrorMessage('Ingresa los 6 dígitos del PIN.');
      return;
    }

    if (pinA !== pinB) {
      triggerMismatch();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.setSecurityPin(sessionId, pinA);
      setIsSuccess(true);

      // Wait for success animation then navigate to Dashboard
      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Error al guardar el PIN de seguridad. Intenta nuevamente.');
    }
  };

  const isMatched =
    subStep === 'confirm' &&
    confirmedPin.length === 6 &&
    createdPin.join('') === confirmedPin.join('');

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showInfoModal) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="flex-1 flex flex-col justify-between p-5 bg-[#f9f9ff] min-h-screen text-[#151c27] select-none relative">
      {/* Top Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              if (subStep === 'confirm') {
                setSubStep('create');
                setConfirmedPin([]);
                setErrorMessage(null);
              } else if (onBack) {
                onBack();
              }
            }}
            className="w-10 h-10 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#151c27] shadow-xs active:scale-95 transition cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>

          {/* Stepper badge */}
          <div className="flex items-center gap-1.5 bg-[#eff3ff] border border-[#dce3f2] px-3 py-1 rounded-full text-xs font-bold text-[#1a3bb0]">
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                subStep === 'create' ? 'bg-[#1a3bb0] scale-110' : 'bg-[#b1c7f0]'
              }`}
            />
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                subStep === 'confirm' ? 'bg-[#1a3bb0] scale-110' : 'bg-[#b1c7f0]'
              }`}
            />
            <span className="ml-1 text-[11px]">
              {subStep === 'create' ? 'Paso 1 de 2: Crear PIN' : 'Paso 2 de 2: Confirmar'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="w-10 h-10 rounded-full bg-white border border-[#e1e8f8] flex items-center justify-center text-[#4a5f7e] hover:text-[#1a3bb0] shadow-xs active:scale-95 transition cursor-pointer"
            aria-label="Ayuda"
          >
            <HelpCircle size={18} />
          </button>
        </div>

        {/* Visual Graphic & Header */}
        <div className="flex flex-col items-center text-center pt-1">
          <AnimatePresence mode="wait">
            {subStep === 'create' ? (
              <motion.div
                key="create-header"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col items-center"
              >
                <div className="w-16 h-16 rounded-full bg-[#d8e2ff] flex items-center justify-center mb-2 shadow-xs">
                  <ShieldCheck size={32} className="text-[#1a3bb0]" />
                </div>
                <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                  Crea tu PIN de 6 dígitos
                </h1>
                <p className="text-xs text-[#4a5f7e] max-w-[310px] mt-1 leading-relaxed">
                  Lo usarás para autorizar compras al crédito, transferencias y retiros seguros en Kuota.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="confirm-header"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col items-center"
              >
                <div className="relative w-16 h-16 rounded-full bg-[#b6ccfd]/40 flex items-center justify-center mb-2 shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-[#b6ccfd] flex items-center justify-center shadow-inner">
                    <CheckCircle2 size={26} className="text-[#1a3bb0]" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-[#e1e8f8] shadow-xs flex items-center justify-center">
                    <Lock size={12} className="text-[#1a3bb0]" />
                  </div>
                </div>
                <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                  Confirma tu PIN
                </h1>
                <p className="text-xs text-[#4a5f7e] max-w-[290px] mt-1 leading-relaxed">
                  Vuelve a ingresar los 6 dígitos para asegurarnos de que coincidan exactamente.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 6-Digit Display Slots */}
        <motion.div
          animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.45 }}
          className="flex justify-center items-center gap-2 sm:gap-2.5 py-1"
        >
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const isFilled = index < currentPin.length;
            const isCurrent = index === currentPin.length;

            return (
              <motion.div
                key={index}
                initial={false}
                animate={{
                  scale: isFilled ? [1, 1.05, 1] : 1,
                  borderColor: errorMessage
                    ? '#ef4444'
                    : isFilled
                    ? '#1A3BB0'
                    : isCurrent
                    ? '#3754c7'
                    : '#AFC5F6',
                  backgroundColor: errorMessage
                    ? '#fef2f2'
                    : isFilled
                    ? '#ffffff'
                    : '#ffffff'
                }}
                className={`w-11 h-13 sm:w-12 sm:h-14 rounded-2xl flex items-center justify-center transition-all border-2 shadow-xs ${
                  isFilled ? 'shadow-md shadow-blue-900/5' : ''
                }`}
              >
                <motion.span
                  animate={{
                    scale: isFilled ? 1 : 0.65,
                    backgroundColor: errorMessage
                      ? '#ef4444'
                      : isFilled
                      ? '#1a3bb0'
                      : 'transparent'
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="w-3.5 h-3.5 rounded-full"
                />
              </motion.div>
            );
          })}
        </motion.div>

        {/* Dynamic Status / Error Feedback */}
        {(errorMessage || isMatched) && (
          <div className="min-h-[28px] flex items-center justify-center px-2">
            {errorMessage ? (
              <motion.div
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold"
              >
                <AlertCircle size={14} className="shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </motion.div>
            ) : isMatched ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
              >
                <CheckCircle2 size={14} className="text-emerald-700" />
                <span>¡Los 6 dígitos coinciden perfectamente!</span>
              </motion.div>
            ) : null}
          </div>
        )}

        {/* End-to-End Encryption Micro-Card (Shown in Confirmation) */}
        {subStep === 'confirm' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-2.5 border border-[#e1e8f8] shadow-xs flex items-center gap-2.5 mx-auto max-w-[340px]"
          >
            <div className="w-8 h-8 rounded-xl bg-[#eff3ff] flex items-center justify-center shrink-0 text-[#1a3bb0]">
              <Lock size={16} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[11px] font-bold text-[#0b2545]">Cifrado de grado bancario</div>
              <p className="text-[10px] text-[#4a5f7e] leading-tight">
                Tu PIN se encripta de extremo a extremo y nunca será visible para el equipo ni terceros.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Numeric Keypad Grid */}
      <div className="w-full max-w-[320px] mx-auto grid grid-cols-3 gap-y-2.5 gap-x-3.5 place-items-center my-auto py-2">
        {[
          { num: '1', letters: '' },
          { num: '2', letters: 'ABC' },
          { num: '3', letters: 'DEF' },
          { num: '4', letters: 'GHI' },
          { num: '5', letters: 'JKL' },
          { num: '6', letters: 'MNO' },
          { num: '7', letters: 'PQRS' },
          { num: '8', letters: 'TUV' },
          { num: '9', letters: 'WXYZ' }
        ].map((k) => (
          <motion.button
            key={k.num}
            whileTap={{ scale: 0.93 }}
            onClick={() => handleDigitPress(k.num)}
            className="w-20 h-14 sm:w-22 sm:h-15 rounded-2xl bg-white border border-[#e1e8f8] shadow-xs hover:border-[#b6ccfd] active:bg-[#eff3ff] flex flex-col items-center justify-center transition-all cursor-pointer"
          >
            <span className="text-xl font-black text-[#0b2545] leading-none">{k.num}</span>
            {k.letters ? (
              <span className="text-[10px] text-[#4a5f7e] font-bold tracking-widest mt-0.5">
                {k.letters}
              </span>
            ) : (
              <span className="text-[10px] opacity-0 mt-0.5">•</span>
            )}
          </motion.button>
        ))}

        {/* Aux Key: Fingerprint on Step 1, Clear on Step 2 */}
        {subStep === 'create' ? (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowBiometricToast(true)}
            className="w-20 h-14 sm:w-22 sm:h-15 rounded-2xl bg-transparent flex flex-col items-center justify-center text-[#4a5f7e] hover:text-[#1a3bb0] transition-colors cursor-pointer"
            aria-label="Biometría"
          >
            <Fingerprint size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5 text-slate-500">
              Biometría
            </span>
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleClear}
            className="w-20 h-14 sm:w-22 sm:h-15 rounded-2xl bg-transparent flex items-center justify-center text-[#4a5f7e] hover:text-red-600 transition-colors cursor-pointer text-xs font-bold uppercase tracking-wider"
          >
            Borrar
          </motion.button>
        )}

        {/* Key 0 */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => handleDigitPress('0')}
          className="w-20 h-14 sm:w-22 sm:h-15 rounded-2xl bg-white border border-[#e1e8f8] shadow-xs hover:border-[#b6ccfd] active:bg-[#eff3ff] flex flex-col items-center justify-center transition-all cursor-pointer"
        >
          <span className="text-xl font-black text-[#0b2545] leading-none">0</span>
          <span className="text-[10px] text-[#4a5f7e] font-bold mt-0.5">+</span>
        </motion.button>

        {/* Backspace Key */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleBackspace}
          className="w-20 h-14 sm:w-22 sm:h-15 rounded-2xl bg-transparent flex items-center justify-center text-[#0b2545] hover:text-red-600 transition-colors cursor-pointer"
          aria-label="Borrar último dígito"
        >
          <Delete size={24} />
        </motion.button>
      </div>

      {/* Bottom CTA Button */}
      <div className="w-full flex flex-col items-center gap-2 pt-2 pb-1">
        {subStep === 'create' ? (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={createdPin.length !== 6}
              onClick={handleProceedToConfirm}
              className={`w-full h-13 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                createdPin.length === 6
                  ? 'bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white cursor-pointer shadow-blue-900/20'
                  : 'bg-[#dde1ff]/60 text-[#4a5f7e]/60 cursor-not-allowed shadow-none'
              }`}
            >
              <span>Continuar</span>
              <ArrowRight size={16} />
            </motion.button>
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              className="text-xs font-bold text-[#1a3bb0] hover:underline py-1 transition cursor-pointer"
            >
              ¿Por qué necesito un PIN?
            </button>
          </>
        ) : (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={confirmedPin.length !== 6 || isSubmitting || isSuccess}
              onClick={handleFinalSubmit}
              className={`w-full h-13 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                isSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                  : confirmedPin.length === 6 && !isSubmitting
                  ? 'bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white cursor-pointer shadow-blue-900/20'
                  : 'bg-[#dde1ff]/60 text-[#4a5f7e]/60 cursor-not-allowed shadow-none'
              }`}
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 size={18} className="animate-bounce" />
                  <span>¡PIN verificado con éxito!</span>
                </>
              ) : isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Protegiendo cuenta...</span>
                </>
              ) : (
                <>
                  <span>Confirmar y activar PIN</span>
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
            <button
              type="button"
              onClick={() => {
                setSubStep('create');
                setConfirmedPin([]);
                setErrorMessage(null);
              }}
              className="text-xs font-semibold text-[#4a5f7e] hover:text-[#0b2545] py-1 transition cursor-pointer"
            >
              ¿Olvidaste el PIN que creaste?
            </button>
          </>
        )}
      </div>

      {/* Info Modal: "¿Por qué necesito un PIN?" */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-5"
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              ref={infoModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pin-info-title"
              className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-sm font-black text-[#0b2545]">
                  <KeyRound size={18} className="text-[#1a3bb0]" />
                  <span id="pin-info-title">¿Por qué necesitas un PIN?</span>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setShowInfoModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#4a5f7e]">
                <div className="p-3 bg-[#eff3ff] rounded-2xl border border-[#dce3f2] flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">
                    1
                  </div>
                  <div>
                    <strong className="text-[#0b2545] block">Compras a crédito instantáneas</strong>
                    Autoriza tus compras de mercadería con tus proveedores registrados en Kuota en menos de 1 segundo sin papeleos.
                  </div>
                </div>

                <div className="p-3 bg-[#eff3ff] rounded-2xl border border-[#dce3f2] flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">
                    2
                  </div>
                  <div>
                    <strong className="text-[#0b2545] block">Retiros y abonos protegidos</strong>
                    Tus saldos cobrados mediante link o terminal quedan blindados contra accesos no autorizados en tu teléfono.
                  </div>
                </div>

                <div className="p-3 bg-[#eff3ff] rounded-2xl border border-[#dce3f2] flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">
                    3
                  </div>
                  <div>
                    <strong className="text-[#0b2545] block">Cifrado de grado bancario</strong>
                    Cumple con los estándares de encriptación de datos financieros regulados en Perú.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="w-full py-3 bg-[#1a3bb0] text-white rounded-2xl font-bold text-xs shadow-md transition hover:bg-[#00248b]"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Biometric Toast / Notice */}
      <AnimatePresence>
        {showBiometricToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 inset-x-5 max-w-sm mx-auto z-50 p-3 bg-[#0b2545] text-white rounded-2xl shadow-xl flex items-center justify-between text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <Fingerprint size={18} className="text-[#b1c7f0]" />
              <span>Podrás activar Huella / FaceID después de crear tu PIN.</span>
            </div>
            <button
              onClick={() => setShowBiometricToast(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
