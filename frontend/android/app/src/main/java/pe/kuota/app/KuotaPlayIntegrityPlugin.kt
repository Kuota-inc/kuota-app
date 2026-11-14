package pe.kuota.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest

/**
 * Solicita un token de Play Integrity para validar que el APK es genuino antes de operaciones
 * sensibles (pago, login, cambio de PIN). El backend verifica el token contra la API de Google y
 * valida que el nonce coincida con la operación en curso.
 *
 * Uso:
 *   const { token } = await KuotaPlayIntegrity.requestToken({ nonce: '<sha256-de-la-operacion>' });
 *   // Enviar token al backend junto con la solicitud; el backend llama a Google para verificar.
 */
@CapacitorPlugin(name = "KuotaPlayIntegrity")
class KuotaPlayIntegrityPlugin : Plugin() {

    @PluginMethod
    fun requestToken(call: PluginCall) {
        val nonce = call.getString("nonce")
        if (nonce.isNullOrBlank()) {
            call.reject("Falta el nonce.", "INVALID_NONCE")
            return
        }
        val manager = IntegrityManagerFactory.create(context)
        val request = IntegrityTokenRequest.builder()
            .setNonce(nonce)
            .build()
        manager.requestIntegrityToken(request)
            .addOnSuccessListener { response ->
                call.resolve(JSObject().put("token", response.token()))
            }
            .addOnFailureListener { e ->
                call.reject("No se pudo obtener el token de integridad: ${e.message}", "INTEGRITY_FAILED", e)
            }
    }
}
