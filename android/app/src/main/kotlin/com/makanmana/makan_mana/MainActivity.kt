package com.makanmana.makan_mana

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    // PROMPT 4 (Part 16): open THIS app's OS notification settings so the user
    // can fix a device-level permission denial. No new plugin dependency.
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "makanmana/notif_settings")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openNotificationSettings" -> {
                        try {
                            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                            } else {
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                                    .setData(android.net.Uri.parse("package:$packageName"))
                            }
                            startActivity(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("open_failed", e.message, null)
                        }
                    }
                    // PROMPT 4A (Part 16): the OS timezone ID (e.g. Asia/Kuala_Lumpur)
                    // — an IANA zone the server quiet-hours evaluator can use.
                    // NOT device location / GPS; just TimeZone.getDefault().
                    "getTimezone" -> {
                        try {
                            result.success(java.util.TimeZone.getDefault().id)
                        } catch (e: Exception) {
                            result.error("tz_failed", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // PROMPT 3.1 (Part 3): create the branded FCM channels BEFORE any push can
    // be displayed. Push is FCM-auto-display only (no flutter_local_notifications,
    // Part 6); Android O+ requires the channel referenced by the manifest default
    // (makanmana_activity) to exist, else notifications fall back / are dropped.
    // Created here (single-activity Flutter app; the user always opens the app —
    // and must log in — before any push is delivered). Idempotent: re-creating a
    // channel with the same id only updates its (non-user-overridden) settings.
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java) ?: return
            val activity = NotificationChannel(
                "makanmana_activity",
                "Aktiviti Sosial",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "Reaksi, komen, ikutan & jemputan kumpulan" }
            val important = NotificationChannel(
                "makanmana_important",
                "Pemberitahuan Penting",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = "Amaran akaun & pembayaran yang penting" }
            nm.createNotificationChannel(activity)
            nm.createNotificationChannel(important)
        }
    }
}
