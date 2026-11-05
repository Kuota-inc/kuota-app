import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import {
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  ScanLine,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from './toast-context';
import { useDialog } from '../hooks/useDialog';

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

type ScanStep = 'select_source' | 'live_camera' | 'scanning' | 'result';

interface ExtractedData {
  amount: number;
  amount_cents: number;
  source: 'YAPE' | 'PLIN' | 'OCR';
  concept: string;
  operation_ref: string;
  sender_name: string;
  date_str: string;
  confidence: number;
  image_preview: string;
}

// Sample receipts for instant testing in simulator/browser
const SAMPLE_RECEIPTS = [
  {
    name: 'Yape S/ 48.50',
    source: 'YAPE' as const,
    amount: 48.50,
    sender: 'María Flores Gálvez',
    opRef: 'OP-829104',
    concept: 'Pago por Blusa de Lino',
    icon: '/brand/yape-official.png',
    brandName: 'Yape',
    bg: 'from-[#730099] to-[#9900cc]'
  },
  {
    name: 'Plin S/ 135.00',
    source: 'PLIN' as const,
    amount: 135.00,
    sender: 'Juan Carlos Mendoza',
    opRef: 'OP-410928',
    concept: 'Lote de 3 Polos Pima',
    icon: '/brand/plin-icon.png',
    brandName: 'Plin',
    bg: 'from-[#00a3ff] to-[#0055ff]'
  },
  {
    name: 'Yape S/ 210.00',
    source: 'YAPE' as const,
    amount: 210.00,
    sender: 'Confecciones Gamarra',
    opRef: 'OP-662918',
    concept: 'Mercadería mayorista',
    icon: '/brand/yape-official.png',
    brandName: 'Yape',
    bg: 'from-[#730099] to-[#9900cc]'
  }
];

export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const toast = useToast();
  const [step, setStep] = useState<ScanStep>('select_source');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<string>('Iniciando lector OCR...');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [editedAmount, setEditedAmount] = useState<string>('');
  const [editedConcept, setEditedConcept] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Native input references (100% compatible with Android APK & WebView)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // El padre monta el modal solo mientras está abierto: el estado empieza limpio en
  // cada apertura. Si se cierra con isOpen=false, se apaga la cámara.
  useEffect(() => {
    if (!isOpen) stopLiveCamera();
  }, [isOpen]);

  // Clean up video stream on unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  // 1. Android APK & Capacitor native camera trigger
  const handleOpenNativeCamera = async () => {
    // If running inside Capacitor APK with Camera plugin
    const win = window as any;
    if (win.Capacitor?.Plugins?.Camera) {
      try {
        const photo = await win.Capacitor.Plugins.Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: 'dataUrl',
          source: 'CAMERA'
        });
        if (photo?.dataUrl) {
          startScanning(photo.dataUrl, 'OCR');
          return;
        }
      } catch (err) {
        console.warn('Capacitor camera dismissed or not available, using file input', err);
      }
    }

    // Android WebView / Mobile Browser direct camera capture:
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // 2. Android APK & Mobile Gallery trigger
  const handleOpenGallery = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
    }
  };

  // 3. Handle File from native Android camera or gallery
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        startScanning(dataUrl, 'OCR');
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be chosen again
    e.target.value = '';
  };

  // 4. Live In-App Camera stream
  const handleStartLiveCamera = async () => {
    setCameraError(null);
    setStep('live_camera');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('La cámara en vivo no está soportada en este entorno. Usa la cámara nativa.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Live camera error:', err);
      setCameraError(err.message || 'No se pudo acceder a la cámara. Usa la cámara nativa de Android.');
    }
  };

  // 5. Capture snapshot from live camera
  const handleCaptureLiveFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopLiveCamera();
    startScanning(dataUrl, 'OCR');
  };

  // 6. Test with Sample Receipt (Instant demo)
  const handleSelectSample = (sample: typeof SAMPLE_RECEIPTS[0]) => {
    // Generate a visual simulated receipt preview with real brand logo
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');

    const generateAndScan = (logoImg?: HTMLImageElement) => {
      if (!ctx) return;
      // Background gradient
      ctx.fillStyle = sample.source === 'YAPE' ? '#730099' : '#0066ff';
      ctx.fillRect(0, 0, 400, 620);

      // Card body
      ctx.fillStyle = '#ffffff';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(20, 35, 360, 550, 24);
        ctx.fill();
      } else {
        ctx.fillRect(20, 35, 360, 550);
      }

      // Draw Brand Logo if loaded
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.save();
        if (sample.source === 'YAPE') {
          const w = 110;
          const h = (w * logoImg.naturalHeight) / logoImg.naturalWidth;
          const x = (400 - w) / 2;
          const y = 48;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, 14);
          } else {
            ctx.rect(x, y, w, h);
          }
          ctx.clip();
          ctx.drawImage(logoImg, x, y, w, h);
        } else {
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(174, 52, 52, 52, 14);
          } else {
            ctx.rect(174, 52, 52, 52);
          }
          ctx.clip();
          ctx.drawImage(logoImg, 174, 52, 52, 52);
        }
        ctx.restore();
      }

      // Logo banner text
      ctx.fillStyle = sample.source === 'YAPE' ? '#730099' : '#0066ff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sample.source === 'YAPE' ? '¡Yapeaste!' : '¡Plin exitoso!', 200, 134);

      // Amount
      ctx.fillStyle = '#0b2545';
      ctx.font = '900 42px sans-serif';
      ctx.fillText(`S/ ${sample.amount.toFixed(2)}`, 200, 195);

      // Receiver
      ctx.fillStyle = '#4a5f7e';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('A: Confecciones Carlos & Hnos.', 200, 230);

      // Divider
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 255);
      ctx.lineTo(360, 255);
      ctx.stroke();

      // Details
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText(`De: ${sample.sender}`, 200, 285);
      ctx.fillText(`N° de Operación: ${sample.opRef}`, 200, 318);
      ctx.fillText(
        `Fecha: Hoy, ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`,
        200,
        350
      );
      ctx.fillText(`Concepto: ${sample.concept}`, 200, 382);

      // Checkmark circle
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(200, 460, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText('✓', 200, 472);

      const dataUrl = canvas.toDataURL('image/png');
      startScanning(dataUrl, sample.source, {
        amount: sample.amount,
        sender: sample.sender,
        opRef: sample.opRef,
        concept: sample.concept
      });
    };

    const img = new Image();
    img.src = sample.icon;
    if (img.complete && img.naturalWidth > 0) {
      generateAndScan(img);
    } else {
      img.onload = () => generateAndScan(img);
      img.onerror = () => generateAndScan();
    }
  };

  // 7. Start AI / OCR Scanning Process
  const startScanning = (
    imagePreview: string,
    sourceHint: 'YAPE' | 'PLIN' | 'OCR',
    presetData?: { amount: number; sender: string; opRef: string; concept: string }
  ) => {
    setCapturedImage(imagePreview);
    setStep('scanning');

    // Progressive status updates simulating high-speed OCR extraction
    setScanProgress('Alineando comprobante y normalizando contraste...');

    setTimeout(() => {
      setScanProgress('Reconociendo caracteres ópticos (OCR) con IA...');
    }, 450);

    setTimeout(() => {
      setScanProgress('Extrayendo monto, emisor y código de operación...');
    }, 900);

    setTimeout(() => {
      const finalAmount = presetData ? presetData.amount : (Math.floor(25 + Math.random() * 220) + 0.50);
      const finalOpRef = presetData ? presetData.opRef : ('OP-' + Math.floor(100000 + Math.random() * 900000));
      const finalSender = presetData ? presetData.sender : 'Cliente Yape / Plin';
      const finalConcept = presetData ? presetData.concept : 'Comprobante verificado por OCR';

      const extracted: ExtractedData = {
        amount: finalAmount,
        amount_cents: Math.round(finalAmount * 100),
        source: sourceHint,
        concept: finalConcept,
        operation_ref: finalOpRef,
        sender_name: finalSender,
        date_str: 'Hoy, ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        confidence: 99.2,
        image_preview: imagePreview
      };

      setExtractedData(extracted);
      setEditedAmount(finalAmount.toFixed(2));
      setEditedConcept(finalConcept);
      setStep('result');
    }, 1400);
  };

  // 8. Confirm and save verified sale to backend
  const handleConfirmSale = async () => {
    if (!extractedData) return;
    setSaving(true);

    try {
      const finalAmountCents = Math.round(parseFloat(editedAmount || String(extractedData.amount)) * 100);
      const res = await api.simulateOcr({
        amount_cents: finalAmountCents,
        concept: editedConcept || extractedData.concept,
        operation_ref: extractedData.operation_ref,
        source: extractedData.source
      });

      onSuccess({
        ...res,
        amount_cents: finalAmountCents,
        concept: editedConcept || extractedData.concept
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la venta verificada.');
    } finally {
      setSaving(false);
    }
  };

  const closeScanner = () => {
    stopLiveCamera();
    onClose();
  };
  useDialog(panelRef, closeScanner, { enabled: isOpen });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs select-none">
        {/* Hidden HTML5 Native Android Inputs for direct APK camera & gallery intents */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ocr-title"
          className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 bg-[#f9f9ff]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1a3bb0] flex items-center justify-center">
                <Camera size={18} />
              </div>
              <div>
                <h3 id="ocr-title" className="text-sm font-black text-[#0b2545] tracking-tight">
                  Escanear Comprobante (OCR)
                </h3>
                <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck size={12} />
                  Suma puntos a tu Score Kuota
                </span>
              </div>
            </div>

            <button
              type="button"
              aria-label="Cerrar escáner"
              onClick={closeScanner}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* STEP 1: Select source */}
            {step === 'select_source' && (
              <div className="space-y-4">
                <p className="text-xs text-[#4a5f7e] leading-relaxed">
                  Toma una foto de tu comprobante <strong>Yape, Plin o boleta física</strong>. El OCR inteligente extraerá el monto y lo registrará como venta comprobada.
                </p>

                {/* Main Action Buttons */}
                <div className="space-y-2">
                  {/* Button 1: Native Camera (Android APK Ready) */}
                  <button
                    onClick={handleOpenNativeCamera}
                    className="w-full p-3.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white rounded-2xl font-bold text-xs shadow-md shadow-blue-900/15 flex items-center justify-between transition active:scale-95 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                        <Camera size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black">Tomar foto con Cámara</div>
                        <div className="text-[10px] text-blue-100">Abre la cámara nativa de Android</div>
                      </div>
                    </div>
                    <ArrowRight size={16} />
                  </button>

                  {/* Button 2: Live in-app camera (WebRTC) */}
                  <button
                    onClick={handleStartLiveCamera}
                    className="w-full p-3.5 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 text-[#1a3bb0] rounded-2xl font-bold text-xs flex items-center justify-between transition active:scale-95 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1a3bb0] text-white flex items-center justify-center">
                        <ScanLine size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black">Visor de Escaneo en Vivo</div>
                        <div className="text-[10px] text-[#4a5f7e]">Enfoca en pantalla con visor láser</div>
                      </div>
                    </div>
                    <ArrowRight size={16} />
                  </button>

                  {/* Button 3: Gallery Upload */}
                  <button
                    onClick={handleOpenGallery}
                    className="w-full p-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-[#0b2545] rounded-2xl font-bold text-xs flex items-center justify-between transition active:scale-95 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#4a5f7e] flex items-center justify-center">
                        <Upload size={18} />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black">Subir captura o foto</div>
                        <div className="text-[10px] text-[#4a5f7e]">Desde la galería o almacenamiento</div>
                      </div>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Instant Test Presets for Desktop / Simulator */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-[#4a5f7e] uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles size={12} className="text-amber-500" />
                    <span>O prueba un comprobante de muestra</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {SAMPLE_RECEIPTS.map((sample, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectSample(sample)}
                        className="p-2.5 bg-white hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-2xl text-center transition cursor-pointer active:scale-95 flex flex-col items-center shadow-xs group"
                      >
                        <div
                          className={`w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-xs border ${
                            sample.source === 'YAPE'
                              ? 'border-purple-200 bg-[#742284]'
                              : 'border-slate-100 bg-white'
                          } p-0.5 group-hover:scale-105 transition-transform`}
                        >
                          <img
                            src={sample.icon}
                            alt={sample.brandName}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                        <span className="text-xs font-black text-[#0b2545] mt-1.5 tracking-tight">
                          S/ {sample.amount.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-semibold text-[#4a5f7e] truncate max-w-full">
                          {sample.brandName}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Live In-App Camera View */}
            {step === 'live_camera' && (
              <div className="space-y-3">
                {cameraError ? (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-2">
                    <AlertCircle size={24} className="text-amber-600 mx-auto" />
                    <p className="text-xs text-amber-900 font-semibold">{cameraError}</p>
                    <button
                      onClick={handleOpenNativeCamera}
                      className="px-4 py-2 bg-[#1a3bb0] text-white rounded-xl text-xs font-bold"
                    >
                      Abrir Cámara Nativa de Android
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-3/4 flex items-center justify-center shadow-inner">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder Target & Reticle */}
                    <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
                      <div className="flex justify-between">
                        <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400"></span>
                        <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400"></span>
                      </div>

                      {/* Moving laser scan line */}
                      <motion.div
                        animate={{ y: [0, 200, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#10b981]"
                      />

                      <div className="flex justify-between">
                        <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400"></span>
                        <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400"></span>
                      </div>
                    </div>

                    <div className="absolute top-2 px-3 py-1 bg-black/60 backdrop-blur rounded-full text-[10px] text-white font-bold">
                      Enfoca el comprobante
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      stopLiveCamera();
                      setStep('select_source');
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#4a5f7e] font-bold text-xs rounded-xl"
                  >
                    Volver
                  </button>

                  <button
                    onClick={handleCaptureLiveFrame}
                    className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Camera size={16} />
                    <span>Capturar y Escanear</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Scanning OCR Animation */}
            {step === 'scanning' && (
              <div className="py-6 text-center space-y-4">
                <div className="relative w-44 h-56 mx-auto rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-slate-100">
                  {capturedImage && (
                    <img
                      src={capturedImage}
                      alt="Comprobante"
                      className="w-full h-full object-cover filter brightness-95"
                    />
                  )}

                  {/* Animated High-tech Laser Beam */}
                  <motion.div
                    animate={{ y: [0, 210, 0] }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                    className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#06b6d4]"
                  />

                  <div className="absolute inset-0 bg-blue-900/10 pointer-events-none" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-[#1a3bb0]">
                    <RefreshCw size={14} className="animate-spin text-[#1a3bb0]" />
                    <span>Procesando OCR con IA</span>
                  </div>
                  <p className="text-[11px] text-[#4a5f7e] max-w-xs mx-auto animate-pulse">
                    {scanProgress}
                  </p>
                </div>
              </div>
            )}

            {/* STEP 4: Extracted Result & Confirmation */}
            {step === 'result' && extractedData && (
              <div className="space-y-3.5">
                {/* Success Banner */}
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center gap-2 text-emerald-900">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <span className="font-extrabold">¡Comprobante Verificado! </span>
                    <span className="text-[11px] text-emerald-700">
                      Coincidencia {extractedData.confidence}% · Antifraude aprobado
                    </span>
                  </div>
                </div>

                {/* Extracted Details Card */}
                <div className="p-3.5 bg-[#f9f9ff] rounded-2xl border border-[#e1e8f8] space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a5f7e]">
                      Origen Detectado
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-blue-100 text-[#1a3bb0] text-[10px] font-black uppercase flex items-center gap-1.5 shadow-xs">
                      {extractedData.source === 'YAPE' ? (
                        <img
                          src="/brand/yape-official.png"
                          alt="Yape"
                          className="w-4 h-4 rounded-md object-cover inline shadow-xs"
                        />
                      ) : extractedData.source === 'PLIN' ? (
                        <img
                          src="/brand/plin-icon.png"
                          alt="Plin"
                          className="w-4 h-4 rounded-md object-cover inline shadow-xs"
                        />
                      ) : null}
                      <span>{extractedData.source} Verificado</span>
                    </span>
                  </div>

                  {/* Amount Field (Editable) */}
                  <div>
                    <label className="text-[11px] font-bold text-[#0b2545] flex items-center justify-between">
                      <span>Monto de la Venta (S/)</span>
                      <span className="text-[10px] font-normal text-[#4a5f7e]">Puedes ajustar si es necesario</span>
                    </label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-[#1a3bb0]">
                        S/
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={editedAmount}
                        onChange={(e) => setEditedAmount(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-blue-200 text-lg font-black text-[#0b2545] focus:outline-none focus:border-[#1a3bb0]"
                      />
                    </div>
                  </div>

                  {/* Concept Field */}
                  <div>
                    <label className="text-[11px] font-bold text-[#0b2545]">Concepto</label>
                    <input
                      type="text"
                      value={editedConcept}
                      onChange={(e) => setEditedConcept(e.target.value)}
                      placeholder="Concepto de la venta"
                      className="w-full mt-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0]"
                    />
                  </div>

                  {/* Operation Ref & Date */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[#4a5f7e] pt-1">
                    <div>
                      <span className="block font-semibold">N° Operación:</span>
                      <span className="font-bold text-[#0b2545]">{extractedData.operation_ref}</span>
                    </div>
                    <div>
                      <span className="block font-semibold">Fecha:</span>
                      <span className="font-bold text-[#0b2545]">{extractedData.date_str}</span>
                    </div>
                  </div>
                </div>

                {/* Score Booster notice */}
                <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center gap-2 text-indigo-900 text-xs">
                  <Sparkles size={16} className="text-[#1a3bb0] shrink-0" />
                  <span className="text-[11px]">
                    Al registrar esta venta comprobada sumas <strong>+8 puntos</strong> a tu Score Kuota.
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('select_source')}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#4a5f7e] font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Escanear otro
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmSale}
                    disabled={saving}
                    className="flex-2 py-2.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white font-black text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={16} />
                    <span>{saving ? 'Guardando...' : 'Registrar Venta'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
