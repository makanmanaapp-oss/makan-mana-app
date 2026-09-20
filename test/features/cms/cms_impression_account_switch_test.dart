// B5 DEF-3 — one person's "already counted" must not silence the next person.
//
// Found on a physical device: user A signed out and user B signed in WITHOUT
// the app process ending. `CmsImpressionPolicy` lives for the whole process and
// its counted set is keyed by (placement, contentId) only — never by identity —
// so every banner A had already seen stayed marked, and B recorded ZERO
// impressions for them until the app was killed and relaunched.
//
// The counting window is still "once per (placement, contentId) per session".
// What these cases pin down is whose session it is.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/cms/cms_impression_policy.dart';
import 'package:makan_mana/features/cms/cms_impression_tracker.dart';

/// Stands in for the signed-in account so a test can switch it.
final _uid = StateProvider<String>((_) => 'user-a');

ProviderContainer _container() {
  final c = ProviderContainer(overrides: [
    currentUidProvider.overrideWith((ref) => ref.watch(_uid)),
  ]);
  addTearDown(c.dispose);
  return c;
}

/// Drive one banner to a counted impression, exactly as the tracker would.
bool _count(CmsImpressionPolicy p, {int at = 0}) {
  p.observe(
      placement: 'home_top',
      contentId: 'B5C-A1',
      visibleFraction: 1,
      foregrounded: true,
      nowMs: at);
  return p.observe(
      placement: 'home_top',
      contentId: 'B5C-A1',
      visibleFraction: 1,
      foregrounded: true,
      nowMs: at + 1500);
}

void _switchTo(ProviderContainer c, String uid) {
  c.read(_uid.notifier).state = uid;
  // Force the dependent provider to re-evaluate, as a real auth emission would.
  c.read(currentUidProvider);
  c.read(cmsImpressionPolicyProvider);
}

void main() {
  group('DEF-3 — session dedupe belongs to one identity', () {
    test('a different account is NOT suppressed by the previous one', () {
      final c = _container();
      final asA = c.read(cmsImpressionPolicyProvider);
      expect(_count(asA), isTrue, reason: 'user A sees the banner');
      expect(asA.hasCounted('home_top', 'B5C-A1'), isTrue);

      _switchTo(c, 'user-b');

      final asB = c.read(cmsImpressionPolicyProvider);
      expect(asB.hasCounted('home_top', 'B5C-A1'), isFalse,
          reason: "user B has not seen this banner - A's mark must not apply");
      expect(_count(asB, at: 10000), isTrue,
          reason: 'user B records their own impression');
    });

    test('the same account is still deduplicated within the session', () {
      final c = _container();
      final p = c.read(cmsImpressionPolicyProvider);
      expect(_count(p), isTrue);
      expect(_count(p, at: 10000), isFalse, reason: 'once per session');

      // A redundant emission of the SAME uid must not hand out a clean slate.
      _switchTo(c, 'user-a');
      expect(c.read(cmsImpressionPolicyProvider).hasCounted('home_top', 'B5C-A1'),
          isTrue, reason: 'no identity change, so nothing resets');
    });

    test('signing out and back in as the SAME person does not re-count', () {
      final c = _container();
      final p = c.read(cmsImpressionPolicyProvider);
      expect(_count(p), isTrue);

      _switchTo(c, ''); // signed out
      _switchTo(c, 'user-a'); // same person returns

      expect(c.read(cmsImpressionPolicyProvider).hasCounted('home_top', 'B5C-A1'),
          isTrue,
          reason: 'an auth transition must not manufacture a duplicate for the '
              'same identity');
    });

    test('signing out and in as someone else does reset', () {
      final c = _container();
      expect(_count(c.read(cmsImpressionPolicyProvider)), isTrue);

      _switchTo(c, '');
      _switchTo(c, 'user-b');

      expect(c.read(cmsImpressionPolicyProvider).hasCounted('home_top', 'B5C-A1'),
          isFalse);
    });

    test('a pending, uncounted dwell does not survive an identity change', () {
      final c = _container();
      final asA = c.read(cmsImpressionPolicyProvider);
      // Start a stretch but never finish it.
      asA.observe(
          placement: 'home_top',
          contentId: 'B5C-A2',
          visibleFraction: 1,
          foregrounded: true,
          nowMs: 0);

      _switchTo(c, 'user-b');

      final asB = c.read(cmsImpressionPolicyProvider);
      // If A's half-finished stretch leaked, this single observation would
      // complete a 1 s dwell that user B never actually had.
      expect(
          asB.observe(
              placement: 'home_top',
              contentId: 'B5C-A2',
              visibleFraction: 1,
              foregrounded: true,
              nowMs: 1500),
          isFalse,
          reason: "user B's dwell must start from zero");
    });
  });
}
