package pe.kuota.app

import android.app.Notification
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.regex.Pattern

class KuotaNotificationService : NotificationListenerService() {

    companion object {
        const val ACTION_PAYMENT = "pe.kuota.app.PAYMENT_DETECTED"
        const val EXTRA_APP = "app_package"
        const val EXTRA_TITLE = "title"
        const val EXTRA_TEXT = "text"
        const val EXTRA_AMOUNT_CENTS = "amount_cents"

        // Apps de pago peruanas conocidas
        private val PAYMENT_APPS = setOf(
            "pe.com.yape.android",
            "pe.bhp.interbank.homebanking",
            "pe.bbva.homebanking",
            "com.bcp.bank.bcp",
            "pe.com.scotiabank.banca_movil",
            "pe.com.billetera.lukita"
        )

        // Detecta monto en soles: "S/ 150.00", "S/50", "150 soles"
        private val AMOUNT_PATTERNS = listOf(
            Pattern.compile("""S/\s*(\d{1,6}(?:[.,]\d{1,2})?)"""),
            Pattern.compile("""(\d{1,6}(?:[.,]\d{1,2})?)\s*soles""", Pattern.CASE_INSENSITIVE)
        )

        fun extractAmountCents(text: String): Int {
            for (p in AMOUNT_PATTERNS) {
                val m = p.matcher(text)
                if (m.find()) {
                    val raw = m.group(1)!!.replace(',', '.')
                    return (raw.toDouble() * 100).toInt()
                }
            }
            return 0
        }

        fun isPaymentNotification(title: String, text: String): Boolean {
            val combined = "$title $text".lowercase()
            return combined.contains("recib") ||
                combined.contains("transfer") ||
                combined.contains("pago") ||
                combined.contains("enviaron") ||
                combined.contains("s/")
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (pkg !in PAYMENT_APPS) return

        val extras = sbn.notification.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

        if (!isPaymentNotification(title, text)) return

        val amountCents = extractAmountCents("$title $text")

        val broadcast = Intent(ACTION_PAYMENT).apply {
            setPackage(applicationContext.packageName)
            putExtra(EXTRA_APP, pkg)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_TEXT, text)
            putExtra(EXTRA_AMOUNT_CENTS, amountCents)
        }
        sendBroadcast(broadcast)
    }
}
