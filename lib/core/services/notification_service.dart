import 'dart:io' show Platform;
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/app_constants.dart';
import '../notifications/notification_destination.dart';

/// NOTIFICATION V2 / PROMPT 3 — FCM push foundation (multi-device).
///
/// Push is DELIVERY only; the persisted in-app NotificationRecord in Firestore
/// remains the source of truth. This service:
///  - owns a stable per-INSTALLATION id (not hardware identity);
///  - registers the current installation's token via the server-authoritative
///    `registerPushDevice` callable (never a direct client token write);
///  - refreshes the SAME installation on token rotation (no duplicate records);
///  - unregisters only THIS installation on logout (other phones untouched);
///  - centralises foreground/background/terminated handling;
///  - resolves a push tap to the canonical record → existing destination
///    resolver, with an auth/ownership gate (never trusts the payload).
class NotificationService {
  NotificationService({required this.firebaseReady});

  final bool firebaseReady;
  bool _initialized = false;

  static const _installIdKey = 'mm_push_install_id';

  /// App-level navigation hook set by the shell (go_router). Kept optional so
  /// the service is testable and never crashes when navigation isn't ready.
  static void Function(String route)? onNavigateToRoute;

  FirebaseFunctions get _fns =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Stable installation id: random, persisted, survives restart, unique per
  /// install, NOT derived from hardware serial or UID (Part 3).
  Future<String> _installationId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_installIdKey);
    if (id == null || id.length < 8) {
      final r = Random.secure();
      id = 'inst_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}_'
          '${List.generate(12, (_) => r.nextInt(36).toRadixString(36)).join()}';
      await prefs.setString(_installIdKey, id);
    }
    return id;
  }

  Future<void> init(String uid) async {
    if (!firebaseReady || uid.isEmpty || _initialized) return;
    _initialized = true;
    try {
      final messaging = FirebaseMessaging.instance;
      // Android 13+ permission. Denial must NOT break in-app notifications.
      await messaging.requestPermission();

      final installId = await _installationId();

      Future<void> registerToken(String? token) async {
        if (token == null || token.isEmpty) return;
        try {
          await _fns.httpsCallable('registerPushDevice').call<Map<dynamic, dynamic>>({
            'deviceId': installId,
            'token': token,
            'platform': Platform.isAndroid ? 'android' : 'ios',
            'locale': Platform.localeName,
            'timezone': DateTime.now().timeZoneName,
          });
        } on FirebaseFunctionsException catch (e) {
          debugPrint('MakanMana: registerPushDevice: ${e.code}');
        }
      }

      await registerToken(await messaging.getToken());
      // Same installation → token refresh updates the SAME record (no dup).
      messaging.onTokenRefresh.listen(registerToken);

      // Centralised message handling (foreground/background/terminated).
      FirebaseMessaging.onMessageOpenedApp.listen(
          (m) => _handleTap(m.data, uid)); // background tap
      final initial = await messaging.getInitialMessage(); // terminated tap
      if (initial != null) await _handleTap(initial.data, uid);

      // Meal reminders topic (existing behaviour, unchanged).
      await messaging.subscribeToTopic('meal_reminders');
    } catch (e) {
      debugPrint('MakanMana: init notifikasi gagal: $e');
    }
  }

  /// Logout: disable ONLY this installation server-side + delete local token.
  /// Never removes tokens belonging to the user's other phones (Part 5/7).
  Future<void> detach(String uid) async {
    _initialized = false;
    if (!firebaseReady) return;
    try {
      final installId = await _installationId();
      await _fns.httpsCallable('unregisterPushDevice')
          .call<Map<dynamic, dynamic>>({'deviceId': installId})
          .timeout(const Duration(seconds: 6));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('MakanMana: unregisterPushDevice: ${e.code}');
    } catch (e) {
      debugPrint('MakanMana: detach notifikasi gagal: $e');
    }
    try {
      // Legacy compat: clear the old single-token field too, and drop the token.
      if (uid.isNotEmpty) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .set({'fcmToken': FieldValue.delete()}, SetOptions(merge: true));
      }
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }

  /// Resolve a push tap to a SAFE route via the canonical record (Part 27/28).
  /// Never navigates from raw payload strings; validates ownership first.
  Future<void> _handleTap(Map<String, dynamic> data, String currentUid) async {
    final route = await resolvePushRoute(data, currentUid);
    if (route != null) onNavigateToRoute?.call(route);
  }

  /// Extract the canonical notification id from a push payload (Part 15/28).
  static String? pushNotificationId(Map<String, dynamic> data) {
    final id = data['notificationId']?.toString().trim();
    return (id != null && id.isNotEmpty) ? id : null;
  }

  /// Fetch the recipient-owned canonical record and map it to a safe route.
  /// Auth/ownership gate: returns null if logged out, not the recipient, or
  /// the record is gone (preserves privacy + content-unavailable handling).
  Future<String?> resolvePushRoute(
      Map<String, dynamic> data, String currentUid) async {
    if (currentUid.isEmpty) return null; // logged out → no private destination
    final id = pushNotificationId(data);
    if (id == null) return null;
    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(currentUid)
          .collection('notifications')
          .doc(id)
          .get();
      if (!snap.exists) return null; // deleted/expired → safe unavailable
      final rec = snap.data() ?? {};
      if (rec['recipientUid'] != currentUid) return null; // never trust payload
      return NotificationDestinationResolver.resolve(
        type: (rec['type'] ?? '').toString(),
        destinationId: (rec['entityId'] ?? rec['destinationId'])?.toString(),
        deepLink: rec['deepLink']?.toString(),
      );
    } catch (e) {
      debugPrint('MakanMana: resolvePushRoute gagal: $e');
      return null;
    }
  }
}

/// Front Page Redesign 1 — SAFE mapping of push data payload → app route.
/// Retained for compatibility; canonical-record resolution above is preferred.
String? routeForMessageData(Map<String, dynamic> data) {
  return NotificationDestinationResolver.resolve(
    type: (data['destinationType'] ?? data['type'])?.toString(),
    destinationId: data['destinationId']?.toString(),
    deepLink: data['deepLink']?.toString(),
  );
}
