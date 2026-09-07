/// WAVE 5 — CMS & Discovery client contract.
///
/// The load-bearing claim is that CMS is ADDITIVE: with no eligible content
/// every screen is exactly the layout it had before Wave 5. The rest is safety
/// at the point of action — a cached CTA must never be able to launch something
/// the current rules forbid.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/services/cms_service.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_providers.dart';
import 'package:makan_mana/features/cms/cms_slot.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

const _payload = {
  'contentId': 'cms-1',
  'placement': 'home_top',
  'title': 'Promosi Raya',
  'subtitle': 'Diskaun sehingga 30%',
  'body': 'Untuk semua pengguna',
  'ctaLabel': 'Lihat',
  'ctaDestination': '/explore',
  'media': {
    'storagePath': 'cms/banners/raya.webp',
    'contentType': 'image/webp',
    'width': 1200,
    'height': 600,
    'altText': 'Promosi Raya',
  },
  'priority': 10,
  'canonicalPlaceId': null,
};

Widget _host(Widget child, {List<Override> overrides = const []}) =>
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  group('A. model + CTA safety', () {
    test('1. a public payload parses into renderable content', () {
      final c = CmsContent.fromMap(_payload);
      expect(c, isNotNull);
      expect(c!.placement, CmsPlacement.homeTop);
      expect(c.media!.aspectRatio, 2.0);
      expect(c.hasCta, isTrue);
    });

    test('2. an unknown placement is skipped, never rendered somewhere else', () {
      final c = CmsContent.fromMap({..._payload, 'placement': 'checkout_banner'});
      expect(c, isNull);
    });

    test('3. incomplete content yields nothing', () {
      for (final missing in ['contentId', 'title', 'placement']) {
        final broken = Map<String, dynamic>.from(_payload)..remove(missing);
        expect(CmsContent.fromMap(broken), isNull, reason: 'missing $missing');
      }
    });

    test('4. executable and handoff CTA schemes are refused on the client too',
        () {
      for (final bad in [
        'javascript:alert(1)', 'JavaScript:alert(1)', ' java script:alert(1)',
        'data:text/html,<script>', 'file:///etc/passwd', 'intent://x',
        'vbscript:msgbox', 'blob:https://x', 'market://details', 'tel:+60123',
        'http://insecure.example',
      ]) {
        expect(isSafeCtaDestination(bad), isFalse, reason: '$bad must be refused');
      }
    });

    test('5. only allowlisted internal routes and https pass', () {
      expect(isSafeCtaDestination('/explore'), isTrue);
      expect(isSafeCtaDestination('/restaurant/canon-1'), isTrue);
      expect(isSafeCtaDestination('https://makanmana.app/x'), isTrue);
      expect(isSafeCtaDestination('/admin'), isFalse);
      expect(isSafeCtaDestination(''), isFalse);
      expect(isSafeCtaDestination(null), isFalse);
    });

    test('6. an unsafe CTA disables the action rather than hiding the banner',
        () {
      final c = CmsContent.fromMap({..._payload, 'ctaDestination': 'javascript:x'});
      expect(c, isNotNull, reason: 'the content itself is still shown');
      expect(c!.hasCta, isFalse, reason: 'but it is not actionable');
    });

    test('7. a collection with no restaurants is not a collection', () {
      expect(CmsCollection.fromMap({
        'collectionId': 'c1', 'title': 'Best of KL', 'canonicalPlaceIds': <String>[],
      }), isNull);
      expect(CmsCollection.fromMap({
        'collectionId': 'c1', 'title': 'Best of KL', 'canonicalPlaceIds': ['a', 'b'],
      }), isNotNull);
    });
  });

  group('B. rendering', () {
    testWidgets('8. no content renders NOTHING', (tester) async {
      await tester.pumpWidget(_host(const CmsBannerList(items: [])));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cms-banner-list')), findsNothing);
    });

    testWidgets('9. active content renders its real copy', (tester) async {
      final c = CmsContent.fromMap(_payload)!;
      await tester.pumpWidget(_host(CmsBannerList(items: [c])));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cms-banner-cms-1')), findsOneWidget);
      expect(find.text('Promosi Raya'), findsOneWidget);
      expect(find.text('Diskaun sehingga 30%'), findsOneWidget);
      expect(find.text('Lihat'), findsOneWidget);
    });

    testWidgets('10. sponsored content is visibly labelled on discovery',
        (tester) async {
      final c = CmsContent.fromMap(_payload)!;
      await tester.pumpWidget(_host(CmsBannerList(items: [c], sponsored: true)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cms-sponsored-label')), findsOneWidget);
    });

    testWidgets('11. no internal identifier is rendered', (tester) async {
      final c = CmsContent.fromMap(_payload)!;
      await tester.pumpWidget(_host(CmsBannerList(items: [c])));
      await tester.pumpAndSettle();
      final texts = tester
          .widgetList<Text>(find.byType(Text))
          .map((w) => w.data ?? '')
          .join(' | ');
      for (final internal in ['cms-1', 'cms/banners', 'AdminId', 'requestId']) {
        expect(texts.contains(internal), isFalse, reason: 'leaked $internal');
      }
    });

    testWidgets('12. renders responsively at 320dp with large text',
        (tester) async {
      final c = CmsContent.fromMap(_payload)!;
      tester.view.physicalSize = const Size(320, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_host(MediaQuery(
        data: const MediaQueryData(
            size: Size(320, 720), textScaler: TextScaler.linear(1.3)),
        child: CmsBannerList(items: [c]),
      )));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('13. a slot with no eligible content renders nothing',
        (tester) async {
      await tester.pumpWidget(_host(
        const CmsSlot(placement: CmsPlacement.homeTop),
        overrides: [
          cmsContentProvider.overrideWith((ref, arg) async =>
              const CmsFetchResult.empty()),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cms-banner-list')), findsNothing);
    });

    testWidgets('14. a restaurant slot without an identity renders nothing',
        (tester) async {
      await tester.pumpWidget(_host(
        const CmsSlot(placement: CmsPlacement.restaurantDetail),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cms-banner-list')), findsNothing);
    });

    testWidgets('15. a slot drops content scoped to another restaurant',
        (tester) async {
      final other = CmsContent.fromMap({
        ..._payload,
        'placement': 'restaurant_detail',
        'canonicalPlaceId': 'canon-OTHER',
      })!;
      await tester.pumpWidget(_host(
        const CmsSlot(
          placement: CmsPlacement.restaurantDetail,
          canonicalPlaceId: 'canon-MINE',
        ),
        overrides: [
          cmsContentProvider.overrideWith((ref, arg) async =>
              CmsFetchResult(content: [other], collections: const [])),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Promosi Raya'), findsNothing,
          reason: 'a banner for another restaurant must never appear here');
    });
  });

  group('C. the approved UI does not regress', () {
    test('16. Home keeps its local hero, greeting and carousel', () {
      final home = _read('lib/features/home/home_screen.dart');
      expect(home, contains('LocalHero'));
      expect(home, contains('_greetingKey()'));
      expect(home, contains("l.t('moodTitle')"));
      expect(home, contains("l.t('nearbyTitle')"));
      // CMS is additive, never a replacement.
      expect(home, contains('CmsSlot(placement: CmsPlacement.homeTop)'));
      expect(home, contains('CmsSlot(placement: CmsPlacement.homeMid)'));
    });

    test('17. the navigation shell still swipes', () {
      final shell = _read('lib/features/shell/app_shell.dart');
      expect(shell, contains('PageView'));
      expect(shell, contains('PageController'));
    });

    test('18. Explore keeps its own search and result list', () {
      final explore = _read('lib/features/explore/explore_screen.dart');
      expect(explore, contains("l.t('searchHint')"));
      expect(explore, contains('_cuisineFilter'));
      // Editorial content is labelled, never blended into results.
      expect(explore, contains('sponsored: true'));
    });

    test('19. Restaurant Detail keeps three tabs, Wave 3 and Wave 4 surfaces',
        () {
      final src = _read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      expect(src, contains('length: 3'));
      expect(src, contains("Key('tab-profile')"));
      expect(src, contains("Key('tab-reviews')"));
      expect(src, contains("Key('tab-menu')"));
      expect(src, contains('onOpenMenuItemComments'));
      expect(src, contains('PromotionSection(promotions: widget.promotions)'));
    });

    test('20. CMS sits BELOW the merchant offer on a restaurant page', () {
      final src = _read(
          'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart');
      final promo = src.indexOf('PromotionSection(promotions: widget.promotions)');
      final cms = src.indexOf('placement: CmsPlacement.restaurantDetail');
      expect(promo, greaterThan(0));
      expect(cms, greaterThan(promo),
          reason: "the restaurant's own offer outranks editorial content");
    });

    test('21. every CMS slot defaults to rendering nothing', () {
      final slot = _read('lib/features/cms/cms_slot.dart');
      expect(slot, contains('return const SizedBox.shrink()'));
      // No spinner and no error card in a promotional slot.
      expect(slot.contains('CircularProgressIndicator'), isFalse);
    });

    test('22. Activity filters, polls and check-in are untouched', () {
      expect(File('lib/features/notifications/activity_filter.dart').existsSync(), isTrue);
      expect(File('lib/features/social/feed_poll_card.dart').existsSync(), isTrue);
      expect(File('lib/features/social/checkin_place.dart').existsSync(), isTrue);
      final card = _read('lib/features/social/post_card.dart');
      expect(card, contains('FeedPollCard'));
      expect(card, contains('openCheckinPlaceInMaps'));
    });
  });

  group('D. read path', () {
    test('23. the client never decides visibility from the device clock', () {
      for (final path in const [
        'lib/features/cms/cms_content.dart',
        'lib/features/cms/cms_banner.dart',
        'lib/features/cms/cms_slot.dart',
      ]) {
        expect(_read(path).contains('DateTime.now()'), isFalse,
            reason: '$path must not decide visibility locally');
      }
    });

    test('24. the client never asserts its own plan', () {
      final service = _read('lib/core/services/cms_service.dart');
      expect(service.contains("'plan'"), isFalse,
          reason: 'entitlement is resolved server-side');
      expect(service, contains("httpsCallable('getCmsContent')"));
      expect(service.contains('FirebaseFirestore'), isFalse,
          reason: 'cms_content is server-only under rules');
    });

    test('25. rules keep the CMS collections fully server-side', () {
      final rules = _read('firestore.rules');
      expect(rules, contains('match /cms_content/{contentId}'));
      expect(rules, contains('match /cms_collections/{collectionId}'));
    });
  });
}
