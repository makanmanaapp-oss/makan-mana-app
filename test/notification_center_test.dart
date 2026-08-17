// Front Page Redesign 1 — ujian Notification Center (tanpa Firebase).
//
// Melindungi: parsing model (isRead/jenis/luput/timestamp), pemetaan destinasi
// selamat (termasuk gagal-selamat → null), formula badge (0/1-99/99+), dan
// resolusi localization 4 bahasa. Semua unit; tiada mock/data palsu.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/constants/app_constants.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';
import 'package:makan_mana/features/notifications/notification_preferences.dart';
import 'package:makan_mana/features/notifications/notification_providers.dart';
import 'package:makan_mana/features/notifications/notification_screen.dart';
import 'package:makan_mana/core/services/notification_service.dart';

const _languages = ['ms', 'en', 'zh', 'ta'];
AppLocalizations _l(String code) => AppLocalizations(Locale(code));

MakanNotification _n(
  MakanNotificationType type, {
  String? destId,
  bool isRead = false,
}) =>
    MakanNotification(
      id: 'x',
      type: type,
      title: 't',
      body: 'b',
      createdAt: DateTime(2026, 8, 7, 10),
      isRead: isRead,
      destinationId: destId,
    );

void main() {
  group('MakanNotification.fromMap', () {
    test('medan hilang → default selamat (tidak crash)', () {
      final n = MakanNotification.fromMap('id1', {});
      expect(n.id, 'id1');
      expect(n.type, MakanNotificationType.unknown);
      expect(n.title, '');
      expect(n.body, '');
      expect(n.isRead, isFalse);
      expect(n.priority, 0);
      expect(n.metadata, isEmpty);
      expect(n.imageUrl, isNull);
      expect(n.expiresAt, isNull);
    });

    test('isRead benar bila readAt hadir walau isRead tiada', () {
      final n = MakanNotification.fromMap('id1', {
        'readAt': DateTime(2026, 8, 7).millisecondsSinceEpoch,
      });
      expect(n.isRead, isTrue);
    });

    test('isRead benar bila isRead==true', () {
      expect(MakanNotification.fromMap('id', {'isRead': true}).isRead, isTrue);
    });

    test('jenis snake_case dipetakan ke enum', () {
      expect(MakanNotification.fromMap('i', {'type': 'food_suggestion'}).type,
          MakanNotificationType.foodSuggestion);
      expect(MakanNotification.fromMap('i', {'type': 'fit_coach'}).type,
          MakanNotificationType.fitCoach);
      expect(MakanNotification.fromMap('i', {'type': 'tak_wujud'}).type,
          MakanNotificationType.unknown);
    });

    test('rekod V2 canonical menyimpan kontrak deep-link dan status', () {
      final n = MakanNotification.fromMap('i', {
        'type': 'social_comment',
        'category': 'social',
        'recipientUid': 'u1',
        'entityType': 'post',
        'entityId': 'p1',
        'deepLink': '/social/post/p1',
        'openedAt': DateTime(2026, 8, 7).millisecondsSinceEpoch,
        'isCritical': true,
        'schemaVersion': 2,
      });
      expect(n.type, MakanNotificationType.socialComment);
      expect(n.rawType, 'social_comment');
      expect(n.category, MakanNotificationCategory.social);
      expect(n.entityId, 'p1');
      expect(n.isCritical, isTrue);
      expect(n.schemaVersion, 2);
    });

    test('timestamp int (epoch ms) diurai', () {
      final ms = DateTime(2026, 8, 7, 9, 30).millisecondsSinceEpoch;
      final n = MakanNotification.fromMap('i', {'createdAt': ms});
      expect(n.createdAt.millisecondsSinceEpoch, ms);
    });

    test('imageUrl kosong → null (tiada thumbnail rosak)', () {
      expect(
          MakanNotification.fromMap('i', {'imageUrl': '   '}).imageUrl, isNull);
      expect(
          MakanNotification.fromMap('i', {'imageUrl': 'https://x/a.png'})
              .imageUrl,
          'https://x/a.png');
    });

    test('isExpired mengikut expiresAt', () {
      final past = MakanNotification.fromMap('i', {
        'expiresAt': DateTime(2000).millisecondsSinceEpoch,
      });
      expect(past.isExpired, isTrue);
      final future = MakanNotification.fromMap('i', {
        'expiresAt': DateTime(2999).millisecondsSinceEpoch,
      });
      expect(future.isExpired, isFalse);
    });
  });

  group('notificationRoute — pemetaan destinasi selamat', () {
    test('food_suggestion dgn id → laluan restoran; tanpa id → null', () {
      expect(
          notificationRoute(
              _n(MakanNotificationType.foodSuggestion, destId: 'p1')),
          '/restaurant/p1');
      expect(
          notificationRoute(_n(MakanNotificationType.foodSuggestion)), isNull);
    });

    test('fitCoach → fit today; subscription → paywall', () {
      expect(notificationRoute(_n(MakanNotificationType.fitCoach)),
          RoutePaths.fitToday);
      expect(notificationRoute(_n(MakanNotificationType.subscription)),
          RoutePaths.paywall);
    });

    test('social dgn/ tanpa id', () {
      expect(notificationRoute(_n(MakanNotificationType.social, destId: 'u9')),
          '/u/u9');
      expect(notificationRoute(_n(MakanNotificationType.social)),
          RoutePaths.social);
    });

    test('system: hanya laluan dalaman eksplisit (mula "/"); jika tidak null',
        () {
      expect(
          notificationRoute(_n(MakanNotificationType.system, destId: '/home')),
          '/home');
      expect(
          notificationRoute(_n(MakanNotificationType.system, destId: 'evil')),
          isNull);
    });

    test('unknown → null (gagal-selamat, tiada navigasi buta)', () {
      expect(notificationRoute(_n(MakanNotificationType.unknown)), isNull);
    });

    test('canonical social comment and hostile deep-link are resolved safely',
        () {
      expect(
          notificationRoute(
              _n(MakanNotificationType.socialComment, destId: 'post1')),
          '/social/post/post1');
      final hostile = MakanNotification(
        id: 'x',
        type: MakanNotificationType.systemAnnouncement,
        title: '',
        body: '',
        createdAt: DateTime(2026),
        isRead: false,
        deepLink: 'https://not-makanmana.example',
      );
      expect(notificationRoute(hostile), isNull);
    });

    test('Prompt 2 social and group destinations stay internal or centre-only',
        () {
      expect(
        notificationRoute(
            _n(MakanNotificationType.socialReaction, destId: 'post1')),
        '/social/post/post1',
      );
      expect(
        notificationRoute(
            _n(MakanNotificationType.socialFollow, destId: 'actor1')),
        '/u/actor1',
      );
      // PROMPT 2.2A — group_invite now routes to the existing Groups-tab invite
      // inbox (invitee-only list), NOT the private group. Fixes "content
      // unavailable". Does NOT go to /groups/{id} (which would deny non-members).
      final inviteRoute = notificationRoute(
          _n(MakanNotificationType.groupInvite, destId: 'invite1'));
      expect(inviteRoute, '/social?tab=groups');
      expect(inviteRoute!.startsWith('/groups/'), isFalse,
          reason: 'invitee must not be routed into the private group');
      expect(
        notificationRoute(
            _n(MakanNotificationType.groupInviteAccepted, destId: 'group1')),
        '/groups/group1',
      );
      expect(
        notificationRoute(
            _n(MakanNotificationType.groupUpdate, destId: 'group1')),
        '/groups/group1',
      );
    });
  });

  group('notificationBadgeLabel — 0 / 1-99 / 99+', () {
    test('0 atau negatif → null (tiada badge)', () {
      expect(notificationBadgeLabel(0), isNull);
      expect(notificationBadgeLabel(-3), isNull);
    });
    test('1..99 → nombor tepat', () {
      expect(notificationBadgeLabel(1), '1');
      expect(notificationBadgeLabel(99), '99');
    });
    test('100+ → "99+"', () {
      expect(notificationBadgeLabel(100), '99+');
      expect(notificationBadgeLabel(9999), '99+');
    });
  });

  group('routeForMessageData — asas tap-routing FCM (selamat)', () {
    test('restaurant/food_suggestion/reminder dgn id → laluan restoran', () {
      expect(
          routeForMessageData(
              {'destinationType': 'restaurant', 'destinationId': 'p1'}),
          '/restaurant/p1');
      expect(routeForMessageData({'type': 'food_suggestion'}), isNull);
    });
    test('fit_coach → fit today; subscription → paywall', () {
      expect(routeForMessageData({'type': 'fit_coach'}), '/fit/today');
      expect(routeForMessageData({'type': 'subscription'}), '/paywall');
    });
    test('system hanya laluan mula "/"; jika tidak null', () {
      expect(routeForMessageData({'type': 'system', 'destinationId': '/home'}),
          '/home');
      expect(routeForMessageData({'type': 'system', 'destinationId': 'x'}),
          isNull);
    });
    test('payload kosong / jenis tak dikenali → null (gagal-selamat)', () {
      expect(routeForMessageData({}), isNull);
      expect(routeForMessageData({'type': 'weird'}), isNull);
    });

    test('canonical push type uses the same resolver', () {
      expect(
          routeForMessageData(
              {'type': 'social_comment', 'destinationId': 'p1'}),
          '/social/post/p1');
    });
  });

  group('notification preferences and paging contracts', () {
    test('defaults preserve in-app/push and quiet-hours data parses safely',
        () {
      final preferences = NotificationPreferences.fromMap({
        'social': {'inAppEnabled': false, 'pushEnabled': true},
        'quietHoursEnabled': true,
        'quietHoursStart': '22:00',
        'quietHoursEnd': '07:00',
        'timezone': 'Asia/Kuala_Lumpur',
      });
      expect(
          preferences
              .forCategory(MakanNotificationCategory.social)
              .inAppEnabled,
          isFalse);
      expect(
          preferences
              .forCategory(MakanNotificationCategory.billing)
              .pushEnabled,
          isTrue);
      expect(preferences.quietHoursEnabled, isTrue);
      expect(preferences.timezone, 'Asia/Kuala_Lumpur');
    });

    test('next page cursor is the oldest visible notification', () {
      final older = MakanNotification(
        id: 'older',
        type: MakanNotificationType.system,
        title: '',
        body: '',
        createdAt: DateTime(2026, 8, 1),
        isRead: false,
      );
      final newer = MakanNotification(
        id: 'newer',
        type: MakanNotificationType.system,
        title: '',
        body: '',
        createdAt: DateTime(2026, 8, 2),
        isRead: false,
      );
      final cursor = notificationNextPageCursor([newer, older]);
      expect(cursor?.id, 'older');
      expect(cursor?.createdAt, DateTime(2026, 8, 1));
    });
  });

  group('Localization — kunci Notification Center dalam 4 bahasa', () {
    const keys = [
      'notificationsTitle',
      'markAllRead',
      'notifToday',
      'notifEarlier',
      'noNotifications',
      'allCaughtUp',
      'notifLoadError',
      'newNotification',
      'notificationLoadMore',
      'notificationSocialCommentTitle',
      'notificationSocialCommentBody',
      'notificationSocialReactionTitle',
      'notificationSocialReactionBody',
      'notificationSocialReplyTitle',
      'notificationSocialReplyBody',
      'notificationSocialFollowTitle',
      'notificationSocialFollowBody',
      'notificationSocialRepostTitle',
      'notificationSocialRepostBody',
      'notificationSocialQuoteTitle',
      'notificationSocialQuoteBody',
      'notificationGroupInviteTitle',
      'notificationGroupInviteBody',
      'notificationGroupInviteAcceptedTitle',
      'notificationGroupInviteAcceptedBody',
      'notificationGroupUpdateTitle',
      'notificationGroupUpdateBody',
      'notificationSystemAnnouncementTitle',
      'notificationTargetUnavailable',
      'seeAll',
    ];
    test('setiap kunci diselesaikan (bukan kunci mentah) + tidak kosong', () {
      for (final lang in _languages) {
        final l = _l(lang);
        for (final k in keys) {
          final v = l.t(k);
          expect(v, isNot(k), reason: '$k tidak diselesaikan untuk $lang');
          expect(v.trim(), isNotEmpty, reason: '$k kosong untuk $lang');
        }
      }
    });
  });
}
