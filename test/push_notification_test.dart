// PROMPT 3 — Flutter push payload/deep-link tests (pure parts).
//
// Canonical-record resolution (resolvePushRoute) requires Firestore and is
// covered by the ownership-gate design; here we verify the pure payload parsing
// and that push taps reuse the SAME safe destination resolver as in-app.
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/services/notification_service.dart';

void main() {
  group('push payload parsing', () {
    test('pushNotificationId extracts the canonical id', () {
      expect(NotificationService.pushNotificationId({'notificationId': 'n1'}), 'n1');
      expect(NotificationService.pushNotificationId({'notificationId': '  '}), isNull);
      expect(NotificationService.pushNotificationId({}), isNull);
    });
  });

  group('routeForMessageData reuses the safe resolver', () {
    test('group_invite push data → Groups-tab invite inbox (2.2A contract)', () {
      final route = routeForMessageData({'type': 'group_invite', 'destinationId': 'inv1'});
      expect(route, '/social?tab=groups');
      expect(route!.startsWith('/groups/'), isFalse); // invitee never into group
    });

    test('social reaction/comment/follow map to internal routes', () {
      expect(routeForMessageData({'type': 'social_reaction', 'destinationId': 'p1'}),
          '/social/post/p1');
      expect(routeForMessageData({'type': 'social_follow', 'destinationId': 'u1'}), '/u/u1');
    });

    test('hostile external deep link is rejected (safe)', () {
      expect(routeForMessageData({'deepLink': 'https://evil.example'}), isNull);
      expect(routeForMessageData({'type': 'unknown_type'}), isNull);
    });
  });
}
