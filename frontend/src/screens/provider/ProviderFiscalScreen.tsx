import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  MapPin,
  Briefcase,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Store,
} from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface ProviderFiscalScreenProps {
  sessionId: string;
  onNext: (requestId: string) => void;
}

export const ProviderFiscalScreen: React.FC<ProviderFiscalScreenProps> = ({ sessionId, onNext }) => {
  const toast = useToast();
  const [ruc, setRuc] = useState<string>('');
  const [dni, setDni] = useState<string>('');
  const [repName, setRepName] = useState<string>('');
  const [verifyingRepDni, setVerifyingRepDni] = useState<boolean>(false);
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [businessData, setBusinessData] = useState<any>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDniLookup = async (dniNumeric: string) => {
    if (dniNumeric.length === 8) {
      setVerifyingRepDni(true);
      try {
        const res = await api.lookupDni(dniNumeric);
        if (res && res.full_name) {
          setRepName(res.full_name);
        }
      } catch {
        // silent
      } finally {
        setVerifyingRepDni(false);
      }
    }
  };

  const handleLookup = async (rucNumeric: string) => {
    if (rucNumeric.length !== 11) {
      setErrorMessage('Ingresa un RUC válido de 11 dígitos.');
      return;
    }
    setSearching(true);
    setErrorMessage(null);
    setWarningMessage(null);
    setIsAlreadyRegistered(false);

    try {
      const res = await api.lookupBusinessByRuc(rucNumeric);
      if (res.success && res.data) {
        setBusinessData(res.data);
        setWarningMessage(res.warning || null);
        setIsAlreadyRegistered(!!res.already_registered);
      } else {
        setBusinessData(null);
        setErrorMessage(res.error || 'No encontramos información para este número de RUC.');
      }
    } catch (err: any) {
      setBusinessData(null);
      setErrorMessage(err.message || 'No pudimos consultar SUNAT en este momento. Intenta nuevamente.');
    } finally {
      setSearching(false);
    }
  };

  const handleRucChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    setRuc(val);
    if (val.length === 11) {
      handleLookup(val);
    } else {
      setBusinessData(null);
      setErrorMessage(null);
      setWarningMessage(null);
      setIsAlreadyRegistered(false);
    }
  };

  const handleConfirmAndContinue = async () => {
    if (!businessData) {
      setErrorMessage('Primero consulta y valida un RUC de 11 dígitos.');
      return;
    }
    if (dni.length !== 8) {
      toast.error('Ingresa el DNI de 8 dígitos del representante legal.');
      return;
    }
    if (whatsapp.length !== 9) {
      toast.error('Ingresa un número de celular de 9 dígitos.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.confirmBusinessRegistration({
        session_id: sessionId,
        ruc: businessData.ruc,
        legal_rep_dni: dni,
        whatsapp
      });

      onNext(res.request_id || 'PRV-89420-PE');
    } catch (err: any) {
      toast.error(err.message || 'Error al confirmar registro.');
    } finally {
      setSubmitting(false);
    }
  };

  // Precarga del RUC y representante de demo: solo al montar.
  useEffect(() => {
    if (ruc.length === 11) {
      handleLookup(ruc);
    }
    if (dni.length === 8) {
      handleDniLookup(dni);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: una sola vez al montar
  }, []);

  return (
    <div className="flex-1 p-5 space-y-4 bg-[#f9f9ff] flex flex-col justify-between">
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 1 de 6</span>
            <span className="text-[#1a3bb0] font-bold">Identificación RUC SUNAT</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-1/5 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading (PRD Section 10) */}
        <div>
          <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
            Registra tu negocio
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
            Identificaremos automáticamente tu empresa con tu RUC para que no tengas que completar todos tus datos manualmente.
          </p>
        </div>

        {/* RUC Input Search Box */}
        <div className="space-y-2">
          <label htmlFor="provider-fiscal-field-1" className="text-xs font-bold text-[#0b2545] flex items-center justify-between">
            <span>RUC de tu negocio</span>
            <span className="text-[10px] text-[#4a5f7e] font-normal">11 dígitos</span>
          </label>

          <div className="relative flex items-center">
            <input
              id="provider-fiscal-field-1"
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={ruc}
              onChange={handleRucChange}
              placeholder="Ej. 20601234567"
              className="w-full pl-3.5 pr-28 py-3 rounded-2xl bg-white border border-[#c5c5d6] text-base font-mono font-bold text-[#0b2545] tracking-wider focus:outline-none focus:border-[#1a3bb0] shadow-sm transition"
            />
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="button"
              onClick={() => handleLookup(ruc)}
              disabled={searching || ruc.length !== 11}
              className="absolute right-1.5 px-3 py-1.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {searching ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Search size={13} />
              )}
              <span>{searching ? 'Buscando' : 'Consultar'}</span>
            </motion.button>
          </div>
        </div>

        {/* Searching Loading State */}
        <AnimatePresence>
          {searching && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 flex items-center justify-center gap-3 text-xs text-[#1a3bb0] font-bold"
            >
              <RefreshCw size={18} className="animate-spin text-[#1a3bb0]" />
              <span>Identificando tu negocio en el padrón de contribuyentes SUNAT...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3.5 bg-red-50 rounded-2xl border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
            >
              <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">Error en la consulta</div>
                <div className="text-[11px] text-red-700 mt-0.5">{errorMessage}</div>
              </div>
              <button
                onClick={() => handleLookup(ruc)}
                className="text-[11px] font-bold text-red-800 underline hover:text-red-950 shrink-0"
              >
                Reintentar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Warning / Duplicate State */}
        <AnimatePresence>
          {isAlreadyRegistered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-amber-50 rounded-2xl border border-amber-300 flex items-center gap-2 text-xs text-amber-900 font-bold"
            >
              <AlertTriangle size={18} className="text-amber-700 shrink-0" />
              <span>Este comercio ya se encuentra registrado en KUOTA.</span>
            </motion.div>
          )}
          {warningMessage && !isAlreadyRegistered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900"
            >
              <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Revisión requerida:</strong> {warningMessage}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Successful Identification Card (PRD Section 4.3 & 10) */}
        <AnimatePresence>
          {businessData && !searching && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="p-4 bg-white rounded-3xl border border-blue-200 shadow-md shadow-blue-900/5 space-y-3 relative overflow-hidden"
            >
              {/* Top Verified Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>¡Encontramos tu negocio!</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1a3bb0] text-[10px] font-bold border border-blue-100">
                  SUNAT Verificado
                </span>
              </div>

              {/* Business Titles */}
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#eff3ff] text-[#1a3bb0] flex items-center justify-center shrink-0 shadow-inner">
                  <Building2 size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-[#0b2545] leading-snug">
                    {businessData.razon_social}
                  </h3>
                  {businessData.nombre_comercial && businessData.nombre_comercial !== 'No registrado' && (
                    <div className="text-xs font-bold text-[#1a3bb0] flex items-center gap-1 mt-0.5">
                      <Store size={12} />
                      <span>{businessData.nombre_comercial}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-[#4a5f7e] font-mono mt-0.5">
                    RUC: <strong>{businessData.ruc}</strong> · {businessData.tipo_contribuyente}
                  </div>
                </div>
              </div>

              {/* Status and Condition Badges */}
              <div className="flex gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    businessData.estado_contribuyente === 'ACTIVO'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <CheckCircle2 size={11} />
                  <span>Estado: {businessData.estado_contribuyente}</span>
                </span>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    businessData.condicion_domicilio === 'HABIDO'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <CheckCircle2 size={11} />
                  <span>Condición: {businessData.condicion_domicilio}</span>
                </span>
              </div>

              {/* Economic Activities */}
              <div className="p-2.5 bg-slate-50 rounded-xl space-y-1 text-[11px] text-[#0b2545]">
                <div className="flex items-start gap-1.5">
                  <Briefcase size={13} className="text-[#1a3bb0] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#4a5f7e]">Actividad principal: </span>
                    <span className="font-semibold">{businessData.actividad_principal}</span>
                  </div>
                </div>
                {businessData.actividades_secundarias && businessData.actividades_secundarias !== 'No declaradas' && (
                  <div className="text-[10px] text-[#4a5f7e] pl-4">
                    Secundarias: {businessData.actividades_secundarias}
                  </div>
                )}
              </div>

              {/* Fiscal Address and Ubigeo */}
              <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5 text-[11px] text-[#0b2545]">
                <div className="flex items-start gap-1.5">
                  <MapPin size={13} className="text-[#1a3bb0] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#4a5f7e]">Dirección fiscal: </span>
                    <span className="font-semibold">{businessData.direccion_fiscal}</span>
                  </div>
                </div>
                <div className="text-[10px] text-[#4a5f7e] pl-4">
                  {businessData.distrito}, {businessData.provincia} - {businessData.departamento} (Ubigeo {businessData.ubigeo})
                </div>
              </div>

              {/* Source attribution and notice */}
              <div className="flex items-center justify-between text-[10px] text-[#4a5f7e] pt-1">
                <span>Fuente: Padrón Oficial SUNAT (Actualizado)</span>
                <span>Datos verificados</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MÓDULO KYC: Representante Legal (RENIEC) */}
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs font-bold text-[#0b2545]">
            <span className="flex items-center gap-1 text-[#1a3bb0]">
              <ShieldCheck size={14} /> Módulo KYC · Representante Legal
            </span>
            {verifyingRepDni ? (
              <span className="text-[10px] text-blue-700 font-bold flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> Buscando…
              </span>
            ) : repName ? (
              <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                <CheckCircle2 size={11} /> Nombre sugerido
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="provider-fiscal-field-2" className="text-[11px] font-bold text-[#0b2545]">DNI Rep. Legal</label>
              <input
              id="provider-fiscal-field-2"
                type="text"
                maxLength={8}
                value={dni}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setDni(val);
                  if (val.length === 8) handleDniLookup(val);
                }}
                placeholder="Ej. 74839201"
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#c5c5d6] text-xs font-mono font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0]"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="provider-fiscal-field-3" className="text-[11px] font-bold text-[#0b2545]">WhatsApp Comercial</label>
              <div className="flex items-center gap-1">
                <span className="px-2 py-2 bg-slate-100 rounded-xl text-[11px] font-bold text-[#0b2545] border border-slate-200">
                  +51
                </span>
                <input
              id="provider-fiscal-field-3"
                  type="text"
                  maxLength={9}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="987654321"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#c5c5d6] text-xs font-mono font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0]"
                />
              </div>
            </div>
          </div>

          {repName && (
            <div className="p-2 bg-slate-100 rounded-xl text-[11px] text-slate-800 font-bold flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-normal">Titular Acreditado:</span>
              <span className="truncate max-w-[200px] uppercase text-[#0b2545]">{repName}</span>
            </div>
          )}
        </div>

        {/* Legal Disclaimer */}
        <div className="p-2.5 bg-blue-50/50 rounded-xl flex items-center gap-2 text-[10px] text-[#4a5f7e]">
          <ShieldCheck size={16} className="text-[#1a3bb0] shrink-0" />
          <span>La consulta identifica al contribuyente oficial de SUNAT para simplificar tu registro.</span>
        </div>
      </div>

      {/* Primary Confirmation Action (PRD Section 4.5) */}
      <div className="pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleConfirmAndContinue}
          disabled={submitting || !businessData || isAlreadyRegistered}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
        >
          <span>{submitting ? 'Guardando comercio...' : 'CONFIRMAR Y CONTINUAR'}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
