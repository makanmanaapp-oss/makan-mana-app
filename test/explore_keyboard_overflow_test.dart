// B5 — Explore keyboard / short-viewport overflow regression.
//
// DEFECT (reproduced on a Samsung SM-A055F, 720x1600 @ 2.0): with an eligible
// explore_top banner and the soft keyboard open, Explore reported
// "BOTTOM OVERFLOWED BY 57 PIXELS". The body was one rigid Column — title,
// location, search, banner and chip strip all fixed — so a tall banner plus the
// keyboard left the results list less than zero height.
//
// These tests drive the REAL ExploreScreen at real device geometry through
// tester.view (physical size, pixel ratio, status-bar padding, keyboard insets,
// text scale). A MediaQuery-only harness was tried first and rejected: it lays
// out at the test surface's default 800x600 and reports the wrong heights.
//
// Only the network edges are replaced: CMS content, the pagination controller
// (so refresh/loadMore calls are observable) and the event logger (so nothing
// touches Firebase and the CTA event can be asserted). Layout, CmsSlot,
// CmsBannerCard, the impression tracker and navigation are production code.
//
// NOTE ON THE TEST FONT: flutter_test draws every glyph as a full em square, so
// text here is wider and taller than on a device. Heights below are therefore
// pessimistic — a layout that fits here has margin on a real phone.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/events/event_types.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/cms_service.dart';
import 'package:makan_mana/core/services/event_logger.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_providers.dart';
import 'package:makan_mana/features/cms/cms_slot.dart';
import 'package:makan_mana/features/explore/explore_flags.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/features/explore/explore_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

String _en(String k) => AppLocalizations(const Locale('en')).t(k);

const _ctaLabel = 'Lihat tawaran';
const _ctaTarget = 'qa-cta-target';

/// A banner shaped like real operator content: 2:1 artwork plus title,
/// subtitle, body and CTA. The image url never loads in a widget test, but
/// CmsBannerCard reserves the AspectRatio box whenever a url exists, so the card
/// has its real on-device height.
CmsContent _banner() => const CmsContent(
      contentId: 'overflow-regression-banner',
      placement: CmsPlacement.exploreTop,
      title: 'Minggu Makanan Laut',
      subtitle: 'Restoran terpilih berhampiran Selangor',
      body: 'Tawaran terhad untuk pelanggan MakanMana minggu ini.',
      ctaLabel: _ctaLabel,
      // Pushed (not a branch root), so a tap lands on a sentinel route.
      ctaDestination: '/restaurant/$_ctaTarget',
      media: CmsMedia(
        storagePath: 'cms/regression/banner.png',
        contentType: 'image/png',
        width: 1200,
        height: 600,
        altText: 'regression banner',
        readUrl: 'https://example.invalid/banner.png',
      ),
      priority: 10,
      canonicalPlaceId: null,
    );

class _Calls {
  int loadFirst = 0;
  int loadMore = 0;
  int refresh = 0;
  final queries = <String>[];
}

/// Real controller type, network methods recorded instead of fetched.
class _FakePagination extends ExplorePaginationController {
  _FakePagination(super.ref, this.calls);
  final _Calls calls;

  @override
  Future<void> loadFirst() async => calls.loadFirst++;

  @override
  Future<void> loadMore() async => calls.loadMore++;

  @override
  Future<void> refresh() async => calls.refresh++;

  @override
  void setSearchQuery(String value) => calls.queries.add(value);
}

class _RecordingLogger extends EventLogger {
  _RecordingLogger(super.ref, this.events);
  final List<(String, Map<String, dynamic>?)> events;

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
    events.add((eventType, metadata));
  }
}

class _Harness {
  final calls = _Calls();
  final events = <(String, Map<String, dynamic>?)>[];
}

/// Sets the REAL view geometry. [size] and [keyboard] are logical pixels.
void _device(
  WidgetTester t, {
  Size size = const Size(360, 800),
  double keyboard = 0,
  double textScale = 1.0,
  double ratio = 2.0,
}) {
  t.view.devicePixelRatio = ratio;
  t.view.physicalSize = size * ratio;
  t.view.padding = FakeViewPadding(top: 24 * ratio);
  t.view.viewInsets = FakeViewPadding(bottom: keyboard * ratio);
  t.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> _setKeyboard(WidgetTester t, double logical) async {
  t.view.viewInsets =
      FakeViewPadding(bottom: logical * t.view.devicePixelRatio);
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
}

Future<_Harness> _pumpExplore(
  WidgetTester t,
  SharedPreferences prefs, {
  required bool withBanner,
}) async {
  final h = _Harness();
  final router = GoRouter(
    initialLocation: '/explore',
    routes: [
      GoRoute(path: '/explore', builder: (_, __) => const ExploreScreen()),
      GoRoute(
        path: '/restaurant/:placeId',
        builder: (_, state) => Scaffold(
          body: Center(
            child: Text('ROUTE restaurant ${state.pathParameters['placeId']}'),
          ),
        ),
      ),
    ],
  );
  await t.pumpWidget(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        cmsContentProvider.overrideWith((ref, arg) async => CmsFetchResult(
              content: withBanner && arg.placement == CmsPlacement.exploreTop
                  ? [_banner()]
                  : const [],
              collections: const [],
            )),
        explorePaginationProvider
            .overrideWith((ref) => _FakePagination(ref, h.calls)),
        eventLoggerProvider
            .overrideWith((ref) => _RecordingLogger(ref, h.events)),
      ],
      child: MaterialApp.router(
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
        routerConfig: router,
      ),
    ),
  );
  await t.pump();
  await t.pump(const Duration(milliseconds: 300));
  return h;
}

/// The vertical results scroll view (not the horizontal chip strip inside it).
Finder get _resultsScrollable => find
    .descendant(
      of: find.byType(CustomScrollView),
      matching: find.byType(Scrollable),
    )
    .first;

// skipOffstage: false on the finders below — a widget scrolled out of the
// viewport still exists and must be findable so it can be measured and scrolled
// back in.
Finder get _chipStrip => find.byWidgetPredicate(
      (w) => w is ListView && w.scrollDirection == Axis.horizontal,
      skipOffstage: false,
    );

Finder get _cta => find.text(_ctaLabel, skipOffstage: false);
Finder get _footer => find.text(_en('loadMore'), skipOffstage: false);

/// Fails with the real Flutter message rather than a bare "not null".
void _expectNoLayoutError(WidgetTester t, String where) {
  final e = t.takeException();
  expect(e, isNull, reason: '$where: ${e.toString().split('\n').first}');
}

/// The part of the results viewport a user can actually see and touch: below
/// the chip strip when it is pinned, and never below the keyboard (the viewport
/// itself already ends above it).
Rect _unobstructed(WidgetTester t) {
  final viewport = t.getRect(find.byType(CustomScrollView));
  final strip = t.getRect(_chipStrip);
  final pinned = (strip.top - viewport.top).abs() < 0.5;
  return pinned
      ? Rect.fromLTRB(
          viewport.left, strip.bottom, viewport.right, viewport.bottom)
      : viewport;
}

/// Scrolls until [target] is FULLY inside the unobstructed viewport.
///
/// This is the definition of "reachable": some scroll offset inside the real
/// scroll extent shows the whole widget, uncovered. It deliberately does not
/// use scrollUntilVisible, which only needs the widget's centre to be hittable
/// and so passes for a widget whose edge is still clipped.
Future<void> _revealFully(WidgetTester t, Finder target, String what) async {
  final position = t.state<ScrollableState>(_resultsScrollable).position;
  for (var i = 0; i < 300; i++) {
    if (target.evaluate().isEmpty) {
      // Lazily built further down the list.
      final next = math.min(position.pixels + 40, position.maxScrollExtent);
      expect(next, greaterThan(position.pixels),
          reason: '$what is never built within the scroll extent');
      position.jumpTo(next);
      await t.pump();
      continue;
    }
    final area = _unobstructed(t);
    final rect = t.getRect(target);
    expect(rect.height, lessThanOrEqualTo(area.height + 0.5),
        reason: '$what (${rect.height}px) is taller than the visible results '
            'area (${area.height}px)');
    if (rect.top >= area.top - 0.5 && rect.bottom <= area.bottom + 0.5) return;
    final delta = rect.bottom > area.bottom
        ? rect.bottom - area.bottom
        : rect.top - area.top;
    final next = (position.pixels + delta)
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();
    expect((next - position.pixels).abs(), greaterThan(0.01),
        reason: '$what cannot be scrolled fully into view: the scroll extent '
            'ends first (offset ${position.pixels}, max '
            '${position.maxScrollExtent})');
    position.jumpTo(next);
    await t.pump();
  }
  fail('$what never settled fully into view');
}

/// Fully inside the unobstructed area AND a hit test at its centre reaches it.
void _expectAccessible(WidgetTester t, Finder target, String what) {
  final area = _unobstructed(t);
  final rect = t.getRect(target);
  expect(rect.top, greaterThanOrEqualTo(area.top - 0.5),
      reason: '$what top is clipped or under the pinned chip strip');
  expect(rect.bottom, lessThanOrEqualTo(area.bottom + 0.5),
      reason: '$what bottom is clipped (keyboard or viewport edge)');
  final hit = t.hitTestOnBinding(t.getCenter(target));
  final render = t.renderObject(target);
  expect(hit.path.any((entry) => entry.target == render), isTrue,
      reason: '$what is covered by something else at its centre');
}

void main() {
  late SharedPreferences prefs;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });
  setUp(ExploreFlags.resetToSafeDefault);

  group('keyboard open (Galaxy A05 geometry: 360x800 @2x, keyboard 300)', () {
    testWidgets(
        'banner present + keyboard open: no overflow, results viewport '
        'ends above the keyboard, end of results reachable', (t) async {
      _device(t, keyboard: 300);
      await _pumpExplore(t, prefs, withBanner: true);

      _expectNoLayoutError(t, 'banner + keyboard');
      expect(find.byType(CmsBannerCard), findsOneWidget);
      expect(find.byKey(const Key('cms-sponsored-label')), findsOneWidget);

      // Nothing the user needs may sit behind the keyboard.
      final viewport = t.getRect(find.byType(CustomScrollView));
      expect(viewport.bottom, lessThanOrEqualTo(800 - 300 + 0.5));
      expect(viewport.height, greaterThan(0));

      // A whole result card fits in the space the pinned strip leaves. Found by
      // identity, so it is simply absent until the lazy list builds it.
      final third =
          ProviderScope.containerOf(t.element(find.byType(ExploreScreen)))
              .read(dummySuggestionServiceProvider)
              .nearby(limit: 12)[2]
              .placeId;
      final card = find.byWidgetPredicate(
        (w) => w is ExplorePlaceCard && w.place.placeId == third,
        skipOffstage: false,
      );
      await _revealFully(t, card, 'third result card');
      _expectAccessible(t, card, 'third result card');

      await _revealFully(t, _footer, 'pagination footer');
      _expectNoLayoutError(t, 'scrolled to footer with keyboard');
      _expectAccessible(t, _footer, 'pagination footer');
    });

    testWidgets(
        'banner absent + keyboard open: no overflow, chips directly '
        'under the search field', (t) async {
      _device(t, keyboard: 300);
      await _pumpExplore(t, prefs, withBanner: false);

      _expectNoLayoutError(t, 'no banner + keyboard');
      expect(find.byType(CmsBannerCard), findsNothing);
      final search = t.getRect(find.byType(TextField));
      final chips = t.getRect(_chipStrip);
      // Search padding (8) + empty slot padding (4): the slot leaves no gap.
      expect(chips.top, moreOrLessEquals(search.bottom + 8 + 4, epsilon: 0.5));
    });

    testWidgets(
        'banner CTA is reachable, uncovered and working with the '
        'keyboard open', (t) async {
      _device(t, keyboard: 300);
      final h = await _pumpExplore(t, prefs, withBanner: true);

      await _revealFully(t, _cta, 'banner CTA');
      _expectNoLayoutError(t, 'scrolled to CTA');
      _expectAccessible(t, _cta, 'banner CTA');

      await t.tap(_cta);
      await t.pumpAndSettle();
      expect(find.text('ROUTE restaurant $_ctaTarget'), findsOneWidget);
      // Analytics semantics unchanged: one CTA event, same metadata contract.
      final cta =
          h.events.where((e) => e.$1 == EventType.cmsCtaTapped).toList();
      expect(cta, hasLength(1));
      expect(cta.single.$2, {
        'contentId': 'overflow-regression-banner',
        'placement': 'explore_top',
        'ctaKind': 'internal_route',
      });
    });
  });

  group('keyboard dismissed', () {
    testWidgets(
        'no overflow, and the resting layout is unchanged: search -> '
        'banner -> chips -> results with the original spacing', (t) async {
      _device(t);
      await _pumpExplore(t, prefs, withBanner: true);
      _expectNoLayoutError(t, 'keyboard dismissed');

      final search = t.getRect(find.byType(TextField));
      final banner = t.getRect(find.byType(CmsBannerCard));
      final chips = t.getRect(_chipStrip);
      final firstCard = t.getRect(find.byType(ExplorePlaceCard).first);

      // Search padding bottom 8 + slot padding top 4.
      expect(banner.top, moreOrLessEquals(search.bottom + 12, epsilon: 0.5));
      // The card's 10 px margin is inside its rect; banner list padding is 14.
      expect(chips.top, moreOrLessEquals(banner.bottom + 14, epsilon: 0.5));
      expect(chips.height, moreOrLessEquals(54, epsilon: 0.5));
      // Results list padding top 8.
      expect(firstCard.top, moreOrLessEquals(chips.bottom + 8, epsilon: 0.5));
    });

    testWidgets(
        'keyboard opening and closing in steps never overflows and '
        'keeps the banner mounted', (t) async {
      _device(t);
      await _pumpExplore(t, prefs, withBanner: true);
      for (final kb in const [0.0, 120.0, 300.0, 180.0, 0.0]) {
        await _setKeyboard(t, kb);
        _expectNoLayoutError(t, 'keyboard at $kb');
        expect(find.byType(CmsBannerCard, skipOffstage: false), findsOneWidget);
      }
    });
  });

  group('short viewport', () {
    // Portrait phones where the results area keeps real height with the
    // keyboard open (64 px and 32 px here under the pessimistic test font):
    // the CTA and the end of the results must be fully reachable.
    for (final geometry in const [
      (Size(320, 568), 1.0),
      (Size(360, 640), 1.3),
    ]) {
      for (final kb in const [0.0, 260.0]) {
        final size = geometry.$1;
        final scale = geometry.$2;
        testWidgets(
            '${size.width.toInt()}x${size.height.toInt()} text x$scale '
            'keyboard ${kb.toInt()}: no overflow, CTA and results reachable',
            (t) async {
          _device(t, size: size, keyboard: kb, textScale: scale);
          await _pumpExplore(t, prefs, withBanner: true);
          _expectNoLayoutError(t, 'short viewport');

          await _revealFully(t, _cta, 'banner CTA');
          _expectAccessible(t, _cta, 'banner CTA');

          await _revealFully(t, _footer, 'pagination footer');
          _expectNoLayoutError(t, 'short viewport scrolled');
          _expectAccessible(t, _footer, 'pagination footer');
        });
      }
    }

    // Geometry where the fixed header plus the keyboard is taller than the
    // screen. Nothing can fit, so the guarantee is: no overflow, the search
    // field the user is typing into stays visible, and the results come back
    // as soon as the keyboard closes.
    for (final geometry in const [
      (Size(360, 520), 1.3, 260.0),
      (Size(800, 360), 1.3, 200.0),
    ]) {
      final size = geometry.$1;
      final scale = geometry.$2;
      final kb = geometry.$3;
      testWidgets(
          'extreme ${size.width.toInt()}x${size.height.toInt()} text '
          'x$scale keyboard ${kb.toInt()}: no overflow, search stays visible, '
          'results return when the keyboard closes', (t) async {
        _device(t, size: size, textScale: scale);
        await _pumpExplore(t, prefs, withBanner: true);

        await t.showKeyboard(find.byType(TextField));
        await _setKeyboard(t, kb);
        await t.pump(const Duration(milliseconds: 300));
        _expectNoLayoutError(t, 'extreme + keyboard');

        final headerView = t.getRect(find.ancestor(
          of: find.byType(TextField),
          matching: find.byType(SingleChildScrollView),
        ));
        final field = t.getRect(find.byType(TextField));
        expect(field.top, greaterThanOrEqualTo(headerView.top - 0.5),
            reason: 'search field scrolled out of its header');
        expect(field.bottom, lessThanOrEqualTo(headerView.bottom + 0.5),
            reason: 'search field hidden while typing');

        await _setKeyboard(t, 0);
        _expectNoLayoutError(t, 'extreme keyboard closed');
        await _revealFully(t, _cta, 'banner CTA after keyboard closed');
        _expectAccessible(t, _cta, 'banner CTA after keyboard closed');
      });
    }
  });

  group('preserved behaviour', () {
    testWidgets(
        'search focus, text and the field itself survive the keyboard '
        'opening, scrolling the results and the keyboard closing', (t) async {
      _device(t);
      final h = await _pumpExplore(t, prefs, withBanner: true);

      await t.enterText(find.byType(TextField), 'a');
      await t.pump();
      expect(h.calls.queries, ['a']);
      final editable = t.state<EditableTextState>(find.byType(EditableText));
      final fieldTop = t.getRect(find.byType(TextField)).top;

      await _setKeyboard(t, 300);
      await t.drag(_resultsScrollable, const Offset(0, -250));
      await t.pump();
      _expectNoLayoutError(t, 'typing + keyboard + scrolled');

      // Same State object: the field was never remounted, so a rebuild could
      // not have dropped focus.
      expect(identical(editable, t.state(find.byType(EditableText))), isTrue);
      expect(editable.widget.focusNode.hasFocus, isTrue);
      expect(editable.textEditingValue.text, 'a');
      // The field is not part of the scroll view: scrolling results leaves it.
      expect(t.getRect(find.byType(TextField)).top,
          moreOrLessEquals(fieldTop, epsilon: 0.5));

      await _setKeyboard(t, 0);
      _expectNoLayoutError(t, 'keyboard closed after typing');
      expect(editable.widget.focusNode.hasFocus, isTrue);
      expect(editable.textEditingValue.text, 'a');
    });

    testWidgets(
        'category chips still filter — including after scrolling with '
        'the keyboard open, because the strip stays pinned', (t) async {
      _device(t, keyboard: 300);
      await _pumpExplore(t, prefs, withBanner: true);
      final container =
          ProviderScope.containerOf(t.element(find.byType(ExploreScreen)));
      final cuisines = container
          .read(dummySuggestionServiceProvider)
          .nearby(limit: 12)
          .map((p) => p.cuisine)
          .toSet()
          .toList()
        ..sort();
      expect(cuisines.length, greaterThan(1),
          reason: 'fixture must offer a real choice to filter');
      final pick = cuisines.first;

      // Scroll well past the banner so the strip has to be pinned to be seen.
      await t.drag(_resultsScrollable, const Offset(0, -600));
      await t.pump();
      expect(
          t.getRect(_chipStrip).top,
          moreOrLessEquals(t.getRect(find.byType(CustomScrollView)).top,
              epsilon: 0.5),
          reason: 'chip strip should be pinned to the top of the results');
      final chip = find.descendant(of: _chipStrip, matching: find.text(pick));
      final hit = t.hitTestOnBinding(t.getCenter(chip));
      expect(hit.path.any((e) => e.target == t.renderObject(chip)), isTrue,
          reason: 'pinned chip "$pick" is covered');

      await t.tap(chip);
      await t.pump();
      _expectNoLayoutError(t, 'filtered');
      final shown =
          t.widgetList<ExplorePlaceCard>(find.byType(ExplorePlaceCard));
      expect(shown, isNotEmpty);
      expect(shown.every((c) => c.place.cuisine == pick), isTrue);
    });

    testWidgets(
        'pull-to-refresh still calls refresh() — with results, and on '
        'an empty result', (t) async {
      _device(t);
      final h = await _pumpExplore(t, prefs, withBanner: true);

      await t.fling(_resultsScrollable, const Offset(0, 500), 1500);
      await t.pumpAndSettle();
      expect(h.calls.refresh, 1);

      await t.enterText(find.byType(TextField), 'zzzz-no-such-place');
      await t.pump();
      expect(find.text(_en('noResults')), findsOneWidget);
      FocusManager.instance.primaryFocus?.unfocus();
      await t.pump();

      await t.fling(_resultsScrollable, const Offset(0, 500), 1500);
      await t.pumpAndSettle();
      expect(h.calls.refresh, 2);
    });

    testWidgets('pagination footer still calls loadMore()', (t) async {
      _device(t);
      final h = await _pumpExplore(t, prefs, withBanner: false);
      expect(h.calls.loadFirst, 1);

      await _revealFully(t, _footer, 'pagination footer');
      await t.tap(_footer);
      await t.pump();
      expect(h.calls.loadMore, 1);
    });
  });

  group('layout contract', () {
    // Encodes the two decisions behind the fix so a later refactor cannot
    // quietly undo them:
    //  - the banner lives in the scroll view (a fixed banner is what overflowed);
    //  - the search field does NOT (inside it, every keystroke would scroll the
    //    results back up to reveal the caret).
    testWidgets(
        'on a short screen with the keyboard open the chip strip '
        'scrolls away instead of covering the results', (t) async {
      _device(t, size: const Size(360, 640), keyboard: 260, textScale: 1.3);
      await _pumpExplore(t, prefs, withBanner: true);
      final viewport = t.getRect(find.byType(CustomScrollView));
      expect(viewport.height, lessThan(54.0 * 3),
          reason: 'fixture must actually be in the tight regime');

      await t.drag(_resultsScrollable, const Offset(0, -1200));
      await t.pump();
      _expectNoLayoutError(t, 'short + keyboard scrolled deep');
      final strip = t.getRect(_chipStrip);
      expect(strip.bottom, lessThanOrEqualTo(viewport.top + 0.5),
          reason: 'strip is still pinned over a ${viewport.height}px results '
              'area');
    });

    testWidgets('banner scrolls with the results; search field does not',
        (t) async {
      _device(t);
      await _pumpExplore(t, prefs, withBanner: true);
      expect(
        find.descendant(
            of: find.byType(CustomScrollView), matching: find.byType(CmsSlot)),
        findsOneWidget,
      );
      expect(
        find.descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(TextField)),
        findsNothing,
      );
    });
  });
}

// MUTATION CHECK (run when this file was written; repeat after layout changes).
// Each mutant reverts one decision and must be killed by the tests guarding it:
//  - pre-fix explore_screen.dart: 15 of 17 fail. The keyboard, short-viewport
//    and extreme tests fail on "A RenderFlex overflowed by N pixels on the
//    bottom" (205 px for the A05 keyboard case). The two that still pass are the
//    no-banner control and the resting-layout check - nothing changed at rest.
//  - header height clamp removed: exactly the two extreme-geometry tests fail.
//  - chip strip always pinned: the two short-screen keyboard tests and the
//    "scrolls away instead of covering" contract test fail.
//  - chip strip never pinned: the pinned-chip filtering test fails.
