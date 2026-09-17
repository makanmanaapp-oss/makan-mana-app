// B5 — impressions count only UNOBSTRUCTED pixels.
//
// The rule is unchanged: at least 50% of the banner visible, continuously, for
// one second, in the foreground, once per session. What these tests pin down is
// what "visible" means. A pixel does not count when it is:
//   - under a fixed header above the scroll view (clipped by the viewport),
//   - under a pinned header inside the scroll view,
//   - behind the keyboard or a system bar,
//   - outside a horizontal page view,
//   - inside an Offstage / fully transparent subtree,
//   - on a route covered by another route or a modal sheet.
//
// Every scenario is driven through REAL widgets, REAL scrolling and REAL layout
// at a fixed device geometry (360x800 @2x). Positions are reached by scrolling
// and then measured back from the render tree, never assumed. Dwell uses the
// test binding's fake clock through cmsImpressionClockProvider, so a one-second
// rule is exercised exactly rather than approximately.
//
// The 49% cases are chosen so that the banner is still >= 50% inside the
// WINDOW: a calculation that only compares against the window counts them, and
// that is precisely the defect being fixed.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/events/event_types.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/event_logger.dart';
import 'package:makan_mana/features/cms/cms_impression_tracker.dart';

const _bannerKey = Key('probe-banner');
const _bannerHeight = 200.0;
const _screen = Size(360, 800);

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

void _device(
  WidgetTester t, {
  double keyboard = 0,
  double statusBar = 0,
  double systemNav = 0,
}) {
  const ratio = 2.0;
  t.view.devicePixelRatio = ratio;
  t.view.physicalSize = _screen * ratio;
  final padding =
      FakeViewPadding(top: statusBar * ratio, bottom: systemNav * ratio);
  t.view.padding = padding;
  t.view.viewPadding = padding;
  t.view.viewInsets = FakeViewPadding(bottom: keyboard * ratio);
  addTearDown(t.view.reset);
}

/// The banner under test: a plain box of known height, so every fraction below
/// is exact arithmetic rather than a text-layout accident.
Widget _banner({Widget Function(Widget)? wrap}) {
  final box = CmsImpressionTracker(
    contentId: 'probe',
    placement: 'explore_top',
    sourceScreen: 'explore',
    child: const SizedBox(
      key: _bannerKey,
      height: _bannerHeight,
      width: double.infinity,
      child: ColoredBox(color: Color(0xFF1D4E89)),
    ),
  );
  return wrap == null ? box : wrap(box);
}

Widget _app(WidgetTester t, _Probe probe, Widget home) {
  return ProviderScope(
    overrides: [
      eventLoggerProvider
          .overrideWith((ref) => _RecordingLogger(ref, probe.events)),
      cmsImpressionClockProvider.overrideWithValue(
          () => t.binding.clock.now().millisecondsSinceEpoch),
    ],
    child: MaterialApp(debugShowCheckedModeBanner: false, home: home),
  );
}

/// Fixed header above a scroll view, optional pinned header inside it.
Widget _scrollScene(
  ScrollController controller, {
  double fixedHeader = 0,
  double? pinnedHeader,
  bool resizeForKeyboard = true,
  Widget Function(Widget)? wrapBanner,
}) {
  return Scaffold(
    resizeToAvoidBottomInset: resizeForKeyboard,
    body: Column(
      children: [
        if (fixedHeader > 0)
          SizedBox(
            height: fixedHeader,
            width: double.infinity,
            child: const ColoredBox(color: Color(0xFFFFFFFF)),
          ),
        Expanded(
          child: CustomScrollView(
            controller: controller,
            slivers: [
              const SliverToBoxAdapter(child: SizedBox(height: 300)),
              if (pinnedHeader != null)
                PinnedHeaderSliver(
                  child: SizedBox(
                    height: pinnedHeader,
                    width: double.infinity,
                    child: const ColoredBox(color: Color(0xFFFAFAFA)),
                  ),
                ),
              // Starts well below the fold, so nothing is observed before the
              // test scrolls it into position.
              const SliverToBoxAdapter(child: SizedBox(height: 1200)),
              SliverToBoxAdapter(child: _banner(wrap: wrapBanner)),
              const SliverToBoxAdapter(child: SizedBox(height: 3000)),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Scrolls until the banner's top edge sits exactly at [globalTop].
Future<void> _placeBannerTop(
    WidgetTester t, ScrollController c, double globalTop) async {
  for (var i = 0; i < 4; i++) {
    final current =
        t.getTopLeft(find.byKey(_bannerKey, skipOffstage: false)).dy;
    if ((current - globalTop).abs() < 0.001) return;
    c.jumpTo(c.offset + (current - globalTop));
    await t.pump();
  }
  expect(t.getTopLeft(find.byKey(_bannerKey, skipOffstage: false)).dy,
      moreOrLessEquals(globalTop, epsilon: 0.001));
}

Future<void> _hold(WidgetTester t, int ms) async {
  for (var elapsed = 0; elapsed < ms; elapsed += 50) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  group('fixed header above the scroll view (Explore title/search)', () {
    // Viewport is y 100..800. A 200 px banner with its top at y 0 shows its
    // lower 100 px below the header: exactly 50%.
    testWidgets('exactly 50% unobstructed for 1s -> one impression', (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 0);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets('49% unobstructed but 99% inside the window -> zero',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, -2); // 198 px on screen, 98 px unobstructed
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });

    testWidgets(
        'fully visible banner is still counted (no fail-closed '
        'undercount)', (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 300);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });
  });

  group('pinned header inside the scroll view (category chips / tab bar)', () {
    // The 60 px header pins at y 0..60 once scrolled past. A banner whose top
    // is at y -40 spans -40..160; the unpinned part is 60..160 = 50%.
    testWidgets('exactly 50% below the pinned header -> one impression',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, pinnedHeader: 60)));
      await _placeBannerTop(t, c, -40);
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets('49% below the pinned header (79% in the window) -> zero',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, pinnedHeader: 60)));
      await _placeBannerTop(t, c, -42);
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });
  });

  group('keyboard and system bars', () {
    testWidgets(
        'keyboard over a non-resizing screen: 50% above it counts, 49% '
        'does not', (t) async {
      _device(t, keyboard: 300); // screen usable to y 500
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(
          _app(t, probe, _scrollScene(c, resizeForKeyboard: false)));

      await _placeBannerTop(t, c, 402); // 98 px above the keyboard
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: '49% above the keyboard');

      await _placeBannerTop(t, c, 400); // 100 px above the keyboard
      await _hold(t, 1500);
      expect(probe.impressions, 1, reason: 'exactly 50% above the keyboard');
    });

    testWidgets(
        'keyboard on a resizing screen: the shrunken viewport is what '
        'counts', (t) async {
      _device(t, keyboard: 300);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 402); // viewport ends at 500
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });

    testWidgets('status bar and gesture bar are not viewing area', (t) async {
      _device(t, statusBar: 24, systemNav: 48);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c)));

      await _placeBannerTop(t, c, -78); // 98 px below the status bar
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: '49% below the status bar');

      await _placeBannerTop(t, c, 654); // 98 px above the gesture bar
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: '49% above the gesture bar');

      await _placeBannerTop(t, c, 652); // 100 px above the gesture bar
      await _hold(t, 1500);
      expect(probe.impressions, 1, reason: 'exactly 50% above the gesture bar');
    });
  });

  group('dwell, foreground and session rules are preserved', () {
    testWidgets('an obstructed moment restarts the dwell', (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));

      await _placeBannerTop(t, c, 0); // 50%
      await _hold(t, 750);
      await _placeBannerTop(t, c, -2); // 49% for at least one sample
      await _hold(t, 300);
      await _placeBannerTop(t, c, 0); // 50% again
      await _hold(t, 900);
      expect(probe.impressions, 0,
          reason: 'visible 1650 ms in total but never 1 s continuously');

      await _hold(t, 400);
      expect(probe.impressions, 1);
    });

    testWidgets('background interrupts the dwell and a hidden app never counts',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      addTearDown(() =>
          t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed));
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 300); // fully visible

      await _hold(t, 700);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: 'no impression while backgrounded');

      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _hold(t, 900);
      expect(probe.impressions, 0,
          reason: 'pre-background dwell was abandoned');
      await _hold(t, 400);
      expect(probe.impressions, 1);
    });

    testWidgets('counted once per session; the event contract is unchanged',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 300);
      await _hold(t, 1500);
      await _placeBannerTop(t, c, 900); // off screen
      await _hold(t, 500);
      await _placeBannerTop(t, c, 300); // back
      await _hold(t, 3000);

      final impressions =
          probe.events.where((e) => e.$1 == EventType.cmsImpression).toList();
      expect(impressions, hasLength(1));
      expect(impressions.single.$2, 'explore');
      expect(impressions.single.$3, {
        'contentId': 'probe',
        'placement': 'explore_top',
        'visible': true,
      });
    });
  });

  group('overlays painted on top (Stack / Scaffold siblings)', () {
    // A floating bar laid over the scroll view, as a snackbar, FAB or toolbar
    // is. It is not a clip: the scroll view underneath still reports the banner
    // as fully inside its viewport, so only sibling occlusion can exclude it.
    Widget overlayScene(ScrollController c) => Stack(
          children: [
            _scrollScene(c),
            const Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: 150,
              child: ColoredBox(color: Color(0xFF222222)),
            ),
          ],
        );

    testWidgets('49% below a floating overlay -> zero; 50% -> one', (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, overlayScene(c)));

      await _placeBannerTop(t, c, 48); // spans 48..248: 98 px below the overlay
      await _hold(t, 3000);
      expect(probe.impressions, 0);

      await _placeBannerTop(t, c, 50); // 100 px below the overlay
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });
  });

  group('other clipping and covering', () {
    testWidgets('horizontal page view: 50% of the page counts, 49.4% does not',
        (t) async {
      _device(t);
      final probe = _Probe();
      final pages = PageController();
      await t.pumpWidget(_app(
        t,
        probe,
        Scaffold(
          body: PageView(
            controller: pages,
            // Keeps the neighbouring page laid out, so geometry is really
            // measured rather than the banner simply not existing.
            allowImplicitScrolling: true,
            children: [
              const SizedBox.expand(),
              Align(alignment: Alignment.topCenter, child: _banner()),
            ],
          ),
        ),
      ));

      pages.jumpTo(178); // banner page shows 178 of 360 px
      await t.pump();
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: '49.4% of the page on screen');

      pages.jumpTo(180); // exactly half
      await t.pump();
      await _hold(t, 1500);
      expect(probe.impressions, 1);
    });

    testWidgets('Offstage and fully transparent banners are never seen',
        (t) async {
      for (final wrap in <Widget Function(Widget)>[
        (w) => Offstage(child: w),
        (w) => Opacity(opacity: 0, child: w),
      ]) {
        _device(t);
        final probe = _Probe();
        final c = ScrollController();
        await t.pumpWidget(_app(t, probe, _scrollScene(c, wrapBanner: wrap)));
        c.jumpTo(1200); // banner layout slot inside the viewport
        await t.pump();
        await _hold(t, 3000);
        expect(probe.impressions, 0);
        await t.pumpWidget(const SizedBox());
      }
    });

    testWidgets('a pushed page covering the banner stops the dwell', (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 300);
      await _hold(t, 500);

      final nav = t.state<NavigatorState>(find.byType(Navigator));
      nav.push(MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: SizedBox.expand())));
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });

    testWidgets('a modal bottom sheet over the banner stops the dwell',
        (t) async {
      _device(t);
      final probe = _Probe();
      final c = ScrollController();
      await t.pumpWidget(_app(t, probe, _scrollScene(c, fixedHeader: 100)));
      await _placeBannerTop(t, c, 300);
      await _hold(t, 500);

      showModalBottomSheet<void>(
        context: t.element(find.byKey(_bannerKey)),
        builder: (_) => const SizedBox(height: 600),
      );
      await _hold(t, 3000);
      expect(probe.impressions, 0);
    });
  });
}
