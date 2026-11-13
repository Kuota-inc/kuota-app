package pe.kuota.app

import android.app.Application
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

class KuotaApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        if (BuildConfig.POSTHOG_PROJECT_TOKEN.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured")
            }
            return
        }

        if (BuildConfig.POSTHOG_HOST.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured")
            }
            return
        }

        PostHogAndroid.setup(
            this,
            PostHogAndroidConfig(
                apiKey = BuildConfig.POSTHOG_PROJECT_TOKEN,
                host = BuildConfig.POSTHOG_HOST,
            ).apply {
                errorTrackingConfig.autoCapture = true
                logs.serviceName = "kuota-android"
                logs.environment = if (BuildConfig.DEBUG) "development" else "production"
            },
        )
        PostHog.logger.info(
            "android application initialized",
            mapOf("event" to "android_application_initialized"),
        )
    }
}
