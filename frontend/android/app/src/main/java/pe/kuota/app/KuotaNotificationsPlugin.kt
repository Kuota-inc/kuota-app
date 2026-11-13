package pe.kuota.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import android.text.TextUtils
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.posthog.android.PostHogAndroid

@CapacitorPlugin(name = "KuotaNotifications")
class KuotaNotificationsPlugin : Plugin() {

    private var receiver: BroadcastReceiver? = null

    override fun load() {
        val filter = IntentFilter(KuotaNotificationService.ACTION_PAYMENT)
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                val payload = JSObject().apply {
                    put("appPackage", intent.getStringExtra(KuotaNotificationService.EXTRA_APP))
                    put("title", intent.getStringExtra(KuotaNotificationService.EXTRA_TITLE))
                    put("text", intent.getStringExtra(KuotaNotificationService.EXTRA_TEXT))
                    put("amountCents", intent.getIntExtra(KuotaNotificationService.EXTRA_AMOUNT_CENTS, 0))
                }
                notifyListeners("notificationCaptured", payload)
            }
        }
        activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    }

    override fun handleOnDestroy() {
        receiver?.let { activity.unregisterReceiver(it) }
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val granted = isListenerEnabled()
        runCatching {
            PostHogAndroid.getInstance().logger.info(
                "notification listener permission checked",
                mapOf("granted" to granted)
            )
        }
        val result = JSObject().put("granted", granted)
        call.resolve(result)
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        activity.startActivity(intent)
        runCatching {
            PostHogAndroid.getInstance().logger.info(
                "notification listener settings opened",
                mapOf("settings" to "notification_listener")
            )
        }
        call.resolve()
    }

    private fun isListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(
            activity.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        val pkgName = activity.packageName
        return flat.split(":").any { it.startsWith(pkgName) || TextUtils.equals(it, pkgName) }
    }
}
