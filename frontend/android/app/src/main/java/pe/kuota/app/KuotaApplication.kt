package pe.kuota.app

import android.app.Application
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

class KuotaApplication : Application() {
    companion object {
        @Volatile
        var postHogReady = false
            private set
    }

    override fun onCreate() {
        super.onCreate()

        val projectToken = BuildConfig.POSTHOG_PROJECT_TOKEN
        val host = BuildConfig.POSTHOG_HOST

        if (projectToken.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured")
            }
            return
        }

        if (host.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured")
            }
            return
        }

        PostHogAndroid.setup(
            this,
            PostHogAndroidConfig(
                projectToken = projectToken,
                host = host,
            ).apply {
                debug = BuildConfig.DEBUG
                errorTrackingConfig.autoCapture = true
                logs.serviceName = "kuota-android"
                logs.environment = if (BuildConfig.DEBUG) "development" else "production"
                logs.serviceVersion = BuildConfig.VERSION_NAME
            },
        )
        postHogReady = true
        PostHogAndroid.getInstance().logger.info(
            "native analytics initialized",
            mapOf("event" to "native_analytics_initialized"),
        )
    }
}
