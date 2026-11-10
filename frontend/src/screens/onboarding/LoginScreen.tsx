import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest, setMerchantId, setMerchantToken, setProviderId, setProviderToken } from '../../api/client';
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
  IdCard,
  KeyRound,
} from 'lucide-react';

interface LoginScreenProps {
  onSuccess: (role?: 'PROVIDER') => void;
  onBack: () => void;
}

type LoginStep = 'phone' | 'pin' | 'recovery_dni' | 'recovery_pin';

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
  const [recoveryDni, setRecoveryDni] = useState('');
  const [recoveryPin, setRecoveryPin] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

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

  const handleBack = () => {
    setError(null);
    if (step === 'pin') { setStep('phone'); setPin([]); }
    else if (step === 'recovery_dni') { setStep('pin'); setRecoveryDni(''); }
    else if (step === 'recovery_pin') { setStep('recovery_dni'); setRecoveryPin([]); }
    else onBack();
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
    if (next.length === 6) submitLogin(next.join(''));
  };

  const handleRecoveryDigit = (d: string) => {
    if (d === 'del') {
      setRecoveryPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    if (recoveryPin.length >= 6) return;
    const next = [...recoveryPin, d];
    setRecoveryPin(next);
    setError(null);
    if (next.length === 6) submitRecovery(next.join(''));
  };

  const submitLogin = async (pinStr: string) => {
    setLoading(true);
    setError(null);
    setMerchantId(null);
    try {
      const res = await apiRequest<{ access_token: string; merchant_id: string; identity_token?: string; expires_at: string; role?: 'PROVIDER'; provider_id?: string; provider_token?: string }>(
        '/auth/sessions',
        {
          method: 'POST',
          body: JSON.stringify({
            pin: pinStr,
            phone: '+51' + phone.replace(/\D/g, ''),
            device_id: deviceId(),
            device_label: Capacitor.isNativePlatform() ? 'App Kuota (Android)' : 'Navegador (Web)',
          }),
        }
      );
      if (res.role === 'PROVIDER' && res.provider_id) {
        // Cuenta de proveedor: guarda su id y su token (reemplaza al anterior: una sola sesión).
        setMerchantId(null);
        setProviderId(res.provider_id);
        if (res.provider_token) setProviderToken(res.provider_token);
        onSuccess('PROVIDER');
        return;
      }
      if (res.merchant_id) setMerchantId(res.merchant_id);
      if (res.identity_token) setMerchantToken(res.identity_token);
      onSuccess();
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('bloqueado') || msg.includes('locked') || err?.code === 'PIN_LOCKED') {
        setError('Tu cuenta está bloqueada temporalmente. Espera unos minutos e inténtalo de nuevo.');
      } else if (err?.code === 'PIN_INVALID' || msg.includes('incorrecto') || msg.includes('incorrect')) {
        setError(msg || 'PIN incorrecto. Inténtalo de nuevo.');
      } else {
        setError(msg || 'Error al iniciar sesión. Verifica tu conexión.');
      }
      setPin([]);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const submitRecovery = async (newPinStr: string) => {
    setLoading(true);
    setError(null);
    setMerchantId(null);
    try {
      const res = await apiRequest<{ access_token: string; merchant_id: string; identity_token?: string; expires_at: string; role?: 'PROVIDER'; provider_id?: string; provider_token?: string }>(
        '/auth/pin/recover',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: '+51' + phone.replace(/\D/g, ''),
            dni: recoveryDni.replace(/\D/g, ''),
            new_pin: newPinStr,
            device_id: deviceId(),
            device_label: Capacitor.isNativePlatform() ? 'App Kuota (Android)' : 'Navegador (Web)',
          }),
        }
      );
      if (res.role === 'PROVIDER' && res.provider_id) {
        // Cuenta de proveedor: guarda su id y su token (reemplaza al anterior: una sola sesión).
        setMerchantId(null);
        setProviderId(res.provider_id);
        if (res.provider_token) setProviderToken(res.provider_token);
        onSuccess('PROVIDER');
        return;
      }
      if (res.merchant_id) setMerchantId(res.merchant_id);
      if (res.identity_token) setMerchantToken(res.identity_token);
      onSuccess();
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (err?.code === 'DNI_MISMATCH') {
        setError('Los datos no coinciden. Verifica tu número de celular y tu DNI.');
      } else if (err?.code === 'RECOVERY_LOCKED') {
        setError('Demasiados intentos. Inténtalo de nuevo en 15 minutos.');
      } else {
        setError(msg || 'Error al recuperar el PIN. Verifica tu conexión.');
      }
      setRecoveryPin([]);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-[#f9f9ff] via-[#eff3ff] to-[#e6edfd] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4.5 pt-5 pb-2">
        <button
          type="button"
          onClick={handleBack}
          className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center shadow-xs border border-[#e1e8f8] cursor-pointer"
        >
          <ArrowLeft size={18} className="text-[#0b2545]" />
        </button>
        <img src="/brand/Kuotalogotiposvg.svg" alt="Kuota" className="h-7 object-contain drop-shadow-sm" />
      </div>

      <div className="flex-1 flex flex-col justify-between px-4.5 pb-5 pt-2">
        <AnimatePresence mode="wait">

          {/* Step: Phone */}
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
                      <span>Verificando...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                <button
                  type="button"
                  onClick={() => { setError(null); setPin([]); setStep('recovery_dni'); }}
                  className="w-full text-center text-xs text-[#1a3bb0] font-bold py-2 cursor-pointer"
                >
                  ¿Olvidé mi PIN?
                </button>
              </div>
            </motion.div>
          )}

          {/* Step: Recovery — ingresar DNI */}
          {step === 'recovery_dni' && (
            <motion.div
              key="recovery-dni-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col flex-1 justify-between"
            >
              <div className="space-y-5 pt-3">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-[#eff3ff] flex items-center justify-center mb-3">
                    <IdCard size={22} className="text-[#1a3bb0]" />
                  </div>
                  <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                    Verifica tu identidad
                  </h1>
                  <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
                    Ingresa el DNI que usaste al registrarte para restablecer tu PIN.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#0b2545]">DNI (8 dígitos)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={8}
                    value={recoveryDni}
                    onChange={(e) => {
                      setRecoveryDni(e.target.value.replace(/\D/g, '').slice(0, 8));
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && recoveryDni.replace(/\D/g, '').length === 8) {
                        setError(null);
                        setStep('recovery_pin');
                      }
                    }}
                    placeholder="XXXXXXXX"
                    className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#c5c5d6] text-sm font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 shadow-sm transition tracking-widest"
                    autoFocus
                  />
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
                onClick={() => {
                  if (recoveryDni.replace(/\D/g, '').length < 8) {
                    setError('Ingresa tu DNI de 8 dígitos.');
                    return;
                  }
                  setError(null);
                  setStep('recovery_pin');
                }}
                className="w-full py-3.5 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continuar</span>
                <ArrowRight size={16} />
              </motion.button>
            </motion.div>
          )}

          {/* Step: Recovery — nuevo PIN */}
          {step === 'recovery_pin' && (
            <motion.div
              key="recovery-pin-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col flex-1 justify-between"
            >
              <div className="space-y-6 pt-3">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-[#eff3ff] flex items-center justify-center mb-3">
                    <KeyRound size={22} className="text-[#1a3bb0]" />
                  </div>
                  <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
                    Elige un nuevo PIN
                  </h1>
                  <p className="text-xs text-[#4a5f7e] mt-1">
                    Escoge 6 dígitos que recordarás fácilmente.
                  </p>
                </div>

                <motion.div
                  animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center justify-center gap-3"
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        i < recoveryPin.length
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
                      <span>Restableciendo PIN...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                          onClick={() => handleRecoveryDigit(d)}
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
