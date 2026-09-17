// B5 — unobstructed impressions on the REAL screens that host banners.
//
// cms_impression_visibility_test.dart proves the rule at exact thresholds in
// controlled scenes. This file proves it where it matters: the production
// ExploreScreen, CanonicalRestaurantDetailScreen and HomeScreen, with their real
// fixed headers, pinned tab bar, tab pages, keyboard handling and system bars.
//
// Each screen is checked in both directions:
//  - a genuinely visible banner IS counted (the walk over the real render tree
//    must not fail closed to zero), and
//  - a banner that is still mostly inside the WINDOW but mostly OBSTRUCTED is
//    not. Every obstructed case asserts that precondition first, so it would be
//    counted by a window-only calculation and cannot pass vacuously.
//
// Only network and analytics edges are replaced: CMS content, pagination, the
// event logger (recorded, never sent) and the dwell clock (the test binding's
// fake clock).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/events/event_types.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/cms_service.dart';
import 'package:makan_mana/core/services/event_logger.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_impression_tracker.dart';
import 'package:makan_mana/features/cms/cms_providers.dart';
import 'package:makan_mana/features/explore/explore_flags.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/features/explore/explore_screen.dart';
import 'package:makan_mana/features/home/home_screen.dart';
import 'package:makan_mana/features/notifications/notification_providers.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';
import 'package:makan_mana/features/suggestions/suggestion_repository.dart';
import 'package:makan_mana/models/daily_usage.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _statusBar = 24.0;

CmsContent _banner(CmsPlacement placement, {String? canonicalPlaceId}) =>
    CmsContent(
      contentId: 'screen-${placement.wire}',
      placement: placement,
      title: 'Minggu Makanan Laut',
      subtitle: 'Restoran terpilih berhampiran Selangor',
      body: 'Tawaran terhad untuk pelanggan MakanMana minggu ini.',
      ctaLabel: 'Lihat tawaran',
      ctaDestination: '/explore',
      media: const CmsMedia(
        storagePath: 'cms/regression/banner.png',
        contentType: 'image/png',
        width: 1200,
        height: 600,
        altText: 'regression banner',
        readUrl: 'https://example.invalid/banner.png',
      ),
      priority: 10,
      canonicalPlaceId: canonicalPlaceId,
    );

class _RecordingLogger extends EventLogger {
  _RecordingLogger(super.ref, this.events);
  final List<(String, String?, Map<String, dynamic>?)> events;

  @override
  void logEvent(
    String eventType, {
    String? sourceScreen,
    String? sessionId,
    String? suggestionId,
    String? placeId,
    String? placeNameSnapshot,
    String? sourceMode,
    String? resultSource,
    bool isSample = false,
    bool isPreview = false,
    double? matchScore,
    List<String>? negativeSignals,
    Map<String, dynamic>? metadata,
  }) {
    events.add((eventType, sourceScreen, metadata));
  }
}

class _Probe {
  final events = <(String, String?, Map<String, dynamic>?)>[];
  int get impressions =>
      events.where((e) => e.$1 == EventType.cmsImpression).length;
}

class _QuietPagination extends ExplorePaginationController {
  _QuietPagination(super.ref);
  @override
  Future<void> loadFirst() async {}
  @override
  Future<void> loadMore() async {}
  @override
  Future<void> refresh() async {}
  @override
  void setSearchQuery(String value) {}
}

void _device(WidgetTester t,
    {Size size = const Size(360, 800), double keyboard = 0}) {
  const ratio = 2.0;
  t.view.devicePixelRatio = ratio;
  t.view.physicalSize = size * ratio;
  const padding = FakeViewPadding(top: _statusBar * ratio);
  t.view.padding = padding;
  t.view.viewPadding = padding;
  t.view.viewInsets = FakeViewPadding(bottom: keyboard * ratio);
  addTearDown(t.view.reset);
}

List<Override> _common(WidgetTester t, _Probe probe, SharedPreferences prefs,
        List<CmsContent> content) =>
    [
      sharedPreferencesProvider.overrideWithValue(prefs),
      eventLoggerProvider
          .overrideWith((ref) => _RecordingLogger(ref, probe.events)),
      cmsImpressionClockProvider.overrideWithValue(
          () => t.binding.clock.now().millisecondsSinceEpoch),
      cmsContentProvider.overrideWith((ref, arg) async => CmsFetchResult(
            content:
                content.where((c) => c.placement == arg.placement).toList(),
            collections: const [],
          )),
    ];

Widget _material(Widget home) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: home,
    );

Future<void> _hold(WidgetTester t, int ms) async {
  for (var elapsed = 0; elapsed < ms; elapsed += 50) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

Future<void> _setKeyboard(WidgetTester t, double logical) async {
  t.view.viewInsets =
      FakeViewPadding(bottom: logical * t.view.devicePixelRatio);
  await t.pump();
  await t.pump();
}

Finder get _card => find.byType(CmsBannerCard, skipOffstage: false);

/// Fraction of the card inside the WINDOW only — what the old calculation used.
double _windowFraction(WidgetTester t, {double screenHeight = 800}) {
  final r = t.getRect(_card);
  final top = r.top.clamp(0.0, screenHeight);
  final bottom = r.bottom.clamp(0.0, screenHeight);
  return (bottom - top) / r.height;
}

/// Moves [position] until the card's top edge is at [globalTop].
Future<void> _placeCardTop(
    WidgetTester t, ScrollPosition position, double globalTop) async {
  for (var i = 0; i < 6; i++) {
    final delta = t.getRect(_card).top - globalTop;
    if (delta.abs() < 0.01) return;
    position.jumpTo(position.pixels + delta);
    await t.pump();
  }
  expect(t.getRect(_card).top, moreOrLessEquals(globalTop, epsilon: 0.01));
}

void main() {
  late SharedPreferences prefs;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    TestWidgetsFlutterBinding.ensureInitialized();
    // HomeScreen probes location on start; report "service disabled" instead
    // of an async MissingPluginException in the plugin-less test env.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('flutter.baseflow.com/geolocator'),
      (call) async {
        if (call.method == 'isLocationServiceEnabled') return false;
        if (call.method == 'checkPermission') return 0;
        if (call.method == 'requestPermission') return 0;
        return null;
      },
    );
  });
  setUp(ExploreFlags.resetToSafeDefault);

  group('Explore (fixed title/search header, keyboard)', () {
    Future<(_Probe, ScrollPosition)> pumpExplore(WidgetTester t) async {
      final probe = _Probe();
      await t.pumpWidget(ProviderScope(
        overrides: [
          ..._common(t, probe, prefs, [_banner(CmsPlacement.exploreTop)]),
          explorePaginationProvider
              .overrideWith((ref) => _QuietPagination(ref)),
        ],
        child: _material(const ExploreScreen()),
      ));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      final position = t
          .state<ScrollableState>(find
              .descendant(
                  of: find.byType(CustomScrollView),
                  matching: find.byType(Scrollable))
              .first)
          .position;
      return (probe, position);
    }

    testWidgets('visible banner at rest is counted exactly once', (t) async {
      _device(t);
      final (probe, _) = await pumpExplore(t);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets(
        'banner scrolled under the fixed search header: 40% '
        'unobstructed, mostly inside the window -> zero', (t) async {
      _device(t);
      final (probe, position) = await pumpExplore(t);
      final viewportTop = t.getRect(find.byType(CustomScrollView)).top;
      final h = t.getRect(_card).height;
      // Only 40% of the card below the header.
      await _placeCardTop(t, position, viewportTop - 0.6 * h);
      expect(_windowFraction(t), greaterThanOrEqualTo(0.5),
          reason: 'precondition: a window-only calculation would count this');
      await _hold(t, 3000);
      expect(probe.impressions, 0);

      // Scroll back until 60% is below the header: now it counts.
      await _placeCardTop(t, position, viewportTop - 0.4 * h);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets('keyboard open: 40% above the keyboard -> zero, 60% -> one',
        (t) async {
      // The banner is the first sliver, so it cannot be scrolled BELOW its
      // resting place (that would be overscroll, which springs back). Instead
      // the keyboard is sized so that exactly 40%, then 60%, of the resting
      // card stays above it — the same geometry a taller keyboard produces.
      _device(t);
      final (probe, position) = await pumpExplore(t);
      final rest = t.getRect(_card);
      expect(position.pixels, 0);

      await _setKeyboard(t, 800 - (rest.top + 0.4 * rest.height));
      expect(t.getRect(find.byType(CustomScrollView)).bottom,
          moreOrLessEquals(rest.top + 0.4 * rest.height, epsilon: 0.5),
          reason: 'the resized viewport must end at the keyboard');
      expect(t.getRect(_card).top, moreOrLessEquals(rest.top, epsilon: 0.01));
      expect(_windowFraction(t), greaterThanOrEqualTo(0.5),
          reason: 'precondition: the whole card is still inside the window');
      await _hold(t, 3000);
      expect(probe.impressions, 0);

      await _setKeyboard(t, 800 - (rest.top + 0.6 * rest.height));
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });
  });

  group('Restaurant detail (pinned tab bar, tab pages)', () {
    RestaurantDetailViewModel vm() => const RestaurantDetailViewModel(
          placeId: 'PLC-regression',
          title: 'Bakar Bakar',
          subtitle: 'Mamak',
          sourceMode: CardSourceMode.live,
          gallery: DetailGallery(images: []),
          businessState: CardBusinessState.active,
          hours: DetailHours(model: CardHoursModel.unknown),
          rating: CardRatingModel(rating: 4.1),
          price: CardPriceModel.unknown,
          location: LocationInfo(address: 'Jalan Ampang'),
          menuItems: [],
        );

    Future<_Probe> pumpDetail(WidgetTester t) async {
      final probe = _Probe();
      await t.pumpWidget(ProviderScope(
        overrides: _common(t, probe, prefs, [
          _banner(CmsPlacement.restaurantDetail,
              canonicalPlaceId: 'PLC-regression'),
        ]),
        child: _material(CanonicalRestaurantDetailScreen(
          vm: vm(),
          cmsCanonicalPlaceId: 'PLC-regression',
        )),
      ));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      return probe;
    }

    NestedScrollViewState nested(WidgetTester t) =>
        t.state<NestedScrollViewState>(find.byType(NestedScrollView));

    testWidgets('banner fully visible below the tab bar is counted once',
        (t) async {
      _device(t);
      final probe = await pumpDetail(t);
      final card = t.getRect(_card);
      final tabs = t.getRect(find.byKey(const Key('restaurant-detail-tabs')));
      expect(card.top, greaterThanOrEqualTo(tabs.bottom),
          reason: 'precondition: nothing covers the card');
      expect(card.bottom, lessThanOrEqualTo(800));
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets(
        'banner under the PINNED tab bar: 40% unobstructed, mostly in '
        'the window -> zero', (t) async {
      _device(t);
      final probe = await pumpDetail(t);
      final n = nested(t);
      n.outerController.jumpTo(n.outerController.position.maxScrollExtent);
      await t.pump();
      final tabs = t.getRect(find.byKey(const Key('restaurant-detail-tabs')));
      final h = t.getRect(_card).height;

      await _placeCardTop(t, n.innerController.position, tabs.bottom - 0.6 * h);
      expect(_windowFraction(t), greaterThanOrEqualTo(0.5),
          reason: 'precondition: a window-only calculation would count this');
      expect(t.getRect(find.byKey(const Key('restaurant-detail-tabs'))).top,
          moreOrLessEquals(tabs.top, epsilon: 0.5),
          reason: 'the tab bar must actually be pinned in this scenario');
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });

    testWidgets('switching to another tab moves the banner off screen',
        (t) async {
      _device(t);
      final probe = await pumpDetail(t);
      await _hold(t, 500); // fully visible, but not yet for a full second

      await t.tap(find.byKey(const Key('tab-reviews')));
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });
  });

  group('Home (no header; status bar over a bare list)', () {
    PlaceSummary place(String id, String name) => PlaceSummary(
          placeId: id,
          name: name,
          cuisine: 'Nasi Campur',
          emoji: '🍜',
          rating: 4.5,
          userRatingCount: 120,
          priceLevel: 2,
          distanceKm: 1.2,
          isOpen: true,
          address: 'Jalan Ujian 1',
          matchScore: 80,
          matchReasonKeys: const [],
        );

    Future<(_Probe, ScrollPosition)> pumpHome(WidgetTester t) async {
      final probe = _Probe();
      await t.pumpWidget(ProviderScope(
        overrides: [
          ..._common(t, probe, prefs, [_banner(CmsPlacement.homeTop)]),
          homeSuggestionProvider.overrideWith((ref) async => HomeSuggestion(
                primary: place('p1', 'Warung Pak Din'),
                alternatives: [place('p2', 'Kedai Kopi Aman')],
                source: 'google_places',
              )),
          nearbyPlacesProvider
              .overrideWith((ref) async => [place('n1', 'Mee Kari Haji')]),
          dailyUsageProvider.overrideWith((ref) async => const DailyUsage(
              userId: 'test',
              date: '20260807',
              plan: 'free',
              spinUsed: 1,
              spinLimit: 3)),
          unreadNotificationCountProvider.overrideWithValue(3),
          homeClockProvider
              .overrideWithValue(() => DateTime(2026, 9, 7, 20, 30)),
        ],
        child: _material(const HomeScreen()),
      ));
      await t.pump(const Duration(milliseconds: 120));
      await t.pump(const Duration(milliseconds: 400));
      final position = t
          .state<ScrollableState>(find
              .descendant(
                  of: find.byType(HomeScreen),
                  matching: find.byType(Scrollable))
              .first)
          .position;
      return (probe, position);
    }

    testWidgets('banner scrolled fully into view is counted once', (t) async {
      _device(t);
      final (probe, position) = await pumpHome(t);
      await _placeCardTop(t, position, 200);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets(
        'banner under the status bar: 45% below it, >= 50% in the '
        'window -> zero', (t) async {
      _device(t);
      final (probe, position) = await pumpHome(t);
      final h = t.getRect(_card).height;
      await _placeCardTop(t, position, _statusBar - 0.55 * h);
      expect(_windowFraction(t), greaterThanOrEqualTo(0.5),
          reason: 'precondition: a window-only calculation would count this');
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });
  });
}
