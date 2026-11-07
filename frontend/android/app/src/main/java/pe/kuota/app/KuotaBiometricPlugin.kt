package pe.kuota.app

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Huella / rostro (biometría fuerte de Android) para desbloquear la app.
 * Es solo un candado local: las operaciones con dinero siguen pidiendo el PIN al servidor.
 */
@CapacitorPlugin(name = "KuotaBiometric")
class KuotaBiometricPlugin : Plugin() {

    private val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG

    /** { available, reason }: reason = NONE_ENROLLED | NO_HARDWARE | HW_UNAVAILABLE | UNSUPPORTED | UNKNOWN */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val code = BiometricManager.from(activity).canAuthenticate(authenticators)
        val reason = when (code) {
            BiometricManager.BIOMETRIC_SUCCESS -> "OK"
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "NONE_ENROLLED"
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "NO_HARDWARE"
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "HW_UNAVAILABLE"
            BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED -> "UNSUPPORTED"
            else -> "UNKNOWN"
        }
        call.resolve(JSObject().put("available", code == BiometricManager.BIOMETRIC_SUCCESS).put("reason", reason))
    }

    /** Resuelve si la persona se autentica; rechaza con code = CANCELED | LOCKOUT | FAILED. */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        val title = call.getString("title") ?: "Desbloquear Kuota"
        val subtitle = call.getString("subtitle")
        val negative = call.getString("negativeText") ?: "Usar PIN"

        activity.runOnUiThread {
            val host = activity as? FragmentActivity
            if (host == null) {
                call.reject("No se pudo abrir la biometría.", "FAILED")
                return@runOnUiThread
            }
            val executor = ContextCompat.getMainExecutor(host)
            val prompt = BiometricPrompt(host, executor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val code = when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED -> "CANCELED"
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "LOCKOUT"
                        else -> "FAILED"
                    }
                    call.reject(errString.toString(), code)
                }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { if (subtitle != null) setSubtitle(subtitle) }
                .setNegativeButtonText(negative)
                .setAllowedAuthenticators(authenticators)
                .setConfirmationRequired(false)
                .build()
            prompt.authenticate(info)
        }
    }
}
