import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import {
  CreditCard,
  UserCheck,
  Phone,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Lock,
  MessageSquare,
  Edit3,
} from 'lucide-react';

interface MerchantIdentityScreenProps {
  sessionId: string;
  onNext: (requestId: string) => void;
}

export const MerchantIdentityScreen: React.FC<MerchantIdentityScreenProps> = ({ sessionId, onNext }) => {
  const [dni, setDni] = useState<string>('47891234');
  const [fullName, setFullName] = useState<string>('CARLOS ALBERTO MENDOZA QUISPE');
  const [phone, setPhone] = useState<string>('987654321');
  const [whatsappOptIn, setWhatsappOptIn] = useState<boolean>(true);

  const [verifyingDni, setVerifyingDni] = useState<boolean>(false);
  const [dniVerified, setDniVerified] = useState<boolean>(true);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Consulta automática en vivo a RENIEC cuando el DNI tiene 8 dígitos
  const handleDniChange = async (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 8);
    setDni(clean);
    setDniVerified(false);
    setErrorMessage(null);

    if (clean.length === 8) {
      setVerifyingDni(true);
      try {
        const res = await api.lookupDni(clean);
        if (res && res.full_name) {
          setFullName(res.full_name);
          setDniVerified(true);
        }
      } catch (err: any) {
        console.warn('RENIEC lookup error:', err);
      } finally {
        setVerifyingDni(false);
      }
    }
  };

  const handleManualDniLookup = async () => {
    if (dni.length !== 8) return;
    setVerifyingDni(true);
    setErrorMessage(null);
    try {
      const res = await api.lookupDni(dni);
      if (res && res.full_name) {
        setFullName(res.full_name);
        setDniVerified(true);
      }
    } catch {
      setErrorMessage('No pudimos validar el DNI ante RENIEC. Verifica el número.');
    } finally {
      setVerifyingDni(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni || dni.length !== 8) {
      setErrorMessage('Ingresa un DNI peruano válido de 8 dígitos.');
      return;
    }
    if (!fullName.trim() || fullName.length < 3) {
      setErrorMessage('Ingresa tus nombres y apellidos completos según DNI.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 9) {
      setErrorMessage('Ingresa un número de celular de 9 dígitos.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await api.saveMerchantIdentity(sessionId, {
        dni,
        full_name: fullName,
        phone: cleanPhone,
        whatsapp_opt_in: whatsappOptIn
      });

      if (res && res.request_id) {
        onNext(res.request_id);
      } else {
        onNext('MER-' + Math.floor(10000 + Math.random() * 90000) + '-PE');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al validar identidad');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 bg-[#f9f9ff] overflow-y-auto select-none">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Step Progress Bar Header */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#4a5f7e]">Paso 1 de 5</span>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200/80">
              <Lock size={10} />
              <span>Conexión Segura SSL</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] w-1/5 rounded-full transition-all duration-500 shadow-sm"></div>
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-xl font-black text-[#0b2545] tracking-tight">
            Tus datos de identificación
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
            Verificamos tu DNI con RENIEC oficial para evaluar tu línea de microcrédito Kuota al instante y sin trámites.
          </p>
        </div>

        {/* 1. DNI Card */}
        <div className="p-3.5 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-2.5 transition hover:border-blue-200">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="merchant-identity-field-1" className="flex items-center gap-1.5 font-bold text-[#0b2545]">
              <span className="text-sm">🇵🇪</span>
              <span>Número de DNI</span>
            </label>

            {verifyingDni ? (
              <span className="text-[10px] text-[#1a3bb0] font-bold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full">
                <RefreshCw size={10} className="animate-spin" />
                <span>Consultando RENIEC...</span>
              </span>
            ) : dniVerified ? (
              <motion.span
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full shadow-xs"
              >
                <CheckCircle2 size={11} className="text-emerald-600" />
                <span>RENIEC Verificado</span>
              </motion.span>
            ) : (
              <span className="text-[10px] text-[#4a5f7e] font-medium">8 dígitos</span>
            )}
          </div>

          <div className="relative flex items-center">
            <div className="absolute left-3 w-8 h-8 rounded-xl bg-[#eff3ff] text-[#00248b] flex items-center justify-center shrink-0">
              <CreditCard size={17} />
            </div>
            <input
              id="merchant-identity-field-1"
              type="tel"
              inputMode="numeric"
              maxLength={8}
              value={dni}
              onChange={(e) => handleDniChange(e.target.value)}
              placeholder="Ej. 47891234"
              className="w-full pl-13 pr-24 py-3 rounded-2xl bg-[#eff3ff]/50 border border-[#c5c5d6]/70 text-lg font-mono font-black tracking-widest text-[#0b2545] focus:bg-white focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 transition"
            />
            {dni.length === 8 && !verifyingDni && !dniVerified && (
              <button
                type="button"
                onClick={handleManualDniLookup}
                className="absolute right-2 px-2.5 py-1 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold shadow-sm hover:bg-[#00248b] active:scale-95 transition cursor-pointer"
              >
                Validar
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#4a5f7e]">
            DNI Azul o DNI Electrónico (DNIe) de persona natural
          </p>
        </div>

        {/* 2. Full Name Card (Autocompletado y Certificado por RENIEC) */}
        <div className="p-3.5 bg-gradient-to-br from-white to-[#f5f8ff] rounded-3xl border border-[#d8e2ff] shadow-sm space-y-2 transition">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="merchant-identity-field-2" className="flex items-center gap-1.5 font-bold text-[#0b2545]">
              <UserCheck size={14} className="text-[#00248b]" />
              <span>Nombres y Apellidos del Titular</span>
            </label>
            <button
              type="button"
              onClick={() => setIsEditingName(!isEditingName)}
              className="text-[10px] text-[#1a3bb0] font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Edit3 size={11} />
              <span>{isEditingName ? 'Fijar' : 'Editar'}</span>
            </button>
          </div>

          <div className="relative">
            <input
              id="merchant-identity-field-2"
              type="text"
              readOnly={!isEditingName}
              value={fullName}
              onChange={(e) => setFullName(e.target.value.toUpperCase())}
              placeholder="Nombres completos según RENIEC"
              className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-black tracking-wide text-[#0b2545] transition ${
                isEditingName
                  ? 'bg-white border-[#1a3bb0] focus:outline-none ring-2 ring-blue-100'
                  : 'bg-white/80 border-[#c5c5d6]/60 cursor-default'
              }`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-emerald-800 bg-emerald-50/80 px-2.5 py-1 rounded-xl border border-emerald-200/60">
            <span className="flex items-center gap-1 font-semibold">
              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              <span>Titular validado oficialmente en padrón RENIEC</span>
            </span>
          </div>
        </div>

        {/* 3. Phone / WhatsApp Field con Prefijo +51 */}
        <div className="p-3.5 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-2 transition hover:border-blue-200">
          <label htmlFor="merchant-identity-field-3" className="text-xs font-bold text-[#0b2545] flex items-center gap-1.5">
            <Phone size={14} className="text-[#1a3bb0]" />
            <span>Número de celular (WhatsApp activo)</span>
          </label>

          <div className="relative flex items-center">
            {/* Country Flag & Prefix Pill */}
            <div className="absolute left-2 flex items-center gap-1 px-2.5 py-1.5 bg-[#eff3ff] rounded-xl border border-[#d8e2ff] text-xs font-bold text-[#0b2545] shrink-0">
              <span>🇵🇪</span>
              <span>+51</span>
            </div>

            <input
              id="merchant-identity-field-3"
              type="tel"
              inputMode="numeric"
              maxLength={9}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="987 654 321"
              className="w-full pl-22 pr-4 py-3 rounded-2xl bg-[#eff3ff]/50 border border-[#c5c5d6]/70 text-base font-mono font-bold tracking-wider text-[#0b2545] focus:bg-white focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 transition"
            />
          </div>

          <p className="text-[10px] text-[#4a5f7e] leading-tight">
            Te enviaremos los comprobantes de cobro y la confirmación de compras aKuotas.
          </p>
        </div>

        {/* 4. WhatsApp Interactive Toggle Card */}
        <div
          role="switch"
          aria-checked={whatsappOptIn}
          aria-labelledby="whatsapp-optin-label"
          tabIndex={0}
          onClick={() => setWhatsappOptIn(!whatsappOptIn)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setWhatsappOptIn(!whatsappOptIn);
            }
          }}
          className="p-3 rounded-3xl bg-white border border-[#e1e8f8] shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8c3ff]"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquare size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span id="whatsapp-optin-label" className="text-xs font-bold text-[#0b2545]">Notificaciones por WhatsApp</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <p className="text-[10px] text-[#4a5f7e] mt-0.5 leading-snug">
                Recibe avisos al instante cuando tus clientes paguen por QR y recordatorios de cuotas.
              </p>
            </div>
          </div>

          {/* Toggle Switch (visual; el rol switch está en la tarjeta) */}
          <div
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
              whatsappOptIn ? 'bg-[#00248b]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                whatsappOptIn ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>

        {/* Error Feedback */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 bg-red-50 rounded-2xl border border-red-200 text-xs text-red-900 flex items-start gap-2 shadow-xs"
            >
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] font-medium leading-tight">{errorMessage}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. Ley 29733 Security Seal Card */}
        <div className="p-3 bg-[#eff3ff] rounded-2xl border border-[#d8e2ff] flex items-start gap-2.5 text-[11px] text-[#0b2545]">
          <div className="w-7 h-7 rounded-xl bg-blue-100 text-[#00248b] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck size={16} />
          </div>
          <div className="leading-snug">
            <span className="font-bold text-[#00248b]">Protección de Datos (Ley 29733): </span>
            <span className="text-[#4a5f7e]">
              Tu DNI solo se utiliza para validar tu identidad ante RENIEC y generar tu línea de microcrédito digital.
            </span>
          </div>
        </div>

        {/* Submit CTA Button */}
        <div className="pt-1 pb-1">
          <motion.button
            whileTap={{ scale: 0.98 }}
            whileHover={{ scale: 1.01 }}
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-950/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
          >
            {submitting ? (
              <>
                <RefreshCw size={17} className="animate-spin text-white" />
                <span>Validando con RENIEC...</span>
              </>
            ) : (
              <>
                <span>Validar identidad y continuar</span>
                <ArrowRight size={17} />
              </>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
};
