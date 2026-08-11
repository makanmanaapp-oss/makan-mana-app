import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/place_cards/place_card_flags.dart';
import 'package:makan_mana/features/place_migration/canonical_read_resolver.dart';
import 'package:makan_mana/features/place_migration/internal_cohort_activation.dart';
import 'package:makan_mana/features/place_migration/place_migration_flags.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';

const ownerUid = 'blp6g37BUVPFLsDrSGuVqHrne153';

void main() {
  tearDown(PlaceMigrationFeatureFlags.resetToSafeDefaults);

  group('evaluateInternalCohort', () {
    test('approved owner UID on debug build is eligible', () {
      final d = evaluateInternalCohort(uid: ownerUid, claims: null, isDebugBuild: true);
      expect(d.eligible, true);
      expect(d.uidMatch, true);
      expect(d.reason, 'approved_owner_uid');
    });

    test('owner admin claim on debug build is eligible', () {
      final d = evaluateInternalCohort(uid: 'someone', claims: {'admin': true}, isDebugBuild: true);
      expect(d.eligible, true);
      expect(d.ownerClaimDetected, true);
    });

    test('owner role claim on debug build is eligible', () {
      final d = evaluateInternalCohort(uid: 'x', claims: {'role': 'owner'}, isDebugBuild: true);
      expect(d.eligible, true);
    });

    test('release build is never eligible (public stays legacyOnly)', () {
      final d = evaluateInternalCohort(uid: ownerUid, claims: {'admin': true}, isDebugBuild: false);
      expect(d.eligible, false);
      expect(d.reason, 'release_build_public_stays_legacy_only');
    });

    test('non-owner, no claims is not eligible', () {
      final d = evaluateInternalCohort(uid: 'public-user', claims: {}, isDebugBuild: true);
      expect(d.eligible, false);
      expect(d.reason, 'not_owner_not_internal_cohort');
    });

    test('null uid is not eligible', () {
      final d = evaluateInternalCohort(uid: null, claims: null, isDebugBuild: true);
      expect(d.eligible, false);
    });
  });

  group('applyInternalCohortActivation', () {
    test('eligible → canonical cards/detail ON, read mode canonical-preferred', () {
      applyInternalCohortActivation(evaluateInternalCohort(uid: ownerUid, claims: null, isDebugBuild: true));
      expect(PlaceMigrationFeatureFlags.productionCanonicalReadAllowed, true);
      expect(PlaceMigrationFeatureFlags.canonicalAdapterAvailable, true);
      expect(PlaceCardFlags.canonicalCardsEnabled, true);
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, true);
      expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode, PlaceReadMode.canonicalPreferredWithLegacyFallback);
    });

    test('not eligible → safe defaults (legacyOnly, canonical OFF)', () {
      // first turn on, then a non-eligible decision must reset
      applyInternalCohortActivation(evaluateInternalCohort(uid: ownerUid, claims: null, isDebugBuild: true));
      applyInternalCohortActivation(evaluateInternalCohort(uid: 'public', claims: {}, isDebugBuild: true));
      expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode, PlaceReadMode.legacyOnly);
      expect(PlaceCardFlags.canonicalCardsEnabled, false);
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, false);
      expect(PlaceMigrationFeatureFlags.productionCanonicalReadAllowed, false);
    });

    test('release build → safe defaults', () {
      applyInternalCohortActivation(evaluateInternalCohort(uid: ownerUid, claims: {'admin': true}, isDebugBuild: false));
      expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode, PlaceReadMode.legacyOnly);
      expect(PlaceCardFlags.canonicalCardsEnabled, false);
    });
  });

  group('resolveCanonicalSource', () {
    CanonicalSourceDecision res({
      bool cohort = true,
      bool flags = true,
      bool override = false,
      bool enriched = true,
    }) =>
        resolveCanonicalSource(
          cohortActive: cohort,
          canonicalCardsOrDetailEnabled: flags,
          emergencyLegacyOverride: override,
          placeIsEnriched: enriched,
        );

    test('cohort + enriched → canonical', () {
      expect(res().source, CardReadSource.canonical);
      expect(res().reason, 'cohort_canonical_enriched');
    });
    test('non-migrated (not enriched) → legacy', () {
      expect(res(enriched: false).source, CardReadSource.legacy);
      expect(res(enriched: false).reason, 'place_not_migrated_legacy_fallback');
    });
    test('non-cohort → legacy', () {
      expect(res(cohort: false).source, CardReadSource.legacy);
      expect(res(cohort: false).reason, 'not_internal_cohort');
    });
    test('emergency override → legacy (wins)', () {
      expect(res(override: true).source, CardReadSource.legacy);
      expect(res(override: true).reason, 'emergency_legacy_override');
    });
    test('flags off → legacy', () {
      expect(res(flags: false).source, CardReadSource.legacy);
    });
  });

  group('placeIsCanonicalEnriched', () {
    test('marker + coords → true', () {
      expect(
        placeIsCanonicalEnriched({
          'locationSource': 'google_places_details',
          'location': {'latitude': 3.1, 'longitude': 101.7},
        }),
        true,
      );
    });
    test('no marker → false', () {
      expect(placeIsCanonicalEnriched({'location': {'latitude': 3.1, 'longitude': 101.7}}), false);
    });
    test('marker but no coords → false', () {
      expect(placeIsCanonicalEnriched({'locationSource': 'google_places_details'}), false);
    });
    test('null → false', () {
      expect(placeIsCanonicalEnriched(null), false);
    });
  });
}
