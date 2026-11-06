package pe.kuota.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(KuotaNotificationsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
