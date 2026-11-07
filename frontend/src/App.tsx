import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { KuotaNotifications } from './plugins/kuotaNotifications';
import { api, apiRequest, getMerchantId, setMerchantId, setProviderId } from './api/client';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useDeviceMode } from './hooks/useDeviceMode';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneSimulator } from './components/PhoneSimulator';
import { HomeScreen } from './screens/dashboard/HomeScreen';
import { KuotearModal } from './screens/dashboard/KuotearModal';
import { NotificationsSheet } from './screens/dashboard/NotificationsSheet';
import { ToastProvider, ToastViewport } from './components/Toast';
import { PinPromptHost, PinPromptProvider } from './components/PinPrompt';
import { logout as logoutPayments } from './api/payments';
import { RotateCcw, Store, Building2, KeyRound, UserCircle } from 'lucide-react';

// Pantallas que no son la inicial se cargan bajo demanda (bundle inicial más liviano).
const WelcomeScreen = lazy(() => import('./screens/onboarding/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })));
const MerchantIdentityScreen = lazy(() => import('./screens/onboarding/MerchantIdentityScreen').then((m) => ({ default: m.MerchantIdentityScreen })));
const MerchantValidatingScreen = lazy(() => import('./screens/onboarding/MerchantValidatingScreen').then((m) => ({ default: m.MerchantValidatingScreen })));
const MerchantActivityScreen = lazy(() => import('./screens/onboarding/MerchantActivityScreen').then((m) => ({ default: m.MerchantActivityScreen })));
const MerchantProductsScreen = lazy(() => import('./screens/onboarding/MerchantProductsScreen').then((m) => ({ default: m.MerchantProductsScreen })));
const MerchantWelcomeSummaryScreen = lazy(() => import('./screens/onboarding/MerchantWelcomeSummaryScreen').then((m) => ({ default: m.MerchantWelcomeSummaryScreen })));
const SalesScreen = lazy(() => import('./screens/dashboard/SalesScreen').then((m) => ({ default: m.SalesScreen })));
const PaymentLinkScreen = lazy(() => import('./screens/dashboard/PaymentLinkScreen').then((m) => ({ default: m.PaymentLinkScreen })));
const BuyOnCreditScreen = lazy(() => import('./screens/dashboard/BuyOnCreditScreen').then((m) => ({ default: m.BuyOnCreditScreen })));
const CreditLineScreen = lazy(() => import('./screens/dashboard/CreditLineScreen').then((m) => ({ default: m.CreditLineScreen })));
const ProviderFiscalScreen = lazy(() => import('./screens/provider/ProviderFiscalScreen').then((m) => ({ default: m.ProviderFiscalScreen })));
const ProviderValidatingScreen = lazy(() => import('./screens/provider/ProviderValidatingScreen').then((m) => ({ default: m.ProviderValidatingScreen })));
const ProviderActivityScreen = lazy(() => import('./screens/provider/ProviderActivityScreen').then((m) => ({ default: m.ProviderActivityScreen })));
const ProviderGpsScreen = lazy(() => import('./screens/provider/ProviderGpsScreen').then((m) => ({ default: m.ProviderGpsScreen })));
const ProviderNotificationsScreen = lazy(() => import('./screens/provider/ProviderNotificationsScreen').then((m) => ({ default: m.ProviderNotificationsScreen })));
const ProviderSavingsScreen = lazy(() => import('./screens/provider/ProviderSavingsScreen').then((m) => ({ default: m.ProviderSavingsScreen })));
const SecurityPinScreen = lazy(() => import('./screens/onboarding/SecurityPinScreen').then((m) => ({ default: m.SecurityPinScreen })));
const LoginScreen = lazy(() => import('./screens/onboarding/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const ProfileScreen = lazy(() => import('./screens/dashboard/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));

function ScreenFallback() {
  return (
    <div role="status" aria-label="Cargando pantalla" className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-[#1a3bb0] border-t-transparent rounded-full motion-safe:animate-spin" />
    </div>
  );
}

const ONBOARDED_KEY = 'kuota.onboarded';
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento: se vuelve a mostrar el registro */
  }
}

function AppShell() {
  // En el celular (APK) la primera vez se empieza por el registro; luego, por el Inicio.
  const [currentScreen, setCurrentScreen] = useState<string>(() =>
    Capacitor.isNativePlatform() && !readFlag(ONBOARDED_KEY) ? 'welcome' : 'dashboard'
  );
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [isKuotearOpen, setIsKuotearOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [notificationsSeen, setNotificationsSeen] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('ses_demo_123');
  const [merchantRequestId, setMerchantRequestId] = useState<string>('MER-48291-PE');
  const [providerRequestId, setProviderRequestId] = useState<string>('PRV-89420-PE');
  const [pinInitialStep, setPinInitialStep] = useState<'create' | 'confirm'>('create');
  const [pinOrigin, setPinOrigin] = useState<'MERCHANT' | 'PROVIDER'>('MERCHANT');
  const device = useDeviceMode();

  // Handle Role selection from Welcome Screen (PRD 01)
  const handleSelectRole = (role: 'MERCHANT' | 'PROVIDER', newSessionId: string) => {
    setSessionId(newSessionId);
    if (role === 'MERCHANT') {
      setCurrentScreen('onboarding_merchant_identity');
    } else {
      setCurrentScreen('onboarding_provider_fiscal');
    }
  };

  // Cerrar sesión: revoca la sesión de cobros (PIN) en el servidor y vuelve al registro.
  const handleLogout = () => {
    void logoutPayments().catch(() => {});
    setMerchantId(null);
    setProviderId(null);
    writeFlag(ONBOARDED_KEY, false);
    setCurrentScreen('welcome');
    setActiveTab('inicio');
  };

  // Al arrancar en dashboard (sesión previa), valida que el merchant_id siga existiendo.
  // Si fue reseteado (DB borrada), redirige a bienvenida automáticamente.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const merchantId = getMerchantId();
    if (!merchantId) { handleLogout(); return; }
    apiRequest('/auth/me').catch((err: any) => {
      if (err?.status === 404 || err?.status === 401 || err?.code === 'SESSION_EXPIRED' || err?.code === 'NOT_AUTHENTICATED') {
        handleLogout();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Natural step-by-step back navigation
  const handleBack = () => {
    switch (currentScreen) {
      // Merchant flow steps
      case 'login':
        setCurrentScreen('welcome');
        break;
      case 'onboarding_merchant_identity':
        setCurrentScreen('welcome');
        break;
      case 'onboarding_merchant_validating':
        setCurrentScreen('onboarding_merchant_identity');
        break;
      case 'onboarding_merchant_activity':
        setCurrentScreen('onboarding_merchant_identity');
        break;
      case 'onboarding_merchant_products':
        setCurrentScreen('onboarding_merchant_activity');
        break;
      case 'onboarding_merchant_summary':
        setCurrentScreen('onboarding_merchant_products');
        break;

      // Provider flow steps
      case 'onboarding_provider_fiscal':
        setCurrentScreen('welcome');
        break;
      case 'onboarding_provider_validating':
        setCurrentScreen('onboarding_provider_fiscal');
        break;
      case 'onboarding_provider_activity':
        setCurrentScreen('onboarding_provider_fiscal');
        break;
      case 'onboarding_provider_gps':
        setCurrentScreen('onboarding_provider_activity');
        break;
      case 'onboarding_provider_notifications':
        setCurrentScreen('onboarding_provider_gps');
        break;
      case 'onboarding_provider_savings':
        setCurrentScreen('onboarding_provider_notifications');
        break;
      case 'onboarding_security_pin':
        if (pinOrigin === 'PROVIDER') {
          setCurrentScreen('onboarding_provider_savings');
        } else {
          setCurrentScreen('onboarding_merchant_summary');
        }
        break;

      case 'profile':
        setCurrentScreen('dashboard');
        setActiveTab('inicio');
        break;

      default:
        setCurrentScreen('welcome');
    }
  };

  const showBack = currentScreen !== 'welcome' && currentScreen !== 'dashboard' && currentScreen !== 'profile' && currentScreen !== 'login';

  // Botón Atrás de Android: cierra el diálogo abierto, retrocede un paso, vuelve
  // al Inicio o, desde el Inicio, sale de la app.
  const backRef = useRef<() => void>(() => {});
  useEffect(() => {
    backRef.current = () => {
      if (document.querySelector('[role="dialog"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (isKuotearOpen) {
        setIsKuotearOpen(false);
      } else if (showBack) {
        handleBack();
      } else if (currentScreen === 'login') {
        setCurrentScreen('welcome');
      } else if (currentScreen === 'welcome') {
        NativeApp.exitApp();
      } else if (currentScreen !== 'dashboard' || activeTab !== 'inicio') {
        setCurrentScreen('dashboard');
        setActiveTab('inicio');
      } else {
        NativeApp.exitApp();
      }
    };
  });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = NativeApp.addListener('backButton', () => backRef.current());
    return () => {
      sub.then((h) => h.remove());
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setOverlaysWebView({ overlay: false });
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#f9f9ff' });
  }, []);

  // Bloque 3: suscribirse al listener de notificaciones de pago
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    KuotaNotifications.checkPermission().then(({ granted }) => {
      if (!granted) return;
      KuotaNotifications.addListener('notificationCaptured', (data) => {
        api.postScoringSignal('PAYMENT_CAPTURED', data.appPackage).catch(() => {});
      }).then((h) => { handle = h; });
    }).catch(() => {});
    return () => { handle?.remove(); };
  }, []);

  // Reset to initial screen
  const handleReset = () => {
    setCurrentScreen('welcome');
    setActiveTab('inicio');
    setIsKuotearOpen(false);
  };

  // Render active screen
  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen onSelectRole={handleSelectRole} onLogin={() => setCurrentScreen('login')} />;

      case 'login':
        return (
          <LoginScreen
            onSuccess={() => {
              writeFlag(ONBOARDED_KEY, true);
              setCurrentScreen('dashboard');
            }}
            onBack={() => setCurrentScreen('welcome')}
          />
        );

      // Merchant Onboarding Flow (Con Identidad DNI y KYC RENIEC)
      case 'onboarding_merchant_identity':
        return (
          <MerchantIdentityScreen
            sessionId={sessionId}
            onNext={(reqId) => {
              setMerchantRequestId(reqId);
              setCurrentScreen('onboarding_merchant_validating');
            }}
          />
        );
      case 'onboarding_merchant_validating':
        return (
          <MerchantValidatingScreen
            requestId={merchantRequestId}
            onNext={() => setCurrentScreen('onboarding_merchant_activity')}
          />
        );
      case 'onboarding_merchant_activity':
        return (
          <MerchantActivityScreen
            sessionId={sessionId}
            onNext={() => setCurrentScreen('onboarding_merchant_products')}
          />
        );
      case 'onboarding_merchant_products':
        return (
          <MerchantProductsScreen
            sessionId={sessionId}
            onNext={() => setCurrentScreen('onboarding_merchant_summary')}
          />
        );
      case 'onboarding_merchant_summary':
        return (
          <MerchantWelcomeSummaryScreen
            sessionId={sessionId}
            onGoToDashboard={() => {
              setPinOrigin('MERCHANT');
              setPinInitialStep('create');
              setCurrentScreen('onboarding_security_pin');
            }}
            onGoToLogin={() => setCurrentScreen('login')}
          />
        );

      // Security PIN Setup (Fin de Onboarding)
      case 'onboarding_security_pin':
        return (
          <SecurityPinScreen
            key={pinInitialStep}
            sessionId={sessionId}
            role={pinOrigin}
            initialStep={pinInitialStep}
            onComplete={() => {
              writeFlag(ONBOARDED_KEY, true);
              setCurrentScreen('dashboard');
              setActiveTab('inicio');
            }}
            onBack={() => {
              if (pinOrigin === 'PROVIDER') {
                setCurrentScreen('onboarding_provider_savings');
              } else {
                setCurrentScreen('onboarding_merchant_summary');
              }
            }}
          />
        );

      // Provider Onboarding Flow
      case 'onboarding_provider_fiscal':
        return (
          <ProviderFiscalScreen
            sessionId={sessionId}
            onNext={(reqId) => {
              setProviderRequestId(reqId);
              setCurrentScreen('onboarding_provider_validating');
            }}
          />
        );
      case 'onboarding_provider_validating':
        return (
          <ProviderValidatingScreen
            requestId={providerRequestId}
            onNext={() => setCurrentScreen('onboarding_provider_activity')}
          />
        );
      case 'onboarding_provider_activity':
        return (
          <ProviderActivityScreen
            onNext={() => setCurrentScreen('onboarding_provider_gps')}
          />
        );
      case 'onboarding_provider_gps':
        return (
          <ProviderGpsScreen
            onNext={() => setCurrentScreen('onboarding_provider_notifications')}
          />
        );
      case 'onboarding_provider_notifications':
        return (
          <ProviderNotificationsScreen
            onNext={() => setCurrentScreen('onboarding_provider_savings')}
          />
        );
      case 'onboarding_provider_savings':
        return (
          <ProviderSavingsScreen
            onFinish={() => {
              setPinOrigin('PROVIDER');
              setPinInitialStep('create');
              setCurrentScreen('onboarding_security_pin');
            }}
          />
        );

      // Profile Screen (Stitch Mi Perfil Y Negocio)
      case 'profile':
        return (
          <ProfileScreen
            onBack={() => {
              setCurrentScreen('dashboard');
              setActiveTab('inicio');
            }}
            onLogout={handleLogout}
          />
        );

      // Main Merchant Dashboard (PRD 05, 06, 07, 08, 09, 10)
      case 'dashboard':
      case 'dashboard_comprar_credito':
      case 'dashboard_cobros':
      default:
        if (currentScreen === 'dashboard_comprar_credito' || activeTab === 'comprar_credito') {
          return (
            <BuyOnCreditScreen
              onBack={() => {
                setCurrentScreen('dashboard');
                setActiveTab('inicio');
              }}
              onNavigateTab={(tab) => {
                setCurrentScreen('dashboard');
                setActiveTab(tab);
              }}
            />
          );
        }
        if (currentScreen === 'dashboard_cobros' || activeTab === 'cobros') {
          return (
            <PaymentLinkScreen
              onBack={() => {
                setCurrentScreen('dashboard');
                setActiveTab('inicio');
              }}
              onNavigateTab={(tab) => {
                setCurrentScreen('dashboard');
                setActiveTab(tab);
              }}
            />
          );
        }
        if (activeTab === 'ventas') {
          return <SalesScreen />;
        }
        if (activeTab === 'credito' || activeTab === 'linea') {
          return <CreditLineScreen onViewInstallments={() => setActiveTab('comprar_credito')} />;
        }
        if (activeTab === 'perfil' || currentScreen === 'profile') {
          return (
            <ProfileScreen
              onBack={() => {
                setCurrentScreen('dashboard');
                setActiveTab('inicio');
              }}
              onLogout={handleLogout}
            />
          );
        }
        if (activeTab === 'inicio') {
          return (
            <HomeScreen
              onNavigateTab={(tab) => {
                setCurrentScreen('dashboard');
                setActiveTab(tab);
              }}
              onOpenKuotear={() => setIsKuotearOpen(true)}
              onOpenNotifications={() => setIsNotificationsOpen(true)}
              notificationsSeen={notificationsSeen}
              onOpenProfile={() => {
                setCurrentScreen('dashboard');
                setActiveTab('perfil');
              }}
            />
          );
        }
        return (
          <HomeScreen
            onNavigateTab={(tab) => {
              setCurrentScreen('dashboard');
              setActiveTab(tab);
            }}
            onOpenKuotear={() => setIsKuotearOpen(true)}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            notificationsSeen={notificationsSeen}
            onOpenProfile={() => {
              setCurrentScreen('dashboard');
              setActiveTab('perfil');
            }}
          />
        );
    }
  };

  return (
    <div className="flex flex-col xl:flex-row items-center justify-center gap-6 w-full max-w-7xl mx-auto py-2">
      {/* Interactive Mobile Device Simulator */}
      <div className="relative">
        <PhoneSimulator
          currentScreenKey={currentScreen}
          onNavigate={(key) => setCurrentScreen(key)}
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === 'kuotear') {
              setIsKuotearOpen(true);
            } else {
              setCurrentScreen('dashboard');
              setActiveTab(tab);
            }
          }}
          showBack={showBack}
          bare={device}
          activeScreenTitle=""
          onBack={handleBack}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentScreen}-${activeTab}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col h-full"
            >
              <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
            </motion.div>
          </AnimatePresence>

          {/* Notificaciones (campana del Home) */}
          <NotificationsSheet
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onSeen={() => setNotificationsSeen(true)}
          />

          {/* Modal Kuotear (PRD 07) */}
          <KuotearModal
            isOpen={isKuotearOpen}
            onClose={() => setIsKuotearOpen(false)}
            onNavigateTo={(screenKey) => {
              if (screenKey === 'buy_on_credit') {
                setActiveTab('comprar_credito');
              } else if (screenKey === 'payment_link') {
                setActiveTab('cobros');
              }
            }}
          />
          <PinPromptHost />
          <ToastViewport />
        </PhoneSimulator>
      </div>

      {!device && (
        <>
      {/* Control Panel / Screen Selector for Testing All 16 PRD Screens */}
      <div className="w-full max-w-md bg-slate-800/90 backdrop-blur rounded-3xl p-5 border border-slate-700 text-white shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <img
              src="/brand/Kuotalogotiposvg.svg"
              alt="Kuota"
              className="h-6 object-contain brightness-0 invert"
            />
            <span className="text-xs text-slate-400 font-bold">| PRD 01-16</span>
          </div>
          <button
            onClick={handleReset}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
          >
            <RotateCcw size={14} />
            <span>Reiniciar</span>
          </button>
        </div>

        {/* Emprendedor Flows */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
            <Store size={15} />
            <span>Flujo Emprendedor (PRD 01 al 10)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={() => setCurrentScreen('welcome')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'welcome' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              01 · Bienvenida / Perfil
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_merchant_identity')}
              className={`p-2 rounded-xl text-left font-medium transition flex items-center justify-between ${
                currentScreen === 'onboarding_merchant_identity' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>01B · Identidad DNI</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_merchant_validating')}
              className={`p-2 rounded-xl text-left font-medium transition flex items-center justify-between ${
                currentScreen === 'onboarding_merchant_validating' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>01C · Validación KYC</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_merchant_activity')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_merchant_activity' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              02 · Actividad Comercial
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_merchant_products')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_merchant_products' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              03 · Añadir Productos
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_merchant_summary')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_merchant_summary' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              04 · Onboarding Exitoso
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setActiveTab('inicio');
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'dashboard' && activeTab === 'inicio' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              05 · Inicio (Home)
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setActiveTab('ventas');
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'dashboard' && activeTab === 'ventas' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              06 · Ventas de mi negocio
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setIsKuotearOpen(true);
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                isKuotearOpen ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              07 · Modal Kuotear
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setActiveTab('cobros');
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'dashboard' && activeTab === 'cobros' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              08 · Cobrar Link (1%)
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setActiveTab('comprar_credito');
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'dashboard' && activeTab === 'comprar_credito' ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              09 · Comprar al crédito (3X)
            </button>
            <button
              onClick={() => {
                setCurrentScreen('dashboard');
                setActiveTab('credito');
              }}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'dashboard' && (activeTab === 'credito' || activeTab === 'linea') ? 'bg-[#1a3bb0] text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              10 · Crédito (6 Niveles)
            </button>
          </div>
        </div>

        {/* Proveedor Flows */}
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <Building2 size={15} />
            <span>Flujo Proveedor (PRD 11 al 16)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={() => setCurrentScreen('onboarding_provider_fiscal')}
              className={`p-2 rounded-xl text-left font-medium transition flex items-center justify-between ${
                currentScreen === 'onboarding_provider_fiscal' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>11 · Reconocimiento RUC</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_provider_validating')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_provider_validating' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              12 · Validando Datos (KYC)
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_provider_activity')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_provider_activity' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              13 · Actividad Comercial
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_provider_gps')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_provider_gps' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              14 · Confirmación GPS
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_provider_notifications')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_provider_notifications' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              15 · Notificaciones (Preview)
            </button>
            <button
              onClick={() => setCurrentScreen('onboarding_provider_savings')}
              className={`p-2 rounded-xl text-left font-medium transition ${
                currentScreen === 'onboarding_provider_savings' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              16 · Ahorro 71% / Tarifa 1%
            </button>
          </div>
        </div>

        {/* Seguridad & PIN */}
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <KeyRound size={15} />
            <span>Seguridad Kuota (Fin de Onboarding)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={() => {
                setPinInitialStep('create');
                setCurrentScreen('onboarding_security_pin');
              }}
              className={`p-2 rounded-xl text-left font-medium transition flex items-center justify-between ${
                currentScreen === 'onboarding_security_pin' && pinInitialStep === 'create'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>17 · Crear PIN</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            </button>
            <button
              onClick={() => {
                setPinInitialStep('confirm');
                setCurrentScreen('onboarding_security_pin');
              }}
              className={`p-2 rounded-xl text-left font-medium transition flex items-center justify-between ${
                currentScreen === 'onboarding_security_pin' && pinInitialStep === 'confirm'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>18 · Confirmar PIN</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </button>
          </div>
        </div>

        {/* Mi Perfil & Negocio (Stitch) */}
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
            <UserCircle size={15} />
            <span>Perfil & Negocio (Stitch 5)</span>
          </div>
          <button
            onClick={() => {
              setCurrentScreen('dashboard');
              setActiveTab('perfil');
            }}
            className={`w-full p-2.5 rounded-xl text-left font-medium transition flex items-center justify-between text-xs ${
              (currentScreen === 'profile' || (currentScreen === 'dashboard' && activeTab === 'perfil'))
                ? 'bg-[#1a3bb0] text-white font-bold ring-2 ring-blue-400'
                : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="font-bold text-sky-400">19</span>
              <span>Mi Perfil Y Negocio (Don Lucho)</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/30 text-blue-200">
              Ver pantalla
            </span>
          </button>
        </div>

        {/* Backend live status pill */}
        <div className="pt-2 border-t border-slate-700 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>API Backend: <strong>http://localhost:3001/api/v1</strong></span>
          </div>
          <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">PEN (Soles)</span>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
export function App() {
  return (
    <ToastProvider>
      <PinPromptProvider>
        <AppShell />
      </PinPromptProvider>
    </ToastProvider>
  );
}
export default App;
