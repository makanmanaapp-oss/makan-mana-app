import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/cms/cms_impression_policy.dart';

/// B5 — the impression rule.
///
/// The whole point of extracting this from the widget is that scroll jitter,
/// rebuilds, backgrounding and a clock that jumps can be reproduced exactly
/// here, where a widget test could only approximate them.
void main() {
  const placement = 'home_top';
  const contentId = 'banner-1';
  const other = 'banner-2';

  late CmsImpressionPolicy policy;
  setUp(() => policy = CmsImpressionPolicy());

  bool observe(double fraction, int nowMs,
      {String id = contentId, bool foreground = true, String place = placement}) {
    return policy.observe(
      placement: place,
      contentId: id,
      visibleFraction: fraction,
      foregrounded: foreground,
      nowMs: nowMs,
    );
  }

  group('what is not an impression', () {
    test('a banner that is never visible is never counted', () {
      for (var t = 0; t < 10000; t += 250) {
        expect(observe(0.0, t), isFalse);
      }
      expect(policy.hasCounted(placement, contentId), isFalse);
    });

    test('a banner just below the threshold is never counted', () {
      for (var t = 0; t < 10000; t += 250) {
        expect(observe(0.49, t), isFalse);
      }
      expect(policy.hasCounted(placement, contentId), isFalse);
    });

    test('being fully visible for a single frame is not an impression', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(0.0, 16), isFalse, reason: 'flicked past');
      expect(policy.hasCounted(placement, contentId), isFalse);
    });

    test('dwell does not accumulate across an interruption', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 600), isFalse);
      expect(observe(0.0, 700), isFalse, reason: 'scrolled away at 700ms');
      // 600ms seen, then 600ms more: two half-glances are not one look.
      expect(observe(1.0, 800), isFalse);
      expect(observe(1.0, 1300), isFalse);
      expect(policy.hasCounted(placement, contentId), isFalse);
      // It only counts once a full second is earned in one stretch.
      expect(observe(1.0, 1801), isTrue);
    });

    test('a backgrounded app accrues no dwell however visible the banner', () {
      for (var t = 0; t < 10000; t += 250) {
        expect(observe(1.0, t, foreground: false), isFalse);
      }
      expect(policy.hasCounted(placement, contentId), isFalse);
    });

    test('backgrounding mid-dwell abandons the stretch', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 900), isFalse);
      policy.onBackgrounded();
      // Returning to a still-visible banner restarts the clock.
      expect(observe(1.0, 1000), isFalse);
      expect(observe(1.0, 1900), isFalse);
      expect(observe(1.0, 2001), isTrue);
    });
  });

  group('what is', () {
    test('half visible for one continuous second counts exactly once', () {
      expect(observe(0.5, 0), isFalse);
      expect(observe(0.5, 500), isFalse);
      expect(observe(0.5, 1000), isTrue);
      expect(policy.hasCounted(placement, contentId), isTrue);
    });

    test('the threshold is inclusive at both ends', () {
      expect(observe(0.5, 0), isFalse);
      expect(observe(0.5, 1000), isTrue, reason: 'exactly 0.5 for exactly 1000ms');
    });

    test('it never fires twice, however long the banner stays visible', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      for (var t = 1250; t < 60000; t += 250) {
        expect(observe(1.0, t), isFalse, reason: 'already counted at $t');
      }
    });
  });

  group('duplicates that used to be easy to create', () {
    test('scrolling away and back does not count again', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      expect(observe(0.0, 2000), isFalse);
      expect(observe(1.0, 3000), isFalse);
      expect(observe(1.0, 5000), isFalse);
    });

    test('a rebuild or refetch reuses the same key and cannot re-count', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      // A fresh widget observing the same content, as after a provider refresh.
      expect(policy.hasCounted(placement, contentId), isTrue);
      expect(observe(1.0, 1250), isFalse);
      expect(observe(1.0, 2500), isFalse);
    });

    test('clearing pending dwell does not clear what was already counted', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      policy.clearPending();
      expect(observe(1.0, 2000), isFalse);
      expect(observe(1.0, 3001), isFalse);
    });
  });

  group('identity', () {
    test('two banners in the same placement are counted separately', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 0, id: other), isFalse);
      expect(observe(1.0, 1000), isTrue);
      expect(observe(1.0, 1000, id: other), isTrue);
      expect(policy.hasCounted(placement, contentId), isTrue);
      expect(policy.hasCounted(placement, other), isTrue);
    });

    test('the same banner in two placements is two impressions', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 0, place: 'home_mid'), isFalse);
      expect(observe(1.0, 1000), isTrue);
      expect(observe(1.0, 1000, place: 'home_mid'), isTrue);
    });

    test('one banner completing does not count the other', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      expect(policy.hasCounted(placement, other), isFalse);
    });

    test('an empty identity is refused rather than counted as ""', () {
      expect(observe(1.0, 0, id: ''), isFalse);
      expect(observe(1.0, 5000, id: ''), isFalse);
      expect(observe(1.0, 0, place: ''), isFalse);
      expect(observe(1.0, 5000, place: ''), isFalse);
    });
  });

  group('hostile clocks and values', () {
    test('a clock that jumps backwards restarts the stretch', () {
      expect(observe(1.0, 10000), isFalse);
      expect(observe(1.0, 500), isFalse, reason: 'NTP correction');
      expect(observe(1.0, 900), isFalse);
      expect(observe(1.0, 1500), isTrue);
    });

    test('a NaN or infinite fraction is not visible', () {
      expect(observe(double.nan, 0), isFalse);
      expect(observe(double.nan, 5000), isFalse);
      expect(observe(double.infinity, 0), isFalse);
      expect(policy.hasCounted(placement, contentId), isFalse);
    });

    test('a new session starts the counting window again', () {
      expect(observe(1.0, 0), isFalse);
      expect(observe(1.0, 1000), isTrue);
      policy.resetForNewSession();
      expect(policy.hasCounted(placement, contentId), isFalse);
      expect(observe(1.0, 2000), isFalse);
      expect(observe(1.0, 3000), isTrue);
    });
  });

  group('visible fraction geometry', () {
    double f({
      required double top,
      required double height,
      double viewportTop = 0,
      double viewportHeight = 800,
    }) =>
        visibleFractionOf(
          childTop: top,
          childHeight: height,
          viewportTop: viewportTop,
          viewportHeight: viewportHeight,
        );

    test('fully on screen is 1', () => expect(f(top: 100, height: 200), 1.0));

    test('entirely below the fold is 0', () {
      expect(f(top: 900, height: 200), 0.0);
    });

    test('entirely above the top is 0', () {
      expect(f(top: -300, height: 200), 0.0);
    });

    test('half off the bottom is 0.5', () {
      expect(f(top: 700, height: 200), closeTo(0.5, 1e-9));
    });

    test('half off the top is 0.5', () {
      expect(f(top: -100, height: 200), closeTo(0.5, 1e-9));
    });

    test('exactly touching the edge is 0, not a sliver', () {
      expect(f(top: 800, height: 200), 0.0);
      expect(f(top: -200, height: 200), 0.0);
    });

    test('a card taller than the screen reports the visible share', () {
      expect(f(top: 0, height: 1600), closeTo(0.5, 1e-9));
    });

    test('a degenerate box is 0, never NaN', () {
      expect(f(top: 0, height: 0), 0.0);
      expect(f(top: 0, height: -10), 0.0);
      expect(f(top: 0, height: 200, viewportHeight: 0), 0.0);
      expect(f(top: double.nan, height: 200), 0.0);
      expect(f(top: 0, height: double.infinity), 0.0);
    });

    test('the result never exceeds 1', () {
      expect(f(top: 10, height: 100, viewportHeight: 10000), 1.0);
    });
  });
}
