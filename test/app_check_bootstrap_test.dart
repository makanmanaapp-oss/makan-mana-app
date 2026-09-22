import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_check_error_strings.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/security/app_check_bootstrap.dart';
import 'package:makan_mana/features/place_corrections/correction_providers.dart';
import 'package:makan_mana/features/place_corrections/correction_repository.dart';
import 'package:makan_mana/features/place_corrections/trusted_callable_errors.dart';
import 'package:makan_mana/features/place_corrections/trusted_callable_gate.dart';
import 'package:makan_mana/features/place_migration/place_migration_flags.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// PART 1 Phase 1.14B.2 — ujian App Check bootstrap + gerbang + ralat selamat.

void main() {
  setUp(() {
    FirebaseAppCheckBootstrap.resetForTests();
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
  });
  tearDown(() {
    FirebaseAppCheckBootstrap.resetForTests();
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
  });

  Future<void> makeReady() => FirebaseAppCheckBootstrap.activate(
        activator: (_) async {},
        isDebugOverride: true,
        isAndroidOverride: true,
      );

  // 1-3: pemilihan provider.
  test('debug Android build selects the debug provider', () {
    expect(FirebaseAppCheckBootstrap.providerFor(isDebug: true, isAndroid: true),
        AppCheckProviderKind.debug);
  });

  test('release Android build selects Play Integrity', () {
    expect(FirebaseAppCheckBootstrap.providerFor(isDebug: false, isAndroid: true),
        AppCheckProviderKind.playIntegrity);
  });

  test('release build NEVER selects the debug provider', () {
    final p = FirebaseAppCheckBootstrap.providerFor(isDebug: false, isAndroid: true);
    expect(p, isNot(AppCheckProviderKind.debug));
  });

  test('platform tanpa sokongan → none (no-op, tiada sandaran debug)', () {
    expect(
        FirebaseAppCheckBootstrap.providerFor(
            isDebug: false, isAndroid: false, isIOS: false),
        AppCheckProviderKind.none);
  });

  // WAVE 4A — iOS dahulunya SENTIASA `none`, jadi kod penyedia Apple dalam
  // _realActivate tidak boleh dicapai dan App Check tidak pernah aktif di iOS.
  test('iOS debug (Simulator QA) → penyedia debug Apple', () {
    expect(
        FirebaseAppCheckBootstrap.providerFor(
            isDebug: true, isAndroid: false, isIOS: true),
        AppCheckProviderKind.appleDebug);
  });

  test('iOS release (peranti fizikal) → App Attest', () {
    expect(
        FirebaseAppCheckBootstrap.providerFor(
            isDebug: false, isAndroid: false, isIOS: true),
        AppCheckProviderKind.appleAttest);
  });

  test('binaan release TIDAK PERNAH memilih penyedia debug pada mana-mana platform',
      () {
    for (final (android, ios) in [(true, false), (false, true)]) {
      final p = FirebaseAppCheckBootstrap.providerFor(
          isDebug: false, isAndroid: android, isIOS: ios);
      expect(isDebugAppCheckProvider(p), isFalse,
          reason: 'android=$android ios=$ios memilih penyedia debug');
    }
  });

  test('tingkah laku Android TIDAK berubah oleh laluan iOS', () {
    expect(
        FirebaseAppCheckBootstrap.providerFor(
            isDebug: true, isAndroid: true, isIOS: true),
        AppCheckProviderKind.debug);
    expect(
        FirebaseAppCheckBootstrap.providerFor(
            isDebug: false, isAndroid: true, isIOS: true),
        AppCheckProviderKind.playIntegrity);
  });

  test('iOS mengaktifkan melalui aktivator yang disuntik (tiada produksi disentuh)',
      () async {
    AppCheckProviderKind? seen;
    final s = await FirebaseAppCheckBootstrap.activate(
      activator: (p) async => seen = p,
      isDebugOverride: false,
      isAndroidOverride: false,
      isIOSOverride: true,
    );
    expect(s.state, AppCheckInitializationState.ready);
    expect(seen, AppCheckProviderKind.appleAttest);
  });

  test('sumber bootstrap memisahkan penyedia Apple dan Android', () {
    final src =
        File('lib/core/security/app_check_bootstrap.dart').readAsStringSync();
    // Laluan release Android tidak boleh menghantar penyedia Apple debug.
    final debugBlock = src.substring(src.indexOf('appleDebug) {'));
    expect(debugBlock.contains('AppleDebugProvider'), isTrue);
    expect(
        RegExp(r'AndroidPlayIntegrityProvider\(\),\s*providerApple')
            .hasMatch(src),
        isFalse,
        reason: 'release Android tidak sepatutnya mengaktifkan penyedia Apple');
  });

  // 4: tiada token debug tertanam dalam sumber.
  test('bootstrap source has no hardcoded debug token', () {
    final src = File('lib/core/security/app_check_bootstrap.dart').readAsStringSync();
    // Tiada literal panjang mirip-token (hex/base64 >= 24 aksara berterusan).
    expect(RegExp(r'[A-Za-z0-9_-]{24,}').allMatches(src).any((m) {
      final s = m.group(0)!;
      // Benarkan pengecam Dart biasa; tolak rentetan mirip-token dalam petikan.
      return src.contains('"$s"') || src.contains("'$s'");
    }), isFalse);
  });

  // 5,15,16,17: pengaktifan disuntik (tiada produksi), ready, idempoten.
  test('activate uses injected activator, becomes ready, is idempotent', () async {
    var calls = 0;
    final s1 = await FirebaseAppCheckBootstrap.activate(
        activator: (_) async => calls++, isDebugOverride: true, isAndroidOverride: true);
    expect(s1.state, AppCheckInitializationState.ready);
    expect(s1.provider, AppCheckProviderKind.debug);
    final s2 = await FirebaseAppCheckBootstrap.activate(
        activator: (_) async => calls++, isDebugOverride: true, isAndroidOverride: true);
    expect(s2.isReady, isTrue);
    expect(calls, 1); // idempoten — tidak aktif semula
  });

  // 11,13: kegagalan → typed monitoringUnavailable, tiada teks exception.
  test('activation failure yields monitoringUnavailable (no raw exception)', () async {
    final s = await FirebaseAppCheckBootstrap.activate(
        activator: (_) async => throw Exception('boom secret detail'),
        isDebugOverride: true,
        isAndroidOverride: true);
    expect(s.state, AppCheckInitializationState.monitoringUnavailable);
    expect(s.reasonCode, 'activation_failed');
    expect(s.reasonCode, isNot(contains('boom')));
  });

  test('unsupported platform yields unsupportedPlatform', () async {
    final s = await FirebaseAppCheckBootstrap.activate(
        activator: (_) async {}, isDebugOverride: false, isAndroidOverride: false);
    expect(s.state, AppCheckInitializationState.unsupportedPlatform);
  });

  // 6,7,9,10: gerbang callable dipercayai.
  test('gate: closed when trusted callable disabled (default)', () async {
    await makeReady();
    expect(TrustedCallableGate.canUseTrustedCallable(authed: true, isSample: false), isFalse);
    expect(TrustedCallableGate.gateReason(authed: true, isSample: false),
        AppCheckGateReason.trustedCallableDisabled);
  });

  test('gate: closed when App Check not ready', () {
    PlaceMigrationFeatureFlags.setEnvironmentForTests(trustedCallableAvailable: true);
    // (belum activate → not ready)
    expect(TrustedCallableGate.gateReason(authed: true, isSample: false),
        AppCheckGateReason.appCheckNotReady);
  });

  test('gate: closed when unauthenticated / sample', () async {
    PlaceMigrationFeatureFlags.setEnvironmentForTests(trustedCallableAvailable: true);
    await makeReady();
    expect(TrustedCallableGate.gateReason(authed: false, isSample: false),
        AppCheckGateReason.unauthenticated);
    expect(TrustedCallableGate.gateReason(authed: true, isSample: true),
        AppCheckGateReason.sampleData);
  });

  test('gate: OPEN only when flag ON + ready + authed + not sample', () async {
    PlaceMigrationFeatureFlags.setEnvironmentForTests(trustedCallableAvailable: true);
    await makeReady();
    expect(TrustedCallableGate.canUseTrustedCallable(authed: true, isSample: false), isTrue);
  });

  // 8: repo lalai kekal Local.
  test('default correction repository remains Local', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(placeCorrectionRepositoryProvider), isA<LocalPlaceCorrectionRepository>());
    expect(PlaceMigrationFeatureFlags.trustedCorrectionCallableAvailable, isFalse);
  });

  // 12: pemetaan sebab-gerbang → ralat bertaip → kunci l10n.
  test('gate reason maps to typed error + safe l10n key', () {
    final err = errorForGateReason(AppCheckGateReason.appCheckNotReady);
    expect(err, TrustedCallableError.appCheckNotInitialized);
    final key = l10nKeyForTrustedError(err!);
    expect(key, 'appCheckErrNotReady');
    final msg = AppLocalizations(const Locale('en')).t(key);
    expect(msg, isNot(key)); // ada terjemahan
    expect(msg.toLowerCase(), isNot(contains('exception')));
  });

  // 14: diagnostik debug tiada token/UID.
  test('debug diagnostics contain no token/uid', () async {
    await makeReady();
    final diag = FirebaseAppCheckBootstrap.debugDiagnostics();
    expect(diag, isNotNull);
    final blob = diag.toString().toLowerCase();
    expect(blob.contains('token'), isFalse);
    expect(blob.contains('uid'), isFalse);
    expect(diag!['state'], 'ready');
  });

  // 19-22: pariti l10n 4 bahasa.
  test('App Check error keys exist in ms/en/zh/ta, non-empty, not raw key', () {
    final keys = kAppCheckErrorStringsMs.keys.toSet();
    for (final m in [
      kAppCheckErrorStringsMs,
      kAppCheckErrorStringsEn,
      kAppCheckErrorStringsZh,
      kAppCheckErrorStringsTa,
    ]) {
      expect(m.keys.toSet(), keys);
      for (final e in m.entries) {
        expect(e.value.trim().isNotEmpty, isTrue, reason: e.key);
        expect(e.value == e.key, isFalse, reason: e.key);
      }
    }
    for (final k in keys) {
      expect(AppLocalizations.hasKey(k), isTrue, reason: k);
    }
  });

  _appCheckAppleProviderTests();
}

/// iOS WAVE 1 — App Check mesti mengkonfigurasikan penyedia APPLE juga.
///
/// `_realActivate` memanggil SDK Firebase sebenar, jadi ia tidak boleh diuji
/// unit secara langsung. Ujian ini membaca sumber dan menegaskan kedua-dua
/// cabang membekalkan `providerApple`. Tanpanya, binaan iOS mengaktifkan App
/// Check tanpa penyedia Apple langsung dan setiap panggilan yang dilindungi
/// ditolak dengan cara yang mengelirukan.
void _appCheckAppleProviderTests() {
  // WAVE 4A — dahulu setiap cabang aktivasi menetapkan KEDUA-DUA penyedia,
  // kerana iOS hanya dicapai melalui cabang Android. Kini setiap platform
  // mempunyai cabangnya sendiri; invarian yang penting kekal sama: App Check
  // tidak pernah aktif tanpa penyedia untuk platform yang berjalan, dan
  // cabang release tidak pernah menggunakan penyedia debug.
  test('setiap cabang aktivasi menetapkan penyedia untuk platformnya', () {
    final src = File('lib/core/security/app_check_bootstrap.dart').readAsStringSync();

    final activateCalls =
        RegExp(r'FirebaseAppCheck\.instance\.activate\(').allMatches(src).length;
    final providerArgs = RegExp(r'provider(Android|Apple):').allMatches(src).length;
    expect(activateCalls, 4, reason: 'bilangan cabang aktivasi berubah');
    expect(providerArgs, greaterThanOrEqualTo(activateCalls),
        reason: 'setiap panggilan activate mesti menetapkan sekurang-kurangnya satu penyedia');

    // Setiap panggilan activate mesti membawa sekurang-kurangnya satu penyedia.
    for (final m
        in RegExp(r'FirebaseAppCheck\.instance\.activate\(([^;]*?)\);', dotAll: true)
            .allMatches(src)) {
      expect(RegExp(r'provider(Android|Apple):').hasMatch(m.group(1)!), isTrue,
          reason: 'panggilan activate tanpa penyedia: ${m.group(1)}');
    }

    // Debug guna penyedia debug; release MESTI pengesahan platform sebenar.
    expect(src.contains('AppleDebugProvider'), isTrue);
    expect(
      src.contains('AppleAppAttestWithDeviceCheckFallbackProvider'),
      isTrue,
      reason: 'release mesti App Attest dengan fallback DeviceCheck',
    );
    // Cabang release (Android mahupun Apple) tidak boleh menggunakan debug.
    // Diskop kepada argumen SATU panggilan activate, bukan tetingkap aksara —
    // tetingkap merentasi sempadan cabang dan menjadikan ujian ini palsu.
    for (final m
        in RegExp(r'FirebaseAppCheck\.instance\.activate\(([^;]*?)\);', dotAll: true)
            .allMatches(src)) {
      final args = m.group(1)!;
      final isRelease = args.contains('AndroidPlayIntegrityProvider') ||
          args.contains('AppleAppAttestWithDeviceCheckFallbackProvider');
      if (!isRelease) continue;
      expect(args.contains('DebugProvider'), isFalse,
          reason: 'cabang release menggunakan penyedia debug: $args');
    }
  });
}
