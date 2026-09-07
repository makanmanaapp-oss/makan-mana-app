// QA-DEV21 — Activity tab classification + time-bucketing (pure, no Firebase).
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/notifications/activity_filter.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';

MakanNotification _n(MakanNotificationType type, {String? actorUid}) =>
    MakanNotification(
      id: type.name,
      type: type,
      title: 't',
      body: 'b',
      createdAt: DateTime(2026, 1, 1),
      isRead: false,
      actorUid: actorUid,
    );

void main() {
  const noFollow = <String>{};

  group('activityMatches — real metadata only', () {
    test('All matches every type (incl. system/reminder/unknown)', () {
      for (final t in MakanNotificationType.values) {
        expect(activityMatches(_n(t), ActivityTab.all, noFollow), isTrue,
            reason: '$t must appear in All');
      }
    });

    test('Follows = socialFollow only', () {
      expect(activityMatches(_n(MakanNotificationType.socialFollow),
          ActivityTab.follows, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialComment),
          ActivityTab.follows, noFollow), isFalse);
      expect(activityMatches(_n(MakanNotificationType.mealReminder),
          ActivityTab.follows, noFollow), isFalse);
    });

    test('Conversations = comment + reply', () {
      expect(activityMatches(_n(MakanNotificationType.socialComment),
          ActivityTab.conversations, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialReply),
          ActivityTab.conversations, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialMention),
          ActivityTab.conversations, noFollow), isFalse);
    });

    test('Mentions = socialMention only', () {
      expect(activityMatches(_n(MakanNotificationType.socialMention),
          ActivityTab.mentions, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialReply),
          ActivityTab.mentions, noFollow), isFalse);
    });

    test('Reposts = repost + quote', () {
      expect(activityMatches(_n(MakanNotificationType.socialRepost),
          ActivityTab.reposts, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialQuote),
          ActivityTab.reposts, noFollow), isTrue);
      expect(activityMatches(_n(MakanNotificationType.socialComment),
          ActivityTab.reposts, noFollow), isFalse);
    });

    test('People you follow = actorUid in following set', () {
      final follows = {'a1', 'a2'};
      expect(
          activityMatches(
              _n(MakanNotificationType.socialComment, actorUid: 'a1'),
              ActivityTab.peopleYouFollow,
              follows),
          isTrue);
      expect(
          activityMatches(
              _n(MakanNotificationType.socialComment, actorUid: 'stranger'),
              ActivityTab.peopleYouFollow,
              follows),
          isFalse);
      // No actor → never in People you follow.
      expect(
          activityMatches(_n(MakanNotificationType.mealReminder),
              ActivityTab.peopleYouFollow, follows),
          isFalse);
    });

    test('system/reminder/broadcast never land in a specialist social tab', () {
      for (final t in const [
        MakanNotificationType.mealReminder,
        MakanNotificationType.systemAnnouncement,
        MakanNotificationType.marketingCampaign,
        MakanNotificationType.unknown,
      ]) {
        for (final tab in const [
          ActivityTab.follows,
          ActivityTab.conversations,
          ActivityTab.mentions,
          ActivityTab.reposts,
          ActivityTab.peopleYouFollow,
        ]) {
          expect(activityMatches(_n(t), tab, {'x'}), isFalse,
              reason: '$t must not appear in $tab');
        }
      }
    });
  });

  group('filterActivity', () {
    test('preserves order and filters correctly', () {
      final list = [
        _n(MakanNotificationType.socialFollow),
        _n(MakanNotificationType.mealReminder),
        _n(MakanNotificationType.socialMention),
      ];
      expect(filterActivity(list, ActivityTab.all, noFollow).length, 3);
      final follows = filterActivity(list, ActivityTab.follows, noFollow);
      expect(follows.length, 1);
      expect(follows.first.type, MakanNotificationType.socialFollow);
    });
  });

  group('activityBucket', () {
    final now = DateTime(2026, 8, 21, 12);
    test('today', () {
      expect(activityBucket(DateTime(2026, 8, 21, 1), now),
          ActivityBucket.today);
    });
    test('last 7 days', () {
      expect(activityBucket(DateTime(2026, 8, 18), now), ActivityBucket.last7);
    });
    test('last 30 days', () {
      expect(activityBucket(DateTime(2026, 8, 1), now), ActivityBucket.last30);
    });
    test('earlier', () {
      expect(activityBucket(DateTime(2026, 6, 1), now), ActivityBucket.earlier);
    });
  });
}
