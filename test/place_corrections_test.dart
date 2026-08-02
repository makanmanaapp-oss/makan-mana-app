import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/place_corrections/correction_form_screen.dart';
import 'package:makan_mana/features/place_corrections/correction_models.dart';
import 'package:makan_mana/features/place_corrections/correction_repository.dart';
import 'package:makan_mana/features/place_corrections/correction_snapshot.dart';
import 'package:makan_mana/features/place_corrections/correction_validation.dart';
import 'package:makan_mana/features/place_corrections/place_correction_flags.dart';
import 'package:makan_mana/features/place_corrections/report_entry_sheet.dart';
import 'package:makan_mana/features/place_corrections/submission_history_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';

/// PART 1 Phase 1.11 — ujian aliran laporan/pembetulan kedai.
///
/// Meliputi: flag ON/OFF, nilai semasa, pratonton cadangan, notis privasi,
/// pelabelan sample, ID penjejakan, sejarah, keadaan perlu bukti tambahan,
/// peraturan tarik balik, keadaan memuat/ralat/kosong, 320dp, skala teks 1.6,
/// Bright/Dark dan label semantik.

String _t(String key, [String lang = 'en']) =>
    AppLocalizations(Locale(lang)).t(key);

Widget _host(
  Widget child, {
  bool dark = false,
  String lang = 'en',
  double width = 390,
  double scale = 1.0,
}) =>
    MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 900),
          textScaler: TextScaler.linear(scale),
        ),
        child: child,
      ),
    );

ReportOriginalSnapshot _snapshot({
  String placeId = 'place-1',
  String title = 'Nasi Kandar Pelita',
  String? phone = '+60 3-1234 5678',
  String sourceMode = 'live',
  String hoursState = 'hours_unknown',
}) =>
    ReportOriginalSnapshot(
      placeId: placeId,
      title: title,
      capturedAt: DateTime.utc(2026, 1, 5, 12),
      contentHash: 'abc12345',
      address: 'Jalan Ampang, Kuala Lumpur',
      phone: phone,
      hoursState: hoursState,
      sourceMode: sourceMode,
    );

RestaurantDetailViewModel _vm({
  CardSourceMode sourceMode = CardSourceMode.live,
}) =>
    RestaurantDetailViewModel(
      placeId: 'place-1',
      title: 'Nasi Kandar Pelita',
      sourceMode: sourceMode,
      gallery: DetailGallery.empty,
      businessState: CardBusinessState.active,
      hours: DetailHours.unknown,
      rating: const CardRatingModel(),
      price: const CardPriceModel(state: CardPriceState.unknown),
      location: const LocationInfo(address: 'Jalan Ampang, Kuala Lumpur'),
      contact: const ContactInfo(phone: '+60 3-1234 5678'),
      actions: const DetailActionConfig(canOpenMaps: true),
    );

/// Isi borang dengan penerangan sah (>= 10 aksara).
Future<void> _fillDescription(WidgetTester tester,
    [String text = 'Nombor telefon sudah bertukar minggu lepas.']) async {
  await tester.enterText(find.byKey(const Key('correction-description')), text);
  await tester.pump();
}

/// Tatal butang hantar ke dalam pandangan sebelum ketik (borang panjang).
Future<void> _tapSubmit(WidgetTester tester) async {
  final submit = find.byKey(const Key('correction-submit'));
  await tester.ensureVisible(submit);
  await tester.pump();
  await tester.tap(submit);
  await tester.pump();
}

void main() {
  tearDown(PlaceCorrectionFlags.resetToSafeDefault);

  // --- 1. Feature flag ------------------------------------------------------

  test('flag lalai adalah OFF dan boleh ditetapkan semula', () {
    expect(PlaceCorrectionFlags.placeCorrectionEnabled, isFalse);
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
    PlaceCorrectionFlags.resetToSafeDefault();
    expect(PlaceCorrectionFlags.placeCorrectionEnabled, isFalse);
  });

  testWidgets('flag OFF: butiran kedai tidak memapar titik masuk laporan',
      (tester) async {
    await tester.pumpWidget(_host(CanonicalRestaurantDetailScreen(
      vm: _vm(),
      callbacks: RestaurantDetailCallbacks(
        onReportIncorrectInformation: () {},
      ),
    )));
    await tester.pump();
    expect(find.byKey(const Key('detail-report-entry')), findsNothing);
    expect(find.text(_t('reportIncorrectInformation')), findsNothing);
  });

  testWidgets('flag ON: butiran kedai memapar titik masuk laporan',
      (tester) async {
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
    var tapped = 0;
    await tester.pumpWidget(_host(CanonicalRestaurantDetailScreen(
      vm: _vm(),
      callbacks: RestaurantDetailCallbacks(
        onReportIncorrectInformation: () => tapped += 1,
      ),
    )));
    await tester.pump();
    final entry = find.byKey(const Key('detail-report-entry'));
    expect(entry, findsOneWidget);
    await tester.ensureVisible(entry);
    await tester.tap(entry);
    await tester.pump();
    expect(tapped, 1);
  });

  testWidgets('flag ON tetapi data sample: titik masuk disembunyikan',
      (tester) async {
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
    await tester.pumpWidget(_host(CanonicalRestaurantDetailScreen(
      vm: _vm(sourceMode: CardSourceMode.sample),
      callbacks: RestaurantDetailCallbacks(
        onReportIncorrectInformation: () {},
      ),
    )));
    await tester.pump();
    expect(find.byKey(const Key('detail-report-entry')), findsNothing);
  });

  // --- 2. Helaian titik masuk ----------------------------------------------

  testWidgets('helaian titik masuk memapar notis privasi dan semua pintasan',
      (tester) async {
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
    await tester.pumpWidget(_host(ReportEntrySheetBody(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
    )));
    await tester.pump();
    expect(find.text(_t('reportPrivacyNotice')), findsOneWidget);
    expect(find.text(_t('reportIdentityNotShown')), findsOneWidget);
    for (final action in kReportQuickActions) {
      expect(find.text(_t(action.labelKey)), findsWidgets,
          reason: 'pintasan ${action.labelKey} hilang');
    }
  });

  // --- 3. Borang: nilai semasa & pratonton cadangan -------------------------

  testWidgets('borang memapar nilai semasa daripada snapshot', (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    final current =
        tester.widget<Text>(find.byKey(const Key('correction-current-value')));
    expect(current.data, '+60 3-1234 5678');
  });

  testWidgets('nilai semasa tidak diketahui kekal tidak diketahui',
      (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(phone: null),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    final current =
        tester.widget<Text>(find.byKey(const Key('correction-current-value')));
    expect(current.data, '—');
  });

  testWidgets('nilai dicadangkan dipratonton dalam medan cadangan',
      (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    await tester.enterText(
        find.byKey(const Key('correction-proposed-value')), '+60 3-9999 0000');
    await tester.pump();
    expect(find.text('+60 3-9999 0000'), findsOneWidget);
    // Nilai semasa TIDAK berubah — snapshot kekal.
    final current =
        tester.widget<Text>(find.byKey(const Key('correction-current-value')));
    expect(current.data, '+60 3-1234 5678');
  });

  testWidgets('borang sentiasa menyatakan cadangan belum disahkan',
      (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    expect(find.text(_t('reportProposalNotVerified')), findsWidgets);
    expect(find.text(_t('reportNoProductionData')), findsOneWidget);
  });

  testWidgets('mod sample dilabel dengan jelas pada borang', (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(sourceMode: 'sample'),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    expect(find.text(_t('reportSampleMode')), findsOneWidget);
  });

  testWidgets('kategori sensitif keselamatan memapar notis manual',
      (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.unsafeHalalClaim,
    )));
    await tester.pump();
    expect(find.text(_t('reportSafetyNotice')), findsOneWidget);
    // Kategori keselamatan tidak menerima nilai tepat daripada pengguna.
    expect(find.byKey(const Key('correction-proposed-value')), findsNothing);
  });

  // --- 4. Pengesahan & penghantaran ----------------------------------------

  testWidgets('penerangan terlalu pendek disekat dengan ralat', (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    await tester.enterText(
        find.byKey(const Key('correction-proposed-value')), '+60 3-9999 0000');
    await _fillDescription(tester, 'pendek');
    await _tapSubmit(tester);
    expect(find.byKey(const Key('correction-errors')), findsOneWidget);
    expect(
        find.textContaining(_t('reportErrorDescriptionShort')), findsOneWidget);
  });

  testWidgets('kategori yang memerlukan bukti disekat tanpa bukti',
      (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.permanentlyClosed,
    )));
    await tester.pump();
    await _fillDescription(tester, 'Kedai ini sudah tutup sejak bulan lepas.');
    await _tapSubmit(tester);
    expect(
        find.textContaining(_t('reportErrorEvidenceRequired')), findsOneWidget);
  });

  testWidgets('penghantaran berjaya memapar ID penjejakan', (tester) async {
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    await tester.enterText(
        find.byKey(const Key('correction-proposed-value')), '+60 3-9999 0000');
    await _fillDescription(tester);
    await _tapSubmit(tester);
    await tester.pumpAndSettle();
    expect(find.text(_t('reportSubmitted')), findsWidgets);
    final tracking =
        tester.widget<Text>(find.byKey(const Key('correction-tracking-id')));
    expect(tracking.data, contains('MM-RPT-000001'));
  });

  testWidgets('keadaan memuat dipapar semasa penghantaran', (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..latency = const Duration(milliseconds: 200);
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: repo,
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    await tester.enterText(
        find.byKey(const Key('correction-proposed-value')), '+60 3-9999 0000');
    await _fillDescription(tester);
    await _tapSubmit(tester);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // Butang dilumpuhkan semasa menghantar — hantar dua kali dicegah.
    final button =
        tester.widget<FilledButton>(find.byKey(const Key('correction-submit')));
    expect(button.onPressed, isNull);
    await tester.pumpAndSettle();
  });

  testWidgets('kegagalan penghantaran memapar keadaan ralat', (tester) async {
    final repo = LocalPlaceCorrectionRepository()..failNextSubmit = true;
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: repo,
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    await tester.enterText(
        find.byKey(const Key('correction-proposed-value')), '+60 3-9999 0000');
    await _fillDescription(tester);
    await _tapSubmit(tester);
    await tester.pumpAndSettle();
    expect(find.text(_t('reportError')), findsOneWidget);
  });

  test('laporan sama dua kali tidak menghasilkan gandaan', () async {
    final repo = LocalPlaceCorrectionRepository();
    CorrectionDraft draft() => CorrectionDraft(
          snapshot: _snapshot(),
          category: ReportCategory.wrongPhone,
          affectedField: CorrectableField.phone,
          proposedValue: '+60 3-9999 0000',
          description: 'Nombor telefon sudah bertukar minggu lepas.',
        );
    final first = await repo.submit(draft());
    final second = await repo.submit(draft());
    expect(first.accepted, isTrue);
    expect(second.accepted, isTrue);
    expect(second.deduplicated, isTrue);
    expect(second.trackingId, first.trackingId);
    expect((await repo.listMySubmissions()).length, 1);
  });

  // --- 5. Sejarah penghantaran ---------------------------------------------

  testWidgets('sejarah kosong memapar keadaan kosong', (tester) async {
    await tester.pumpWidget(_host(
        SubmissionHistoryScreen(repository: LocalPlaceCorrectionRepository())));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('history-empty')), findsOneWidget);
    expect(find.text(_t('reportHistoryEmpty')), findsOneWidget);
  });

  testWidgets('sejarah memapar keadaan memuat sebelum data tiba',
      (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..latency = const Duration(milliseconds: 200);
    await tester.pumpWidget(_host(SubmissionHistoryScreen(repository: repo)));
    await tester.pump();
    expect(find.byKey(const Key('history-loading')), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('sejarah memapar status sebagai teks, bukan warna sahaja',
      (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..seed(ReporterSubmissionView(
        submissionId: 'MM-RPT-000009',
        placeId: 'place-1',
        placeTitle: 'Nasi Kandar Pelita',
        category: ReportCategory.wrongPhone,
        status: SubmissionStatus.underReview,
        submittedAt: DateTime.utc(2026, 1, 5),
        evidenceCount: 0,
      ));
    await tester.pumpWidget(_host(SubmissionHistoryScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text(_t('reportStatusUnderReview')), findsOneWidget);
    expect(find.textContaining('MM-RPT-000009'), findsOneWidget);
  });

  testWidgets('status perlu bukti tambahan memapar arahan hantar semula',
      (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..seed(ReporterSubmissionView(
        submissionId: 'MM-RPT-000010',
        placeId: 'place-1',
        placeTitle: 'Nasi Kandar Pelita',
        category: ReportCategory.permanentlyClosed,
        status: SubmissionStatus.needsMoreEvidence,
        submittedAt: DateTime.utc(2026, 1, 5),
        evidenceCount: 1,
      ));
    await tester.pumpWidget(_host(SubmissionHistoryScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('history-more-evidence-MM-RPT-000010')),
        findsOneWidget);
  });

  testWidgets('tarik balik hanya untuk status terbuka', (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..seed(ReporterSubmissionView(
        submissionId: 'MM-RPT-000011',
        placeId: 'place-1',
        placeTitle: 'Buka',
        category: ReportCategory.wrongPhone,
        status: SubmissionStatus.submitted,
        submittedAt: DateTime.utc(2026, 1, 5),
        evidenceCount: 0,
      ))
      ..seed(ReporterSubmissionView(
        submissionId: 'MM-RPT-000012',
        placeId: 'place-2',
        placeTitle: 'Selesai',
        category: ReportCategory.wrongPhone,
        status: SubmissionStatus.resolved,
        submittedAt: DateTime.utc(2026, 1, 5),
        evidenceCount: 0,
      ));
    await tester.pumpWidget(_host(SubmissionHistoryScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('history-withdraw-MM-RPT-000011')),
        findsOneWidget);
    expect(
        find.byKey(const Key('history-withdraw-MM-RPT-000012')), findsNothing);

    await tester.tap(find.byKey(const Key('history-withdraw-MM-RPT-000011')));
    await tester.pumpAndSettle();
    expect(find.text(_t('reportStatusWithdrawn')), findsOneWidget);
    expect(
        find.byKey(const Key('history-withdraw-MM-RPT-000011')), findsNothing);
  });

  // --- 6. Privasi ----------------------------------------------------------

  testWidgets('sejarah tidak mendedah identiti pelapor atau penyemak',
      (tester) async {
    final repo = LocalPlaceCorrectionRepository()
      ..seed(ReporterSubmissionView(
        submissionId: 'MM-RPT-000013',
        placeId: 'place-1',
        placeTitle: 'Nasi Kandar Pelita',
        category: ReportCategory.wrongPhone,
        status: SubmissionStatus.underReview,
        submittedAt: DateTime.utc(2026, 1, 5),
        evidenceCount: 0,
      ));
    await tester.pumpWidget(_host(SubmissionHistoryScreen(repository: repo)));
    await tester.pumpAndSettle();
    final texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((w) => w.data ?? '')
        .join(' ')
        .toLowerCase();
    for (final forbidden in ['uid', 'reviewer', 'penyemak', '@', 'admin']) {
      expect(texts.contains(forbidden), isFalse,
          reason: 'sejarah tidak boleh mendedah "$forbidden"');
    }
  });

  // --- 7. Susun atur, tema, skala teks, bahasa -----------------------------

  testWidgets('borang muat pada 320dp tanpa limpahan', (tester) async {
    await tester.pumpWidget(_host(
      CorrectionFormScreen(
        snapshot: _snapshot(),
        repository: LocalPlaceCorrectionRepository(),
        initialCategory: ReportCategory.wrongPhone,
      ),
      width: 320,
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('borang muat pada skala teks 1.6 tanpa limpahan', (tester) async {
    await tester.pumpWidget(_host(
      CorrectionFormScreen(
        snapshot: _snapshot(),
        repository: LocalPlaceCorrectionRepository(),
        initialCategory: ReportCategory.wrongPhone,
      ),
      width: 320,
      scale: 1.6,
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('borang membina dalam mod Dark', (tester) async {
    await tester.pumpWidget(_host(
      CorrectionFormScreen(
        snapshot: _snapshot(),
        repository: LocalPlaceCorrectionRepository(),
        initialCategory: ReportCategory.wrongPhone,
      ),
      dark: true,
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('correction-submit')), findsOneWidget);
  });

  for (final lang in ['ms', 'en', 'zh', 'ta']) {
    testWidgets('borang membina dalam bahasa $lang', (tester) async {
      await tester.pumpWidget(_host(
        CorrectionFormScreen(
          snapshot: _snapshot(),
          repository: LocalPlaceCorrectionRepository(),
          initialCategory: ReportCategory.wrongPhone,
        ),
        lang: lang,
      ));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text(_t('reportCurrentValue', lang)), findsOneWidget);
      expect(find.text(_t('reportDescription', lang)), findsOneWidget);
    });
  }

  testWidgets('medan borang mempunyai label semantik', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(_host(CorrectionFormScreen(
      snapshot: _snapshot(),
      repository: LocalPlaceCorrectionRepository(),
      initialCategory: ReportCategory.wrongPhone,
    )));
    await tester.pump();
    expect(find.bySemanticsLabel(_t('reportProposedValue')), findsWidgets);
    expect(find.bySemanticsLabel(_t('reportDescription')), findsWidgets);
    handle.dispose();
  });

  // --- 8. Snapshot ---------------------------------------------------------

  test('snapshot menangkap keadaan yang dipapar tanpa mereka nilai', () {
    final snapshot =
        captureSnapshot(_vm(), capturedAt: DateTime.utc(2026, 1, 5));
    expect(snapshot.placeId, 'place-1');
    expect(snapshot.hoursState, 'hours_unknown');
    expect(snapshot.priceState, 'price_unknown');
    expect(snapshot.ratingState, 'rating_hidden');
    expect(snapshot.halalState, 'halal_unknown');
    expect(snapshot.allergenState, 'allergen_unknown');
    expect(snapshot.contentHash, isNotEmpty);
  });

  test('cincang snapshot berubah bila kandungan yang dipapar berubah', () {
    final a = captureSnapshot(_vm(), capturedAt: DateTime.utc(2026, 1, 5));
    final b = captureSnapshot(_vm(sourceMode: CardSourceMode.sample),
        capturedAt: DateTime.utc(2026, 1, 5));
    expect(a.contentHash, isNot(b.contentHash));
  });

  test('cincang snapshot stabil untuk kandungan yang sama', () {
    final a = captureSnapshot(_vm(), capturedAt: DateTime.utc(2026, 1, 5));
    final b = captureSnapshot(_vm(), capturedAt: DateTime.utc(2026, 6, 9));
    // Masa tangkap tidak menyumbang kepada cincang kandungan.
    expect(a.contentHash, b.contentHash);
  });

  // --- 9. Pengesahan tulen -------------------------------------------------

  test('URL bukan http/https ditolak', () {
    expect(isSyntacticallyValidUrl('https://contoh.my'), isTrue);
    expect(isSyntacticallyValidUrl('javascript:alert(1)'), isFalse);
    expect(isSyntacticallyValidUrl('bukan-url'), isFalse);
  });

  test('koordinat di luar julat ditolak', () {
    final draft = CorrectionDraft(
      snapshot: _snapshot(),
      category: ReportCategory.wrongCoordinates,
      affectedField: CorrectableField.coordinates,
      proposedValue: '999, 999',
      description: 'Lokasi pin salah, jauh dari kedai sebenar.',
      evidence: [
        ReportEvidenceDraft(
          evidenceId: 'e1',
          evidenceType: ReportEvidenceType.mapScreenshot,
          observedAt: DateTime.utc(2026, 1, 5),
        ),
      ],
    );
    final result = validateDraft(draft);
    expect(result.valid, isFalse);
    expect(result.errorKeys, contains('reportErrorInvalidCoordinates'));
  });

  test('laporan tutup kekal memerlukan bukti', () {
    final rule = ruleFor(ReportCategory.permanentlyClosed);
    expect(rule.minimumEvidence, greaterThanOrEqualTo(1));
    expect(rule.requiresObservationDate, isTrue);
    expect(rule.adminReviewMandatory, isTrue);
  });

  test('setiap kategori mempunyai peraturan dan label l10n', () {
    for (final category in ReportCategory.values) {
      expect(kCategoryRules[category], isNotNull, reason: '$category');
      final key = kCategoryLabelKeys[category];
      expect(key, isNotNull, reason: '$category');
      for (final lang in ['ms', 'en', 'zh', 'ta']) {
        expect(_t(key!, lang), isNot(key), reason: '$category / $lang');
      }
    }
  });

  test('setiap status mempunyai label l10n dalam semua bahasa', () {
    for (final status in SubmissionStatus.values) {
      final key = kStatusLabelKeys[status];
      expect(key, isNotNull, reason: '$status');
      for (final lang in ['ms', 'en', 'zh', 'ta']) {
        expect(_t(key!, lang), isNot(key), reason: '$status / $lang');
      }
    }
  });

  test('semakan admin wajib untuk setiap kategori', () {
    for (final rule in kCategoryRules.values) {
      expect(rule.adminReviewMandatory, isTrue, reason: '${rule.category}');
    }
  });

  test('kategori keselamatan tidak menerima nilai tepat daripada pengguna', () {
    for (final rule in kCategoryRules.values) {
      if (rule.safetySensitive &&
          rule.category != ReportCategory.movedLocation) {
        expect(rule.allowsExactProposedValue, isFalse,
            reason: '${rule.category} tidak boleh menerima nilai tepat');
      }
    }
  });
}
