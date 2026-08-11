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

    test('timestamp int (epoch ms) diurai', () {
      final ms = DateTime(2026, 8, 7, 9, 30).millisecondsSinceEpoch;
      final n = MakanNotification.fromMap('i', {'createdAt': ms});
      expect(n.createdAt.millisecondsSinceEpoch, ms);
    });

    test('imageUrl kosong → null (tiada thumbnail rosak)', () {
      expect(MakanNotification.fromMap('i', {'imageUrl': '   '}).imageUrl,
          isNull);
      expect(MakanNotification.fromMap('i', {'imageUrl': 'https://x/a.png'})
          .imageUrl, 'https://x/a.png');
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
      expect(notificationRoute(_n(MakanNotificationType.foodSuggestion,
              destId: 'p1')),
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
      expect(
          routeForMessageData({'type': 'system', 'destinationId': '/home'}),
          '/home');
      expect(routeForMessageData({'type': 'system', 'destinationId': 'x'}),
          isNull);
    });
    test('payload kosong / jenis tak dikenali → null (gagal-selamat)', () {
      expect(routeForMessageData({}), isNull);
      expect(routeForMessageData({'type': 'weird'}), isNull);
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
