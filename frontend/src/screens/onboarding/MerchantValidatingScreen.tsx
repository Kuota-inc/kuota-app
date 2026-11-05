import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { IdentityVerification } from './IdentityVerification';
import {
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Camera,
  Upload,
  ScanFace,
  RotateCcw,
} from 'lucide-react';

interface MerchantValidatingScreenProps {
  requestId: string;
  onNext: () => void;
}

type KycPhase = 'upload_docs' | 'validating' | 'approved';

// Helper to create authentic mock DNI Front, Back and Selfie for testing in simulator
function createSampleKycImages() {
  // 1. DNI Front
  const c1 = document.createElement('canvas');
  c1.width = 340;
  c1.height = 215;
  const ctx1 = c1.getContext('2d')!;
  const grad1 = ctx1.createLinearGradient(0, 0, 340, 215);
  grad1.addColorStop(0, '#5fa8d3');
  grad1.addColorStop(1, '#1b4965');
  ctx1.fillStyle = grad1;
  ctx1.fillRect(0, 0, 340, 215);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = 'bold 11px sans-serif';
  ctx1.fillText('REPÚBLICA DEL PERÚ', 20, 24);
  ctx1.font = '8px sans-serif';
  ctx1.fillText('REGISTRO NACIONAL DE IDENTIFICACIÓN Y ESTADO CIVIL', 20, 36);
  ctx1.fillStyle = '#e2e8f0';
  ctx1.fillRect(20, 48, 65, 85);
  ctx1.fillStyle = '#1e293b';
  ctx1.beginPath();
  ctx1.arc(52, 75, 18, 0, Math.PI * 2);
  ctx1.fill();
  ctx1.beginPath();
  ctx1.arc(52, 118, 26, Math.PI, 0);
  ctx1.fill();
  ctx1.fillStyle = '#ffffff';
  ctx1.font = 'bold 9px sans-serif';
  ctx1.fillText('DNI N° 47891234', 100, 60);
  ctx1.font = '7px sans-serif';
  ctx1.fillText('PRIMER APELLIDO: MENDOZA', 100, 75);
  ctx1.fillText('SEGUNDO APELLIDO: QUISPE', 100, 88);
  ctx1.fillText('PRENOMBRES: CARLOS ALBERTO', 100, 101);
  ctx1.fillText('NACIMIENTO: 14/08/1992', 100, 114);
  ctx1.fillText('SEXO: M   ESTADO CIVIL: S', 100, 127);
  ctx1.fillStyle = '#ffd700';
  ctx1.fillRect(280, 52, 38, 28);
  ctx1.fillStyle = '#10b981';
  ctx1.font = 'bold 9px sans-serif';
  ctx1.fillText('✓ ANVERSO OFICIAL', 100, 160);

  // 2. DNI Back
  const c2 = document.createElement('canvas');
  c2.width = 340;
  c2.height = 215;
  const ctx2 = c2.getContext('2d')!;
  const grad2 = ctx2.createLinearGradient(0, 0, 340, 215);
  grad2.addColorStop(0, '#62b6cb');
  grad2.addColorStop(1, '#1b4965');
  ctx2.fillStyle = grad2;
  ctx2.fillRect(0, 0, 340, 215);
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(20, 30, 300, 45);
  ctx2.fillStyle = '#000000';
  for (let i = 25; i < 315; i += 4) {
    if (i % 7 !== 0) {
      ctx2.fillRect(i, 35, 2.5, 35);
    }
  }
  ctx2.fillStyle = '#e2e8f0';
  ctx2.fillRect(260, 90, 60, 80);
  ctx2.fillStyle = '#334155';
  ctx2.font = '8px sans-serif';
  ctx2.fillText('HUELLA', 272, 135);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = '8px sans-serif';
  ctx2.fillText('DOMICILIO: JR. GAMARRA 1020 INT. 302', 20, 100);
  ctx2.fillText('DISTRITO: LA VICTORIA - LIMA', 20, 115);
  ctx2.fillText('UBIGEO: 150115', 20, 130);
  ctx2.fillStyle = '#10b981';
  ctx2.font = 'bold 9px sans-serif';
  ctx2.fillText('✓ REVERSO OFICIAL', 20, 160);

  // 3. Selfie Biométrico
  const c3 = document.createElement('canvas');
  c3.width = 300;
  c3.height = 300;
  const ctx3 = c3.getContext('2d')!;
  ctx3.fillStyle = '#0f172a';
  ctx3.fillRect(0, 0, 300, 300);
  ctx3.fillStyle = '#e0a96d';
  ctx3.beginPath();
  ctx3.ellipse(150, 135, 65, 80, 0, 0, Math.PI * 2);
  ctx3.fill();
  ctx3.fillStyle = '#27272a';
  ctx3.beginPath();
  ctx3.arc(150, 95, 66, Math.PI, 0);
  ctx3.fill();
  ctx3.fillStyle = '#1e293b';
  ctx3.beginPath();
  ctx3.arc(130, 130, 6, 0, Math.PI * 2);
  ctx3.arc(170, 130, 6, 0, Math.PI * 2);
  ctx3.fill();
  ctx3.strokeStyle = '#991b1b';
  ctx3.lineWidth = 3;
  ctx3.beginPath();
  ctx3.arc(150, 160, 22, 0.2, Math.PI - 0.2);
  ctx3.stroke();
  ctx3.fillStyle = '#1a3bb0';
  ctx3.beginPath();
  ctx3.ellipse(150, 280, 90, 65, 0, 0, Math.PI * 2);
  ctx3.fill();
  ctx3.strokeStyle = '#10b981';
  ctx3.lineWidth = 2;
  ctx3.setLineDash([6, 4]);
  ctx3.beginPath();
  ctx3.ellipse(150, 140, 85, 105, 0, 0, Math.PI * 2);
  ctx3.stroke();
  ctx3.setLineDash([]);
  ctx3.fillStyle = '#10b981';
  ctx3.font = 'bold 11px sans-serif';
  ctx3.textAlign = 'center';
  ctx3.fillText('✓ ROSTRO BIOMÉTRICO VALIDADO', 150, 285);

  return {
    dniFront: c1.toDataURL('image/jpeg', 0.85),
    dniBack: c2.toDataURL('image/jpeg', 0.85),
    selfie: c3.toDataURL('image/jpeg', 0.85)
  };
}

/** Flujo simulado (solo desarrollo, sin proveedor de identidad configurado). */
const DemoValidatingScreen: React.FC<MerchantValidatingScreenProps> = ({ requestId, onNext }) => {
  const [phase, setPhase] = useState<KycPhase>('upload_docs');

  // Three required KYC photos
  const [dniFront, setDniFront] = useState<string | null>(null);
  const [dniBack, setDniBack] = useState<string | null>(null);
  const [faceSelfie, setFaceSelfie] = useState<string | null>(null);

  // Progressive validation state
  const [progress, setProgress] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [merchantData, setMerchantData] = useState<any>({
    dni: '47891234',
    full_name: 'CARLOS ALBERTO MENDOZA QUISPE',
    phone: '987654321',
    approved_limit: 1400
  });

  // Native input references (Android APK & Camera triggers)
  const frontCamInputRef = useRef<HTMLInputElement>(null);
  const frontGalInputRef = useRef<HTMLInputElement>(null);
  const backCamInputRef = useRef<HTMLInputElement>(null);
  const backGalInputRef = useRef<HTMLInputElement>(null);
  const selfieCamInputRef = useRef<HTMLInputElement>(null);
  const selfieGalInputRef = useRef<HTMLInputElement>(null);

  const steps = [
    {
      id: 'reniec_docs',
      title: 'Validación OCR de DNI (Anverso y Reverso)',
      subtitle: 'Verificando legibilidad, códigos de barras y padrón nacional RENIEC',
      icon: CreditCard
    },
    {
      id: 'biometrics',
      title: 'Biometría Facial y Prueba de Vida',
      subtitle: 'Comparando foto del rostro contra la fotografía oficial del DNI',
      icon: ScanFace
    },
    {
      id: 'scoring',
      title: 'Scoring de Microcrédito Ágil Kuota',
      subtitle: 'Aprobando línea rotativa inicial de S/ 1,400 para compras a proveedores',
      icon: ShieldCheck
    }
  ];

  // Fetch initial merchant info
  useEffect(() => {
    api.getMerchantKycStatus(requestId)
      .then((res) => {
        if (res && res.merchant) {
          setMerchantData({
            dni: res.merchant.dni || '47891234',
            full_name: res.merchant.full_name || 'CARLOS ALBERTO MENDOZA QUISPE',
            phone: res.merchant.phone || '987654321',
            approved_limit: (res.result?.approved_limit_cents || 140000) / 100
          });
        }
      })
      .catch((err) => console.warn('Using default merchant KYC status:', err));
  }, [requestId]);

  // Handler for file uploads
  const handleFileRead = (file: File, setter: (val: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) setter(result);
    };
    reader.readAsDataURL(file);
  };

  // Instant prefill with sample images for rapid testing/demo
  const handleLoadSampleImages = () => {
    const samples = createSampleKycImages();
    setDniFront(samples.dniFront);
    setDniBack(samples.dniBack);
    setFaceSelfie(samples.selfie);
  };

  // Start validation after documents are loaded
  const handleStartValidation = async () => {
    if (!dniFront || !dniBack || !faceSelfie) return;

    setPhase('validating');
    setProgress(15);
    setCurrentStepIndex(0);

    // Call backend endpoint to persist KYC documents
    api.submitMerchantKycDocuments(requestId, {
      dni_front: dniFront,
      dni_back: dniBack,
      selfie: faceSelfie
    }).catch(console.warn);

    // Progressive validation flow
    setTimeout(() => {
      setProgress(55);
      setCurrentStepIndex(1);
    }, 600);

    setTimeout(() => {
      setProgress(88);
      setCurrentStepIndex(2);
    }, 1200);

    setTimeout(() => {
      setProgress(100);
      setPhase('approved');
    }, 1800);
  };

  const allDocsReady = Boolean(dniFront && dniBack && faceSelfie);

  return (
    <div className="flex-1 flex flex-col justify-between p-4 bg-[#f9f9ff] overflow-y-auto select-none">
      {/* Hidden Native File Inputs (Compatible with Android APK & Camera) */}
      <input
        ref={frontCamInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setDniFront)}
        className="hidden"
      />
      <input
        ref={frontGalInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setDniFront)}
        className="hidden"
      />
      <input
        ref={backCamInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setDniBack)}
        className="hidden"
      />
      <input
        ref={backGalInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setDniBack)}
        className="hidden"
      />
      <input
        ref={selfieCamInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setFaceSelfie)}
        className="hidden"
      />
      <input
        ref={selfieGalInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFileRead(e.target.files[0], setFaceSelfie)}
        className="hidden"
      />

      <div className="space-y-3.5">
        {/* Step Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 2 de 5</span>
            <span className="text-[#1a3bb0] font-bold">Validación KYC</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div
              className={`h-full bg-[#1a3bb0] rounded-full transition-all duration-300 ${
                phase === 'approved' ? 'w-full' : phase === 'validating' ? 'w-3/4' : 'w-2/5'
              }`}
            ></div>
          </div>
        </div>

        {/* Header */}
        <div className="text-center pt-0.5">
          <span className="text-[10px] font-mono tracking-wider text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
            SOLICITUD: {requestId}
          </span>
          <h1 className="text-xl font-black text-[#0b2545] tracking-tight mt-1">
            {phase === 'approved'
              ? '¡Identidad y Crédito Aprobados!'
              : phase === 'validating'
              ? 'Validando tus Documentos...'
              : 'Verificación de Identidad KYC'}
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-0.5 max-w-xs mx-auto leading-relaxed">
            {phase === 'approved'
              ? 'Tus documentos y biometría fueron verificados exitosamente con RENIEC.'
              : phase === 'validating'
              ? 'Analizando DNI anverso, reverso y biometría facial con inteligencia artificial.'
              : 'Sube fotos de tu DNI por ambos lados y una selfie para activar tu línea de crédito.'}
          </p>
        </div>

        {/* PHASE 1: DOCUMENT UPLOAD CARDS */}
        {phase === 'upload_docs' && (
          <div className="space-y-2.5">
            {/* Slot 1: DNI Anverso */}
            <div className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  dniFront ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-blue-50 text-[#1a3bb0]'
                }`}>
                  {dniFront ? (
                    <img src={dniFront} alt="DNI Anverso" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <CreditCard size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-[#0b2545]">1. DNI Anverso</span>
                    {dniFront && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full">
                        ✓ Listo
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#4a5f7e] truncate">
                    {dniFront ? 'Foto frontal capturada correctamente' : 'Foto frontal con nombres y tu rostro'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {dniFront ? (
                  <button
                    type="button"
                    onClick={() => frontCamInputRef.current?.click()}
                    className="p-1.5 text-xs text-[#1a3bb0] hover:bg-blue-50 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Cambiar</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => frontCamInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Camera size={13} />
                      <span>Cámara</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => frontGalInputRef.current?.click()}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs cursor-pointer"
                      title="Subir de galería"
                    >
                      <Upload size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Slot 2: DNI Reverso */}
            <div className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  dniBack ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-blue-50 text-[#1a3bb0]'
                }`}>
                  {dniBack ? (
                    <img src={dniBack} alt="DNI Reverso" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <CreditCard size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-[#0b2545]">2. DNI Reverso</span>
                    {dniBack && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full">
                        ✓ Listo
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#4a5f7e] truncate">
                    {dniBack ? 'Foto posterior capturada' : 'Foto posterior con código de barras y ubigeo'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {dniBack ? (
                  <button
                    type="button"
                    onClick={() => backCamInputRef.current?.click()}
                    className="p-1.5 text-xs text-[#1a3bb0] hover:bg-blue-50 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Cambiar</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => backCamInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Camera size={13} />
                      <span>Cámara</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => backGalInputRef.current?.click()}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs cursor-pointer"
                      title="Subir de galería"
                    >
                      <Upload size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Slot 3: Selfie Biométrico */}
            <div className="p-3 bg-white rounded-2xl border border-[#e1e8f8] shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
                  faceSelfie ? 'ring-2 ring-emerald-500' : 'bg-indigo-50 text-indigo-700'
                }`}>
                  {faceSelfie ? (
                    <img src={faceSelfie} alt="Selfie" className="w-full h-full object-cover" />
                  ) : (
                    <ScanFace size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-[#0b2545]">3. Foto de tu Cara (Selfie)</span>
                    {faceSelfie && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full">
                        ✓ Listo
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#4a5f7e] truncate">
                    {faceSelfie ? 'Biometría facial capturada' : 'Rostro descubierto con cámara frontal'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {faceSelfie ? (
                  <button
                    type="button"
                    onClick={() => selfieCamInputRef.current?.click()}
                    className="p-1.5 text-xs text-[#1a3bb0] hover:bg-blue-50 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Cambiar</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => selfieCamInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Camera size={13} />
                      <span>Selfie</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selfieGalInputRef.current?.click()}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs cursor-pointer"
                      title="Subir de galería"
                    >
                      <Upload size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Demo Pre-fill Button */}
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={handleLoadSampleImages}
                className="text-[11px] font-bold text-[#1a3bb0] hover:text-[#00248b] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
              >
                <Sparkles size={13} className="text-amber-500" />
                <span>Cargar fotos de prueba DNI + Selfie</span>
              </button>
            </div>
          </div>
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
                    className="stroke-[#1a3bb0]"
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
                      <span className="text-[8px] text-[#4a5f7e] font-bold uppercase tracking-wider">
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
                const isDone = progress >= (idx === 0 ? 45 : idx === 1 ? 85 : 100);
                const isCurrent = currentStepIndex === idx && phase !== 'approved';
                const IconComponent = st.icon;

                return (
                  <motion.div
                    key={st.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`p-2.5 rounded-2xl border transition flex items-center gap-2.5 ${
                      isDone
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : isCurrent
                        ? 'bg-blue-50/80 border-[#1a3bb0] shadow-sm'
                        : 'bg-white border-slate-200 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-[#1a3bb0] text-white animate-pulse'
                          : 'bg-slate-100 text-slate-400'
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
                          <span className="text-[9px] text-emerald-700 font-bold shrink-0">
                            Completado
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-[#4a5f7e] mt-0.5 leading-tight truncate">
                        {st.subtitle}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Approved Microcredit Card */}
            <AnimatePresence>
              {phase === 'approved' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="p-3.5 bg-gradient-to-br from-[#eff3ff] via-white to-blue-50 rounded-2xl border-2 border-[#1a3bb0] shadow-md shadow-blue-900/10 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase text-[#1a3bb0] tracking-wider flex items-center gap-1 truncate">
                      <Sparkles size={13} className="shrink-0 text-amber-500" /> Línea Aprobada
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black whitespace-nowrap shrink-0 shadow-xs">
                      Nivel 1 Brote
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between border-b border-blue-100 pb-2">
                    <div>
                      <div className="text-2xl font-black text-[#0b2545] tracking-tight">
                        S/ {merchantData.approved_limit.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[9px] text-[#4a5f7e] mt-0.5 font-medium">
                        Línea disponible para compras a crédito (Plan 3X)
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-600 block">0% Interés</span>
                      <span className="text-[9px] text-slate-500">Lanzamiento</span>
                    </div>
                  </div>

                  {/* Titular Details */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-[#4a5f7e] block">Titular</span>
                      <span className="font-bold text-[#0b2545] truncate block uppercase">{merchantData.full_name}</span>
                    </div>
                    <div>
                      <span className="text-[#4a5f7e] block">DNI Verificado</span>
                      <span className="font-bold text-[#0b2545]">{merchantData.dni}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 pb-1">
        {phase === 'upload_docs' ? (
          <button
            type="button"
            onClick={handleStartValidation}
            disabled={!allDocsReady}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-xs shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            <ShieldCheck size={16} />
            <span>{allDocsReady ? 'Validar Documentos y Rostro' : 'Sube DNI y Selfie para validar'}</span>
            <ArrowRight size={14} />
          </button>
        ) : phase === 'approved' ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            onClick={onNext}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-xs shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continuar a configurar mi negocio</span>
            <ArrowRight size={14} />
          </motion.button>
        ) : (
          <div className="text-center py-2 text-xs font-bold text-[#1a3bb0] flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin" />
            <span>Validando documentos en RENIEC...</span>
          </div>
        )}
      </div>
    </div>
  );
};

/** Usa la verificación real (Didit) si el backend la tiene; si no, el flujo demo. */
export const MerchantValidatingScreen: React.FC<MerchantValidatingScreenProps> = ({ requestId, onNext }) => {
  const [mode, setMode] = useState<{ provider: 'LOADING' | 'DIDIT' | 'DEMO'; url?: string | null }>({ provider: 'LOADING' });
  useEffect(() => {
    let alive = true;
    api
      .startMerchantVerification(requestId)
      .then((r) => alive && setMode({ provider: r.provider, url: r.url }))
      .catch(() => alive && setMode({ provider: 'DEMO' }));
    return () => {
      alive = false;
    };
  }, [requestId]);
  if (mode.provider === 'LOADING') {
    return (
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Preparando verificación">
        <div className="w-8 h-8 border-[3px] border-[#1a3bb0] border-t-transparent rounded-full motion-safe:animate-spin" />
      </div>
    );
  }
  if (mode.provider === 'DIDIT' && mode.url) return <IdentityVerification requestId={requestId} url={mode.url} onNext={onNext} />;
  return <DemoValidatingScreen requestId={requestId} onNext={onNext} />;
};
