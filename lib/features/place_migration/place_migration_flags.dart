/// PART 1 Phase 1.12 Part N — penyelaras rollout feature flag.
///
/// Satu tempat yang mengetahui SEMUA flag canonical dan kombinasi mana yang
/// tidak selamat. Flag individu (kad, butiran, pembetulan) masih hidup dalam
/// modulnya sendiri; penyelaras ini menyatukannya supaya tiada gabungan yang
/// mustahil boleh diaktifkan secara tidak sengaja.
///
/// Lalai produksi adalah SELAMAT sepenuhnya:
/// - mod bacaan = legacy_only
/// - bacaan bayangan = mati
/// - diagnostik = mati
/// - semua flag canonical = mati
library;

import 'package:flutter/foundation.dart';

import '../place_cards/place_card_flags.dart';
import '../place_corrections/place_correction_flags.dart';
import '../restaurant/canonical/restaurant_detail_flags.dart';

/// Mod bacaan tempat. Produksi kekal pada [legacyOnly].
enum PlaceReadMode {
  /// Hanya laluan legasi dibaca. Lalai produksi.
  legacyOnly,

  /// Legasi kekal yang dilihat pengguna; canonical dibaca selari untuk
  /// perbandingan sahaja (debug/ujian).
  shadowRead,

  /// Canonical diutamakan tetapi SENTIASA jatuh balik ke legasi apabila gagal.
  canonicalPreferredWithLegacyFallback,

  /// Canonical sahaja — UJIAN SAHAJA. Tiada jatuh balik, jadi kegagalan
  /// kelihatan. Tidak pernah dibenarkan dalam binaan keluaran.
  canonicalOnlyTest,
}

/// Sebab satu gabungan flag ditolak.
enum FlagRejectionReason {
  canonicalOnlyInRelease,
  shadowReadInRelease,
  diagnosticsInRelease,
  canonicalReadWithoutMigrationMarker,
  canonicalCardsWithoutAdapter,
  canonicalDetailWithCanonicalOnlyStub,
  correctionSubmitWithoutTrustedCallable,
}

/// Hasil pengesahan gabungan flag.
class FlagValidationResult {
  const FlagValidationResult({required this.ok, this.reasons = const []});

  final bool ok;
  final List<FlagRejectionReason> reasons;

  static const FlagValidationResult valid = FlagValidationResult(ok: true);
}

/// Penyelaras rollout tunggal.
class PlaceMigrationFeatureFlags {
  PlaceMigrationFeatureFlags._();

  // --- Keadaan (semua lalai selamat) ---------------------------------------

  static PlaceReadMode _readMode = PlaceReadMode.legacyOnly;
  static bool _shadowReadEnabled = false;
  static bool _migrationDiagnosticsEnabled = false;

  /// Penanda penyiapan migrasi. TIADA cara untuk menetapkannya benar dalam
  /// fasa ini — ia wujud supaya pagar keselamatan boleh merujuknya.
  static bool _migrationCompletedForEnvironment = false;

  /// Adakah penyesuai bacaan canonical sebenar tersedia? Dalam fasa ini
  /// hanya stub yang wujud, jadi ini kekal false dalam produksi.
  static bool _canonicalAdapterAvailable = false;

  /// Adakah callable pembetulan dipercayai telah digunakan? Belum lagi.
  static bool _trustedCorrectionCallableAvailable = false;

  /// Phase 1.14E — kebenaran baca kanonikal PRODUKSI (kohort dalaman sahaja,
  /// TIDAK PERNAH awam/global dalam fasa ini). Lalai selamat OFF.
  static bool _productionCanonicalReadAllowed = false;

  /// Phase 1.14E — override kecemasan: paksa legasi serta-merta, menang ke atas
  /// setiap mod/keupayaan lain. Lalai OFF.
  static bool _emergencyLegacyOverride = false;

  // --- Pembaca -------------------------------------------------------------

  static PlaceReadMode get canonicalPlaceReadMode => _readMode;
  static bool get shadowReadEnabled => _shadowReadEnabled;
  static bool get migrationDiagnosticsEnabled => _migrationDiagnosticsEnabled;
  static bool get migrationCompletedForEnvironment =>
      _migrationCompletedForEnvironment;
  static bool get canonicalAdapterAvailable => _canonicalAdapterAvailable;
  static bool get trustedCorrectionCallableAvailable =>
      _trustedCorrectionCallableAvailable;
  static bool get productionCanonicalReadAllowed =>
      _productionCanonicalReadAllowed;
  static bool get emergencyLegacyOverride => _emergencyLegacyOverride;

  /// Flag canonical yang diselaras (didelegasikan kepada pemilik sebenarnya).
  static bool get canonicalCardsEnabled => PlaceCardFlags.canonicalCardsEnabled;
  static bool get canonicalRestaurantDetailEnabled =>
      RestaurantDetailFlags.canonicalRestaurantDetailEnabled;
  static bool get placeCorrectionEnabled =>
      PlaceCorrectionFlags.placeCorrectionEnabled;

  // --- Tetapkan semula -----------------------------------------------------

  /// Kembalikan SEMUA flag kepada lalai produksi yang selamat.
  static void resetToSafeDefaults() {
    _readMode = PlaceReadMode.legacyOnly;
    _shadowReadEnabled = false;
    _migrationDiagnosticsEnabled = false;
    _migrationCompletedForEnvironment = false;
    _canonicalAdapterAvailable = false;
    _trustedCorrectionCallableAvailable = false;
    _productionCanonicalReadAllowed = false;
    _emergencyLegacyOverride = false;
    PlaceCardFlags.resetToSafeDefault();
    RestaurantDetailFlags.resetToSafeDefault();
    PlaceCorrectionFlags.resetToSafeDefault();
  }

  /// Phase 1.14E — dayakan baca kanonikal untuk kohort DALAMAN sahaja (bukan
  /// awam/global). Global kekal legacyOnly; hanya keupayaan + callable dihidupkan.
  static void enableInternalCohortCanonical() {
    _productionCanonicalReadAllowed = true;
    _canonicalAdapterAvailable = true;
    _trustedCorrectionCallableAvailable = true;
  }

  /// Phase 1.14E — override kecemasan (paksa legasi). Menang atas segalanya.
  static void setEmergencyLegacyOverride(bool on) {
    _emergencyLegacyOverride = on;
  }

  // --- Pengesahan ----------------------------------------------------------

  /// Sahkan satu gabungan yang dicadangkan TANPA menggunakannya.
  ///
  /// [releaseMode] disuntik supaya ujian boleh mengesahkan tingkah laku
  /// keluaran tanpa membina binaan keluaran.
  static FlagValidationResult validate({
    required PlaceReadMode readMode,
    required bool shadowRead,
    required bool diagnostics,
    required bool canonicalCards,
    required bool canonicalDetail,
    required bool correctionEnabled,
    bool? releaseMode,
    bool? migrationCompleted,
    bool? adapterAvailable,
    bool? trustedCallableAvailable,
  }) {
    final isRelease = releaseMode ?? kReleaseMode;
    final completed = migrationCompleted ?? _migrationCompletedForEnvironment;
    final adapter = adapterAvailable ?? _canonicalAdapterAvailable;
    final callable =
        trustedCallableAvailable ?? _trustedCorrectionCallableAvailable;
    final reasons = <FlagRejectionReason>[];

    // Mod canonical-sahaja adalah alat ujian. Ia tidak pernah dihantar.
    if (isRelease && readMode == PlaceReadMode.canonicalOnlyTest) {
      reasons.add(FlagRejectionReason.canonicalOnlyInRelease);
    }
    // Diagnostik bacaan bayangan tidak boleh berjalan dalam keluaran.
    if (isRelease && (shadowRead || readMode == PlaceReadMode.shadowRead)) {
      reasons.add(FlagRejectionReason.shadowReadInRelease);
    }
    if (isRelease && diagnostics) {
      reasons.add(FlagRejectionReason.diagnosticsInRelease);
    }
    // Bacaan canonical memerlukan migrasi yang telah disiapkan.
    final readsCanonical =
        readMode == PlaceReadMode.canonicalPreferredWithLegacyFallback ||
            readMode == PlaceReadMode.canonicalOnlyTest;
    if (readsCanonical && !completed) {
      reasons.add(FlagRejectionReason.canonicalReadWithoutMigrationMarker);
    }
    // Kad canonical memerlukan penyesuai bacaan yang berfungsi.
    if (canonicalCards && readsCanonical && !adapter) {
      reasons.add(FlagRejectionReason.canonicalCardsWithoutAdapter);
    }
    // Butiran canonical tidak boleh dipasangkan dengan stub canonical-sahaja.
    if (canonicalDetail && readMode == PlaceReadMode.canonicalOnlyTest && !adapter) {
      reasons.add(FlagRejectionReason.canonicalDetailWithCanonicalOnlyStub);
    }
    // Penghantaran pembetulan produksi memerlukan callable dipercayai.
    if (correctionEnabled && isRelease && !callable) {
      reasons.add(FlagRejectionReason.correctionSubmitWithoutTrustedCallable);
    }

    return reasons.isEmpty
        ? FlagValidationResult.valid
        : FlagValidationResult(ok: false, reasons: reasons);
  }

  /// Cuba gunakan gabungan. Mengembalikan hasil pengesahan; apabila tidak sah
  /// TIADA flag berubah — kegagalan tidak pernah meninggalkan keadaan separuh.
  static FlagValidationResult apply({
    required PlaceReadMode readMode,
    required bool shadowRead,
    required bool diagnostics,
    required bool canonicalCards,
    required bool canonicalDetail,
    required bool correctionEnabled,
    bool? releaseMode,
    bool? migrationCompleted,
    bool? adapterAvailable,
    bool? trustedCallableAvailable,
  }) {
    final result = validate(
      readMode: readMode,
      shadowRead: shadowRead,
      diagnostics: diagnostics,
      canonicalCards: canonicalCards,
      canonicalDetail: canonicalDetail,
      correctionEnabled: correctionEnabled,
      releaseMode: releaseMode,
      migrationCompleted: migrationCompleted,
      adapterAvailable: adapterAvailable,
      trustedCallableAvailable: trustedCallableAvailable,
    );
    if (!result.ok) return result;

    _readMode = readMode;
    _shadowReadEnabled = shadowRead;
    _migrationDiagnosticsEnabled = diagnostics;
    PlaceCardFlags.canonicalCardsEnabled = canonicalCards;
    RestaurantDetailFlags.canonicalRestaurantDetailEnabled = canonicalDetail;
    PlaceCorrectionFlags.placeCorrectionEnabled = correctionEnabled;
    return result;
  }

  /// Timpaan ujian sahaja bagi keupayaan persekitaran.
  @visibleForTesting
  static void setEnvironmentForTests({
    bool? migrationCompleted,
    bool? adapterAvailable,
    bool? trustedCallableAvailable,
  }) {
    if (migrationCompleted != null) {
      _migrationCompletedForEnvironment = migrationCompleted;
    }
    if (adapterAvailable != null) _canonicalAdapterAvailable = adapterAvailable;
    if (trustedCallableAvailable != null) {
      _trustedCorrectionCallableAvailable = trustedCallableAvailable;
    }
  }
}
