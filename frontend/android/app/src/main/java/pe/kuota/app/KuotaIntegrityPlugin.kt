package pe.kuota.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Detecta condiciones de riesgo en el dispositivo antes de que el usuario ingrese el PIN:
 *  - overlay apps activas con permiso SYSTEM_ALERT_WINDOW
 *  - servicios de accesibilidad habilitados (pueden capturar texto de pantallas sensibles)
 *
 * La web llama a checkRisk() antes de mostrar el teclado PIN y muestra un aviso si hay riesgo.
 */
@CapacitorPlugin(name = "KuotaIntegrity")
class KuotaIntegrityPlugin : Plugin() {

    @PluginMethod
    fun checkRisk(call: PluginCall) {
        val ctx = context
        val risks = mutableListOf<String>()

        // 1. Accessibility services — cualquier servicio activo puede leer texto de otras apps.
        val am = ctx.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val activeServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        // Filtra el lector de pantalla del sistema (TalkBack) solo para no alertar a usuarios con discapacidad visual.
        val thirdPartyA11y = activeServices.filter { info ->
            val pkg = info.resolveInfo.serviceInfo.packageName ?: ""
            pkg != "com.google.android.marvin.talkback" &&
            pkg != "com.samsung.accessibility" &&
            !pkg.startsWith("com.android.")
        }
        if (thirdPartyA11y.isNotEmpty()) {
            risks.add("ACCESSIBILITY_SERVICE")
        }

        // 2. SYSTEM_ALERT_WINDOW (overlay) — permiso habilitado para apps de terceros.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(ctx)) {
                // canDrawOverlays devuelve true si la app *actual* tiene permiso.
                // Para detectar si OTRA app lo tiene necesitamos AppOpsManager.
            }
            // Comprobar si alguna app instalada (no del sistema) tiene SYSTEM_ALERT_WINDOW activo.
            val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val pm = ctx.packageManager
            val installedApps = pm.getInstalledPackages(0)
            val overlayApps = installedApps.filter { pkg ->
                val appInfo = pkg.applicationInfo ?: return@filter false
                // Excluir apps del sistema: solo nos importan apps de usuario.
                (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0 &&
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ops.unsafeCheckOpNoThrow(
                            AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW,
                            appInfo.uid,
                            pkg.packageName
                        ) == AppOpsManager.MODE_ALLOWED
                    } else {
                        @Suppress("DEPRECATION")
                        ops.checkOpNoThrow(
                            AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW,
                            appInfo.uid,
                            pkg.packageName
                        ) == AppOpsManager.MODE_ALLOWED
                    }
                } catch (_: Exception) { false }
            }
            if (overlayApps.isNotEmpty()) {
                risks.add("OVERLAY_PERMISSION")
            }
        }

        val result = JSObject()
            .put("safe", risks.isEmpty())
            .put("risks", risks.joinToString(","))
        call.resolve(result)
    }
}
