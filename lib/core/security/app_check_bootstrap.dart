/// PART 1 Phase 1.14B.2 — bootstrap Firebase App Check (klien).
///
/// Mengaktifkan App Check SELEPAS Firebase.initializeApp dan SEBELUM mana-mana
/// callable dipercayai boleh digunakan. Pemilihan provider ikut mod binaan:
///   - DEBUG   → AndroidProvider.debug (TIADA token tertanam; token didaftar di konsol)
///   - RELEASE/PROFILE → AndroidProvider.playIntegrity (TIDAK PERNAH debug)
///
/// Pelancaran adalah MONITORING: jika pengaktifan gagal, permulaan app legasi
/// TIDAK ranap — laluan legasi kekal selamat dan callable dipercayai kekal
/// DIMATIKAN sehingga App Check `ready`. TIADA penguatkuasaan diaktifkan di sini.
library;

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';

enum AppCheckInitializationState {
  notStarted,
  ready,
  monitoringUnavailable,
  unsupportedPlatform,
  failed,
}

enum AppCheckProviderKind { debug, playIntegrity, none }

@immutable
class AppCheckStatus {
  const AppCheckStatus({required this.state, required this.provider, this.reasonCode});

  final AppCheckInitializationState state;
  final AppCheckProviderKind provider;

  /// Kod selamat sahaja (cth. 'activation_failed') — TIDAK PERNAH teks exception.
  final String? reasonCode;

  bool get isReady => state == AppCheckInitializationState.ready;

  static const AppCheckStatus notStarted =
      AppCheckStatus(state: AppCheckInitializationState.notStarted, provider: AppCheckProviderKind.none);
}

/// Boleh disuntik dalam ujian supaya TIADA sambungan produksi diperlukan.
typedef AppCheckActivator = Future<void> Function(AppCheckProviderKind provider);

class FirebaseAppCheckBootstrap {
  FirebaseAppCheckBootstrap._();

  static AppCheckStatus _status = AppCheckStatus.notStarted;
  static AppCheckStatus get status => _status;

  /// Pilih provider (TULEN, boleh diuji). Release/profile Android → Play Integrity.
  static AppCheckProviderKind providerFor({required bool isDebug, required bool isAndroid}) {
    if (!isAndroid) return AppCheckProviderKind.none; // platform lain: no-op fasa ini
    return isDebug ? AppCheckProviderKind.debug : AppCheckProviderKind.playIntegrity;
  }

  /// Aktifkan App Check. IDEMPOTEN. Menggunakan [activator] disuntik dalam ujian.
  /// Melindungi permulaan legasi: kegagalan → monitoringUnavailable (bukan ranap).
  static Future<AppCheckStatus> activate({
    AppCheckActivator? activator,
    bool? isDebugOverride,
    bool? isAndroidOverride,
  }) async {
    if (_status.isReady) return _status; // idempoten — tidak aktif semula

    final isDebug = isDebugOverride ?? kDebugMode;
    final isAndroid = isAndroidOverride ?? (defaultTargetPlatform == TargetPlatform.android);
    final provider = providerFor(isDebug: isDebug, isAndroid: isAndroid);

    if (provider == AppCheckProviderKind.none) {
      _status = const AppCheckStatus(
        state: AppCheckInitializationState.unsupportedPlatform,
        provider: AppCheckProviderKind.none,
        reasonCode: 'unsupported_platform',
      );
      return _status;
    }

    try {
      final act = activator ?? _realActivate;
      await act(provider);
      _status = AppCheckStatus(state: AppCheckInitializationState.ready, provider: provider);
    } catch (_) {
      // JANGAN dedah teks exception. Pelancaran monitoring: app kekal berjalan.
      _status = AppCheckStatus(
        state: AppCheckInitializationState.monitoringUnavailable,
        provider: provider,
        reasonCode: 'activation_failed',
      );
    }
    return _status;
  }

  /// Token debug DEBUG-SAHAJA dibekalkan melalui --dart-define
  /// (`APP_CHECK_DEBUG_TOKEN`) — local untracked / secure env var. Kosong dalam
  /// release. TIDAK PERNAH tertanam dalam sumber, TIDAK PERNAH dilog. Bila kosong,
  /// SDK debug menjana token peranti sendiri (daftar di konsol seperti biasa).
  static const String _debugTokenFromEnv =
      String.fromEnvironment('APP_CHECK_DEBUG_TOKEN');

  static Future<void> _realActivate(AppCheckProviderKind provider) async {
    if (provider == AppCheckProviderKind.debug) {
      // Debug sahaja. Token dari secure env (--dart-define); null → auto-jana.
      final String? token =
          _debugTokenFromEnv.isNotEmpty ? _debugTokenFromEnv : null;
      await FirebaseAppCheck.instance.activate(
        providerAndroid: AndroidDebugProvider(debugToken: token),
      );
      return;
    }
    // Release/profile: Play Integrity SAHAJA — tiada token debug, tiada fallback.
    await FirebaseAppCheck.instance.activate(
      providerAndroid: const AndroidPlayIntegrityProvider(),
    );
  }

  @visibleForTesting
  static void resetForTests() {
    _status = AppCheckStatus.notStarted;
  }

  /// Diagnostik DEBUG SAHAJA — TIADA token/UID/maklumat sensitif.
  static Map<String, String>? debugDiagnostics() {
    if (!kDebugMode) return null;
    return {
      'provider': _status.provider.name,
      'state': _status.state.name,
      if (_status.reasonCode != null) 'reason': _status.reasonCode!,
    };
  }
}
