import fs from 'node:fs';
const edit = (f, pairs) => {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(f + ': ' + a.slice(0, 80));
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(f, s);
};

edit('src/api/client.ts', [
  [
    "export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || defaultApiBase()).replace(/\\/+$/, '');",
    "export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || defaultApiBase()).replace(/\\/+$/, '');\n/** Origen del backend (sin /api/v1): sirve las páginas legales y el Libro de Reclamaciones. */\nexport const API_ORIGIN = (() => {\n  try {\n    return new URL(API_BASE).origin;\n  } catch {\n    return '';\n  }\n})();",
  ],
]);

edit('src/api/payments.ts', [
  [
    "/** Bloqueo de la app: descarta la sesión en memoria y pide el PIN (se verifica en el servidor). */",
    "/** Descarta la sesión de cobros en memoria: la próxima operación con dinero vuelve a pedir el PIN. */\nexport function forgetSession() {\n  session = null;\n}\n\n/** Bloqueo de la app: descarta la sesión en memoria y pide el PIN (se verifica en el servidor). */",
  ],
]);

edit('src/screens/onboarding/WelcomeScreen.tsx', [
  ['<a href="https://kuota.pe/legal/terminos"', '<a href={`${API_ORIGIN}/legal/terminos`}'],
  ['<a href="https://kuota.pe/legal/privacidad"', '<a href={`${API_ORIGIN}/legal/privacidad`}'],
]);
{
  let w = fs.readFileSync('src/screens/onboarding/WelcomeScreen.tsx', 'utf8');
  const firstImport = w.indexOf('import ');
  w = w.slice(0, firstImport) + "import { API_ORIGIN } from '../../api/client';\n" + w.slice(firstImport);
  fs.writeFileSync('src/screens/onboarding/WelcomeScreen.tsx', w);
}

edit('src/components/PinPrompt.tsx', [
  [
    "  const request = ctx?.request ?? null;\n  return (\n    <AnimatePresence>",
    "  const request = ctx?.request ?? null;\n  useSecureScreen(!!request);\n  return (\n    <AnimatePresence>",
  ],
  ["import { CancelledError, setPinHandler, type PinPromptOptions } from '../api/payments';", "import { CancelledError, setPinHandler, type PinPromptOptions } from '../api/payments';\nimport { useSecureScreen } from '../plugins/kuotaSecure';"],
]);

edit('src/screens/dashboard/ProfileScreen.tsx', [
  ["import { api } from '../../api/client';", "import { API_ORIGIN, api } from '../../api/client';\nimport { KuotaBiometric, biometricReasonText } from '../../plugins/kuotaBiometric';\nimport { isBiometricEnabled, setBiometricEnabled } from '../../services/appSettings';\nimport { disableListener, enableListener, listenerStatus, onListenerChange, refreshListener, type ListenerStatus } from '../../services/paymentListener';"],
  [
    "  const [isListenerActive, setIsListenerActive] = useState<boolean>(true);\n  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);",
    "  // Listener Yape/Plin: refleja el permiso real de Android y la preferencia guardada.\n  const [listenerState, setListenerState] = useState<ListenerStatus>(listenerStatus());\n  const isListenerActive = listenerState === 'ACTIVE';\n  const [biometricEnabled, setBiometricOn] = useState<boolean>(isBiometricEnabled());\n  useEffect(() => {\n    void refreshListener().then(setListenerState);\n    return onListenerChange(() => setListenerState(listenerStatus()));\n  }, []);\n\n  const toggleBiometric = async () => {\n    if (biometricEnabled) {\n      setBiometricEnabled(false);\n      setBiometricOn(false);\n      showToast('Huella digital desactivada.');\n      return;\n    }\n    try {\n      const info = await KuotaBiometric.isAvailable();\n      if (!info.available) {\n        showToast(biometricReasonText(info.reason));\n        return;\n      }\n      // Se confirma con la biometría antes de activarla: así se sabe que el sensor funciona y es de esta persona.\n      await KuotaBiometric.authenticate({ title: 'Activar huella o rostro', subtitle: 'Confirma para desbloquear Kuota con tu biometría', negativeText: 'Cancelar' });\n      setBiometricEnabled(true);\n      setBiometricOn(true);\n      showToast('Listo: desbloquearás Kuota con tu huella o rostro. Los cobros seguirán pidiendo tu PIN.');\n    } catch (e: any) {\n      if (e?.code !== 'CANCELED') showToast(biometricReasonText('UNKNOWN'));\n    }\n  };\n\n  const toggleListener = async () => {\n    if (listenerState === 'UNSUPPORTED') {\n      showToast('La detección automática solo funciona en la app Android.');\n      return;\n    }\n    if (isListenerActive) {\n      setActiveModal('modal-listener-alert');\n      return;\n    }\n    const r = await enableListener();\n    setListenerState(listenerStatus());\n    showToast(r === 'ACTIVE' ? 'Listener Yape & Plin activado.' : 'En Ajustes, activa \"Kuota\" en Acceso a notificaciones y vuelve a la app.');\n  };\n\n  const listenerLabel = { ACTIVE: 'Activo', OFF: 'Inactivo', NO_PERMISSION: 'Sin permiso', UNSUPPORTED: 'No disponible' }[listenerState];",
  ],
  [
    "                    {isListenerActive ? 'Activo' : 'Inactivo'}",
    "                    {listenerLabel}",
  ],
  [
    "              onClick={() => {\n                if (isListenerActive) {\n                  setActiveModal('modal-listener-alert');\n                } else {\n                  setIsListenerActive(true);\n                  showToast('Listener Yape & Plin reactivado con éxito');\n                }\n              }}",
    "              onClick={() => void toggleListener()}\n              role=\"switch\"\n              aria-checked={isListenerActive}",
  ],
  [
    "              onClick={() => {\n                setBiometricEnabled(v => {\n                  const next = !v;\n                  showToast(next ? 'Huella digital activada para esta cuenta.' : 'Huella digital desactivada.');\n                  return next;\n                });\n              }}",
    "              onClick={() => void toggleBiometric()}\n              role=\"switch\"\n              aria-checked={biometricEnabled}",
  ],
  [
    "                      onClick={() => {\n                        setIsListenerActive(true);\n                        closeModal();\n                      }}",
    "                      onClick={closeModal}",
  ],
  [
    "                      onClick={() => {\n                        setIsListenerActive(false);\n                        closeModal();\n                        showToast('Listener suspendido');\n                      }}",
    "                      onClick={() => {\n                        void disableListener().then(() => setListenerState(listenerStatus()));\n                        closeModal();\n                        showToast('Listener suspendido');\n                      }}",
  ],
  ['href="https://kuota.pe/legal"', 'href={`${API_ORIGIN}/legal/privacidad`}'],
  ['href="https://kuota.pe/reclamaciones"', 'href={`${API_ORIGIN}/reclamaciones`}'],
]);

edit('src/App.tsx', [
  ["import { KuotaNotifications } from './plugins/kuotaNotifications';\n", "import { KuotaBiometric } from './plugins/kuotaBiometric';\nimport { useSecureScreen } from './plugins/kuotaSecure';\nimport { useToast } from './components/toast-context';\nimport { isBiometricEnabled, resetSettings } from './services/appSettings';\nimport { refreshListener, setCaptureHandler } from './services/paymentListener';\n"],
  ["import { logout as logoutPayments, unlockWithPin } from './api/payments';", "import { forgetSession, logout as logoutPayments, unlockWithPin } from './api/payments';"],
  [
    "    setMerchantId(null);\n    setProviderId(null);\n    setLocked(false);",
    "    setMerchantId(null);\n    setProviderId(null);\n    resetSettings();\n    setLocked(false);",
  ],
  [
    "  // Bloque 3: suscribirse al listener de notificaciones de pago\n  useEffect(() => {\n    let handle: { remove: () => void } | null = null;\n    KuotaNotifications.checkPermission().then(({ granted }) => {\n      if (!granted) return;\n      KuotaNotifications.addListener('notificationCaptured', (data) => {\n        api.postScoringSignal('PAYMENT_CAPTURED', data.appPackage).catch(() => {});\n      }).then((h) => { handle = h; });\n    }).catch(() => {});\n    return () => { handle?.remove(); };\n  }, []);",
    "  // Detección de abonos Yape/Plin: se (re)evalúa el permiso al abrir y cada vez que se vuelve a la app\n  // (la persona pudo concederlo en Ajustes). Cada abono detectado se registra como venta declarada.\n  const appToast = useToast();\n  const toastRef = useRef(appToast);\n  toastRef.current = appToast;\n  useEffect(() => {\n    setCaptureHandler(({ amountCents, source }) =>\n      toastRef.current.success(`Abono ${source === 'YAPE' ? 'Yape' : 'Plin'} de S/ ${(amountCents / 100).toFixed(2)} registrado`)\n    );\n    void refreshListener();\n    const sub = Capacitor.isNativePlatform()\n      ? NativeApp.addListener('appStateChange', ({ isActive }) => {\n          if (isActive) void refreshListener();\n        })\n      : null;\n    return () => {\n      setCaptureHandler(null);\n      sub?.then((h) => h.remove());\n    };\n  }, []);",
  ],
  [
    "  const promptUnlock = () => {\n    if (unlocking.current) return;\n    unlocking.current = true;\n    unlockWithPin()\n      .then(() => setLocked(false))\n      .catch(() => {\n        /* cancelado o PIN no verificado: sigue bloqueada hasta que lo intente de nuevo */\n      })\n      .finally(() => {\n        unlocking.current = false;\n      });\n  };",
    "  // Desbloqueo: huella/rostro si está activada (candado local; los cobros siguen pidiendo el PIN);\n  // si se cancela o falla, o no está activada, se pide el PIN y se verifica en el servidor.\n  const promptUnlock = async (pinOnly = false) => {\n    if (unlocking.current) return;\n    unlocking.current = true;\n    try {\n      if (!pinOnly && isBiometricEnabled()) {\n        try {\n          await KuotaBiometric.authenticate({ title: 'Desbloquear Kuota', subtitle: 'Usa tu huella o rostro', negativeText: 'Usar PIN' });\n          setLocked(false);\n          return;\n        } catch {\n          /* cancelada, bloqueada o fallida: se continúa con el PIN */\n        }\n      }\n      await unlockWithPin();\n      setLocked(false);\n    } catch {\n      /* cancelado o PIN no verificado: sigue bloqueada hasta que lo intente de nuevo */\n    } finally {\n      unlocking.current = false;\n    }\n  };",
  ],
  [
    "    const t = window.setTimeout(promptUnlock, 350);",
    "    const t = window.setTimeout(() => void promptUnlock(), 350);",
  ],
  [
    "      if (away >= 60_000 && getMerchantId() && readFlag(ONBOARDED_KEY)) setLocked(true);",
    "      if (away >= 60_000 && getMerchantId() && readFlag(ONBOARDED_KEY)) {\n        forgetSession();\n        setLocked(true);\n      }",
  ],
  [
    "                onClick={promptUnlock}\n                className=\"mt-8 w-full max-w-xs py-3.5 rounded-2xl bg-white text-[#00248b] font-black text-sm shadow-lg cursor-pointer\"\n              >\n                Desbloquear con PIN\n              </button>",
    "                onClick={() => void promptUnlock()}\n                className=\"mt-8 w-full max-w-xs py-3.5 rounded-2xl bg-white text-[#00248b] font-black text-sm shadow-lg cursor-pointer\"\n              >\n                {isBiometricEnabled() ? 'Desbloquear con huella o rostro' : 'Desbloquear con PIN'}\n              </button>\n              {isBiometricEnabled() && (\n                <button\n                  type=\"button\"\n                  onClick={() => void promptUnlock(true)}\n                  className=\"mt-3 text-xs font-bold text-white/90 underline cursor-pointer\"\n                >\n                  Usar PIN\n                </button>\n              )}",
  ],
  [
    "  const unlocking = useRef(false);",
    "  const unlocking = useRef(false);\n  // Pantallas con credenciales o datos de identidad: sin capturas ni grabación de pantalla (solo Android).\n  // Cobros, ventas, crédito e inicio sí permiten capturas (p. ej. compartir un comprobante).",
  ],
]);

// Pantallas sensibles: se calcula después de declarar currentScreen / activeTab / locked
{
  let a = fs.readFileSync('src/App.tsx', 'utf8');
  const anchor = "  const [isKuotearOpen, setIsKuotearOpen] = useState<boolean>(false);";
  if (!a.includes(anchor)) throw new Error('anchor isKuotearOpen');
  a = a.replace(
    anchor,
    anchor +
      "\n  useSecureScreen(\n    locked ||\n      SENSITIVE_SCREENS.has(currentScreen) ||\n      (currentScreen.startsWith('dashboard') && activeTab === 'perfil')\n  );"
  );
  a = a.replace(
    "const ONBOARDED_KEY = 'kuota.onboarded';",
    "const ONBOARDED_KEY = 'kuota.onboarded';\n// Pantallas con PIN, DNI/RUC, cuentas de abono o datos del perfil.\nconst SENSITIVE_SCREENS = new Set([\n  'login',\n  'onboarding_merchant_identity',\n  'onboarding_merchant_validating',\n  'onboarding_security_pin',\n  'onboarding_provider_fiscal',\n  'onboarding_provider_validating',\n  'onboarding_provider_savings',\n  'profile'\n]);"
  );
  fs.writeFileSync('src/App.tsx', a);
}
console.log('ok');
