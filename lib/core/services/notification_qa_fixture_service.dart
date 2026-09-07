/// Debug-device helper for the permanently hardened owner-only QA callable.
/// This is never shown in release builds; server-side authorization remains the
/// security boundary and the callable accepts only predefined fixture names.
library;

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';

class NotificationQaFixtureService {
  const NotificationQaFixtureService();

  static const fixtures = [
    'social_comment',
    'social_reaction',
    'system_announcement',
    'self_suppressed_social_reaction',
    'unavailable_target',
  ];

  /// Debug setup only: copies the authenticated Firebase UID locally. It never
  /// sends the UID to a callable or renders the full value in the app.
  Future<String?> copyCurrentUidForTrustedSetup() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return null;
    await Clipboard.setData(ClipboardData(text: uid));
    return '…${uid.substring(uid.length - 4)}';
  }

  Future<String> create(String fixture) async {
    if (!fixtures.contains(fixture)) {
      throw ArgumentError.value(fixture, 'fixture');
    }
    final result =
        await FirebaseFunctions.instanceFor(region: 'asia-southeast1')
            .httpsCallable('createNotificationQaFixture')
            .call<Map<String, dynamic>>({'fixture': fixture});
    return (result.data['status'] as String?) ?? 'unknown';
  }
}
