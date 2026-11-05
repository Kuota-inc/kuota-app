import React from 'react';
import { Wifi, Battery, ArrowLeft } from 'lucide-react';

interface PhoneSimulatorProps {
  children: React.ReactNode;
  activeScreenTitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  currentScreenKey: string;
  onNavigate: (screenKey: string) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  showBottomNav?: boolean;
  /** Teléfono real (APK / navegador móvil): pantalla completa, sin marco ni barra de estado simulada. */
  bare?: boolean;
}

// Zonas seguras de Android/iOS: Capacitor inyecta --safe-area-inset-*; en navegador, env().
const SAFE_TOP = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
const SAFE_BOTTOM = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';

export const PhoneSimulator: React.FC<PhoneSimulatorProps> = ({
  children,
  activeScreenTitle,
  onBack,
  showBack = false,
  currentScreenKey,
  activeTab = 'inicio',
  onTabChange,
  showBottomNav = true,
  bare = false,
}) => {
  const isMerchantOnboarding = currentScreenKey.startsWith('onboarding_merchant');
  const isProviderOnboarding = currentScreenKey.startsWith('onboarding_provider');

  return (
    <div
      className={
        bare
          ? 'fixed inset-0 w-full h-[100dvh] bg-[#f9f9ff] flex flex-col overflow-hidden select-none'
          : 'relative w-[390px] h-[812px] max-h-[92vh] bg-slate-950 rounded-[44px] p-2.5 shadow-2xl border-[7px] border-slate-900 flex flex-col overflow-hidden select-none'
      }
    >
      {/* Android Center Camera Punch-hole */}
      {!bare && (
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-black ring-1 ring-slate-800/60 z-50 flex items-center justify-center pointer-events-none shadow-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-[#0a1120] ring-1 ring-slate-900"></div>
        </div>
      )}

      {/* Screen Content Wrapper.
          El transform lo convierte en el bloque contenedor de todo `position: fixed`:
          modales, sheets y toasts quedan dentro de la pantalla del teléfono (no del
          navegador) y fijos aunque el contenido haga scroll. */}
      <div
        className={`relative w-full h-full bg-[#f9f9ff] flex flex-col overflow-hidden text-[#151c27] [transform:translateZ(0)] ${bare ? '' : 'rounded-[34px]'}`}
        style={bare ? { paddingTop: SAFE_TOP } : undefined}
      >
        {/* Android Material Status Bar (solo en el simulador; el teléfono real tiene la suya) */}
        {!bare && (
        <div aria-hidden="true" className="pt-2 px-5 pb-1 flex justify-between items-center text-[11px] font-semibold select-none text-slate-800 z-40 bg-transparent">
          <span className="font-bold tracking-tight">12:30</span>
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="text-[9px] font-black tracking-tighter bg-slate-200/90 px-1 py-0.2 rounded text-slate-800">5G</span>
            <Wifi size={12} strokeWidth={2.5} />
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] font-bold">98%</span>
              <Battery size={13} strokeWidth={2.5} />
            </div>
          </div>
        </div>
        )}

        {/* Top Header if back button is needed */}
        {showBack && (
          <div className="px-3.5 py-2 flex items-center justify-between border-b border-[#e7eefe] bg-white/95 backdrop-blur z-30 shadow-xs">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 text-[#1a3bb0] hover:bg-[#eff3ff] active:scale-95 rounded-xl transition flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Atrás</span>
            </button>
            {activeScreenTitle ? (
              <span className="font-black text-xs tracking-tight text-[#0b2545] truncate max-w-[210px]">
                {activeScreenTitle}
              </span>
            ) : (
              <div />
            )}
            <div className="w-8"></div>
          </div>
        )}

        {/* Scrollable Screen Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative flex flex-col">
          {children}
        </div>

        {/* Bottom Navigation Bar for Dashboard (5 components: Home, Mis ventas, Botón azul Comprar/Vender, Crédito, Mi cuenta) */}
        {showBottomNav && !isMerchantOnboarding && !isProviderOnboarding && currentScreenKey !== 'welcome' && (
          <nav aria-label="Navegación principal" className="bg-white border-t border-[#e1e8f8] px-2 py-1.5 flex items-center justify-around z-40 shadow-lg">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => onTabChange?.('inicio')}
              aria-current={activeTab === 'inicio' ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 px-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'inicio' ? 'text-[#1a3bb0] font-bold' : 'text-[#4a5f7e]'
              }`}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[23px] ${activeTab === 'inicio' ? 'material-symbols-filled text-[#1a3bb0]' : ''}`}>
                home
              </span>
              <span className="text-[10px] tracking-tight">Home</span>
            </button>

            {/* 2. Mis Ventas */}
            <button
              type="button"
              onClick={() => onTabChange?.('ventas')}
              aria-current={activeTab === 'ventas' ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 px-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'ventas' ? 'text-[#1a3bb0] font-bold' : 'text-[#4a5f7e]'
              }`}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[23px] ${activeTab === 'ventas' ? 'material-symbols-filled text-[#1a3bb0]' : ''}`}>
                payments
              </span>
              <span className="text-[10px] tracking-tight">Mis ventas</span>
            </button>

            {/* 3. Botón Central Azul: Comprar y Vender (Acción Kuotear / Selector doble) */}
            <button
              type="button"
              onClick={() => onTabChange?.('kuotear')}
              aria-haspopup="dialog"
              className="relative -top-3.5 flex flex-col items-center group cursor-pointer active:scale-95 transition"
              title="Comprar o Vender"
            >
              <div className="w-13 h-13 p-3 bg-gradient-to-tr from-[#00248b] to-[#1a3bb0] text-white rounded-full shadow-lg shadow-blue-900/35 group-active:scale-95 transition flex items-center justify-center ring-4 ring-white">
                <span aria-hidden="true" className="material-symbols-outlined text-2xl font-bold">
                  swap_vert
                </span>
              </div>
              <span className="text-[9px] font-black text-[#1a3bb0] -mt-0.5 tracking-tight">
                Comprar / Vender
              </span>
            </button>

            {/* 4. Crédito */}
            <button
              type="button"
              onClick={() => onTabChange?.('credito')}
              aria-current={activeTab === 'credito' || activeTab === 'linea' ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 px-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'credito' || activeTab === 'linea' ? 'text-[#1a3bb0] font-bold' : 'text-[#4a5f7e]'
              }`}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[23px] ${(activeTab === 'credito' || activeTab === 'linea') ? 'material-symbols-filled text-[#1a3bb0]' : ''}`}>
                account_balance_wallet
              </span>
              <span className="text-[10px] tracking-tight">Crédito</span>
            </button>

            {/* 5. Mi Cuenta (Perfil) */}
            <button
              type="button"
              onClick={() => onTabChange?.('perfil')}
              aria-current={activeTab === 'perfil' || currentScreenKey === 'profile' ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 px-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'perfil' || currentScreenKey === 'profile' ? 'text-[#1a3bb0] font-bold' : 'text-[#4a5f7e]'
              }`}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[23px] ${(activeTab === 'perfil' || currentScreenKey === 'profile') ? 'material-symbols-filled text-[#1a3bb0]' : ''}`}>
                person
              </span>
              <span className="text-[10px] tracking-tight">Mi cuenta</span>
            </button>
          </nav>
        )}

        {/* Home Indicator Bar (simulador) / zona segura inferior (teléfono real) */}
        {bare ? (
          <div aria-hidden="true" className="w-full bg-white shrink-0" style={{ height: SAFE_BOTTOM }} />
        ) : (
          <div aria-hidden="true" className="w-full flex justify-center pb-2 pt-1 bg-white">
            <div className="w-32 h-1 bg-slate-300 rounded-full"></div>
          </div>
        )}
      </div>
    </div>
  );
};
