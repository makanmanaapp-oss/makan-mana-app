import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Notifikasi push (FCM):
/// - komen baru pada post anda
/// - rating delivery diluluskan
/// - peringatan waktu makan (topik meal_reminders)
class NotificationService {
  NotificationService({required this.firebaseReady});

  final bool firebaseReady;
  bool _initialized = false;

  Future<void> init(String uid) async {
    if (!firebaseReady || uid.isEmpty || _initialized) return;
    _initialized = true;
    try {
      final messaging = FirebaseMessaging.instance;
      // Android 13+ minta kebenaran notifikasi.
      await messaging.requestPermission();

      Future<void> saveToken(String? token) async {
        if (token == null) return;
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .set({'fcmToken': token}, SetOptions(merge: true));
      }

      await saveToken(await messaging.getToken());
      messaging.onTokenRefresh.listen(saveToken);

      // Peringatan waktu makan untuk semua pengguna.
      await messaging.subscribeToTopic('meal_reminders');
    } catch (e) {
      debugPrint('MakanMana: init notifikasi gagal: $e');
    }
  }

  /// Front Page Redesign 1 — putuskan token push daripada akaun yang LOG
  /// KELUAR. Token FCM MESTI hanya dikaitkan dengan pengguna yang disahkan;
  /// bila log keluar kita buang medan token dari dokumen pengguna itu dan
  /// padam token peranti supaya push akaun terdahulu tidak sampai kepada
  /// pengguna seterusnya pada peranti yang sama. Best-effort (gagal senyap).
  Future<void> detach(String uid) async {
    _initialized = false;
    if (!firebaseReady) return;
    try {
      if (uid.isNotEmpty) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .set({'fcmToken': FieldValue.delete()}, SetOptions(merge: true));
      }
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('MakanMana: detach notifikasi gagal: $e');
    }
  }
}

/// Front Page Redesign 1 — pemetaan SELAMAT muatan data push → laluan aplikasi
/// (asas tap-routing). Mengikut medan `destinationType`/`destinationId` yang
/// dihantar backend. null = tiada navigasi selamat (kekal di skrin semasa;
/// tidak crash). Diasingkan supaya boleh diuji unit tanpa FCM.
String? routeForMessageData(Map<String, dynamic> data) {
  final type = (data['destinationType'] ?? data['type'])?.toString().trim();
  final id = data['destinationId']?.toString().trim() ?? '';
  switch (type) {
    case 'restaurant':
    case 'food_suggestion':
    case 'reminder':
      return id.isNotEmpty ? '/restaurant/$id' : null;
    case 'social':
      return id.isNotEmpty ? '/u/$id' : '/social';
    case 'group':
      return id.isNotEmpty ? '/groups/$id' : '/group';
    case 'fit_coach':
      return '/fit/today';
    case 'subscription':
      return '/paywall';
    case 'coupon':
      return '/coupon';
    case 'support':
      return '/support';
    case 'system':
      // Sistem: hanya laluan dalaman eksplisit (mesti mula '/').
      return id.startsWith('/') ? id : null;
    default:
      return null;
  }
}
