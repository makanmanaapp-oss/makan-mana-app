import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';
import 'package:makan_mana/features/notifications/notification_screen.dart';
import 'package:makan_mana/features/social/food_profile.dart';

MakanNotification _notification({String? snapshot}) => MakanNotification(
      id: 'n',
      type: MakanNotificationType.socialFollow,
      title: '',
      body: '',
      createdAt: DateTime(2026, 8, 21),
      isRead: false,
      actorUid: 'actor',
      actorDisplaySnapshot: snapshot,
    );

void main() {
  group('resolveNotificationActorName', () {
    test('uses the current public display name first', () {
      expect(
        resolveNotificationActorName(
          _notification(snapshot: 'Older Q'),
          const FoodProfile(
              uid: 'actor', displayName: 'Q', username: 'Qa', exists: true),
        ),
        'Q',
      );
    });

    test('uses a public username when the profile has no display name', () {
      final profile = FoodProfile.fromMap('actor', {
        'username': 'Qa',
      });
      expect(resolveNotificationActorName(_notification(), profile), 'Qa');
    });

    test('uses the stored event snapshot after a missing public profile', () {
      expect(
        resolveNotificationActorName(_notification(snapshot: 'Q'), null),
        'Q',
      );
    });

    test('returns null only when no actor identity can be resolved', () {
      expect(resolveNotificationActorName(_notification(), null), isNull);
    });
  });
}
