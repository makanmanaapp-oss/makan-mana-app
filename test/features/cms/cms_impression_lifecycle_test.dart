// B5 DEF-1 — a banner is not "seen" just because the app is not PAUSED.
//
// Found on a physical device: Android raises the notification-permission dialog
// over Home while the CMS content is still loading. A permission dialog is a
// TRANSLUCENT activity, so FlutterActivity.onPause fires (-> AppLifecycleState
// .inactive) but onStop does not (-> never `paused`). The tracker seeded
// `_foregrounded` from `lifecycleState != paused`, so a tracker MOUNTED during
// that window started out believing it was foregrounded, and because
// didChangeAppLifecycleState only fires on a CHANGE nothing ever corrected it.
// A banner completely behind the dialog was counted.
//
// These cases pin the two halves of the rule:
//   - a tracker that mounts while the app is not `resumed` must not count;
//   - once the app really is resumed, a fresh qualifying interval must count
//     exactly once (the fix must not turn into an undercount).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/events/event_types.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/event_logger.dart';
import 'package:makan_mana/features/cms/cms_impression_tracker.dart';

const _screen = Size(360, 800);

class _RecordingLogger extends EventLogger {
  _RecordingLogger(super.ref, this.events);
  final List<String> events;

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
    events.add(eventType);
  }
}

class _Probe {
  final events = <String>[];
  int get impressions =>
      events.where((e) => e == EventType.cmsImpression).length;
}

void _device(WidgetTester t) {
  const ratio = 2.0;
  t.view.devicePixelRatio = ratio;
  t.view.physicalSize = _screen * ratio;
  addTearDown(t.view.reset);
}

/// The banner fills the top half of the screen, so it is unambiguously past the
/// 50% threshold the moment it is laid out. Nothing here is about geometry.
Widget _app(WidgetTester t, _Probe probe) {
  return ProviderScope(
    overrides: [
      eventLoggerProvider
          .overrideWith((ref) => _RecordingLogger(ref, probe.events)),
      cmsImpressionClockProvider.overrideWithValue(
          () => t.binding.clock.now().millisecondsSinceEpoch),
    ],
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: CmsImpressionTracker(
          contentId: 'def1-probe',
          placement: 'home_top',
          sourceScreen: 'home',
          child: const SizedBox(
            height: 400,
            width: double.infinity,
            child: ColoredBox(color: Color(0xFF1D4E89)),
          ),
        ),
      ),
    ),
  );
}

/// Advance the fake clock in sampling-sized steps so the tracker's periodic
/// timer actually fires, exactly as the existing visibility suite does.
Future<void> _hold(WidgetTester t, int ms) async {
  var left = ms;
  while (left > 0) {
    final step = left < 100 ? left : 100;
    await t.pump(Duration(milliseconds: step));
    left -= step;
  }
}

void main() {
  group('DEF-1 — lifecycle at mount time', () {
    tearDown(() {
      // Leave the binding resumed for whatever runs next.
      WidgetsBinding.instance
          .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    });

    testWidgets('the binding reports a concrete state once driven', (t) async {
      // Guards the assumption the other cases rest on: driving the binding
      // really does change what initState() would read.
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      expect(WidgetsBinding.instance.lifecycleState, AppLifecycleState.inactive);
    });

    testWidgets('mounted while a system dialog holds the app INACTIVE: 0',
        (t) async {
      _device(t);
      final probe = _Probe();

      // The dialog is already up before the banner exists - the device case.
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await t.pumpWidget(_app(t, probe));

      await _hold(t, 5000);
      expect(probe.impressions, 0,
          reason: 'the app was never resumed, so nothing was seen');
    });

    testWidgets('mounted while HIDDEN or PAUSED: 0', (t) async {
      for (final state in [AppLifecycleState.hidden, AppLifecycleState.paused]) {
        _device(t);
        final probe = _Probe();
        t.binding.handleAppLifecycleStateChanged(state);
        await t.pumpWidget(_app(t, probe));
        await _hold(t, 5000);
        expect(probe.impressions, 0, reason: 'mounted while $state');
      }
    });

    testWidgets('dialog dismissed: a fresh qualifying interval counts once',
        (t) async {
      _device(t);
      final probe = _Probe();

      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await t.pumpWidget(_app(t, probe));
      await _hold(t, 5000);
      expect(probe.impressions, 0);

      // The person dismisses the dialog.
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _hold(t, 900);
      expect(probe.impressions, 0,
          reason: 'the interrupted time must not be carried over');

      await _hold(t, 400);
      expect(probe.impressions, 1, reason: 'one full second in the foreground');

      await _hold(t, 5000);
      expect(probe.impressions, 1, reason: 'still once per session');
    });

    testWidgets('mounted while RESUMED still counts exactly once', (t) async {
      _device(t);
      final probe = _Probe();
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpWidget(_app(t, probe));

      await _hold(t, 900);
      expect(probe.impressions, 0, reason: 'not a full second yet');
      await _hold(t, 400);
      expect(probe.impressions, 1);
    });

    testWidgets('interruption after mount abandons the dwell', (t) async {
      _device(t);
      final probe = _Probe();
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpWidget(_app(t, probe));

      await _hold(t, 700);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await _hold(t, 3000);
      expect(probe.impressions, 0, reason: 'inactive is not foreground');

      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _hold(t, 900);
      expect(probe.impressions, 0, reason: 'the pre-dialog 700 ms is gone');
      await _hold(t, 400);
      expect(probe.impressions, 1);
    });
  });
}
