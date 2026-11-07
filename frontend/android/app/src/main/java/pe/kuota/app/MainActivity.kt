package pe.kuota.app

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(KuotaNotificationsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    // Al pasar a segundo plano se marca la ventana como segura: la miniatura de "apps recientes"
    // sale en negro y no muestra saldos ni datos. Al volver se quita, para no impedir capturas de
    // pantalla mientras la app está en uso.
    override fun onPause() {
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
}
