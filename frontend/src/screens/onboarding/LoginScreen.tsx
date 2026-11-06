import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest, setMerchantId } from '../../api/client';
import { deviceId } from '../../api/payments';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Lock,
  Phone,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface LoginScreenProps {
  onSuccess: () => void;
  onBack: () => void;
}

type LoginStep = 'phone' | 'pin';

const DIGITS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess, onBack }) => {
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handlePhoneNext = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) {
      setError('Ingresa tu número de celular (9 dígitos).');
      return;
    }
    setError(null);
    setStep('pin');
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleDigit = (d: string) => {
    if (d === 'del') {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    setError(null);

    if (next.length === 6) {
      submitLogin(next.join(''));
    }
  };

  const doAuthRequest = (pinStr: string) =>
    apiRequest<{ access_token: string; merchant_id: string; expires_at: string }>(
      '/auth/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          pin: pinStr,
          device_id: deviceId(),
          device_label: Capacitor.isNativePlatform() ? 'App Kuota (Android)' : 'Navegador (Web)',
        }),
      }
    );

  const submitLogin = async (pinStr: string) => {
    setLoading(true);
    setRetrying(false);
    setError(null);
    try {
      let res: { access_token: string; merchant_id: string; expires_at: string };
      try {
        res = await doAuthRequest(pinStr);
      } catch (firstErr: any) {
        if (firstErr?.code === 'NETWORK') {
          // Render free tier puede tardar en arrancar — reintentamos una vez
          setRetrying(true);
          await new Promise((r) => setTimeout(r, 3000));
          setRetrying(false);
          res = await doAuthRequest(pinStr);
        } else {
          throw firstErr;
        }
      }
      if (res.merchant_id) setMerchantId(res.merchant_id);
      onSuccess();
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('bloqueado') || msg.includes('locked') || err?.code === 'PIN_LOCKED') {
        setError('Tu cuenta está bloqueada temporalmente. Espera unos minutos e inténtalo de nuevo.');
      } else if (err?.code === 'PIN_INCORRECT' || msg.includes('incorrecto') || msg.includes('incorrect')) {
        setError('PIN incorrecto. Inténtalo de nuevo.');
      } else if (err?.code === 'NETWORK') {
        setError('El servidor está iniciando. Espera unos segundos e inténtalo de nuevo.');
      } else {
        setError(msg || 'Error al iniciar sesión. Verifica tu conexión.');
      }
      setPin([]);
      triggerShake();
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4.5 pt-5 pb-2">
        <button
          type="button"
          onClick={step === 'pin' ? () => { setStep('phone'); setPin([]); setError(null); } : onBack}
          className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center shadow-xs border border-[#e1e8f8] cursor-pointer"
        >
          <ArrowLeft size={18} className="text-[#0b2545]" />
        </button>
        <img src="/brand/Kuotalogotiposvg.svg" alt="Kuota" className="h-7 object-contain drop-shadow-sm" />
      </div>

      <div className="flex-1 flex flex-col justify-between px-4.5 pb-5 pt-2">
        {/* Step: Phone */}
        <AnimatePresence mode="wait">
          {step === 'phone' && (
            <motion.div
              key="phone-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 justify-between"
            >
              <div className="space-y-5 pt-3">
                <div>
                  <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                    Bienvenido de vuelta
                  </h1>
                  <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
                    Ingresa el número con el que te registraste en Kuota.
                  </p>
                </div>

                {/* Phone Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#0b2545]">Número de celular</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <Phone size={16} className="text-[#4a5f7e]" />
                      <span className="text-xs font-bold text-[#4a5f7e]">+51</span>
                      <span className="w-px h-4 bg-[#c5c5d6]" />
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={9}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, '').slice(0, 9));
                        setError(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneNext(); }}
                      placeholder="9XXXXXXXX"
                      className="w-full pl-20 pr-4 py-3.5 rounded-2xl bg-white border border-[#c5c5d6] text-sm font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 shadow-sm transition tracking-widest"
                      autoFocus
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5"
                    >
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handlePhoneNext}
                className="w-full py-3.5 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continuar</span>
                <ArrowRight size={16} />
              </motion.button>
            </motion.div>
          )}

          {/* Step: PIN */}
          {step === 'pin' && (
            <motion.div
              key="pin-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col flex-1 justify-between"
            >
              <div className="space-y-6 pt-3">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-[#eff3ff] flex items-center justify-center mb-3">
                    <Lock size={22} className="text-[#1a3bb0]" />
                  </div>
                  <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                    Ingresa tu PIN
                  </h1>
                  <p className="text-xs text-[#4a5f7e] mt-1">
                    El PIN de 6 dígitos que configuraste al registrarte.
                  </p>
                </div>

                {/* PIN dots */}
                <motion.div
                  animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center justify-center gap-3"
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        i < pin.length
                          ? 'bg-[#1a3bb0] border-[#1a3bb0] scale-110'
                          : 'bg-transparent border-[#c5c5d6]'
                      }`}
                    />
                  ))}
                </motion.div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5"
                    >
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                  {loading && !error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center gap-2 text-xs text-[#1a3bb0] font-bold"
                    >
                      <CheckCircle2 size={15} className="animate-pulse" />
                      <span>{retrying ? 'Conectando con el servidor...' : 'Verificando...'}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* PIN Keypad */}
              <div className="space-y-2.5">
                {DIGITS.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-3 gap-2.5">
                    {row.map((d, di) => {
                      if (d === '') return <div key={di} />;
                      return (
                        <motion.button
                          key={di}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          disabled={loading}
                          onClick={() => handleDigit(d)}
                          className={`h-14 rounded-2xl font-black text-lg transition flex items-center justify-center cursor-pointer disabled:opacity-50 ${
                            d === 'del'
                              ? 'bg-white/60 text-[#4a5f7e] border border-[#e1e8f8]'
                              : 'bg-white shadow-sm border border-[#e1e8f8] text-[#0b2545] hover:bg-[#eff3ff] active:bg-[#e1e8f8]'
                          }`}
                        >
                          {d === 'del' ? <Delete size={20} /> : d}
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
