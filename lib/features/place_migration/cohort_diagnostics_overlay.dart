/// PART 1 Phase 1.14F-R — panel diagnostik kohort (DEBUG-ONLY).
///
/// Menindih strip diagnostik kecil di atas skrin supaya penguji dalaman boleh
/// mengesahkan pengaktifan kohort + laluan baca pada peranti sebenar. TIDAK
/// PERNAH dipapar dalam binaan keluaran (dibalut dengan kDebugMode oleh pemanggil).
/// Tiada UID/token penuh — UID ditopeng.
library;

import 'package:flutter/material.dart';

import '../place_cards/place_card_flags.dart';
import '../restaurant/canonical/restaurant_detail_flags.dart';
import 'canonical_read_resolver.dart';
import 'internal_cohort_activation.dart';
import 'place_migration_flags.dart';

String _mask(String? uid) {
  if (uid == null || uid.isEmpty) return 'none';
  if (uid.length <= 8) return '****';
  return '${uid.substring(0, 4)}…${uid.substring(uid.length - 4)}';
}

/// Label mod baca berkesan untuk kohort.
String effectiveReadModeLabel() {
  if (PlaceMigrationFeatureFlags.emergencyLegacyOverride) {
    return 'emergencyLegacyOverride';
  }
  final mode = PlaceMigrationFeatureFlags.canonicalPlaceReadMode;
  if (mode == PlaceReadMode.legacyOnly) return 'legacyOnly';
  if (PlaceMigrationFeatureFlags.productionCanonicalReadAllowed) {
    return 'canonicalForInternalCohort';
  }
  return mode.name;
}

class CohortDiagnosticsOverlay extends StatelessWidget {
  const CohortDiagnosticsOverlay({
    super.key,
    required this.child,
    required this.uid,
    this.surfaceSourceLabel,
  });

  final Widget child;
  final String? uid;

  /// Label sumber untuk permukaan ini (cth. "detail: canonical"), pilihan.
  final String? surfaceSourceLabel;

  @override
  Widget build(BuildContext context) {
    final d = lastInternalCohortDecision;
    final cohortEligible = d?.eligible ?? false;
    final cardsOrDetail = PlaceCardFlags.canonicalCardsEnabled ||
        RestaurantDetailFlags.canonicalRestaurantDetailEnabled;
    final detailSource = resolveCanonicalSource(
      cohortActive: cohortEligible,
      canonicalCardsOrDetailEnabled: cardsOrDetail,
      emergencyLegacyOverride: PlaceMigrationFeatureFlags.emergencyLegacyOverride,
      // Skrin butiran menggunakan laluan pandangan kanonikal apabila flag ON;
      // untuk kohort yang aktif ini menandakan sumber kanonikal.
      placeIsEnriched: RestaurantDetailFlags.canonicalRestaurantDetailEnabled,
    );

    final lines = <String>[
      'uid ${_mask(uid)}  cohortEligible=$cohortEligible (${d?.reason ?? "n/a"})',
      'ownerClaim=${d?.ownerClaimDetected ?? false}  uidMatch=${d?.uidMatch ?? false}  debug=${d?.isDebugBuild ?? false}',
      'readMode=${effectiveReadModeLabel()}',
      'canonicalReadAllowed=${PlaceMigrationFeatureFlags.productionCanonicalReadAllowed} adapter=${PlaceMigrationFeatureFlags.canonicalAdapterAvailable}',
      'cards=${PlaceCardFlags.canonicalCardsEnabled} detail=${RestaurantDetailFlags.canonicalRestaurantDetailEnabled}',
      'source=${surfaceSourceLabel ?? detailSource.source.name} (${detailSource.reason})',
    ];

    return Stack(
      children: [
        child,
        Positioned(
          left: 6,
          right: 6,
          bottom: 6,
          child: IgnorePointer(
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: (detailSource.isCanonical ? Colors.teal : Colors.blueGrey)
                    .withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'CANONICAL COHORT DIAG\n${lines.join("\n")}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9.5,
                  height: 1.25,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
