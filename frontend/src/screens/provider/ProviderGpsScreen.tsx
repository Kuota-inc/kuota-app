import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import {
  MapPin,
  Navigation,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Radio,
  Sparkles
} from 'lucide-react';
import { useToast } from '../../components/toast-context';

interface ProviderGpsScreenProps {
  onNext: () => void;
}

export const ProviderGpsScreen: React.FC<ProviderGpsScreenProps> = ({ onNext }) => {
  const toast = useToast();
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: -12.0645,
    lng: -77.0142
  });
  const [address, setAddress] = useState<string>('');
  const [hasAcquiredLocation, setHasAcquiredLocation] = useState<boolean>(false);
  const [detecting, setDetecting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [permissionPrompt, setPermissionPrompt] = useState<boolean>(false);
  const [detectedSuccess, setDetectedSuccess] = useState<boolean>(false);

  // 1. Obtención de ubicación del dispositivo (Obligatoria para registrar el negocio)
  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador o dispositivo no soporta geolocalización. Por favor utiliza un dispositivo con GPS.');
      return;
    }

    setDetecting(true);
    setGeoError(null);
    setPermissionPrompt(true);
    setStatusMessage('Accediendo a la ubicación de tu dispositivo...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setPermissionPrompt(false);
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const userAccuracy = Math.round(position.coords.accuracy || 10);

        setCoords({ lat: userLat, lng: userLng });
        setStatusMessage(`Ubicación obtenida (precisión ±${userAccuracy} m). Identificando tu dirección...`);

        try {
          // Reverse geocoding con las coordenadas del dispositivo
          const geoData = await api.reverseGeocode(userLat, userLng);
          if (geoData) {
            const resolvedAddress = geoData.full_address || geoData.address || geoData.full_display || 'Ubicación identificada';
            setAddress(resolvedAddress);
          }
          setHasAcquiredLocation(true);
          setDetectedSuccess(true);
          setTimeout(() => setDetectedSuccess(false), 4500);
        } catch (err) {
          console.warn('Error al identificar dirección:', err);
          setAddress('Ubicación detectada por coordenadas');
          setHasAcquiredLocation(true);
        } finally {
          setDetecting(false);
          setStatusMessage('');
        }
      },
      (error) => {
        setDetecting(false);
        setPermissionPrompt(false);
        setStatusMessage('');
        console.warn('Geolocation error:', error);

        if (error.code === error.PERMISSION_DENIED) {
          setGeoError(
            'Permiso requerido: Para registrar tu negocio es obligatorio activar tu ubicación. Haz clic en el ícono de candado 🔒 en la barra de direcciones de tu navegador y activa "Ubicación".'
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGeoError(
            'No se pudo determinar la ubicación de tu dispositivo. Asegúrate de tener activada la ubicación en tu celular o computadora e inténtalo de nuevo.'
          );
        } else if (error.code === error.TIMEOUT) {
          setGeoError(
            'Tiempo de espera agotado buscando tu ubicación. Presiona nuevamente "Usar mi ubicación actual" y confirma el permiso.'
          );
        } else {
          setGeoError('No se pudo obtener la ubicación. Por favor reintenta con el botón de abajo.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Autodetectar automáticamente si el usuario ya concedió permisos previamente
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((status) => {
        if (status.state === 'granted') {
          handleUseLocation();
        }
      }).catch(() => {
        // Ignorar si el navegador no soporta permissions.query
      });
    }
  }, []);

  // 2. Guardar y continuar (valida que se haya obtenido la ubicación del dispositivo)
  const handleContinue = async () => {
    if (!hasAcquiredLocation || !address.trim()) {
      toast.error('Para registrar tu negocio es obligatorio usar tu ubicación actual.');
      handleUseLocation();
      return;
    }

    setSaving(true);
    try {
      await api.saveProviderLocation({
        lat: coords.lat,
        lng: coords.lng,
        address_line: address
      });
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la ubicación');
    } finally {
      setSaving(false);
    }
  };

  const openInExternalMaps = () => {
    window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`, '_blank');
  };

  return (
    <div className="flex-1 p-4.5 space-y-4 bg-[#f9f9ff] flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between items-center text-xs font-semibold text-[#4a5f7e]">
            <span>Paso 4 de 6</span>
            <span className="text-[#1a3bb0] font-bold">Ubicación del Negocio</span>
          </div>
          <div className="h-1.5 w-full bg-[#e1e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a3bb0] w-4/5 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-2xl font-black text-[#0b2545] tracking-tight">
            Ubicación de tu negocio
          </h1>
          <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
            Es obligatorio registrar la ubicación física de tu negocio para activar tus ventas y entregas a crédito.
          </p>
        </div>

        {/* Interactive Map View (Limpio y profesional, sin enlaces ni mensajes de donación de terceros) */}
        <div className="relative w-full h-52 rounded-3xl overflow-hidden border border-blue-200 shadow-sm bg-slate-100 flex items-center justify-center">
          <div className="absolute -top-12 -bottom-48 -left-8 -right-8 overflow-hidden pointer-events-none">
            <iframe
              key={`${coords.lat}-${coords.lng}`}
              title="Mapa de Ubicación Kuota"
              width="100%"
              height="100%"
              className="w-full h-full border-0 filter saturate-125"
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.004}%2C${coords.lat - 0.0025}%2C${coords.lng + 0.004}%2C${coords.lat + 0.0025}&layer=mapnik`}
            />
          </div>

          {/* Floating Radar Pin Overlay (Pin oficial Kuota centrado) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-[#1a3bb0]/30 animate-ping absolute"></span>
            <div className="w-10 h-10 rounded-full bg-[#1a3bb0] text-white flex items-center justify-center shadow-xl shadow-blue-900/60 z-10 border-2 border-white">
              <MapPin size={22} className="drop-shadow" />
            </div>
          </div>

          {/* Location Status Badge */}
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-sm border border-slate-200 z-10">
            {hasAcquiredLocation ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-800 font-extrabold">Ubicación registrada</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="text-amber-800 font-bold">Ubicación requerida</span>
              </>
            )}
          </div>

          {/* External Map Link */}
          {hasAcquiredLocation && (
            <button
              type="button"
              onClick={openInExternalMaps}
              className="absolute bottom-3 right-3 bg-white/95 backdrop-blur px-2.5 py-1 rounded-xl text-[10px] font-bold text-[#1a3bb0] hover:bg-white flex items-center gap-1 shadow-sm border border-blue-100 transition cursor-pointer z-10"
            >
              <ExternalLink size={11} />
              <span>Ver mapa</span>
            </button>
          )}

          {/* Máscara inferior para bloquear al 100% cualquier texto o pie de donación */}
          <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-slate-200/50 to-transparent pointer-events-none z-10" />
        </div>

        {/* Botón Principal: USAR MI UBICACIÓN ACTUAL */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          type="button"
          onClick={handleUseLocation}
          disabled={detecting}
          className="w-full py-3.5 bg-gradient-to-r from-blue-700 to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-blue-800 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-md shadow-blue-900/25 cursor-pointer disabled:opacity-75"
        >
          {detecting ? (
            <>
              <RefreshCw size={16} className="animate-spin text-white" />
              <span className="font-bold">{statusMessage || 'Obteniendo tu ubicación actual...'}</span>
            </>
          ) : (
            <>
              <Navigation size={16} className="text-white animate-pulse" />
              <span>Usar mi ubicación actual</span>
            </>
          )}
        </motion.button>

        {/* Alerta de Permisos si el navegador está esperando confirmación */}
        {permissionPrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 bg-blue-50 rounded-2xl border-2 border-blue-300 text-xs text-blue-900 flex items-start gap-2 shadow-sm animate-pulse"
          >
            <Radio size={18} className="text-[#1a3bb0] shrink-0 mt-0.5" />
            <div className="leading-tight">
              <span className="font-bold">Permiso requerido:</span>
              <p className="text-[11px] mt-0.5">
                Por favor haz clic en <strong>"Permitir"</strong> en la ventana emergente de tu navegador para que Kuota registre la dirección exacta de tu negocio.
              </p>
            </div>
          </motion.div>
        )}

        {/* Feedback de Éxito / Error */}
        <AnimatePresence>
          {detectedSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 font-bold flex items-center gap-2 shadow-sm"
            >
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div className="flex-1">
                <span>¡Ubicación detectada exitosamente!</span>
                <p className="text-[11px] text-emerald-700 font-normal mt-0.5">
                  Tu dirección ha sido identificada y vinculada a tu cuenta de comercio.
                </p>
              </div>
            </motion.div>
          )}

          {geoError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-xs text-amber-900 flex items-start gap-2"
            >
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed space-y-2">
                <div>{geoError}</div>
                <div>
                  <button
                    type="button"
                    onClick={handleUseLocation}
                    className="px-3 py-1.5 bg-[#1a3bb0] hover:bg-[#00248b] text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw size={12} />
                    <span>Reintentar obtener ubicación</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Campo Único de Dirección (Sin separar distritos ni mostrar coordenadas) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#0b2545]">
            <label htmlFor="provider-gps-field-1">Dirección de tu negocio</label>
            {hasAcquiredLocation && (
              <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                <Sparkles size={11} /> Ubicación vinculada
              </span>
            )}
          </div>
          <div className="relative">
            <textarea
              id="provider-gps-field-1"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Presiona 'Usar mi ubicación actual' para registrar tu dirección automáticamente"
              className="w-full px-4 py-3 rounded-2xl bg-white border border-[#c5c5d6] text-xs font-bold text-[#0b2545] focus:outline-none focus:border-[#1a3bb0] focus:ring-2 focus:ring-[#1a3bb0]/20 shadow-sm transition resize-none leading-relaxed"
            />
          </div>
          <p className="text-[10px] text-[#4a5f7e]">
            {hasAcquiredLocation
              ? 'Verifica que la dirección detectada coincida con tu local de atención.'
              : 'La dirección se completará automáticamente al presionar el botón de arriba.'}
          </p>
        </div>

        {/* Nota de Seguridad */}
        <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-100 flex items-start gap-2.5 text-[11px] text-[#0b2545]">
          <ShieldCheck size={16} className="text-[#1a3bb0] shrink-0 mt-0.5" />
          <span>La ubicación física es un requisito de seguridad obligatorio para activar tus cotizaciones y compras al crédito en Kuota.</span>
        </div>
      </div>

      {/* Primary Continue Button */}
      <div className="pt-3 pb-1">
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleContinue}
          disabled={saving}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#00248b] to-[#1a3bb0] hover:from-[#1a3bb0] hover:to-[#00248b] text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
        >
          <span>{saving ? 'Guardando ubicación...' : 'Confirmar ubicación y continuar'}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
    </div>
  );
};
