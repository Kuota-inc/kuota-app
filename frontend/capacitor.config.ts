import type { CapacitorConfig } from '@capacitor/cli';

// Empaquetado Android de la app web (Capacitor). Compilar con: npm run build:android
//
// Seguridad (estándar bancario): la app se sirve con esquema https, sin tráfico HTTP plano
// y sin depuración remota del WebView. Solo para probar contra un backend local por Wi-Fi
// (http://<ip-de-la-pc>:3001) compila con KUOTA_DEV_LAN=1: NUNCA entregues ese APK.
const devLan = process.env.KUOTA_DEV_LAN === '1';

const config: CapacitorConfig = {
  appId: 'pe.kuota.app',
  appName: 'Kuota',
  webDir: 'dist',
  server: devLan ? { androidScheme: 'http', cleartext: true } : { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: devLan
  },
  plugins: {
    // Las llamadas a la API salen por el HTTP nativo de Android: así aplica el pinning de certificados
    // de network_security_config.xml (las peticiones hechas desde el WebView no lo respetan).
    CapacitorHttp: {
      enabled: true
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f9f9ff',
      overlaysWebView: false
    }
  }
};

export default config;
