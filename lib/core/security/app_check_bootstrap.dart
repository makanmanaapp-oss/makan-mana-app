/// PART 1 Phase 1.14B.2 — bootstrap Firebase App Check (klien).
///
/// Mengaktifkan App Check SELEPAS Firebase.initializeApp dan SEBELUM mana-mana
/// callable dipercayai boleh digunakan. Pemilihan provider ikut platform DAN
/// mod binaan:
///   - Android DEBUG   → AndroidDebugProvider (TIADA token tertanam)
///   - Android RELEASE → Play Integrity (TIDAK PERNAH debug)
///   - iOS DEBUG       → AppleDebugProvider (Simulator QA; App Attest tidak
///                       wujud pada Simulator)
///   - iOS RELEASE     → App Attest dengan sandaran DeviceCheck
///
/// WAVE 4A — sebelum ini `providerFor` memulangkan `none` untuk SETIAP platform
/// bukan-Android, jadi iOS tidak pernah mengaktifkan App Check walaupun kod
/// penyedia Apple sudah wujud dalam `_realActivate`: ia tidak boleh dicapai.
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

enum AppCheckProviderKind {
  /// Android: AndroidDebugProvider.
  debug,

  /// Android: Play Integrity (release/profile).
  playIntegrity,

  /// iOS: AppleDebugProvider — Simulator dan binaan debug SAHAJA.
  appleDebug,

  /// iOS: App Attest, jatuh ke DeviceCheck pada peranti lama.
  appleAttest,

  /// Platform tanpa pengesahan App Check (desktop, web dalam binaan ini).
  none,
}

/// true untuk penyedia yang TIDAK membuktikan integriti peranti.
bool isDebugAppCheckProvider(AppCheckProviderKind kind) =>
    kind == AppCheckProviderKind.debug || kind == AppCheckProviderKind.appleDebug;

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

  /// Pilih provider (TULEN, boleh diuji).
  ///
  /// Penyedia debug TIDAK PERNAH dipilih untuk binaan release pada mana-mana
  /// platform: ia akan menjadikan pengesahan peranti teater.
  static AppCheckProviderKind providerFor({
    required bool isDebug,
    required bool isAndroid,
    bool isIOS = false,
  }) {
    if (isAndroid) {
      return isDebug ? AppCheckProviderKind.debug : AppCheckProviderKind.playIntegrity;
    }
    if (isIOS) {
      // Simulator tidak boleh melakukan App Attest; binaan QA Simulator ialah
      // binaan debug, jadi ia mendapat penyedia debug. Binaan release pada
      // peranti fizikal mendapat App Attest.
      return isDebug ? AppCheckProviderKind.appleDebug : AppCheckProviderKind.appleAttest;
    }
    return AppCheckProviderKind.none;
  }

  /// Aktifkan App Check. IDEMPOTEN. Menggunakan [activator] disuntik dalam ujian.
  /// Melindungi permulaan legasi: kegagalan → monitoringUnavailable (bukan ranap).
  static Future<AppCheckStatus> activate({
    AppCheckActivator? activator,
    bool? isDebugOverride,
    bool? isAndroidOverride,
    bool? isIOSOverride,
  }) async {
    if (_status.isReady) return _status; // idempoten — tidak aktif semula

    final isDebug = isDebugOverride ?? kDebugMode;
    final isAndroid = isAndroidOverride ?? (defaultTargetPlatform == TargetPlatform.android);
    final isIOS = isIOSOverride ?? (defaultTargetPlatform == TargetPlatform.iOS);
    final provider =
        providerFor(isDebug: isDebug, isAndroid: isAndroid, isIOS: isIOS);

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
    if (provider == AppCheckProviderKind.appleDebug) {
      // iOS debug / Simulator SAHAJA. Token daripada env selamat; null →
      // SDK menjana token peranti untuk didaftar dalam konsol.
      final String? token =
          _debugTokenFromEnv.isNotEmpty ? _debugTokenFromEnv : null;
      await FirebaseAppCheck.instance.activate(
        providerApple: AppleDebugProvider(debugToken: token),
      );
      return;
    }
    if (provider == AppCheckProviderKind.appleAttest) {
      // Peranti fizikal, binaan release. App Attest memerlukan iOS 14+;
      // varian sandaran turun ke DeviceCheck pada peranti lama dan bukan
      // gagal tanpa perlindungan.
      await FirebaseAppCheck.instance.activate(
        providerApple: const AppleAppAttestWithDeviceCheckFallbackProvider(),
      );
      return;
    }
    if (provider == AppCheckProviderKind.debug) {
      // Debug sahaja. Token dari secure env (--dart-define); null → auto-jana.
      final String? token =
          _debugTokenFromEnv.isNotEmpty ? _debugTokenFromEnv : null;
      await FirebaseAppCheck.instance.activate(
        providerAndroid: AndroidDebugProvider(debugToken: token),
        // iOS: penyedia debug setara. Tanpa ini, binaan debug iOS mengaktifkan
        // App Check TANPA penyedia Apple langsung dan setiap panggilan yang
        // dilindungi akan ditolak dengan cara yang mengelirukan.
        providerApple: AppleDebugProvider(debugToken: token),
      );
      return;
    }
    // Android release/profile: pengesahan platform SAHAJA — tiada token debug,
    // tiada sandaran debug.
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
