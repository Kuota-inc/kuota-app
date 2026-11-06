import type { CapacitorConfig } from '@capacitor/cli';

// Empaquetado Android de la app web (Capacitor). Compilar con: npm run build:android
const config: CapacitorConfig = {
  appId: 'pe.kuota.app',
  appName: 'Kuota',
  webDir: 'dist',
  server: {
    // http (no https) para que el WebView pueda llamar al backend de desarrollo por
    // la red Wi-Fi (http://<ip-de-la-pc>:3001) sin bloqueo de "contenido mixto".
    androidScheme: 'http',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f9f9ff',
      overlaysWebView: false
    }
  }
};

export default config;
