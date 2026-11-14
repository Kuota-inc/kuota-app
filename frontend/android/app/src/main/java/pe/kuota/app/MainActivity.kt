package pe.kuota.app

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(KuotaNotificationsPlugin::class.java)
        registerPlugin(KuotaSecurePlugin::class.java)
        registerPlugin(KuotaBiometricPlugin::class.java)
        registerPlugin(KuotaVaultPlugin::class.java)
        registerPlugin(KuotaIntegrityPlugin::class.java)
        registerPlugin(KuotaPlayIntegrityPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    // Al pasar a segundo plano se marca la ventana como segura: la miniatura de "apps recientes"
    // sale en negro y no muestra saldos ni datos.
    override fun onPause() {
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onPause()
    }

    // Al volver se quita, salvo que la pantalla visible sea sensible (PIN, identidad, perfil): ahí
    // sigue bloqueada la captura. En el resto de pantallas se permiten capturas (p. ej. compartir un cobro).
    override fun onResume() {
        super.onResume()
        if (!KuotaSecurePlugin.sensitive) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
