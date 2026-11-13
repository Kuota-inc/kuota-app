package pe.kuota.app

import android.app.Application
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

class KuotaApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val projectToken = BuildConfig.POSTHOG_PROJECT_TOKEN
        val host = BuildConfig.POSTHOG_HOST

        if (projectToken.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured")
            }
            return
        }

        if (host.isBlank()) {
            if (BuildConfig.DEBUG) {
                error("POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured")
            }
            return
        }

        val config = PostHogAndroidConfig(
            projectToken = projectToken,
            host = host,
        ).apply {
            errorTrackingConfig.autoCapture = true
            logs.serviceName = "kuota-android"
        }

        PostHogAndroid.setup(this, config)
    }
}
