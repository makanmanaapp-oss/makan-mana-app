// B5 DEF-2 — the client half of the same rule as
// functions/src/domain/cms/__tests__/cmsCtaDestinationParse.test.ts.
//
// A destination that cannot be a URL must not render a CTA that looks live.
// Before the fix `https://[b5c` passed `isSafeCtaDestination` (it starts with
// "https://"), the CTA row rendered, and the tap was silently discarded by
// `Uri.tryParse` inside `_open` — no navigation, no event, no signal to anyone.
//
// The table below is deliberately identical to the server's, because the two
// diverge on exactly these inputs if the rule is only "it parses":
//   "https://"             Dart parses with an EMPTY host (JS throws)
//   "https://exa mple.com" Dart parses host "exa%20mple.com" (JS throws)
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/cms/cms_content.dart';

const _malformed = [
  'https://[b5c',
  'https://',
  'https://exa mple.com',
  'https:// makanmana.app',
  'https://[',
  'https://]',
];

const _externalOk = [
  'https://makanmana.app/promo',
  'https://makanmana.app:8443/x',
  'https://xn--n3h.example/x',
  'https://makanmana.app/x?a=1&b=2#frag',
];

const _internalOk = ['/explore', '/restaurant/canon-1', '/home', '/profile'];

void main() {
  group('DEF-2 — malformed destinations never look tappable', () {
    test('a malformed https destination is refused', () {
      for (final bad in _malformed) {
        expect(isSafeCtaDestination(bad), isFalse, reason: 'must refuse $bad');
      }
    });

    test('valid external destinations still pass', () {
      for (final good in _externalOk) {
        expect(isSafeCtaDestination(good), isTrue, reason: 'must accept $good');
      }
    });

    test('internal routes still pass', () {
      for (final good in _internalOk) {
        expect(isSafeCtaDestination(good), isTrue, reason: 'must accept $good');
      }
    });

    test('the earlier rules still fail closed', () {
      for (final bad in [
        'javascript:alert(1)',
        'java script:alert(1)',
        'JAVASCRIPT:alert(1)',
        'http://insecure.example',
        '/admin',
        '',
      ]) {
        expect(isSafeCtaDestination(bad), isFalse, reason: 'must refuse "$bad"');
      }
      expect(isSafeCtaDestination(null), isFalse);
    });

    test('a banner with a malformed destination exposes no CTA', () {
      final content = CmsContent.fromMap({
        'contentId': 'def2',
        'placement': 'home_mid',
        'title': 'B5C G2',
        'ctaLabel': 'Buka pautan',
        'ctaDestination': 'https://[b5c',
      });
      expect(content, isNotNull);
      expect(content!.hasCta, isFalse,
          reason: 'no CTA row, so nothing can be tapped into a dead end');
    });
  });
}
