import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import 'notification_preferences.dart';

/// PROMPT 4 — streams the current user's canonical notification preferences
/// (account-scoped; one record shared by every installation, Part 18).
final notificationPreferencesProvider =
    StreamProvider.autoDispose<NotificationPreferences>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid.isEmpty) return Stream.value(const NotificationPreferences());
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) => NotificationPreferences.fromMap(
          (snap.data()?['notificationPreferences'] as Map?)
              ?.cast<String, dynamic>()));
});

final notificationSettingsServiceProvider =
    Provider((ref) => NotificationSettingsService());

/// Server-authoritative preference writer + OS-permission awareness. All writes
/// go through the validated setNotificationPreferences callable (never a direct
/// client Firestore write, Part 25/26). Throws on save failure so the UI can
/// revert an optimistic toggle (Part 24).
class NotificationSettingsService {
  static const _osChannel = MethodChannel('makanmana/notif_settings');

  FirebaseFunctions get _fns =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Future<void> save(NotificationPreferences prefs) async {
    await _fns
        .httpsCallable('setNotificationPreferences')
        .call<Map<dynamic, dynamic>>(prefs.toPreferenceMap());
  }

  /// OS notification permission is DEVICE-specific (Part 19), separate from the
  /// account push preference (Part 15). Never auto-flips the MakanMana pref.
  Future<bool> osPermissionAllowed() async {
    try {
      final settings =
          await FirebaseMessaging.instance.getNotificationSettings();
      return settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
    } catch (_) {
      return true; // fail-open: never scare the user with a false "disabled"
    }
  }

  /// Opens THIS app's OS notification settings (Part 16). Safe no-op if the
  /// platform channel is unavailable; never loops permission prompts.
  Future<void> openOsSettings() async {
    try {
      await _osChannel.invokeMethod('openNotificationSettings');
    } catch (_) {/* platform unsupported — ignore */}
  }

  /// The OS timezone as a canonical IANA id (e.g. Asia/Kuala_Lumpur) for quiet
  /// hours (Part 16). Returns null unless it is a true IANA id — an
  /// abbreviation ("MYT"/"+08") is never stored, since the server evaluator
  /// (Intl) cannot consume it. No GPS / location involved.
  Future<String?> platformTimezone() async {
    try {
      final tz = await _osChannel.invokeMethod<String>('getTimezone');
      if (tz == null) return null;
      return (tz == 'UTC' || tz.contains('/')) ? tz : null;
    } catch (_) {
      return null;
    }
  }
}
