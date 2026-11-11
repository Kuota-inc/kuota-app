import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { KuotaBiometric } from './plugins/kuotaBiometric';
import { useSecureScreen } from './plugins/kuotaSecure';
import { useToast } from './components/toast-context';
import { HelpFab } from './components/HelpFab';
import { ProfileChooser } from './components/ProfileChooser';
import { ADD_RUC_EVENT, SWITCH_EVENT } from './components/ProfileSwitcher';
import { AddRucSheet } from './screens/dashboard/AddRucSheet';
import { PaywallSheet } from './screens/dashboard/PaywallSheet';
import { getActiveProfile, profilesApi, setActiveProfile, type ProfileKind } from './api/profiles';
import { isBiometricEnabled, resetSettings } from './services/appSettings';
import { refreshListener, setCaptureHandler } from './services/paymentListener';
import { api, apiRequest, getMerchantId, getProviderId, setMerchantId, setProviderId } from './api/client';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useDeviceMode } from './hooks/useDeviceMode';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneSimulator } from './components/PhoneSimulator';
import { HomeScreen } from './screens/dashboard/HomeScreen';
import { KuotearModal } from './screens/dashboard/KuotearModal';
import { NotificationsSheet } from './screens/dashboard/NotificationsSheet';
import { ToastProvider, ToastViewport } from './components/Toast';
import { PinPromptHost, PinPromptProvider } from './components/PinPrompt';
import { ensurePaymentsAccountForProvider, forgetSession, isCancelled, logout as logoutPayments, unlockWithPin } from './api/payments';
import { RotateCcw, Store, Building2, KeyRound, UserCircle } from 'lucide-react';

// Pantallas que no son la inicial se cargan bajo demanda (bundle inicial más liviano).
const ProviderHomeScreen = lazy(() => import('./screens/provider/ProviderHomeScreen').then((m) => ({ default: m.ProviderHomeScreen })));
const CalendarScreen = lazy(() => import('./screens/dashboard/CalendarScreen').then((m) => ({ default: m.CalendarScreen })));
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
// Pantallas principales con botón flotante de ayuda (nombre que viaja en el mensaje a soporte).
const HELP_TABS = new Map<string, string>([
  ['inicio', 'Inicio'],
  ['cobros', 'Nuevo cobro'],
  ['ventas', 'Mis ventas'],
  ['credito', 'Crédito'],
  ['linea', 'Crédito'],
  ['calendario', 'Calendario']
]);
// Pantallas con PIN, DNI/RUC, cuentas de abono o datos del perfil.
const SENSITIVE_SCREENS = new Set([
  'login',
  'onboarding_merchant_identity',
  'onboarding_merchant_validating',
  'onboarding_security_pin',
  'onboarding_provider_fiscal',
  'onboarding_provider_validating',
  'onboarding_provider_savings',
  'profile'
]);
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
  const [currentScreen, setCurrentScreen] = useState<string>(() => {
    if (!Capacitor.isNativePlatform()) return 'dashboard';
    if (!readFlag(ONBOARDED_KEY)) return 'welcome';
    // Sesión ya abierta: se abre en el último perfil usado.
    if (getProviderId() && (!getMerchantId() || getActiveProfile() === 'PROVIDER')) return 'provider_home';
    return 'dashboard';
  });
  // Bloqueo por seguridad: al abrir la app (y al volver tras un rato en segundo plano) se pide el PIN.
  const [locked, setLocked] = useState<boolean>(
    () => Capacitor.isNativePlatform() && !!getMerchantId() && readFlag(ONBOARDED_KEY)
  );
  const unlocking = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [isKuotearOpen, setIsKuotearOpen] = useState<boolean>(false);
  const [chooser, setChooser] = useState<boolean>(false);
  // Se llegó a vender desde el panel Provider: al terminar se vuelve a ese panel, y el perfil activo sigue siendo Provider.
  const [sellFromProvider, setSellFromProvider] = useState<boolean>(false);
  const [sellFlow, setSellFlow] = useState<null | 'add_ruc' | 'paywall' | 'add_ruc_profile'>(null);
  // Pantallas con credenciales o datos de identidad: sin capturas ni grabación de pantalla (solo Android).
  // Cobros, ventas, crédito e inicio sí permiten capturas (p. ej. compartir un comprobante).
  useSecureScreen(
    locked ||
      SENSITIVE_SCREENS.has(currentScreen) ||
      (currentScreen.startsWith('dashboard') && activeTab === 'perfil')
  );
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
    if (getProviderId()) void apiRequest('/providers/logout', { method: 'POST' }).catch(() => {});
    setMerchantId(null);
    setProviderId(null);
    setActiveProfile(null);
    setChooser(false);
    setSellFlow(null);
    setSellFromProvider(false);
    resetSettings();
    setLocked(false);
    writeFlag(ONBOARDED_KEY, false);
    setCurrentScreen('welcome');
    setActiveTab('inicio');
  };

  // Vender: 1) ¿RUC completado? -> Agregar mi RUC, 2) ¿Kuota Payments activo? -> paywall, 3) flujo de venta.
  const requestSell = async () => {
    try {
      const a = await profilesApi.access();
      if (a.next_step === 'ADD_RUC') { setSellFlow('add_ruc'); return; }
      if (a.next_step === 'RUC_IN_REVIEW') { appToast.info('Tu RUC está en revisión. Te avisaremos cuando puedas vender.'); return; }
      if (a.next_step === 'PAYWALL') { setSellFlow('paywall'); return; }
    } catch {
      /* si no se puede consultar, el servidor igual bloquea la venta */
    }
    setCurrentScreen('dashboard');
    setActiveTab('cobros');
  };

  // Cambio de perfil (botón de perfil) y "Agregar mi RUC" desde Perfil: sin volver a pedir la clave.
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const p = (e as CustomEvent<ProfileKind>).detail;
      setActiveProfile(p);
      setSellFromProvider(false);
      setActiveTab('inicio');
      setCurrentScreen(p === 'PROVIDER' ? 'provider_home' : 'dashboard');
    };
    const onAddRuc = () => setSellFlow('add_ruc_profile');
    window.addEventListener(SWITCH_EVENT, onSwitch);
    window.addEventListener(ADD_RUC_EVENT, onAddRuc);
    return () => {
      window.removeEventListener(SWITCH_EVENT, onSwitch);
      window.removeEventListener(ADD_RUC_EVENT, onAddRuc);
    };
  }, []);

  // Al arrancar en dashboard (sesión previa), valida que el merchant_id siga existiendo.
  // Si fue reseteado (DB borrada), redirige a bienvenida automáticamente.
  // Una sola sesión por cuenta: si se inició sesión en otro equipo, este se entera al abrir, al volver a la app
  // y cada 45 s con la app abierta (el servidor responde 401 y se vuelve al inicio de sesión).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const check = () => {
      const merchantId = getMerchantId();
      const providerId = getProviderId();
      // Sin cuenta todavía (registro en curso o bienvenida): no hay sesión que validar. Antes esto
      // devolvía a la bienvenida cada 45 s y al volver a la app, a mitad del registro.
      if (!merchantId && !providerId) return;
      apiRequest(merchantId ? '/auth/me' : '/providers/me').catch((err: any) => {
        if (err?.status === 404 || err?.status === 401 || err?.code === 'SESSION_EXPIRED' || err?.code === 'NOT_AUTHENTICATED') {
          handleLogout();
        }
      });
    };
    check();
    const timer = window.setInterval(check, 45_000);
    const sub = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check();
    });
    return () => {
      window.clearInterval(timer);
      sub.then((h) => h.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El token de identidad dejó de valer (venció o se revocó): volver al inicio de sesión.
  useEffect(() => {
    const onLogout = (e: Event) => {
      if ((e as CustomEvent<{ scope?: string }>).detail?.scope === 'PROVIDER' && getMerchantId()) {
        // Solo venció el acceso Provider (varias consultas lo avisan a la vez: se atiende una). El Emprendedor sigue abierto.
        if (!getProviderId()) return;
        setProviderId(null);
        setActiveProfile('EMPRENDEDOR');
        setSellFromProvider(false);
        setActiveTab('inicio');
        setCurrentScreen('dashboard');
        toastRef.current.error('Tu perfil Provider se cerró. Inicia sesión otra vez con tu PIN para usarlo.');
        return;
      }
      handleLogout();
      toastRef.current.error('Tu sesión se cerró: iniciaste sesión en otro equipo o venció. Vuelve a ingresar con tu PIN.');
    };
    window.addEventListener('kuota:logout', onLogout);
    return () => window.removeEventListener('kuota:logout', onLogout);
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

  // Pantallas de inicio (Emprendedor y Provider): sin "Atrás"; el botón de Android sale de la app.
  const showBack = currentScreen !== 'welcome' && currentScreen !== 'dashboard' && currentScreen !== 'provider_home' && currentScreen !== 'profile' && currentScreen !== 'login';

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
      } else if (currentScreen === 'welcome' || currentScreen === 'provider_home') {
        NativeApp.exitApp();
      } else if (sellFromProvider) {
        setSellFromProvider(false);
        setActiveTab('inicio');
        setCurrentScreen('provider_home');
      } else if (currentScreen !== 'dashboard' || activeTab !== 'inicio') {
        setCurrentScreen('dashboard');
        setActiveTab('inicio');
      } else {
        NativeApp.exitApp();
      }
    };
  });
  // El perfil activo (el que se recuerda al reabrir) sigue a la pantalla: Provider en su panel, Emprendedor en el suyo.
  useEffect(() => {
    if (currentScreen === 'provider_home') setActiveProfile('PROVIDER');
    else if (currentScreen === 'dashboard' && !sellFromProvider && getMerchantId()) setActiveProfile('EMPRENDEDOR');
  }, [currentScreen, sellFromProvider]);
  // Desbloqueo: huella/rostro si está activada (candado local; los cobros siguen pidiendo el PIN);
  // si se cancela o falla, o no está activada, se pide el PIN y se verifica en el servidor.
  const promptUnlock = async (pinOnly = false) => {
    if (unlocking.current) return;
    unlocking.current = true;
    try {
      if (!pinOnly && isBiometricEnabled()) {
        try {
          await KuotaBiometric.authenticate({ title: 'Desbloquear Kuota', subtitle: 'Usa tu huella o rostro', negativeText: 'Usar PIN' });
          setLocked(false);
          return;
        } catch {
          /* cancelada, bloqueada o fallida: se continúa con el PIN */
        }
      }
      await unlockWithPin();
      setLocked(false);
    } catch {
      /* cancelado o PIN no verificado: sigue bloqueada hasta que lo intente de nuevo */
    } finally {
      unlocking.current = false;
    }
  };

  useEffect(() => {
    if (!locked) return;
    const t = window.setTimeout(() => void promptUnlock(), 350);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        backgroundedAt.current = Date.now();
        return;
      }
      const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;
      if (away >= 60_000 && getMerchantId() && readFlag(ONBOARDED_KEY)) {
        forgetSession();
        setLocked(true);
      }
    });
    return () => {
      sub.then((h) => h.remove());
    };
  }, []);

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

  // Detección de abonos Yape/Plin: se (re)evalúa el permiso al abrir y cada vez que se vuelve a la app
  // (la persona pudo concederlo en Ajustes). Cada abono detectado se registra como venta declarada.
  const appToast = useToast();
  const toastRef = useRef(appToast);
  toastRef.current = appToast;
  useEffect(() => {
    setCaptureHandler(({ amountCents, source }) =>
      toastRef.current.success(`Abono ${source === 'YAPE' ? 'Yape' : 'Plin'} de S/ ${(amountCents / 100).toFixed(2)} registrado`)
    );
    void refreshListener();
    const sub = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void refreshListener();
        })
      : null;
    return () => {
      setCaptureHandler(null);
      sub?.then((h) => h.remove());
    };
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
        return <WelcomeScreen onSelectRole={handleSelectRole} onLogin={() => setCurrentScreen('login')} onSessionResolved={setSessionId} />;

      case 'provider_home':
        return (
          <ProviderHomeScreen
            onLogout={handleLogout}
            onSell={async () => {
              // Kuota Payments es de la persona: mismo flujo de venta que el Emprendedor.
              try {
                await ensurePaymentsAccountForProvider();
              } catch (e) {
                if (!isCancelled(e)) appToast.error((e as Error)?.message || 'No pudimos abrir Kuota Payments.');
                return;
              }
              setActiveProfile('PROVIDER');
              setSellFromProvider(true);
              void requestSell();
            }}
          />
        );

      case 'login':
        return (
          <LoginScreen
            onSuccess={(role, profiles) => {
              writeFlag(ONBOARDED_KEY, true);
              if (profiles && profiles.length > 1) {
                // Dos perfiles: el modal de elección va antes de cualquier pantalla de inicio.
                setCurrentScreen('dashboard');
                setChooser(true);
                return;
              }
              const p: ProfileKind = role === 'PROVIDER' ? 'PROVIDER' : 'EMPRENDEDOR';
              setActiveProfile(p);
              setCurrentScreen(p === 'PROVIDER' ? 'provider_home' : 'dashboard');
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
                setSellFromProvider(false);
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
                // Si se vendió desde el perfil Provider, se vuelve a su panel.
                if (sellFromProvider) {
                  setSellFromProvider(false);
                  setActiveTab('inicio');
                  setCurrentScreen('provider_home');
                  return;
                }
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
        if (activeTab === 'calendario') {
          return <CalendarScreen onBack={() => setActiveTab('inicio')} />;
        }
        if (activeTab === 'credito' || activeTab === 'linea') {
          return <CreditLineScreen onViewInstallments={() => setActiveTab('comprar_credito')} onOpenCalendar={() => setActiveTab('calendario')} />;
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
            } else if (tab === 'cobros') {
              void requestSell();
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
                void requestSell();
              }
            }}
          />
          {locked && (
            <div className="fixed inset-0 z-[60] bg-gradient-to-b from-[#00248b] to-[#1a3bb0] flex flex-col items-center justify-center text-white px-8 text-center">
              <div className="w-20 h-20 rounded-3xl bg-white/15 border border-white/25 flex items-center justify-center mb-6">
                <KeyRound size={36} />
              </div>
              <h1 className="text-2xl font-black tracking-tight">Kuota está bloqueada</h1>
              <p className="text-sm text-white/80 mt-2 max-w-xs">Ingresa tu PIN para continuar. Así protegemos tu cuenta si pierdes el celular.</p>
              <button
                type="button"
                onClick={() => void promptUnlock()}
                className="mt-8 w-full max-w-xs py-3.5 rounded-2xl bg-white text-[#00248b] font-black text-sm shadow-lg cursor-pointer"
              >
                {isBiometricEnabled() ? 'Desbloquear con huella o rostro' : 'Desbloquear con PIN'}
              </button>
              {isBiometricEnabled() && (
                <button
                  type="button"
                  onClick={() => void promptUnlock(true)}
                  className="mt-3 text-xs font-bold text-white/90 underline cursor-pointer"
                >
                  Usar PIN
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 text-xs font-bold text-white/80 underline cursor-pointer"
              >
                Cerrar sesión
              </button>
            </div>
          )}
          {!locked && !isKuotearOpen && currentScreen.startsWith('dashboard') && HELP_TABS.has(activeTab) && (
            <HelpFab screenName={HELP_TABS.get(activeTab)!} />
          )}
          {chooser && (
            <ProfileChooser
              onChoose={(p) => {
                setChooser(false);
                setActiveProfile(p);
                setActiveTab('inicio');
                setCurrentScreen(p === 'PROVIDER' ? 'provider_home' : 'dashboard');
              }}
              onLogout={handleLogout}
            />
          )}
          {(sellFlow === 'add_ruc' || sellFlow === 'add_ruc_profile') && (
            <AddRucSheet
              reason={sellFlow === 'add_ruc' ? 'sell' : 'profile'}
              onClose={() => {
                const fromSell = sellFlow === 'add_ruc';
                setSellFlow(null);
                if (fromSell) setIsKuotearOpen(true);
              }}
              onDone={() => {
                const fromSell = sellFlow === 'add_ruc';
                setSellFlow(null);
                appToast.success('Listo, tu RUC quedó registrado.');
                if (fromSell) void requestSell();
              }}
            />
          )}
          {sellFlow === 'paywall' && (
            <PaywallSheet
              onClose={() => {
                setSellFlow(null);
                setIsKuotearOpen(true);
              }}
              onActivated={() => {
                setSellFlow(null);
                appToast.success('Kuota Payments activado.');
                setCurrentScreen('dashboard');
                setActiveTab('cobros');
              }}
            />
          )}
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
              <span>01B · Identidad (DNI o CE)</span>
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
              <span>11 · Reconocimiento RUC (DNI o CE)</span>
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
