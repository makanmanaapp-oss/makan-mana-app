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

  test('non-Android platform → none (no-op, no debug fallback)', () {
    expect(FirebaseAppCheckBootstrap.providerFor(isDebug: false, isAndroid: false),
        AppCheckProviderKind.none);
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
}
