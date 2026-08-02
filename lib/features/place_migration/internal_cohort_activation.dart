/// PART 1 Phase 1.14F-R — pengaktifan kohort dalaman (owner-only, debug-only).
///
/// Root cause fasa 1.14E/1.14F: keupayaan kanonikal + penyesuai dibina tetapi
/// TIDAK PERNAH diaktifkan pada masa runtime berdasarkan pengguna yang log masuk,
/// dan tidak disambung kepada Firebase Auth UID/claims. Modul ini membetulkannya
/// dengan pengaktifan TERKECIL yang selamat:
///   - hanya binaan DEBUG/dalaman,
///   - hanya UID owner yang diluluskan ATAU custom claims admin/owner,
///   - awam/global kekal legacyOnly (bukan owner → reset selamat),
///   - emergencyLegacyOverride masih menang,
///   - tiada suis awam, tiada medan admin boleh-edit-klien.
library;

import 'place_migration_flags.dart';

/// UID owner/penguji dalaman yang DILULUSKAN (i.hachiman12@gmail.com).
const Set<String> kApprovedInternalCohortUids = {
  'blp6g37BUVPFLsDrSGuVqHrne153',
};

/// Keputusan kohort terkini (untuk panel diagnostik debug-only). Null sebelum
/// sebarang penilaian. Ditetapkan oleh laluan bootstrap auth.
InternalCohortDecision? lastInternalCohortDecision;

class InternalCohortDecision {
  const InternalCohortDecision({
    required this.eligible,
    required this.reason,
    required this.uidMatch,
    required this.ownerClaimDetected,
    required this.isDebugBuild,
  });

  final bool eligible;
  final String reason;
  final bool uidMatch;
  final bool ownerClaimDetected;
  final bool isDebugBuild;
}

/// Penilaian TULEN (boleh diuji tanpa Firebase). Tidak mengubah apa-apa flag.
InternalCohortDecision evaluateInternalCohort({
  required String? uid,
  required Map<String, dynamic>? claims,
  required bool isDebugBuild,
}) {
  final uidMatch = uid != null && kApprovedInternalCohortUids.contains(uid);
  final adminClaim = claims != null && claims['admin'] == true;
  final ownerRole = claims != null && claims['role'] == 'owner';
  final ownerClaimDetected = adminClaim || ownerRole;

  if (!isDebugBuild) {
    return InternalCohortDecision(
      eligible: false,
      reason: 'release_build_public_stays_legacy_only',
      uidMatch: uidMatch,
      ownerClaimDetected: ownerClaimDetected,
      isDebugBuild: false,
    );
  }
  if (!uidMatch && !ownerClaimDetected) {
    return InternalCohortDecision(
      eligible: false,
      reason: 'not_owner_not_internal_cohort',
      uidMatch: uidMatch,
      ownerClaimDetected: ownerClaimDetected,
      isDebugBuild: true,
    );
  }
  return InternalCohortDecision(
    eligible: true,
    reason: uidMatch ? 'approved_owner_uid' : 'owner_admin_claim',
    uidMatch: uidMatch,
    ownerClaimDetected: ownerClaimDetected,
    isDebugBuild: true,
  );
}

/// Terapkan keputusan kepada flag global. Eligible → dayakan kanonikal kohort +
/// mod baca kohort + kad/butiran/pembetulan/diagnostik. Tidak eligible → reset
/// selamat (legacyOnly). emergencyLegacyOverride TIDAK disentuh di sini (ia
/// dikawal berasingan dan menang ke atas mod).
void applyInternalCohortActivation(InternalCohortDecision decision) {
  if (!decision.eligible) {
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
    return;
  }
  // Keupayaan kohort dalaman (bukan awam/global).
  PlaceMigrationFeatureFlags.enableInternalCohortCanonical();
  PlaceMigrationFeatureFlags.apply(
    readMode: PlaceReadMode.canonicalPreferredWithLegacyFallback,
    shadowRead: false,
    diagnostics: true,
    canonicalCards: true,
    canonicalDetail: true,
    correctionEnabled: true,
    releaseMode: false,
    migrationCompleted: true,
    adapterAvailable: true,
    trustedCallableAvailable: true,
  );
}
