import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { AlertCircle, ArrowRight, CheckCircle2, IdCard, Lock, MessageSquare, Phone, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';

interface MerchantIdentityScreenProps {
  sessionId: string;
  onNext: (requestId: string) => void;
}

type DocType = 'DNI' | 'CE';

// Cada documento define su formato, su teclado y sus textos de ayuda.
const DOCS: Record<DocType, {
  tab: string;
  tabHint: string;
  label: string;
  placeholder: string;
  help: string;
  inputMode: 'numeric' | 'text';
  clean: (v: string) => string;
  valid: (v: string) => boolean;
  error: string;
  nameHint: string;
}> = {
  DNI: {
    tab: 'DNI',
    tabHint: 'Peruano/a',
    label: 'Número de DNI',
    placeholder: '47891234',
    help: 'DNI azul o DNI electrónico. 8 dígitos.',
    inputMode: 'numeric',
    clean: (v) => v.replace(/\D/g, '').slice(0, 8),
    valid: (v) => /^\d{8}$/.test(v),
    error: 'Ingresa un DNI válido de 8 dígitos.',
    nameHint: 'Como figura en tu DNI'
  },
  CE: {
    tab: 'Carnet de extranjería',
    tabHint: 'Extranjero/a residente',
    label: 'Número de carnet de extranjería',
    placeholder: '001234567',
    help: 'Emitido por Migraciones. Escríbelo tal como figura, sin guiones.',
    inputMode: 'text',
    clean: (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12),
    valid: (v) => /^[0-9A-Z]{9,12}$/.test(v),
    error: 'Ingresa tu carnet de extranjería tal como figura (9 a 12 caracteres).',
    nameHint: 'Como figura en tu carnet'
  }
};

export const MerchantIdentityScreen: React.FC<MerchantIdentityScreenProps> = ({ sessionId, onNext }) => {
  // El usuario escribe sus propios datos; se comprueban en el paso siguiente (foto del documento + selfie).
  const [docType, setDocType] = useState<DocType>('DNI');
  const [docNumber, setDocNumber] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [whatsappOptIn, setWhatsappOptIn] = useState<boolean>(true);

  const [lookingUp, setLookingUp] = useState<boolean>(false);
  // true = el nombre vino sugerido por la búsqueda del DNI (no es una validación oficial)
  const [nameSuggested, setNameSuggested] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const doc = DOCS[docType];
  const docOk = doc.valid(docNumber);

  const switchDoc = (next: DocType) => {
    if (next === docType) return;
    setDocType(next);
    setDocNumber('');
    setNameSuggested(false);
    setErrorMessage(null);
  };

  // Solo el DNI tiene sugerencia de nombre; el carnet se escribe a mano.
  const suggestName = async (dni: string) => {
    setLookingUp(true);
    try {
      const res = await api.lookupDni(dni);
      if (res?.full_name) {
        setFullName((prev) => (prev.trim() ? prev : res.full_name));
        setNameSuggested(true);
      }
    } catch {
      /* sin sugerencia: el usuario escribe su nombre */
    } finally {
      setLookingUp(false);
    }
  };

  const handleDocChange = (val: string) => {
    const clean = doc.clean(val);
    setDocNumber(clean);
    setNameSuggested(false);
    setErrorMessage(null);
    if (docType === 'DNI' && clean.length === 8) void suggestName(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docOk) {
      setErrorMessage(doc.error);
      return;
    }
    if (fullName.trim().length < 3) {
      setErrorMessage('Ingresa tus nombres y apellidos completos.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 9) {
      setErrorMessage('Ingresa un número de celular de 9 dígitos.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.saveMerchantIdentity(sessionId, {
        doc_type: docType,
        dni: docNumber,
        full_name: fullName,
        phone: cleanPhone,
        whatsapp_opt_in: whatsappOptIn
      });
      onNext(res?.request_id || 'MER-' + Math.floor(10000 + Math.random() * 90000) + '-PE');
    } catch (err: any) {
      setErrorMessage(err?.message || 'No pudimos guardar tus datos. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 bg-[#f9f9ff] overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Progreso */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-[#4a5f7e]">Paso 1 de 5</span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-800 font-bold">
              <Lock size={12} aria-hidden="true" /> Datos cifrados
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden" role="progressbar" aria-valuenow={1} aria-valuemin={1} aria-valuemax={5} aria-label="Paso 1 de 5">
            <div className="h-full bg-gradient-to-r from-[#00248b] to-[#1a3bb0] w-1/5 rounded-full" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-black text-[#0b2545] tracking-tight leading-tight">Tus datos de identificación</h1>
          <p className="text-[13px] text-[#4a5f7e] mt-1.5 leading-relaxed">
            Escríbelos tal como figuran en tu documento. En el siguiente paso los comprobamos con una foto del documento y una selfie.
          </p>
        </div>

        {/* 1. Documento */}
        <section className="p-4 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-3" aria-labelledby="doc-section-title">
          <h2 id="doc-section-title" className="text-[13px] font-black text-[#0b2545] flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-[#eff3ff] text-[#00248b] flex items-center justify-center" aria-hidden="true">
              <IdCard size={16} />
            </span>
            Documento de identidad
          </h2>

          <div role="radiogroup" aria-label="Tipo de documento" className="grid grid-cols-2 gap-2 p-1 bg-[#eff3ff] rounded-2xl">
            {(Object.keys(DOCS) as DocType[]).map((k) => {
              const active = k === docType;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => switchDoc(k)}
                  className={`px-2.5 py-2 rounded-xl text-left transition cursor-pointer ${
                    active ? 'bg-white shadow-sm ring-1 ring-[#1a3bb0]' : 'hover:bg-white/60'
                  }`}
                >
                  <span className={`block text-[13px] font-black leading-tight ${active ? 'text-[#00248b]' : 'text-[#0b2545]'}`}>{DOCS[k].tab}</span>
                  <span className="block text-[11px] text-[#4a5f7e] leading-tight mt-0.5">{DOCS[k].tabHint}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="identity-doc-number" className="text-xs font-bold text-[#0b2545]">{doc.label}</label>
              {lookingUp ? (
                <span className="text-[11px] text-[#1a3bb0] font-bold flex items-center gap-1">
                  <RefreshCw size={11} className="animate-spin" aria-hidden="true" /> Buscando…
                </span>
              ) : docOk ? (
                <span className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                  <CheckCircle2 size={12} aria-hidden="true" /> Formato correcto
                </span>
              ) : null}
            </div>
            <input
              id="identity-doc-number"
              type="text"
              inputMode={doc.inputMode}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={docNumber}
              onChange={(e) => handleDocChange(e.target.value)}
              placeholder={`Ej. ${doc.placeholder}`}
              aria-describedby="identity-doc-help"
              className="w-full px-4 py-3 rounded-2xl bg-[#f7f9ff] border border-[#c5cfe8] text-lg font-mono font-black tracking-widest text-[#0b2545] placeholder:text-[#9aa8c9] placeholder:font-semibold focus:bg-white focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 transition"
            />
            <p id="identity-doc-help" className="text-[11px] text-[#4a5f7e]">{doc.help}</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="identity-full-name" className="text-xs font-bold text-[#0b2545] flex items-center gap-1.5">
                <UserRound size={14} className="text-[#00248b]" aria-hidden="true" /> Nombres y apellidos
              </label>
              <span className="text-[11px] text-[#4a5f7e]">{nameSuggested ? 'Sugerido: revísalo' : doc.nameHint}</span>
            </div>
            <input
              id="identity-full-name"
              type="text"
              value={fullName}
              autoComplete="name"
              onChange={(e) => {
                setFullName(e.target.value.toUpperCase());
                setNameSuggested(false);
              }}
              placeholder="Nombres y apellidos completos"
              className="w-full px-4 py-3 rounded-2xl bg-[#f7f9ff] border border-[#c5cfe8] text-sm font-bold tracking-wide text-[#0b2545] placeholder:text-[#9aa8c9] placeholder:font-semibold focus:bg-white focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 transition"
            />
          </div>
        </section>

        {/* 2. Contacto */}
        <section className="p-4 bg-white rounded-3xl border border-[#e1e8f8] shadow-sm space-y-3" aria-labelledby="contact-section-title">
          <h2 id="contact-section-title" className="text-[13px] font-black text-[#0b2545] flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-[#eff3ff] text-[#00248b] flex items-center justify-center" aria-hidden="true">
              <Phone size={15} />
            </span>
            Celular
          </h2>
          <div className="space-y-1.5">
            <label htmlFor="identity-phone" className="text-xs font-bold text-[#0b2545]">Número con WhatsApp activo</label>
            <div className="flex items-stretch rounded-2xl border border-[#c5cfe8] bg-[#f7f9ff] focus-within:bg-white focus-within:border-[#1a3bb0] focus-within:ring-2 focus-within:ring-[#1a3bb0]/20 transition overflow-hidden">
              <span className="flex items-center gap-1 px-3 text-sm font-bold text-[#0b2545] border-r border-[#c5cfe8] bg-[#eff3ff]" aria-hidden="true">
                🇵🇪 +51
              </span>
              <input
                id="identity-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={9}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="987 654 321"
                className="flex-1 min-w-0 px-3 py-3 bg-transparent text-base font-mono font-bold tracking-wider text-[#0b2545] placeholder:text-[#9aa8c9] focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-[#4a5f7e]">Aquí te llegan los comprobantes de cobro y las confirmaciones de aKuotas!</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={whatsappOptIn}
            onClick={() => setWhatsappOptIn(!whatsappOptIn)}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#f7f9ff] border border-[#e1e8f8] text-left cursor-pointer"
          >
            <span className="flex items-start gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0" aria-hidden="true">
                <MessageSquare size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[#0b2545]">Avisos por WhatsApp</span>
                <span className="block text-[11px] text-[#4a5f7e] leading-snug">Cuando te paguen y antes de cada cuota.</span>
              </span>
            </span>
            <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${whatsappOptIn ? 'bg-[#00248b]' : 'bg-slate-300'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition ${whatsappOptIn ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </section>

        <AnimatePresence>
          {errorMessage && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 bg-red-50 rounded-2xl border border-red-200 text-red-900 flex items-start gap-2"
            >
              <AlertCircle size={16} className="text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs font-semibold leading-snug">{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3 rounded-2xl bg-[#eff3ff] border border-[#d8e2ff] flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-[#00248b] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-[#2b3f66] leading-snug">
            <span className="font-bold text-[#00248b]">Ley 29733: </span>
            Tu documento solo se usa para verificar tu identidad y evaluar tu línea. Kuota no guarda las fotos de tu documento ni tu selfie.
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-950/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
        >
          {submitting ? (
            <>
              <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> Guardando…
            </>
          ) : (
            <>
              Continuar a la verificación <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
};
