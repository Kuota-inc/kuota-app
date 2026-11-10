package pe.kuota.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Bóveda de credenciales: guarda los tokens de sesión cifrados con AES-256-GCM. La clave vive en el
 * Android Keystore (no se puede exportar ni leer fuera de esta app) y los datos cifrados en
 * preferencias privadas excluidas del respaldo. Reemplaza al localStorage del WebView para secretos.
 */
@CapacitorPlugin(name = "KuotaVault")
class KuotaVaultPlugin : Plugin() {

    private val alias = "kuota_vault_key_v1"
    private val prefsName = "kuota_vault"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    private fun prefs() = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = cipher.iv
        val data = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String? = try {
        val parts = stored.split(":")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
        String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    } catch (e: Exception) {
        null // dato dañado o clave rotada: se trata como ausente (la app pide iniciar sesión)
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val keys = call.getArray("keys")?.toList<String>() ?: emptyList()
        val values = JSObject()
        val p = prefs()
        for (k in keys) {
            val v = p.getString(k, null)?.let { decrypt(it) }
            if (v != null) values.put(k, v)
        }
        call.resolve(JSObject().put("values", values))
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val k = call.getString("key")
        val v = call.getString("value")
        if (k.isNullOrEmpty() || v == null) {
            call.reject("key y value son obligatorios")
            return
        }
        try {
            prefs().edit().putString(k, encrypt(v)).apply()
            call.resolve()
        } catch (e: Exception) {
            call.reject("No se pudo guardar en la bóveda", e)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val k = call.getString("key")
        if (!k.isNullOrEmpty()) prefs().edit().remove(k).apply()
        call.resolve()
    }
}
