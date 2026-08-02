import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/place_cards/place_card_flags.dart';
import 'package:makan_mana/features/place_corrections/place_correction_flags.dart';
import 'package:makan_mana/features/place_migration/alias_resolution.dart';
import 'package:makan_mana/features/place_migration/migration_diagnostics.dart';
import 'package:makan_mana/features/place_migration/place_migration_flags.dart';
import 'package:makan_mana/features/place_migration/place_read_repository.dart';
import 'package:makan_mana/features/place_migration/read_comparison.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';

/// PART 1 Phase 1.12 — ujian dwi-bacaan, resolusi alias, bacaan bayangan,
/// penyelaras feature flag dan diagnostik QA.
///
/// Meliputi Part T item 33-43, 46-49 di sisi Flutter.

ComparablePlaceView view({
  String placeId = 'ChIJ_alpha',
  String title = 'Nasi Kandar Semarak',
  double? lat = 3.1595,
  double? lng = 101.7123,
  String ratingState = 'rating_shown',
  String hoursState = 'open_now',
  String halalState = 'halal_unknown',
  String businessState = 'status_active',
}) =>
    ComparablePlaceView(
      placeId: placeId,
      title: title,
      address: 'Jalan Ampang, Kuala Lumpur',
      lat: lat,
      lng: lng,
      ratingState: ratingState,
      reviewCountState: 'count_shown',
      priceState: 'price_provider_band',
      hoursState: hoursState,
      businessState: businessState,
      imageState: 'image_present',
      halalState: halalState,
      tagIds: const ['cuisine_mamak'],
    );

/// Bina pembaca dwi-mod lengkap dengan data legasi dan canonical yang disuntik.
({
  DualPlaceReadRepository dual,
  CanonicalPlaceReadRepositoryStub canonical,
  AliasResolver aliases,
  List<PlaceReadComparison> recorded,
}) harness({
  Map<String, ComparablePlaceView>? legacyRecords,
  Map<String, ComparablePlaceView>? canonicalRecords,
  Map<String, String>? aliasMap,
  Duration timeout = const Duration(milliseconds: 200),
}) {
  final legacyData = legacyRecords ?? {'ChIJ_alpha': view()};
  final canonicalData = canonicalRecords ?? {'PLC_alpha': view(placeId: 'PLC_alpha')};
  final aliases = AliasResolver(aliasMap: aliasMap ?? {'ChIJ_alpha': 'PLC_alpha'});
  final canonical = CanonicalPlaceReadRepositoryStub(records: canonicalData);
  final recorded = <PlaceReadComparison>[];

  return (
    dual: DualPlaceReadRepository(
      legacy: LegacyPlaceReadRepository((id) async => legacyData[id]),
      canonical: canonical,
      aliasResolver: aliases,
      canonicalTimeout: timeout,
      onComparison: recorded.add,
    ),
    canonical: canonical,
    aliases: aliases,
    recorded: recorded,
  );
}

void main() {
  tearDown(() {
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
    MigrationDiagnostics.reset();
  });

  // --- 41-42, 46-48: lalai selamat ----------------------------------------

  test('41. mod bacaan lalai ialah legacy_only', () {
    expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode,
        PlaceReadMode.legacyOnly);
    expect(PlaceMigrationFeatureFlags.shadowReadEnabled, isFalse);
    expect(PlaceMigrationFeatureFlags.migrationDiagnosticsEnabled, isFalse);
  });

  test('42. semua flag ditetapkan semula dengan selamat', () {
    PlaceCardFlags.canonicalCardsEnabled = true;
    RestaurantDetailFlags.canonicalRestaurantDetailEnabled = true;
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
    PlaceMigrationFeatureFlags.setEnvironmentForTests(
        migrationCompleted: true, adapterAvailable: true);
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: true,
      canonicalCards: true,
      canonicalDetail: true,
      correctionEnabled: true,
      releaseMode: false,
    );

    PlaceMigrationFeatureFlags.resetToSafeDefaults();

    expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode,
        PlaceReadMode.legacyOnly);
    expect(PlaceMigrationFeatureFlags.shadowReadEnabled, isFalse);
    expect(PlaceMigrationFeatureFlags.migrationDiagnosticsEnabled, isFalse);
    expect(PlaceMigrationFeatureFlags.migrationCompletedForEnvironment, isFalse);
    expect(PlaceCardFlags.canonicalCardsEnabled, isFalse);
    expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    expect(PlaceCorrectionFlags.placeCorrectionEnabled, isFalse);
  });

  test('46-48. kad, butiran dan pembetulan canonical kekal OFF secara lalai', () {
    expect(PlaceMigrationFeatureFlags.canonicalCardsEnabled, isFalse);
    expect(PlaceMigrationFeatureFlags.canonicalRestaurantDetailEnabled, isFalse);
    expect(PlaceMigrationFeatureFlags.placeCorrectionEnabled, isFalse);
  });

  // --- 43: gabungan flag terlarang ----------------------------------------

  test('43a. mod canonical-sahaja ditolak dalam keluaran', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.canonicalOnlyTest,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: true,
      migrationCompleted: true,
      adapterAvailable: true,
    );
    expect(result.ok, isFalse);
    expect(result.reasons, contains(FlagRejectionReason.canonicalOnlyInRelease));
  });

  test('43b. bacaan bayangan dan diagnostik ditolak dalam keluaran', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: true,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: true,
    );
    expect(result.ok, isFalse);
    expect(result.reasons, contains(FlagRejectionReason.shadowReadInRelease));
    expect(result.reasons, contains(FlagRejectionReason.diagnosticsInRelease));
  });

  test('43c. bacaan canonical tanpa penanda migrasi ditolak', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.canonicalPreferredWithLegacyFallback,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
      migrationCompleted: false,
    );
    expect(result.ok, isFalse);
    expect(result.reasons,
        contains(FlagRejectionReason.canonicalReadWithoutMigrationMarker));
  });

  test('43d. kad canonical tanpa penyesuai ditolak', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.canonicalPreferredWithLegacyFallback,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: true,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
      migrationCompleted: true,
      adapterAvailable: false,
    );
    expect(result.ok, isFalse);
    expect(result.reasons,
        contains(FlagRejectionReason.canonicalCardsWithoutAdapter));
  });

  test('43e. butiran canonical dengan stub canonical-sahaja ditolak', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.canonicalOnlyTest,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: true,
      correctionEnabled: false,
      releaseMode: false,
      migrationCompleted: true,
      adapterAvailable: false,
    );
    expect(result.ok, isFalse);
    expect(result.reasons,
        contains(FlagRejectionReason.canonicalDetailWithCanonicalOnlyStub));
  });

  test('43f. pembetulan dalam keluaran tanpa callable dipercayai ditolak', () {
    final result = PlaceMigrationFeatureFlags.validate(
      readMode: PlaceReadMode.legacyOnly,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: true,
      releaseMode: true,
      trustedCallableAvailable: false,
    );
    expect(result.ok, isFalse);
    expect(result.reasons,
        contains(FlagRejectionReason.correctionSubmitWithoutTrustedCallable));
  });

  test('43g. gabungan tidak sah TIDAK mengubah mana-mana flag', () {
    final before = PlaceMigrationFeatureFlags.canonicalPlaceReadMode;
    final result = PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.canonicalOnlyTest,
      shadowRead: true,
      diagnostics: true,
      canonicalCards: true,
      canonicalDetail: true,
      correctionEnabled: true,
      releaseMode: true,
    );
    expect(result.ok, isFalse);
    expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode, before);
    expect(PlaceCardFlags.canonicalCardsEnabled, isFalse);
    expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    expect(PlaceCorrectionFlags.placeCorrectionEnabled, isFalse);
  });

  test('43h. gabungan sah dalam debug diterima', () {
    final result = PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: true,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    expect(result.ok, isTrue);
    expect(PlaceMigrationFeatureFlags.canonicalPlaceReadMode,
        PlaceReadMode.shadowRead);
  });

  // --- Resolusi alias ------------------------------------------------------

  test('alias tidak diketahui memulangkan notFound eksplisit', () {
    final resolver = AliasResolver();
    expect(resolver.resolve('never_seen').status, AliasResolutionStatus.notFound);
  });

  test('alias bulat gagal selamat', () {
    final resolver = AliasResolver(aliasMap: {'A': 'B', 'B': 'A'});
    expect(resolver.resolve('A').status, AliasResolutionStatus.circular);
  });

  test('rantaian alias terbatas', () {
    final map = <String, String>{};
    for (var i = 0; i < 30; i++) {
      map['id_$i'] = 'id_${i + 1}';
    }
    final resolver = AliasResolver(aliasMap: map, maxHops: 5);
    expect(resolver.resolve('id_0').status, AliasResolutionStatus.circular);
  });

  test('ID yang sudah canonical menyelesai kepada dirinya sendiri', () {
    final resolver = AliasResolver(aliasMap: {'ChIJ_alpha': 'PLC_alpha'});
    final resolution = resolver.resolve('PLC_alpha');
    expect(resolution.status, AliasResolutionStatus.resolved);
    expect(resolution.canonicalPlaceId, 'PLC_alpha');
  });

  // --- 33-34: bacaan bayangan ---------------------------------------------

  test('34. bacaan bayangan mengekalkan legasi sebagai yang dilihat pengguna',
      () async {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    final h = harness();
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result, isNotNull);
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.placeId, 'ChIJ_alpha');
    expect(h.recorded, hasLength(1));
  });

  test('33. bacaan bayangan tidak melambatkan legasi melebihi had masa',
      () async {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    final h = harness(timeout: const Duration(milliseconds: 50));
    // Canonical mengambil masa jauh lebih lama daripada had masa.
    h.canonical.latency = const Duration(milliseconds: 400);

    final stopwatch = Stopwatch()..start();
    final result = await h.dual.readPlace('ChIJ_alpha');
    stopwatch.stop();

    expect(result!.source, PlaceReadSource.legacy);
    // Hasil masih legasi dan kita tidak menunggu 400ms penuh.
    expect(stopwatch.elapsedMilliseconds, lessThan(300));
    expect(h.recorded, isEmpty,
        reason: 'perbandingan digugurkan selepas had masa');
  });

  test('33b. kegagalan canonical semasa bayangan tidak menjejaskan pengguna',
      () async {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.shadowRead,
      shadowRead: true,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    final h = harness();
    h.canonical.failNextRead = true;
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.view.title, 'Nasi Kandar Semarak');
  });

  // --- 35-36: pengesanan ketidakpadanan -----------------------------------

  test('35. perbandingan mengesan ketidakpadanan rating', () {
    final comparison = comparePlaceReads(
      view(),
      view(placeId: 'PLC_alpha', ratingState: 'rating_hidden'),
      legacySource: 'legacy',
      canonicalSource: 'canonical',
    );
    final rating = comparison.fieldComparisons
        .firstWhere((f) => f.field == ComparedField.ratingState);
    expect(rating.match, isFalse);
    expect(rating.severity, ComparisonSeverity.warning);
  });

  test('36. perbandingan mengesan ketidakpadanan waktu', () {
    final comparison = comparePlaceReads(
      view(),
      view(placeId: 'PLC_alpha', hoursState: 'hours_unknown'),
      legacySource: 'legacy',
      canonicalSource: 'canonical',
    );
    expect(
      comparison.fieldComparisons
          .firstWhere((f) => f.field == ComparedField.hoursState)
          .match,
      isFalse,
    );
  });

  test('36b. ketidakpadanan tajuk atau halal adalah kritikal', () {
    final title = comparePlaceReads(
      view(),
      view(placeId: 'PLC_alpha', title: 'Kedai Lain'),
      legacySource: 'l',
      canonicalSource: 'c',
    );
    expect(title.identityMatch, isFalse);
    expect(title.severity, ComparisonSeverity.critical);

    final halal = comparePlaceReads(
      view(),
      view(placeId: 'PLC_alpha', halalState: 'halal_certified'),
      legacySource: 'l',
      canonicalSource: 'c',
    );
    expect(halal.severity, ComparisonSeverity.critical);
  });

  test('36c. paparan sepadan menghasilkan perbandingan bersih', () {
    final comparison = comparePlaceReads(
      view(),
      view(),
      legacySource: 'l',
      canonicalSource: 'c',
    );
    expect(comparison.identityMatch, isTrue);
    expect(comparison.severity, ComparisonSeverity.match);
    expect(comparison.mismatches, isEmpty);
    expect(comparison.comparisonVersion, '1.12.0');
  });

  // --- 37-40: jatuh balik dwi-bacaan --------------------------------------

  Future<void> enableCanonicalPreferred() async {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.canonicalPreferredWithLegacyFallback,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
      migrationCompleted: true,
      adapterAvailable: true,
    );
  }

  test('37. kegagalan canonical jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness();
    h.canonical.failNextRead = true;
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fellBackToLegacy, isTrue);
    expect(result.fallbackReason, PlaceReadFallbackReason.canonicalError);
  });

  test('37b. had masa canonical jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness(timeout: const Duration(milliseconds: 40));
    h.canonical.latency = const Duration(milliseconds: 300);
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fallbackReason, PlaceReadFallbackReason.canonicalTimeout);
  });

  test('38. alias yang hilang jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness(aliasMap: <String, String>{});
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fallbackReason, PlaceReadFallbackReason.aliasNotFound);
  });

  test('38b. alias bulat jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness(aliasMap: {'ChIJ_alpha': 'X', 'X': 'ChIJ_alpha'});
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fallbackReason, PlaceReadFallbackReason.aliasCircular);
  });

  test('38c. rekod canonical yang disekat jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness();
    h.canonical.block('PLC_alpha');
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fallbackReason, PlaceReadFallbackReason.canonicalBlocked);
  });

  test('38d. canonical yang hilang jatuh balik ke legasi', () async {
    await enableCanonicalPreferred();
    final h = harness(canonicalRecords: <String, ComparablePlaceView>{});
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fallbackReason, PlaceReadFallbackReason.canonicalMissing);
  });

  test('39. placeId stabil dikekalkan merentas kedua-dua sumber', () async {
    await enableCanonicalPreferred();
    final h = harness();
    final canonicalResult = await h.dual.readPlace('ChIJ_alpha');
    expect(canonicalResult!.source, PlaceReadSource.canonicalStub);
    // Pemanggil masih melihat ID yang mereka minta.
    expect(canonicalResult.placeId, 'ChIJ_alpha');
    expect(canonicalResult.canonicalPlaceId, 'PLC_alpha');

    h.canonical.failNextRead = true;
    final legacyResult = await h.dual.readPlace('ChIJ_alpha');
    expect(legacyResult!.placeId, 'ChIJ_alpha');
  });

  test('40. tiada hasil tempat berganda apabila alias dan canonical diminta',
      () async {
    await enableCanonicalPreferred();
    final h = harness();
    final results = await h.dual.readPlaces(['ChIJ_alpha', 'PLC_alpha']);
    expect(results, hasLength(1));
    expect(results.first.canonicalPlaceId, 'PLC_alpha');
  });

  test('40b. mod legacy_only tidak pernah menyentuh canonical', () async {
    final h = harness();
    h.canonical.failNextRead = true; // akan membuang jika disentuh
    final result = await h.dual.readPlace('ChIJ_alpha');
    expect(result!.source, PlaceReadSource.legacy);
    expect(result.fellBackToLegacy, isFalse);
    // Suntikan kegagalan tidak digunakan → canonical tidak pernah dibaca.
    expect(h.canonical.failNextRead, isTrue);
  });

  test('mod canonical-sahaja mendedahkan kegagalan dan bukan menyembunyikannya',
      () async {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.canonicalOnlyTest,
      shadowRead: false,
      diagnostics: false,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
      migrationCompleted: true,
      adapterAvailable: true,
    );
    final h = harness(canonicalRecords: <String, ComparablePlaceView>{});
    expect(await h.dual.readPlace('ChIJ_alpha'), isNull);
  });

  // --- 49: diagnostik QA --------------------------------------------------

  test('49. diagnostik QA tersembunyi dalam mod keluaran', () {
    expect(
      MigrationDiagnostics.wouldBeVisible(releaseMode: true, flagOn: true),
      isFalse,
    );
    expect(
      MigrationDiagnostics.wouldBeVisible(releaseMode: false, flagOn: true),
      isTrue,
    );
    expect(
      MigrationDiagnostics.wouldBeVisible(releaseMode: false, flagOn: false),
      isFalse,
    );
  });

  test('49b. petikan diagnostik ialah null apabila flag dimatikan', () {
    expect(MigrationDiagnostics.snapshotFor(null), isNull);
  });

  test('49c. diagnostik merekod ketika dihidupkan dalam debug', () {
    // kReleaseMode adalah false dalam ujian, jadi flag sahaja yang mengawal.
    expect(kReleaseMode, isFalse);
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.legacyOnly,
      shadowRead: false,
      diagnostics: true,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    MigrationDiagnostics.recordComparison(
      comparePlaceReads(
        view(),
        view(placeId: 'PLC_alpha', ratingState: 'rating_hidden'),
        legacySource: 'l',
        canonicalSource: 'c',
      ),
    );
    final snapshot = MigrationDiagnostics.snapshotFor(
      PlaceReadResult(
        placeId: 'ChIJ_alpha',
        view: view(),
        source: PlaceReadSource.legacy,
        canonicalPlaceId: 'PLC_alpha',
      ),
    );
    expect(snapshot, isNotNull);
    expect(snapshot!.shadowMismatchCount, 1);
    expect(snapshot.sourceUsed, PlaceReadSource.legacy);
    expect(snapshot.rows, hasLength(9));
  });

  test('49d. diagnostik tidak merekod apa-apa apabila dimatikan', () {
    MigrationDiagnostics.recordComparison(
      comparePlaceReads(view(), view(), legacySource: 'l', canonicalSource: 'c'),
    );
    expect(MigrationDiagnostics.comparisons, isEmpty);
  });

  test('49e. diagnostik tidak mendedahkan data pengguna', () {
    PlaceMigrationFeatureFlags.apply(
      readMode: PlaceReadMode.legacyOnly,
      shadowRead: false,
      diagnostics: true,
      canonicalCards: false,
      canonicalDetail: false,
      correctionEnabled: false,
      releaseMode: false,
    );
    final snapshot = MigrationDiagnostics.snapshotFor(
      PlaceReadResult(
        placeId: 'ChIJ_alpha',
        view: view(),
        source: PlaceReadSource.legacy,
      ),
    );
    final labels = snapshot!.rows.map((r) => r.label.toLowerCase()).join(' ');
    for (final forbidden in ['uid', 'user', 'email', 'location']) {
      expect(labels.contains(forbidden), isFalse, reason: forbidden);
    }
  });

  // --- Ringkasan bayangan -------------------------------------------------

  test('ringkasan bayangan mengagregat mengikut medan', () {
    final summary = summarizeComparisons([
      comparePlaceReads(view(), view(), legacySource: 'l', canonicalSource: 'c'),
      comparePlaceReads(
        view(),
        view(placeId: 'PLC_alpha', ratingState: 'rating_hidden'),
        legacySource: 'l',
        canonicalSource: 'c',
      ),
      comparePlaceReads(
        view(),
        view(placeId: 'PLC_alpha', title: 'Lain'),
        legacySource: 'l',
        canonicalSource: 'c',
      ),
    ]);
    expect(summary.totalCompared, 3);
    expect(summary.mismatches, 2);
    expect(summary.criticalMismatches, 1);
    expect(summary.mismatchesByField[ComparedField.ratingState], 1);
  });
}
