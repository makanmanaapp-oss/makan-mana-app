/// FEATURED SHOP BANNER — what the customer is actually shown.
///
/// The owner's rule drives every case here: expose the REAL shop name, visual
/// and destination, and never invent a name, rating, distance, opening status
/// or image. So these tests are mostly about what must NOT appear — a banner
/// that renders something plausible but unearned is the failure this feature
/// exists to prevent, and it is invisible to a compiler.
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/cms_service.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_providers.dart';
import 'package:makan_mana/features/cms/featured_shop_card.dart';
import 'package:makan_mana/features/cms/featured_shop_carousel.dart';
import 'package:makan_mana/core/mood/availability_label.dart';

const _shopId = 'PLC-warung-1';

Map<String, Object?> _shop({
  String id = _shopId,
  String name = 'Warung Pak Din',
  Object? photoUrl = 'https://photos.example/pakdin.jpg',
  Object? address = '12 Jalan Besar, Shah Alam',
  Object? rating = 4.4,
  Object? ratingCount = 231,
  String? destination,
}) =>
    {
      'canonicalPlaceId': id,
      'name': name,
      'photoUrl': photoUrl,
      'address': address,
      'rating': rating,
      'ratingCount': ratingCount,
      'destination': destination ?? '/restaurant/$id',
    };

Map<String, Object?> _banner({
  String contentId = 'cms-shop-1',
  String placement = 'home_top',
  String title = 'Pilihan minggu ini',
  String subtitle = 'Set sarapan dari RM6',
  Map<String, Object?>? shop,
  String sponsorship = 'editorial',
}) =>
    {
      'contentId': contentId,
      'placement': placement,
      'title': title,
      'subtitle': subtitle,
      'body': '',
      'ctaLabel': '',
      'ctaDestination': '',
      'media': null,
      'priority': 10,
      'canonicalPlaceId': shop == null ? null : shop['canonicalPlaceId'],
      'shop': shop,
      'shopDestination': shop == null ? null : shop['destination'],
      'sponsorship': sponsorship,
    };

Map<String, Object?> _collection({
  String id = 'col-1',
  String title = 'Sarapan terbaik',
  List<Map<String, Object?>>? shops,
  String sponsorship = 'editorial',
}) =>
    {
      'collectionId': id,
      'sponsorship': sponsorship,
      'title': title,
      'description': 'Pilihan editor',
      'canonicalPlaceIds': (shops ?? [_shop()])
          .map((s) => s['canonicalPlaceId'] as String)
          .toList(),
      'shops': shops ?? [_shop()],
    };

late SharedPreferences _prefs;

Widget _host(
  Widget child, {
  List<Override> overrides = const [],
  String lang = 'ms',
  bool dark = false,
  double textScale = 1.0,
}) =>
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(_prefs),
        ...overrides,
      ],
      child: MaterialApp(
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        locale: Locale(lang),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      ),
    );

/// A host with a real router, so a CTA tap is checked by where it LANDS rather
/// than by a mock that would happily accept a wrong destination.
class _RouteSpy {
  final List<String> visited = <String>[];
}

Widget _routedHost(Widget child, _RouteSpy spy, {List<Override> overrides = const []}) {
  final router = GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(path: '/home', builder: (_, __) => Scaffold(body: child)),
      GoRoute(
        path: '/restaurant/:placeId',
        builder: (_, state) {
          spy.visited.add('/restaurant/${state.pathParameters['placeId']}');
          return const Scaffold(body: Text('SHOP PAGE'));
        },
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(_prefs),
      ...overrides,
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      locale: const Locale('ms'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    ),
  );
}

String _t(String key, {String lang = 'ms'}) =>
    AppLocalizations(Locale(lang)).t(key);

/// A service that answers with whatever the test wants, including a failure.
class _StubCms implements CmsService {
  _StubCms({this.result = const CmsFetchResult.empty(), this.delay});
  CmsFetchResult result;
  final Duration? delay;
  int calls = 0;

  @override
  Future<CmsFetchResult> fetch({
    required CmsPlacement placement,
    String? language,
    String? region,
    String? canonicalPlaceId,
    bool includeCollections = false,
  }) async {
    calls += 1;
    if (delay != null) await Future<void>.delayed(delay!);
    return result;
  }
}

List<Override> _cms(_StubCms service) => [
      firebaseReadyProvider.overrideWithValue(true),
      cmsServiceProvider.overrideWithValue(service),
      cmsViewerRegionProvider.overrideWithValue(null),
    ];

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  // ── 1. the model refuses what cannot be shown honestly ───────────────────

  group('the shop model fails closed', () {
    test('a shop with no name is not a shop', () {
      expect(CmsShop.fromMap(_shop(name: '')), isNull);
      expect(CmsShop.fromMap(_shop(name: '   ')), isNull);
    });

    test('a shop with no reachable destination is not a shop', () {
      expect(CmsShop.fromMap(_shop(destination: '')), isNull);
      // A cached payload must never be able to launch something the current
      // rules forbid, so the destination is re-checked here too.
      expect(CmsShop.fromMap(_shop(destination: 'javascript:alert(1)')), isNull);
      expect(CmsShop.fromMap(_shop(destination: '/etc/passwd')), isNull);
      expect(CmsShop.fromMap(_shop(destination: 'http://insecure/x')), isNull);
    });

    test('a rating needs BOTH a value and a count', () {
      expect(CmsShop.fromMap(_shop())!.hasRating, isTrue);
      expect(CmsShop.fromMap(_shop(ratingCount: null))!.hasRating, isFalse);
      expect(CmsShop.fromMap(_shop(rating: null))!.hasRating, isFalse);
    });

    test('a banner with no shop is an ordinary editorial banner', () {
      final plain = CmsContent.fromMap(_banner())!;
      expect(plain.isFeaturedShop, isFalse);
      expect(plain.shop, isNull);
    });

    test('a collection still parses when its shops could not be resolved', () {
      // The model reports what the server sent. Refusing to parse it here
      // would make "nobody was featured" indistinguishable from "the row does
      // not exist" — the carousel is what declines to DRAW it, below.
      // Ids present (the operator curated three shops), but none of them could
      // be proven on this request — the case a takedown actually produces.
      final c = CmsCollection.fromMap({
        'collectionId': 'col-1',
        'title': 'Sarapan terbaik',
        'description': '',
        'canonicalPlaceIds': ['PLC-1', 'PLC-2', 'PLC-3'],
        'shops': <Map<String, Object?>>[],
      });
      expect(c, isNotNull);
      expect(c!.shops, isEmpty);
    });
  });

  // ── 2. the Home banner shows the REAL shop ──────────────────────────────

  group('Home featured shop banner', () {
    testWidgets('shows the registry name, not the operator headline', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('featured-shop-banner-cms-shop-1')), findsOneWidget);
      // The real shop name.
      expect(find.text('Warung Pak Din'), findsOneWidget);
      // The operator's pitch is present but is NOT the identity.
      expect(find.text('Pilihan minggu ini'), findsOneWidget);
      expect(find.text('Set sarapan dari RM6'), findsOneWidget);
      expect(find.text('12 Jalan Besar, Shah Alam'), findsOneWidget);
      expect(find.text('4.4 (231)'), findsOneWidget);
      expect(find.byKey(const Key('featured-shop-editorial')), findsOneWidget);
    });

    testWidgets('an unproven rating is simply absent', (tester) async {
      final content = CmsContent.fromMap(
          _banner(shop: _shop(rating: 4.9, ratingCount: 0)))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      expect(find.text('Warung Pak Din'), findsOneWidget);
      expect(find.textContaining('4.9'), findsNothing);
      expect(find.byIcon(Icons.star_rounded), findsNothing);
    });

    testWidgets('never shows a distance or an opening status', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      // `place_details` carries neither, so any such text would be invented.
      expect(find.textContaining('km'), findsNothing);
      expect(find.textContaining('Buka'), findsNothing);
      expect(find.textContaining('Tutup'), findsNothing);
    });

    testWidgets('no photo -> a monogram, never a broken image', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop(photoUrl: null)))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      expect(find.byType(CachedNetworkImage), findsNothing);
      expect(find.text('WP'), findsOneWidget);
    });

    testWidgets('a real photo renders an image widget', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pump();
      expect(find.byType(CachedNetworkImage), findsOneWidget);
    });

    testWidgets('falls back to a localised CTA when the operator left it empty',
        (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();
      expect(find.text(_t('featuredShopViewShop')), findsOneWidget);
    });

    testWidgets('an editorial banner is UNCHANGED by this feature', (tester) async {
      final content = CmsContent.fromMap(_banner())!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();
      // The old card, not the shop card.
      expect(find.byKey(const Key('cms-banner-cms-shop-1')), findsOneWidget);
      expect(find.byKey(const Key('featured-shop-banner-cms-shop-1')), findsNothing);
    });
  });

  // ── 3. navigation goes to the shop the card named ───────────────────────

  group('CTA destination', () {
    testWidgets('tapping the banner opens THAT shop', (tester) async {
      final spy = _RouteSpy();
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_routedHost(CmsBannerCard(content: content), spy));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Warung Pak Din'));
      await tester.pumpAndSettle();

      expect(spy.visited, ['/restaurant/$_shopId']);
      expect(find.text('SHOP PAGE'), findsOneWidget);
    });

    testWidgets('a tile opens the shop it shows, not its neighbour', (tester) async {
      final spy = _RouteSpy();
      final shops = [
        _shop(id: 'PLC-a', name: 'Kedai A'),
        _shop(id: 'PLC-b', name: 'Kedai B'),
      ];
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([_collection(shops: shops)]),
        ),
      );
      await tester.pumpWidget(_routedHost(
        const FeaturedShopCarousel(),
        spy,
        overrides: _cms(service),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Kedai B'));
      await tester.pumpAndSettle();
      expect(spy.visited, ['/restaurant/PLC-b']);
    });
  });


  // ── 3b. the destination must be able to RENDER the shop ─────────────────
  //
  // Device-found: the CTA navigated correctly and landed on a dead page,
  // because a bare `/restaurant/<id>` has nothing for the screen to resolve.
  // These lock the identity that now travels with it.
  group('the shop identity travels with the navigation', () {
    test('a proven shop becomes a renderable PlaceSummary', () {
      final shop = CmsShop.fromMap(_shop())!;
      final summary = placeSummaryFromShop(shop);
      expect(summary.placeId, _shopId);
      expect(summary.canonicalPlaceId, _shopId);
      expect(summary.name, 'Warung Pak Din');
      expect(summary.photoUrl, 'https://photos.example/pakdin.jpg');
      expect(summary.address, '12 Jalan Besar, Shah Alam');
      expect(summary.rating, 4.4);
      expect(summary.userRatingCount, 231);
    });

    test('nothing a CMS read cannot know is filled in', () {
      final summary = placeSummaryFromShop(CmsShop.fromMap(_shop())!);
      // Each of these is the value the detail screen reads as "say nothing":
      // distance and the match badge render only when > 0, and an empty
      // cuisine draws no line.
      expect(summary.distanceKm, 0, reason: 'a CMS read has no location');
      expect(summary.matchScore, 0, reason: 'no algorithm ran');
      expect(summary.priceLevel, 0);
      expect(summary.cuisine, isEmpty);
    });

    test('the page can never claim the shop is open OR closed', () {
      final summary = placeSummaryFromShop(CmsShop.fromMap(_shop())!);
      // `place_details` carries no opening hours at all. Without this signal
      // the screen would fall through to isOpen:false and tell the customer
      // the restaurant is CLOSED — an invented fact, not a missing one.
      expect(summary.negativeSignals, contains('hours_unverified'));
      expect(showsOpenNow(summary), isFalse);
      expect(availabilityDisplay(summary), AvailabilityDisplay.hoursNotVerified);
    });

    test('an unrated shop carries no rating into the page', () {
      final shop = CmsShop.fromMap(_shop(rating: 4.9, ratingCount: 0))!;
      final summary = placeSummaryFromShop(shop);
      expect(summary.rating, 0);
      expect(summary.userRatingCount, 0);
    });
  });

  // ── 4. the Explore carousel ─────────────────────────────────────────────

  group('Explore featured shops carousel', () {
    testWidgets('renders every shop, in the operator\'s order', (tester) async {
      final shops = [
        _shop(id: 'PLC-1', name: 'Satu'),
        _shop(id: 'PLC-2', name: 'Dua'),
        _shop(id: 'PLC-3', name: 'Tiga'),
      ];
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([_collection(shops: shops)]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();

      expect(find.text('Sarapan terbaik'), findsOneWidget);
      for (final name in ['Satu', 'Dua', 'Tiga']) {
        expect(find.text(name), findsOneWidget);
      }
      // The ORDER is the product, so it is asserted, not assumed.
      final xs = ['Satu', 'Dua', 'Tiga']
          .map((n) => tester.getTopLeft(find.text(n)).dx)
          .toList();
      expect(xs[0] < xs[1] && xs[1] < xs[2], isTrue, reason: 'order: $xs');
    });

    testWidgets('no duplicate card for the same shop within a section',
        (tester) async {
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([
            _collection(shops: [_shop(id: 'PLC-x', name: 'Sama')]),
          ]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('featured-shop-tile-PLC-x')), findsOneWidget);
    });

    testWidgets('EMPTY -> the page is exactly what it was', (tester) async {
      final service = _StubCms(result: const CmsFetchResult.empty());
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();

      expect(find.text(_t('featuredShopSectionTitle')), findsNothing);
      expect(find.byKey(const Key('featured-shop-error')), findsNothing);
      expect(tester.getSize(find.byType(FeaturedShopCarousel)).height, 0);
    });

    testWidgets('LOADING -> skeletons, never a spinner in a promo slot',
        (tester) async {
      final service = _StubCms(
        result: const CmsFetchResult.empty(),
        delay: const Duration(seconds: 2),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pump();

      expect(find.byType(FeaturedShopTileSkeleton), findsWidgets);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.pumpAndSettle(const Duration(seconds: 3));
    });

    testWidgets('FAILED -> an honest message and a working retry', (tester) async {
      final service = _StubCms(result: const CmsFetchResult.failure());
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('featured-shop-error')), findsOneWidget);
      expect(find.text(_t('featuredShopLoadFailed')), findsOneWidget);

      final before = service.calls;
      // The retry must actually refetch — a button that only looks like a
      // retry is the dishonest version of no button at all.
      service.result = CmsFetchResult(
        content: const [],
        collections: CmsCollection.listFromMap([_collection()]),
      );
      await tester.tap(find.byKey(const Key('featured-shop-retry')));
      await tester.pumpAndSettle();

      expect(service.calls, greaterThan(before));
      expect(find.byKey(const Key('featured-shop-error')), findsNothing);
      expect(find.text('Warung Pak Din'), findsOneWidget);
    });
  });

  // ── 5. layout, themes, languages, accessibility ─────────────────────────

  group('presentation holds up', () {
    testWidgets('a very long shop name does not overflow the tile',
        (tester) async {
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([
            _collection(shops: [
              _shop(name: 'Restoran Nasi Kandar Pulau Pinang Cawangan Seksyen 13'),
            ]),
          ]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('a long name survives a large text scale', (tester) async {
      final content = CmsContent.fromMap(
          _banner(shop: _shop(name: 'Restoran Nasi Kandar Pulau Pinang Seksyen 13')))!;
      await tester.pumpWidget(_host(
        CmsBannerCard(content: content),
        textScale: 1.6,
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('dark mode renders without error', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(
          _host(CmsBannerCard(content: content), dark: true));
      await tester.pumpAndSettle();
      expect(find.text('Warung Pak Din'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      testWidgets('renders in $lang with translated chrome', (tester) async {
        final content = CmsContent.fromMap(_banner(shop: _shop()))!;
        await tester.pumpWidget(_host(
          CmsBannerCard(content: content),
          lang: lang,
        ));
        await tester.pumpAndSettle();

        // The shop's own name is never translated.
        expect(find.text('Warung Pak Din'), findsOneWidget);
        // The chrome around it is. The default banner is EDITORIAL, so the
        // label must say so — not "Tajaan", which nobody declared.
        expect(find.text(_t('featuredShopEditorial', lang: lang)), findsOneWidget);
        expect(find.text(_t('featuredShopSponsored', lang: lang)), findsNothing);
        expect(find.text(_t('featuredShopViewShop', lang: lang)), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('a tile is one screen-reader node naming the shop',
        (tester) async {
      final handle = tester.ensureSemantics();
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([_collection()]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Warung Pak Din'), findsOneWidget);
      handle.dispose();
    });
  });

  // ── 6. disclosure: declared, never inferred ─────────────────────────────

  group('the sponsorship label states a declared fact', () {
    testWidgets('a PAID banner says Tajaan, on HOME too', (tester) async {
      // The old code passed a `sponsored` flag from the hosting screen, and
      // Home never passed it — so a genuinely paid Home banner carried no
      // disclosure at all.
      final content =
          CmsContent.fromMap(_banner(shop: _shop(), sponsorship: 'paid'))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('featured-shop-paid')), findsOneWidget);
      expect(find.text(_t('featuredShopSponsored')), findsOneWidget);
      expect(find.text(_t('featuredShopEditorial')), findsNothing);
    });

    testWidgets('an EDITORIAL banner says Pilihan MakanMana', (tester) async {
      final content = CmsContent.fromMap(_banner(shop: _shop()))!;
      await tester.pumpWidget(_host(CmsBannerCard(content: content)));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('featured-shop-editorial')), findsOneWidget);
      expect(find.text(_t('featuredShopEditorial')), findsOneWidget);
      expect(find.text(_t('featuredShopSponsored')), findsNothing);
    });

    testWidgets('the SURFACE cannot make a banner look paid', (tester) async {
      // This is the regression. Every Explore banner used to be labelled
      // "Tajaan" purely because Explore is a discovery surface — a paid
      // placement disclosure nobody had actually declared.
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections: CmsCollection.listFromMap([_collection()]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();

      expect(find.text(_t('featuredShopSponsored')), findsNothing,
          reason: 'Explore must not assert a paid placement by itself');
      expect(find.text(_t('featuredShopEditorial')), findsOneWidget);
    });

    testWidgets('a paid CURATED ROW is disclosed on Explore', (tester) async {
      final service = _StubCms(
        result: CmsFetchResult(
          content: const [],
          collections:
              CmsCollection.listFromMap([_collection(sponsorship: 'paid')]),
        ),
      );
      await tester.pumpWidget(
          _host(const FeaturedShopCarousel(), overrides: _cms(service)));
      await tester.pumpAndSettle();
      expect(find.text(_t('featuredShopSponsored')), findsOneWidget);
    });

    test('an unknown value is editorial, never paid', () {
      // Reading an unknown value as paid would invent a commercial
      // relationship; reading it as editorial only says nobody declared one.
      for (final junk in [null, '', 'PAID', 'sponsored', 1]) {
        expect(CmsSponsorship.parse(junk), CmsSponsorship.editorial,
            reason: 'inferred paid from ${junk.runtimeType}: $junk');
      }
      expect(CmsSponsorship.parse('paid'), CmsSponsorship.paid);
    });
  });
}
