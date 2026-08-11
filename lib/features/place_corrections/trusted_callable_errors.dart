/// PART 1 Phase 1.14B.2 — ralat callable dipercayai bertaip + pemetaan l10n.
///
/// Tiada teks exception Firebase mentah, ID projek, atau token didedah kepada
/// pengguna. Panduan cuba-semula jujur; pengguna TIDAK PERNAH diberitahu laporan
/// dihantar jika ia disekat.
library;

import 'trusted_callable_gate.dart';

enum TrustedCallableError {
  appCheckNotInitialized,
  appCheckTokenUnavailable,
  appCheckRejected,
  playIntegrityUnavailable,
  trustedCallableDisabled,
  unauthenticated,
  temporaryBackendFailure,
}

/// Kunci l10n selamat untuk setiap ralat (semua wujud 4 bahasa).
String l10nKeyForTrustedError(TrustedCallableError e) {
  switch (e) {
    case TrustedCallableError.appCheckNotInitialized:
      return 'appCheckErrNotReady';
    case TrustedCallableError.appCheckTokenUnavailable:
      return 'appCheckErrToken';
    case TrustedCallableError.appCheckRejected:
      return 'appCheckErrRejected';
    case TrustedCallableError.playIntegrityUnavailable:
      return 'appCheckErrPlayIntegrity';
    case TrustedCallableError.trustedCallableDisabled:
      return 'appCheckErrDisabled';
    case TrustedCallableError.unauthenticated:
      return 'correctionErrLogin';
    case TrustedCallableError.temporaryBackendFailure:
      return 'correctionErrUnavailable';
  }
}

/// Petakan sebab gerbang tertutup → ralat bertaip.
TrustedCallableError? errorForGateReason(AppCheckGateReason reason) {
  switch (reason) {
    case AppCheckGateReason.ok:
      return null;
    case AppCheckGateReason.trustedCallableDisabled:
      return TrustedCallableError.trustedCallableDisabled;
    case AppCheckGateReason.appCheckNotReady:
      return TrustedCallableError.appCheckNotInitialized;
    case AppCheckGateReason.unauthenticated:
      return TrustedCallableError.unauthenticated;
    case AppCheckGateReason.sampleData:
      // Data sample tidak boleh hantar langsung — dilayan sebagai dimatikan.
      return TrustedCallableError.trustedCallableDisabled;
  }
}
