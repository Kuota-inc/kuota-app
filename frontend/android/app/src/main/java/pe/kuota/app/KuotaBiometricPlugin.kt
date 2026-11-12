package pe.kuota.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Registro y desbloqueo con biometría fuerte de Android (huella, o rostro en los teléfonos que lo certifican como fuerte).
 *
 * Registrar NO es solo prender un interruptor. Android no deja que una app guarde huellas (eso lo hace el sistema en
 * Ajustes); lo que Kuota registra es un VÍNCULO criptográfico con las huellas del teléfono:
 *  1. Se crea una clave en el Android Keystore que solo se puede usar con una biometría fuerte reciente
 *     (setUserAuthenticationRequired) y que se invalida si cambian las huellas del teléfono
 *     (setInvalidatedByBiometricEnrollment).
 *  2. La persona pasa su huella una vez: con esa autenticación se cifra un secreto aleatorio y se guarda cifrado.
 *  3. Para desbloquear hay que volver a pasar la huella y descifrar ese secreto con la misma clave: sin una biometría
 *     real no hay desbloqueo (un simple "OK" de la interfaz no basta).
 * Si alguien agrega o quita una huella en el teléfono, la clave se invalida y hay que registrar de nuevo.
 * Sigue siendo solo un candado local: las operaciones con dinero siguen pidiendo el PIN al servidor.
 */
@CapacitorPlugin(name = "KuotaBiometric")
class KuotaBiometricPlugin : Plugin() {

    private val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
    private val alias = "kuota_biometric_key_v1"
    private val prefsName = "kuota_biometric"
    private val transformation = "AES/GCM/NoPadding"

    private fun prefs() = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun key(): SecretKey? = (keyStore().getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey() {
        val ks = keyStore()
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                if (Build.VERSION.SDK_INT >= 30) {
                    // 0 = hay que autenticarse en cada uso, y solo con biometría fuerte.
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .build()
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }.generateKey()
    }

    /** Borra la clave y el secreto cifrado: la biometría queda sin registrar. */
    private fun wipe() {
        try {
            keyStore().deleteEntry(alias)
        } catch (_: Exception) {
            /* ya no estaba */
        }
        prefs().edit().clear().apply()
    }

    private fun reason(code: Int) = when (code) {
        BiometricManager.BIOMETRIC_SUCCESS -> "OK"
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "NONE_ENROLLED"
        BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "NO_HARDWARE"
        BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "HW_UNAVAILABLE"
        BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED -> "UNSUPPORTED"
        else -> "UNKNOWN"
    }

    private fun mapError(code: Int) = when (code) {
        BiometricPrompt.ERROR_USER_CANCELED,
        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
        BiometricPrompt.ERROR_CANCELED -> "CANCELED"
        BiometricPrompt.ERROR_LOCKOUT,
        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "LOCKOUT"
        else -> "FAILED"
    }

    private fun storedParts(): Pair<ByteArray, ByteArray>? {
        val blob = prefs().getString("blob", null) ?: return null
        val parts = blob.split(":")
        if (parts.size != 2) return null
        return try {
            Pair(Base64.decode(parts[0], Base64.NO_WRAP), Base64.decode(parts[1], Base64.NO_WRAP))
        } catch (_: Exception) {
            null
        }
    }

    /** { available, reason, registered, invalidated } — reason = OK | NONE_ENROLLED | NO_HARDWARE | HW_UNAVAILABLE | UNSUPPORTED | UNKNOWN */
    @PluginMethod
    fun status(call: PluginCall) {
        val code = BiometricManager.from(activity).canAuthenticate(authenticators)
        var registered = false
        var invalidated = false
        val parts = storedParts()
        if (parts != null) {
            try {
                val secretKey = key()
                if (secretKey != null) {
                    // Probar que la clave sigue válida: si cambiaron las huellas del teléfono, Android la invalidó.
                    Cipher.getInstance(transformation).init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, parts.first))
                    registered = true
                } else {
                    wipe()
                }
            } catch (_: KeyPermanentlyInvalidatedException) {
                wipe()
                invalidated = true
            } catch (_: Exception) {
                registered = false
            }
        }
        call.resolve(
            JSObject().put("available", code == BiometricManager.BIOMETRIC_SUCCESS).put("reason", reason(code))
                .put("registered", registered).put("invalidated", invalidated)
        )
    }

    /** Compatibilidad: { available, reason }. */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val code = BiometricManager.from(activity).canAuthenticate(authenticators)
        call.resolve(JSObject().put("available", code == BiometricManager.BIOMETRIC_SUCCESS).put("reason", reason(code)))
    }

    /** Abre la pantalla de Android donde se guarda una huella (el sistema es quien las registra). */
    @PluginMethod
    fun openEnrollment(call: PluginCall) {
        val intents = ArrayList<Intent>()
        if (Build.VERSION.SDK_INT >= 30) {
            intents.add(
                Intent(Settings.ACTION_BIOMETRIC_ENROLL)
                    .putExtra(Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED, authenticators)
            )
        }
        if (Build.VERSION.SDK_INT >= 28) intents.add(Intent(Settings.ACTION_FINGERPRINT_ENROLL))
        intents.add(Intent(Settings.ACTION_SECURITY_SETTINGS))
        for (intent in intents) {
            try {
                activity.startActivity(intent)
                call.resolve()
                return
            } catch (_: Exception) {
                /* se prueba la siguiente pantalla */
            }
        }
        call.reject("No pudimos abrir los ajustes de huella.", "FAILED")
    }

    /** Registra la biometría: crea la clave y pide la huella una vez para sellar el secreto. */
    @PluginMethod
    fun register(call: PluginCall) {
        val title = call.getString("title") ?: "Registrar tu huella en Kuota"
        val subtitle = call.getString("subtitle")
        val negative = call.getString("negativeText") ?: "Cancelar"

        activity.runOnUiThread {
            val host = activity as? FragmentActivity
            if (host == null) {
                call.reject("No se pudo abrir la biometría.", "FAILED")
                return@runOnUiThread
            }
            val cipher: Cipher
            try {
                wipe()
                createKey()
                cipher = Cipher.getInstance(transformation).apply { init(Cipher.ENCRYPT_MODE, key()) }
            } catch (e: Exception) {
                wipe()
                call.reject("No pudimos preparar el registro.", "FAILED", e)
                return@runOnUiThread
            }
            val executor = ContextCompat.getMainExecutor(host)
            val prompt = BiometricPrompt(host, executor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        val sealing = result.cryptoObject?.cipher ?: throw IllegalStateException("sin cifrador")
                        val secret = ByteArray(32).also { SecureRandom().nextBytes(it) }
                        val sealed = sealing.doFinal(secret)
                        prefs().edit()
                            .putString("blob", Base64.encodeToString(sealing.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP))
                            .apply()
                        call.resolve(JSObject().put("registered", true))
                    } catch (e: Exception) {
                        wipe()
                        call.reject("No pudimos guardar el registro.", "FAILED", e)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    wipe()
                    call.reject(errString.toString(), mapError(errorCode))
                }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { if (subtitle != null) setSubtitle(subtitle) }
                .setNegativeButtonText(negative)
                .setAllowedAuthenticators(authenticators)
                .setConfirmationRequired(true)
                .build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        }
    }

    /**
     * Desbloqueo: hay que pasar la huella y descifrar el secreto registrado con la clave biométrica.
     * Rechaza con code = NOT_REGISTERED | INVALIDATED (cambiaron las huellas del teléfono) | CANCELED | LOCKOUT | FAILED.
     */
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
            val parts = storedParts()
            val secretKey = try { key() } catch (_: Exception) { null }
            if (parts == null || secretKey == null) {
                call.reject("Aún no registraste tu huella en Kuota.", "NOT_REGISTERED")
                return@runOnUiThread
            }
            val cipher: Cipher
            try {
                cipher = Cipher.getInstance(transformation).apply { init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, parts.first)) }
            } catch (_: KeyPermanentlyInvalidatedException) {
                wipe()
                call.reject("Cambiaron las huellas guardadas en el teléfono. Regístrala de nuevo.", "INVALIDATED")
                return@runOnUiThread
            } catch (e: Exception) {
                call.reject("No pudimos abrir la biometría.", "FAILED", e)
                return@runOnUiThread
            }
            val executor = ContextCompat.getMainExecutor(host)
            val prompt = BiometricPrompt(host, executor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        result.cryptoObject?.cipher?.doFinal(parts.second) ?: throw IllegalStateException("sin descifrador")
                        call.resolve()
                    } catch (e: Exception) {
                        call.reject("No pudimos verificar tu huella.", "FAILED", e)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.reject(errString.toString(), mapError(errorCode))
                }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { if (subtitle != null) setSubtitle(subtitle) }
                .setNegativeButtonText(negative)
                .setAllowedAuthenticators(authenticators)
                .setConfirmationRequired(false)
                .build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        }
    }

    /** Quita el registro: borra la clave y el secreto. */
    @PluginMethod
    fun disable(call: PluginCall) {
        wipe()
        call.resolve()
    }
}
