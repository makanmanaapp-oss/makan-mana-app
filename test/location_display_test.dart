import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/location/location_display.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';

/// Phase 2.8A — kejujuran paparan lokasi (fallback KL didedah).
void main() {
  group('LocationDisplay.resolve', () {
    test('1. device coords -> deviceOrStored, "yourArea" allowed, no notice', () {
      final k = LocationDisplay.resolve(lat: 3.15, manualName: null);
      expect(k, LocationDisplayKind.deviceOrStored);
      expect(LocationDisplay.labelKey(k), 'yourArea');
      expect(LocationDisplay.showsFallbackNotice(k), false);
      expect(LocationDisplay.allowsCurrentLocationClaim(k), true);
    });

    test('3. permission denied (no coords, no manual) -> defaultFallback, discloses', () {
      final k = LocationDisplay.resolve(lat: null, manualName: null);
      expect(k, LocationDisplayKind.defaultFallback);
      // MUST NOT claim current location.
      expect(LocationDisplay.labelKey(k), isNot('yourArea'));
      expect(LocationDisplay.labelKey(k), 'locDefaultArea');
      expect(LocationDisplay.showsFallbackNotice(k), true);
      expect(LocationDisplay.allowsCurrentLocationClaim(k), false);
    });

    test('4. service disabled (same as denied: null coords) -> fallback + notice', () {
      final k = LocationDisplay.resolve(lat: null, manualName: null);
      expect(k, LocationDisplayKind.defaultFallback);
      expect(LocationDisplay.showsFallbackNotice(k), true);
    });

    test('5. manual location -> manual (name represented by caller)', () {
      expect(LocationDisplay.resolve(lat: null, manualName: 'Bangsar'),
          LocationDisplayKind.manual);
      // manual wins even if stale coords exist.
      expect(LocationDisplay.resolve(lat: 3.15, manualName: 'Bangsar'),
          LocationDisplayKind.manual);
      // empty/whitespace manual name ignored -> fallback.
      expect(LocationDisplay.resolve(lat: null, manualName: '   '),
          LocationDisplayKind.defaultFallback);
    });

    test('6. recovery: null->fallback notice, then coords->no notice', () {
      expect(
          LocationDisplay.showsFallbackNotice(
              LocationDisplay.resolve(lat: null)),
          true);
      expect(
          LocationDisplay.showsFallbackNotice(
              LocationDisplay.resolve(lat: 3.15)),
          false);
    });

    test('7. account switch: resolve is pure — A fallback cannot leak to B device', () {
      final a = LocationDisplay.resolve(lat: null, manualName: null); // acct A
      expect(a, LocationDisplayKind.defaultFallback);
      final b = LocationDisplay.resolve(lat: 1.29, manualName: null); // acct B fresh coords
      expect(b, LocationDisplayKind.deviceOrStored);
      // and B manual does not inherit A's fallback
      final b2 = LocationDisplay.resolve(lat: null, manualName: 'KLCC');
      expect(b2, LocationDisplayKind.manual);
    });
  });

  group('Localization — 4 languages', () {
    const requiredKeys = [
      'locDefaultArea',
      'locFallbackNotice',
      'chooseArea',
      'enableLocation',
      'near',
      'yourArea',
    ];
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      test('9. $lang has all required location keys, non-empty', () {
        final m = AppLocalizations.valuesForTesting(Locale(lang));
        for (final k in requiredKeys) {
          expect(m[k], isNotNull, reason: '$lang missing "$k"');
          expect(m[k]!.trim(), isNotEmpty, reason: '$lang empty "$k"');
        }
      });
    }

    test('English fallback strings are honest (no "around your location"; names KL)', () {
      final en = AppLocalizations.valuesForTesting(const Locale('en'));
      expect(en['locDefaultArea']!.toLowerCase(),
          isNot(contains('around your location')));
      expect(en['locFallbackNotice']!.toLowerCase(), contains('kuala lumpur'));
      // the honest label must differ from the current-location label.
      expect(en['locDefaultArea'], isNot(en['yourArea']));
    });
  });
}
