/// PART 1 Phase 1.14B.2 — gerbang callable dipercayai (klien).
///
/// Callable pembetulan dipercayai HANYA boleh digunakan apabila SEMUA syarat
/// benar. Lalai KEKAL tertutup (`trustedCorrectionCallableAvailable=false`),
/// jadi laluan lalai sentiasa `LocalPlaceCorrectionRepository`.
library;

import '../../core/security/app_check_bootstrap.dart';
import '../place_migration/place_migration_flags.dart';

enum AppCheckGateReason {
  ok,
  trustedCallableDisabled,
  appCheckNotReady,
  unauthenticated,
  sampleData,
}

class TrustedCallableGate {
  const TrustedCallableGate._();

  /// true HANYA jika: flag callable dipercayai ON, App Check `ready`, pengguna
  /// disahkan, dan bukan data sample. Lalai = false (flag OFF).
  static bool canUseTrustedCallable({required bool authed, required bool isSample}) {
    return gateReason(authed: authed, isSample: isSample) == AppCheckGateReason.ok;
  }

  static AppCheckGateReason gateReason({required bool authed, required bool isSample}) {
    if (!PlaceMigrationFeatureFlags.trustedCorrectionCallableAvailable) {
      return AppCheckGateReason.trustedCallableDisabled;
    }
    if (!FirebaseAppCheckBootstrap.status.isReady) {
      return AppCheckGateReason.appCheckNotReady;
    }
    if (!authed) return AppCheckGateReason.unauthenticated;
    if (isSample) return AppCheckGateReason.sampleData;
    return AppCheckGateReason.ok;
  }
}
