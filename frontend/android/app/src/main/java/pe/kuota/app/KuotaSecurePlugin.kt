package pe.kuota.app

import android.view.WindowManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bloquea capturas de pantalla y grabación en las pantallas sensibles (PIN, identidad, KYC, perfil).
 * La web llama a setSecure(true) mientras una de esas pantallas está visible y a setSecure(false) al salir.
 */
@CapacitorPlugin(name = "KuotaSecure")
class KuotaSecurePlugin : Plugin() {

    companion object {
        /** Estado pedido por la web: MainActivity lo respeta al volver de segundo plano. */
        @Volatile
        var sensitive: Boolean = false
    }

    @PluginMethod
    fun setSecure(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        sensitive = enabled
        activity.runOnUiThread {
            if (enabled) {
                activity.window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            call.resolve()
        }
    }
}
