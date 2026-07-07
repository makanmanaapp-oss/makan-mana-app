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
}
