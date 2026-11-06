import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Shield,
  BookOpen,
  Smartphone,
  X,
  AlertTriangle,
  Send,
  ExternalLink,
  Users,
  Video,
  KeyRound,
  Store,
  FileText,
  BadgeCheck,
  CreditCard,
  BarChart3,
  Package,
  Radio,
  Info,
  Gauge,
  BellRing,
  LogOut
} from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { ChangePinPanel, DevicesPanel, LimitsPanel, SecurityActivityPanel } from './PaymentSecurityPanels';

interface ProfileScreenProps {
  onBack: () => void;
  onLogout?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onLogout }) => {
  // Active modal state: null or modal id string
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Profile data states
  const [selectedRucType, setSelectedRucType] = useState<'10' | '20' | 'NONE'>('10');
  const [rucNumber] = useState<string>('10428791024');
  const [rubro, setRubro] = useState<string>('Textil y Confección');
  const [zona, setZona] = useState<string>('Gamarra (La Victoria)');
  const [isListenerActive, setIsListenerActive] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const closeModal = () => setActiveModal(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useDialog(modalRef, closeModal, { enabled: !!activeModal });

  return (
    <div className="flex-1 flex flex-col bg-[#f9f9ff] text-[#151c27] relative pb-10">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#00248b] text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 border border-blue-400/40"
          >
            <CheckCircle2 size={16} className="text-teal-300" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#f9f9ff]/90 backdrop-blur-md border-b border-[#e7eefe] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1 text-[#00248b] hover:bg-[#e7eefe] active:scale-95 rounded-xl transition cursor-pointer flex items-center"
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-[#00248b] font-black text-xl tracking-tight">kuota</span>
        </div>
        <h1 className="text-sm font-bold text-[#151c27] truncate max-w-[170px]">
          Mi Perfil Y Negocio
        </h1>
        <div className="w-8 h-8 rounded-full bg-[#00248b] flex items-center justify-center text-white text-xs font-bold shadow-sm">
          <span className="material-symbols-outlined text-[17px]">person</span>
        </div>
      </div>

      {/* Main Body Content */}
      <div className="p-4 space-y-4">
        {/* 1. Banner Superior: Próxima Capacitación */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#e1e8f8] relative overflow-hidden">
          <div className="absolute -right-4 -top-6 w-24 h-24 bg-blue-200/25 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#d8e2ff] text-[#00248b] text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00248b] animate-pulse"></span>
              Taller en vivo · Mañana 7:00 PM
            </span>
            <span className="text-[11px] text-[#4a5f7e] ml-auto flex items-center gap-1">
              <Video size={13} className="text-blue-600" /> Zoom
            </span>
          </div>
          <h3 className="text-xs font-bold text-[#151c27] leading-snug mb-3">
            Mentorías y Formalización: Cómo declarar tus ingresos ante SUNAT sin enredos
          </h3>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-[#4a5f7e] text-[11px]">
              <Users size={14} className="text-[#00248b]" />
              <span>Últimos 12 cupos disponibles</span>
            </div>
            <button
              onClick={() => showToast('¡Cupo reservado con éxito! Recibirás el enlace de Zoom por WhatsApp.')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 h-8 rounded-full bg-[#1a3bb0] text-white text-xs font-bold hover:bg-[#00248b] active:scale-95 transition shadow-sm cursor-pointer"
            >
              <span>Reservar cupo</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </section>

        {/* 2. Identidad y Datos del Negocio */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3.5">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-13 h-13 rounded-full bg-[#e7eefe] flex items-center justify-center text-[#00248b] text-lg font-black shadow-inner">
                DL
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00248b] text-white flex items-center justify-center shadow-sm">
                <BadgeCheck size={14} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-[#151c27] truncate">Confecciones Don Lucho</h2>
              </div>
              <p className="text-[11px] text-[#4a5f7e] truncate mt-0.5">
                {rubro} · {zona.split(' ')[0]}
              </p>
              <span className="inline-block px-2 py-0.5 mt-1 rounded-md bg-[#d8e2ff]/70 text-[#00248b] text-[10px] font-bold">
                Cuenta Comercial &amp; Personal Unificada
              </span>
            </div>
          </div>

          {/* Chips / Opciones Interactivas */}
          <div className="space-y-2 pt-1">
            {/* Chip RUC */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-ruc')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#4a5f7e]">Estado de formalidad</p>
                  <p className="text-xs font-bold text-[#151c27] truncate">
                    {selectedRucType === '10' && `RUC 10 · ${rucNumber}`}
                    {selectedRucType === '20' && `RUC 20 · 20601894231`}
                    {selectedRucType === 'NONE' && 'Sin RUC (En proceso)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[#4a5f7e]">
                <span className="text-[11px] text-[#00248b] font-bold">Editar</span>
                <ChevronRight size={16} />
              </div>
            </button>

            {/* Chip Rubro y Zona */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-rubro')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                  <Store size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#4a5f7e]">Rubro y zona operativa</p>
                  <p className="text-xs font-bold text-[#151c27] truncate">
                    {rubro} · {zona}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[#4a5f7e]">
                <span className="text-[11px] text-[#00248b] font-bold">Cambiar</span>
                <ChevronRight size={16} />
              </div>
            </button>

            {/* Chip Facturas y Boletas */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-facturas')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[19px]">receipt_long</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#4a5f7e]">Mis facturas y boletas</p>
                  <p className="text-xs font-bold text-[#151c27] truncate">Comprobantes emitidos Kuota</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-full bg-[#d8e2ff] text-[#00248b] text-[10px] font-bold">
                  Al día
                </span>
                <ChevronRight size={16} className="text-[#4a5f7e]" />
              </div>
            </button>
          </div>
        </section>

        {/* 3. Crédito aKuotas! */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">aKuotas!</h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal('modal-pagos')}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                <CreditCard size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#151c27] truncate">Mis pagos</p>
                <p className="text-[10px] text-[#4a5f7e] truncate mt-0.5">mis pagos realizados a tiempo</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#4a5f7e] shrink-0" />
          </button>
        </section>

        {/* 4. Salud del Negocio */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Salud del negocio</h3>
            <span className="text-[10px] font-semibold text-[#4a5f7e]">Este mes</span>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setActiveModal('modal-dashboard')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                  <BarChart3 size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#151c27] truncate">Dashboard financiero</p>
                  <p className="text-[10px] text-[#4a5f7e] truncate mt-0.5">Ingresos, Yape/Plin y compras aKuotas</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('modal-productos')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#151c27] truncate">Mis productos</p>
                  <p className="text-[10px] text-[#4a5f7e] truncate mt-0.5">Catálogo y lista de precios (48 items)</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e] shrink-0" />
            </button>
          </div>
        </section>

        {/* 5. Permisos y Conexiones en Vivo */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">
            Permisos &amp; Conexiones en Vivo
          </h3>

          {/* Switch Listener Yape / Plin */}
          <div className="p-3 rounded-2xl bg-[#eff3ff] flex items-center justify-between gap-3 border border-transparent hover:border-blue-200">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center shrink-0 mt-0.5">
                <Radio size={18} className={isListenerActive ? 'animate-pulse text-[#00248b]' : 'text-slate-400'} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[#151c27]">Listener Yape &amp; Plin</p>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                      isListenerActive ? 'bg-[#00248b]/10 text-[#00248b]' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isListenerActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-[10px] text-[#4a5f7e] mt-0.5 leading-tight">
                  Detección automática de abonos sin comprobantes falsos
                </p>
              </div>
            </div>

            {/* Toggle button interactivo */}
            <button
              type="button"
              aria-label="Cambiar estado del listener de notificaciones"
              onClick={() => {
                if (isListenerActive) {
                  setActiveModal('modal-listener-alert');
                } else {
                  setIsListenerActive(true);
                  showToast('Listener Yape & Plin reactivado con éxito');
                }
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                isListenerActive ? 'bg-[#1a3bb0]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${
                  isListenerActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Enlaces Legales & Reclamaciones */}
          <div className="space-y-1 pt-1 border-t border-[#e7eefe]">
            <a
              href="https://kuota.pe/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#eff3ff] transition text-left"
            >
              <div className="flex items-center gap-2.5">
                <Shield size={16} className="text-[#4a5f7e]" />
                <span className="text-xs font-medium text-[#151c27]">
                  Privacidad y Ley 29733 (Datos Personales)
                </span>
              </div>
              <ExternalLink size={14} className="text-[#4a5f7e]" />
            </a>
            <a
              href="https://kuota.pe/reclamaciones"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#eff3ff] transition text-left"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen size={16} className="text-[#4a5f7e]" />
                <span className="text-xs font-medium text-[#151c27]">
                  Libro de Reclamaciones Virtual
                </span>
              </div>
              <ExternalLink size={14} className="text-[#4a5f7e]" />
            </a>
          </div>
        </section>

        {/* 6. Seguridad */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Seguridad de la cuenta</h3>
          <div className="space-y-2">
            {/* Cambiar PIN */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-pin')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center">
                  <KeyRound size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#151c27]">Cambiar PIN de seguridad</p>
                  <p className="text-[10px] text-[#4a5f7e]">Clave de 6 dígitos para autorizar cobros</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e]" />
            </button>

            {/* Dispositivos Activos */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-dispositivos')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center">
                  <Smartphone size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#151c27]">Dispositivos vinculados</p>
                  <p className="text-[10px] text-[#4a5f7e]">Revisa y desvincula los que no reconozcas</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e]" />
            </button>
            {/* Límites de cobro */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-limites')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center">
                  <Gauge size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#151c27]">Límites de cobro</p>
                  <p className="text-[10px] text-[#4a5f7e]">Por cobro, por día y número de cobros</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e]" />
            </button>

            {/* Actividad de seguridad */}
            <button
              type="button"
              onClick={() => setActiveModal('modal-actividad')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] active:scale-[0.99] transition text-left cursor-pointer border border-transparent hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#d8e2ff] text-[#00248b] flex items-center justify-center">
                  <BellRing size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#151c27]">Actividad de seguridad</p>
                  <p className="text-[10px] text-[#4a5f7e]">Cobros, dispositivos nuevos y cambios</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#4a5f7e]" />
            </button>
          </div>

          <div className="p-3 rounded-xl bg-[#eff3ff] text-[10px] text-[#4a5f7e] flex items-start gap-2 border border-blue-100">
            <Info size={15} className="text-[#00248b] shrink-0 mt-0.5" />
            <span>
              Esta cuenta opera con el correo <strong className="text-[#151c27]">lucho.confecciones@gmail.com</strong> para cobros y créditos.
            </span>
          </div>
        </section>

        {/* 7. Ayuda y Soporte */}
        <section className="bg-white rounded-3xl p-4 shadow-sm border border-[#e1e8f8] space-y-3">
          <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider">Ayuda y Soporte</h3>

          {/* WhatsApp Oficial CTA */}
          <a
            href="https://wa.me/51987654321?text=Hola%20Kuota,%20necesito%20ayuda%20con%20mi%20cuenta"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#00248b] hover:bg-[#1a3bb0] text-white active:scale-[0.98] transition shadow-md shadow-blue-900/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white">
                <Send size={18} />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold">Soporte Kuota (WhatsApp oficial)</p>
                <p className="text-[10px] text-blue-200">+51 987 654 321 · Atención inmediata</p>
              </div>
            </div>
            <ChevronRight size={18} />
          </a>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveModal('modal-faq')}
              className="p-3 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] text-[#151c27] text-xs font-bold text-center transition cursor-pointer"
            >
              Preguntas frecuentes
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('modal-logout')}
              className="p-3 rounded-2xl bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold text-center transition cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </div>

      {/* ================= MODALES Y POP-UPS ================= */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs">
            {/* Scrim click outside */}
            <div className="absolute inset-0" onClick={closeModal} aria-hidden="true" />

            {/* Modal Container */}
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-label="Editar datos del negocio"
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 120 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full max-w-[390px] bg-white rounded-t-3xl p-5 shadow-2xl z-10 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />

              {/* 1. Modal RUC */}
              {activeModal === 'modal-ruc' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Estado de Formalidad</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-[#4a5f7e]">
                    Selecciona tu régimen fiscal ante SUNAT para sincronizar tus comprobantes electrónicos en Kuota.
                  </p>
                  <div className="space-y-2">
                    <label
                      onClick={() => setSelectedRucType('10')}
                      className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border transition ${
                        selectedRucType === '10'
                          ? 'bg-[#d8e2ff]/50 border-[#1a3bb0]'
                          : 'bg-[#eff3ff] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#00248b]">person</span>
                        <div>
                          <p className="text-xs font-bold text-[#151c27]">RUC 10 (Persona con Negocio)</p>
                          <p className="text-[10px] text-[#4a5f7e]">10428791024 · Don Lucho</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[#00248b]">
                        {selectedRucType === '10' ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </label>

                    <label
                      onClick={() => setSelectedRucType('20')}
                      className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border transition ${
                        selectedRucType === '20'
                          ? 'bg-[#d8e2ff]/50 border-[#1a3bb0]'
                          : 'bg-[#eff3ff] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#4a5f7e]">business</span>
                        <div>
                          <p className="text-xs font-bold text-[#151c27]">RUC 20 (Empresa / SAC / EIRL)</p>
                          <p className="text-[10px] text-[#4a5f7e]">Requiere ficha RUC y DNI del representante</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[#00248b]">
                        {selectedRucType === '20' ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </label>

                    <label
                      onClick={() => setSelectedRucType('NONE')}
                      className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border transition ${
                        selectedRucType === 'NONE'
                          ? 'bg-[#d8e2ff]/50 border-[#1a3bb0]'
                          : 'bg-[#eff3ff] border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#4a5f7e]">store</span>
                        <div>
                          <p className="text-xs font-bold text-[#151c27]">Sin RUC (En proceso)</p>
                          <p className="text-[10px] text-[#4a5f7e]">Límite operativo de S/ 2,000 mensuales</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[#00248b]">
                        {selectedRucType === 'NONE' ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      showToast('Estado de formalidad actualizado');
                      closeModal();
                    }}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Guardar cambios
                  </button>
                </div>
              )}

              {/* 2. Modal Rubro y Zona */}
              {activeModal === 'modal-rubro' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Rubro y Zona Operativa</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-[#4a5f7e]">
                    Mejora las ofertas de financiamiento de proveedores locales ajustando tu zona.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[#4a5f7e] font-semibold block mb-1">Rubro Comercial</label>
                      <select
                        value={rubro}
                        onChange={(e) => setRubro(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#c5c5d6] text-xs font-semibold text-[#151c27] focus:outline-none focus:ring-2 focus:ring-[#00248b]"
                      >
                        <option>Textil y Confección</option>
                        <option>Bodega y Minimarket</option>
                        <option>Gastronomía y Cafetería</option>
                        <option>Calzado y Cuero</option>
                        <option>Tecnología y Accesorios</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[#4a5f7e] font-semibold block mb-1">Zona Comercial Principal</label>
                      <select
                        value={zona}
                        onChange={(e) => setZona(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#c5c5d6] text-xs font-semibold text-[#151c27] focus:outline-none focus:ring-2 focus:ring-[#00248b]"
                      >
                        <option>Gamarra (La Victoria)</option>
                        <option>Mesa Redonda / Mercado Central</option>
                        <option>Polvos Azules (Cercado)</option>
                        <option>Huamantanga (Puente Piedra)</option>
                        <option>Otro emporio o local independiente</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      showToast('Datos de ubicación y rubro guardados');
                      closeModal();
                    }}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Actualizar Datos
                  </button>
                </div>
              )}

              {/* 3. Modal Listener Alert */}
              {activeModal === 'modal-listener-alert' && (
                <div className="space-y-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                    <AlertTriangle size={28} />
                  </div>
                  <h4 className="text-base font-black text-[#151c27]">¡Alerta Crítica!</h4>
                  <p className="text-xs text-[#4a5f7e] leading-relaxed">
                    Desactivar el listener suspenderá tus cobros y validaciones automáticas de{' '}
                    <strong className="text-[#151c27]">Yape y Plin en tiempo real</strong>. Tus clientes no podrán validar pagos por código QR sin intervención manual.
                  </p>
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsListenerActive(true);
                        closeModal();
                      }}
                      className="w-full h-11 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                    >
                      Mantener Listener Activo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsListenerActive(false);
                        closeModal();
                        showToast('Listener suspendido');
                      }}
                      className="w-full h-11 rounded-full bg-[#eff3ff] text-red-600 hover:bg-red-50 text-xs font-bold active:scale-95 transition cursor-pointer"
                    >
                      Desactivar bajo mi riesgo
                    </button>
                  </div>
                </div>
              )}

              {/* 4. Cambiar PIN (backend real) */}
              {activeModal === 'modal-pin' && <ChangePinPanel onClose={closeModal} />}

              {/* 5. Dispositivos, límites y actividad de Kuota Payments */}
              {activeModal === 'modal-dispositivos' && <DevicesPanel onClose={closeModal} />}
              {activeModal === 'modal-limites' && <LimitsPanel onClose={closeModal} />}
              {activeModal === 'modal-actividad' && <SecurityActivityPanel onClose={closeModal} />}

              {/* 6. Modal Historial Pagos */}
              {activeModal === 'modal-pagos' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Historial de Cuotas aKuotas!</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-[#4a5f7e]">
                    Tus pagos puntuales han aumentado tu línea en S/ 400 este trimestre.
                  </p>
                  <div className="space-y-2">
                    <div className="p-3 rounded-2xl bg-[#eff3ff] flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">Cuota 3/3 - Hilados del Sur</p>
                        <p className="text-[10px] text-[#4a5f7e]">Pagado el 15 Oct · Débito automático</p>
                      </div>
                      <span className="text-xs font-extrabold text-[#00248b]">S/ 350.00</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#eff3ff] flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">Cuota 2/3 - Hilados del Sur</p>
                        <p className="text-[10px] text-[#4a5f7e]">Pagado el 15 Sep · Débito automático</p>
                      </div>
                      <span className="text-xs font-extrabold text-[#00248b]">S/ 350.00</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#eff3ff] flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">Cuota 1/3 - Hilados del Sur</p>
                        <p className="text-[10px] text-[#4a5f7e]">Pagado el 15 Ago · Débito automático</p>
                      </div>
                      <span className="text-xs font-extrabold text-[#00248b]">S/ 350.00</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              )}

              {/* 7. Modal Dashboard Financiero */}
              {activeModal === 'modal-dashboard' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Balance del Mes</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-2xl bg-[#eff3ff]">
                      <p className="text-[11px] text-[#4a5f7e]">Ingresos Kuota Payments</p>
                      <p className="text-xl font-black text-[#00248b] mt-0.5">S/ 8,420.50</p>
                      <p className="text-[10px] text-[#4a5f7e] mt-0.5">Cobros con tarjeta y links directos</p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#eff3ff]">
                      <p className="text-[11px] text-[#4a5f7e]">Abonos Yape &amp; Plin (Listener)</p>
                      <p className="text-xl font-black text-[#151c27] mt-0.5">S/ 5,110.00</p>
                      <p className="text-[10px] text-[#4a5f7e] mt-0.5">142 transacciones validadas en tienda</p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#eff3ff]">
                      <p className="text-[11px] text-[#4a5f7e]">Compras aKuotas! Insumos</p>
                      <p className="text-xl font-black text-[#495e89] mt-0.5">S/ 1,050.00</p>
                      <p className="text-[10px] text-[#4a5f7e] mt-0.5">Telas y cierres financiados</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Cerrar Balance
                  </button>
                </div>
              )}

              {/* 8. Modal Productos */}
              {activeModal === 'modal-productos' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Catálogo de Productos</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff]">
                      <span className="text-xs font-bold text-[#151c27]">Polo Piqué Premium 24/1</span>
                      <span className="text-xs font-black text-[#00248b]">S/ 28.00</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff]">
                      <span className="text-xs font-bold text-[#151c27]">Camisa Oxford Slim Fit</span>
                      <span className="text-xs font-black text-[#00248b]">S/ 45.00</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff]">
                      <span className="text-xs font-bold text-[#151c27]">Pantalón Drill Stretch</span>
                      <span className="text-xs font-black text-[#00248b]">S/ 58.00</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#eff3ff]">
                      <span className="text-xs font-bold text-[#151c27]">Casaca Denim Clásica</span>
                      <span className="text-xs font-black text-[#00248b]">S/ 79.00</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Cerrar Catálogo
                  </button>
                </div>
              )}

              {/* 9. Modal Facturas y Boletas */}
              {activeModal === 'modal-facturas' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Comprobantes Emitidos</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-2xl bg-[#eff3ff] flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">Boleta B001-00248</p>
                        <p className="text-[10px] text-[#4a5f7e]">Hoy 11:32 AM · Validada SUNAT</p>
                      </div>
                      <span className="text-xs font-black text-[#00248b]">S/ 120.00</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#eff3ff] flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">Factura F001-00084</p>
                        <p className="text-[10px] text-[#4a5f7e]">Ayer 04:15 PM · Validada SUNAT</p>
                      </div>
                      <span className="text-xs font-black text-[#00248b]">S/ 640.00</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              )}

              {/* 10. Modal FAQ */}
              {activeModal === 'modal-faq' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-black text-[#151c27]">Preguntas Frecuentes</h4>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-[#eff3ff] flex items-center justify-center text-[#4a5f7e]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-2xl bg-[#eff3ff]">
                      <p className="text-xs font-bold text-[#151c27]">¿Cómo funciona aKuotas!?</p>
                      <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
                        Te permite adquirir insumos textiles a 30, 60 y 90 días con 0% interés al pagar a tiempo.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#eff3ff]">
                      <p className="text-xs font-bold text-[#151c27]">¿El listener lee mis mensajes privados?</p>
                      <p className="text-xs text-[#4a5f7e] mt-1 leading-relaxed">
                        No. Solo filtra las notificaciones push del sistema financiero de Yape y Plin para validar el monto depositado.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full h-12 rounded-full bg-[#1a3bb0] hover:bg-[#00248b] text-white text-xs font-bold shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              )}
              {/* Modal Logout */}
              {activeModal === 'modal-logout' && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center text-center space-y-2 pt-2">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                      <LogOut size={26} className="text-red-500" />
                    </div>
                    <h4 className="text-base font-black text-[#151c27]">Cerrar sesión</h4>
                    <p className="text-xs text-[#4a5f7e] leading-relaxed">
                      ¿Estás seguro que deseas cerrar tu sesión de Kuota? Tendrás que ingresar tus credenciales para volver a acceder.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="h-12 rounded-2xl bg-[#eff3ff] hover:bg-[#e7eefe] text-[#151c27] text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        if (onLogout) { onLogout(); } else { onBack(); }
                      }}
                      className="h-12 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-red-200"
                    >
                      Sí, cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
