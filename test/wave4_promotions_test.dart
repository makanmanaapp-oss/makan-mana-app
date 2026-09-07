/// WAVE 4 — Commercial Tools client contract.
///
/// Three claims are guarded:
///
///  1. the client does NOT decide visibility — it renders what the server
///     already filtered, so a device with a wrong clock cannot reveal an offer;
///  2. Restaurant Detail keeps its Profil | Ulasan | Menu architecture, and a
///     restaurant with no offer looks exactly as it did before Wave 4;
///  3. no internal identifier reaches the screen.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/promotions/promotion.dart';
import 'package:makan_mana/features/promotions/promotion_section.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

const _publicPayload = {
  'promotionId': 'promo-1',
  'canonicalPlaceId': 'canon-1',
  'title': 'Set lunch RM12',
  'description': 'Nasi + air',
  'terms': 'Sehingga stok habis',
  'offerType': 'amount_off',
  'offerLabel': 'RM5 off',
  'minSpendSen': 1200,
  'eligibility': {'audience': 'all', 'plans': <String>[]},
  'startsAtMs': 1757000000000,
  'endsAtMs': 1759000000000,
};

Widget _host(Widget child, {String language = 'ms'}) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(language),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('A. model', () {
    test('1. a public payload parses into a renderable offer', () {
      final promo = Promotion.fromMap(_publicPayload);
      expect(promo, isNotNull);
      expect(promo!.title, 'Set lunch RM12');
      expect(promo.offerType, OfferType.amountOff);
      expect(promo.minSpendSen, 1200);
      expect(promo.eligibility.isPlanGated, isFalse);
      // The public projection carries no status — everything returned is live.
      expect(promo.status, isNull);
    });

    test('2. an incomplete payload yields no offer at all', () {
      for (final missing in ['promotionId', 'canonicalPlaceId', 'title', 'endsAtMs']) {
        final broken = Map<String, dynamic>.from(_publicPayload)..remove(missing);
        expect(Promotion.fromMap(broken), isNull,
            reason: 'missing $missing must not produce a renderable offer');
      }
      expect(Promotion.fromMap(null), isNull);
      expect(Promotion.fromMap('nope'), isNull);
    });

    test('3. an unknown status falls to the LEAST visible state', () {
      final promo = Promotion.fromMap({..._publicPayload, 'status': 'super_active'});
      expect(promo!.status, PromotionStatus.draft,
          reason: 'an unrecognised status must never look live');
    });

    test('4. the client mirrors the server transition table', () {
      expect(allowedNextStatuses(PromotionStatus.expired),
          [PromotionStatus.archived],
          reason: 'an expired offer is never resurrected in place');
      expect(allowedNextStatuses(PromotionStatus.archived), isEmpty);
      expect(allowedNextStatuses(PromotionStatus.active),
          contains(PromotionStatus.paused));
      expect(allowedNextStatuses(PromotionStatus.paused),
          contains(PromotionStatus.active));
    });

    test('5. minimum spend formats honestly or not at all', () {
      expect(formatMinSpend(1200), 'RM12.00');
      expect(formatMinSpend(0), isNull, reason: 'RM0 would be misleading');
      expect(formatMinSpend(null), isNull);
    });
  });

  group('B. public surface', () {
    testWidgets('6. no offers renders NOTHING — not an empty card',
        (tester) async {
      await tester.pumpWidget(_host(const PromotionSection(promotions: [])));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('restaurant-promotions')), findsNothing);
    });

    testWidgets('7. an active offer renders its real content', (tester) async {
      final promo = Promotion.fromMap(_publicPayload)!;
      await tester.pumpWidget(_host(PromotionSection(promotions: [promo])));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('restaurant-promotions')), findsOneWidget);
      expect(find.text('Set lunch RM12'), findsOneWidget);
      expect(find.text('RM5 off'), findsOneWidget);
      expect(find.textContaining('RM12.00'), findsOneWidget);
      expect(find.textContaining('Sehingga stok habis'), findsOneWidget);
    });

    testWidgets('8. no internal identifier is ever rendered', (tester) async {
      final promo = Promotion.fromMap(_publicPayload)!;
      await tester.pumpWidget(_host(PromotionSection(promotions: [promo])));
      await tester.pumpAndSettle();
      final texts = tester
          .widgetList<Text>(find.byType(Text))
          .map((w) => w.data ?? '')
          .join(' | ');
      for (final internal in ['promo-1', 'canon-1', 'Uid', 'requestId']) {
        expect(texts.contains(internal), isFalse,
            reason: 'internal identifier leaked to the screen: $internal');
      }
    });

    testWidgets('9. renders without overflow at 320dp and large text',
        (tester) async {
      final promo = Promotion.fromMap(_publicPayload)!;
      tester.view.physicalSize = const Size(320, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_host(
        MediaQuery(
          data: const MediaQueryData(
              size: Size(320, 720), textScaler: TextScaler.linear(1.3)),
          child: PromotionSection(promotions: [promo]),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('C. architecture is preserved', () {
    test('10. Restaurant Detail still has exactly three tabs', () {
      final src = _read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      expect(src, contains('length: 3'));
      expect(src, contains("Key('tab-profile')"));
      expect(src, contains("Key('tab-reviews')"));
      expect(src, contains("Key('tab-menu')"));
      // Wave 3 engagement is untouched.
      expect(src, contains('onOpenMenuItemComments'));
    });

    test('11. the promotion section is additive and defaults to empty', () {
      final src = _read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      expect(src, contains('this.promotions = const []'),
          reason: 'every existing caller must keep compiling and rendering the '
              'same page');
      expect(src, contains('PromotionSection(promotions: widget.promotions)'));
    });

    test('12. the client never re-derives visibility from the device clock', () {
      for (final path in const [
        'lib/features/promotions/promotion_section.dart',
        'lib/features/promotions/promotion.dart',
      ]) {
        final src = _read(path);
        expect(src.contains('DateTime.now()'), isFalse,
            reason: '$path must not decide visibility locally');
      }
    });

    test('13. the write plane is callables only — no direct collection access',
        () {
      final service = _read('lib/core/services/promotion_service.dart');
      expect(service.contains('FirebaseFirestore'), isFalse,
          reason: 'restaurant_promotions is server-write-only under rules');
      for (final name in const [
        'listMerchantPromotions',
        'createPromotion',
        'updatePromotion',
        'setPromotionStatus',
      ]) {
        expect(service, contains("'$name',"),
            reason: 'every operation must name a real callable');
      }
      expect(service, contains('httpsCallable(name)'),
          reason: 'one shared call path keeps auth/error handling uniform');
    });

    test('14. rules keep the promotions collection fully server-side', () {
      final rules = _read('firestore.rules');
      expect(rules, contains('match /restaurant_promotions/{promotionId}'));
      expect(rules, contains('allow read, write: if false;'));
    });

    test('15. merchant promotions live inside the existing Merchant Center', () {
      final center = _read('lib/features/merchant/merchant_center_screen.dart');
      expect(center, contains('MerchantPromotionsCard'));
      final card = _read('lib/features/merchant/merchant_promotions_card.dart');
      // Restaurant chosen from the authorized projection, never typed.
      expect(card, contains('widget.state.engagementRestaurants'));
      expect(card, contains("Text('\${r.label} · \${r.role}')"),
          reason: 'the picker must show names, not canonical ids');
    });
  });
}
