/// PART 1 Phase 1.13A — HARNES QA CANONICAL (DEBUG SAHAJA).
///
/// Skrin QA tempatan yang merender widget canonical SEBENAR (kad, Butiran Kedai,
/// borang pembetulan, diagnostik shadow-read) dengan fixtures terkawal supaya
/// setiap keadaan paparan-jujur boleh disahkan secara visual pada peranti
/// fizikal — termasuk keadaan yang data legasi langsung TIDAK boleh hasilkan
/// (halal luput, venue blocked/moved, rating null, dsb.).
///
/// KESELAMATAN:
/// - Hanya wujud apabila `kDebugMode` DAN `--dart-define=MM_CANONICAL_QA=true`.
///   Binaan keluaran tidak pernah memasukkan laluan ini.
/// - Bahasa/tema/skala disimpan dalam keadaan TEMPATAN — TIDAK menulis
///   SharedPreferences pengguna, TIDAK menulis Firestore, TIDAK menyentuh
///   Remote Config.
/// - Repositori pembetulan = LocalPlaceCorrectionRepository (mock tempatan).
/// - Banner merah "DEBUG CANONICAL QA — NOT PRODUCTION" sentiasa dipapar.
/// - RESET memulihkan semua lalai selamat.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../place_cards/place_card_view_model.dart';
import '../place_cards/place_cards.dart';
import '../place_corrections/correction_models.dart';
import '../place_corrections/correction_repository.dart';
import '../place_corrections/place_correction_flags.dart';
import '../place_corrections/report_entry_sheet.dart';
import '../place_migration/place_migration_flags.dart';
import '../place_migration/read_comparison.dart';
import '../restaurant/canonical/canonical_restaurant_detail_screen.dart';
import '../restaurant/canonical/restaurant_detail_view_model.dart';

/// Aktif hanya dalam debug + dengan dart-define MM_CANONICAL_QA=true.
const bool kCanonicalQaEnabled =
    kDebugMode && bool.fromEnvironment('MM_CANONICAL_QA');

const String _qaLangDefine =
    String.fromEnvironment('MM_QA_LANG', defaultValue: 'en');
const String _qaThemeDefine =
    String.fromEnvironment('MM_QA_THEME', defaultValue: 'light');
const String _qaScaleDefine =
    String.fromEnvironment('MM_QA_SCALE', defaultValue: '1.0');
const String _qaPageDefine =
    String.fromEnvironment('MM_QA_PAGE', defaultValue: 'cards');

enum _QaPage { cards, detail, correction, shadow }

/// Aplikasi QA berdiri sendiri (MaterialApp tersendiri) supaya bahasa/tema/skala
/// boleh ditukar TANPA menyimpan ke keutamaan pengguna sebenar.
class CanonicalQaApp extends StatefulWidget {
  const CanonicalQaApp({super.key});

  @override
  State<CanonicalQaApp> createState() => _CanonicalQaAppState();
}

class _CanonicalQaAppState extends State<CanonicalQaApp> {
  late Locale _locale = Locale(_qaLangDefine);
  late ThemeMode _theme =
      _qaThemeDefine == 'dark' ? ThemeMode.dark : ThemeMode.light;
  late double _scale = double.tryParse(_qaScaleDefine) ?? 1.0;
  late _QaPage _page = _pageFromDefine(_qaPageDefine);

  static _QaPage _pageFromDefine(String s) => switch (s) {
        'detail' => _QaPage.detail,
        'correction' => _QaPage.correction,
        'shadow' => _QaPage.shadow,
        _ => _QaPage.cards,
      };

  @override
  void initState() {
    super.initState();
    // Aktifkan flag pembetulan untuk harness (debug sahaja; tidak dihantar).
    PlaceCorrectionFlags.placeCorrectionEnabled = true;
  }

  void _cycleLang() {
    const order = ['ms', 'en', 'zh', 'ta'];
    final i = order.indexOf(_locale.languageCode);
    setState(() => _locale = Locale(order[(i + 1) % order.length]));
  }

  void _toggleTheme() => setState(() =>
      _theme = _theme == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);

  void _toggleScale() =>
      setState(() => _scale = _scale >= 1.6 ? 1.0 : 1.6);

  void _reset() {
    // Pulihkan SEMUA lalai selamat.
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Safe defaults restored (legacyOnly)')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: _theme,
      locale: _locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(
        builder: (ctx) => MediaQuery(
          data: MediaQuery.of(ctx).copyWith(textScaler: TextScaler.linear(_scale)),
          child: _harness(ctx),
        ),
      ),
    );
  }

  Widget _harness(BuildContext context) {
    final mm = context.mm;
    return Scaffold(
      backgroundColor: mm.appBackground,
      body: SafeArea(
        child: Column(
          children: [
            _banner(),
            _controls(context),
            const Divider(height: 1),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _banner() => Container(
        width: double.infinity,
        color: const Color(0xFFB91C1C),
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
        child: const Text(
          'DEBUG CANONICAL QA — NOT PRODUCTION',
          textAlign: TextAlign.center,
          style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 12.5,
              letterSpacing: 0.4),
        ),
      );

  Widget _controls(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          _btn('Lang: ${_locale.languageCode}', _cycleLang, key: 'qa_lang'),
          _btn('Theme: ${_theme == ThemeMode.dark ? 'Dark' : 'Bright'}',
              _toggleTheme, key: 'qa_theme'),
          _btn('Scale: $_scale', _toggleScale, key: 'qa_scale'),
          _btn('Cards', () => setState(() => _page = _QaPage.cards),
              key: 'qa_cards', active: _page == _QaPage.cards),
          _btn('Detail', () => setState(() => _page = _QaPage.detail),
              key: 'qa_detail', active: _page == _QaPage.detail),
          _btn('Correction', () => setState(() => _page = _QaPage.correction),
              key: 'qa_correction', active: _page == _QaPage.correction),
          _btn('Shadow', () => setState(() => _page = _QaPage.shadow),
              key: 'qa_shadow', active: _page == _QaPage.shadow),
          _btn('RESET', _reset, key: 'qa_reset', danger: true),
        ],
      ),
    );
  }

  Widget _btn(String label, VoidCallback onTap,
      {required String key, bool active = false, bool danger = false}) {
    return FilledButton(
      key: Key(key),
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: danger
            ? const Color(0xFFB91C1C)
            : active
                ? MMColors.danger
                : context.mm.card,
        foregroundColor:
            (danger || active) ? Colors.white : context.mm.onCard,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        minimumSize: const Size(0, 44),
        side: BorderSide(color: context.mm.border),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12.5)),
    );
  }

  Widget _body() {
    switch (_page) {
      case _QaPage.cards:
        return _CardsPage();
      case _QaPage.detail:
        return _DetailPage();
      case _QaPage.correction:
        return _CorrectionPage();
      case _QaPage.shadow:
        return _ShadowPage();
    }
  }
}

// ---------------------------------------------------------------------------
// FIXTURES kad
// ---------------------------------------------------------------------------

PlaceCardViewModel _card({
  String title = 'Nasi Kandar Pelita',
  CardRatingModel rating = const CardRatingModel(rating: 4.3, reviewCount: 88),
  CardPriceModel price = const CardPriceModel(
      state: CardPriceState.estimatedRange, amountLabel: 'RM8-RM12'),
  CardHoursModel hours = const CardHoursModel(state: CardHoursState.openNow),
  CardBusinessState business = CardBusinessState.active,
  HalalDisplayState halal = HalalDisplayState.none,
  CardSourceMode source = CardSourceMode.live,
  List<CardWarning> warnings = const [],
  bool noImage = false,
  int? matchScore,
}) =>
    PlaceCardViewModel(
      placeId: 'qa-fixture-001',
      title: title,
      subtitle: 'Jalan Ampang',
      image: CardImageModel(isFallback: noImage, fallbackCategory: 'Mamak'),
      distanceMeters: 1200,
      rating: rating,
      price: price,
      hours: hours,
      businessState: business,
      cuisineLabels: const ['Mamak'],
      halal: halal,
      sourceMode: source,
      warnings: warnings,
      matchScore: matchScore,
    );

class _Labelled extends StatelessWidget {
  const _Labelled(this.label, this.child);
  final String label;
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.mm.onCardMuted)),
            const SizedBox(height: 6),
            child,
          ],
        ),
      );
}

class _CardsPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final items = <_Labelled>[
      _Labelled('1. Rating null (JANGAN 0.0)',
          CanonicalNearbyCard(vm: _card(rating: CardRatingModel.none), width: 300)),
      _Labelled(
          '2. Review count null',
          CanonicalNearbyCard(
              vm: _card(rating: const CardRatingModel(rating: 4.1)), width: 300)),
      _Labelled(
          '3. Unknown hours (JANGAN "Open")',
          CanonicalNearbyCard(
              vm: _card(hours: CardHoursModel.unknown), width: 300)),
      _Labelled(
          '4. Expired hours (recheck)',
          CanonicalNearbyCard(
              vm: _card(hours: const CardHoursModel(state: CardHoursState.hoursExpired)),
              width: 300)),
      _Labelled(
          '5. Estimated price (labelled)',
          CanonicalAiPickCard(vm: _card())),
      _Labelled(
          '6. Unknown price (unavailable)',
          CanonicalNearbyCard(
              vm: _card(price: CardPriceModel.unknown), width: 300)),
      _Labelled(
          '7. Halal possible-non (caution)',
          CanonicalAiPickCard(
              vm: _card(
                  halal: HalalDisplayState.possibleNonHalal,
                  warnings: const [
                CardWarning(
                    id: 'possible_non_halal',
                    severity: 'important',
                    labelKey: 'warnPossibleNonHalal',
                    relatedField: 'halal')
              ]))),
      _Labelled(
          '8. Allergen unknown (caution)',
          CanonicalAiPickCard(
              vm: _card(warnings: const [
            CardWarning(
                id: 'allergy_data_unknown',
                severity: 'caution',
                labelKey: 'warnAllergyUnknown',
                relatedField: 'allergy')
          ]))),
      _Labelled('9. Missing image (fallback)',
          CanonicalNearbyCard(vm: _card(noImage: true), width: 300)),
      _Labelled('10. Sample (labelled + no live action)',
          CanonicalAiPickCard(vm: _card(source: CardSourceMode.sample))),
      _Labelled(
          '11. Moved venue',
          CanonicalNearbyCard(
              vm: _card(business: CardBusinessState.moved), width: 300)),
      _Labelled(
          '12. Blocked/perm-closed venue',
          CanonicalNearbyCard(
              vm: _card(business: CardBusinessState.permanentlyClosed),
              width: 300)),
      _Labelled(
          '13. Match score (only when supplied)',
          CanonicalAiPickCard(vm: _card(matchScore: 92))),
      _Labelled('14. Explore grid', CanonicalExploreGridCard(vm: _card())),
      _Labelled('15. Map preview', CanonicalMapPreviewCard(vm: _card())),
    ];
    return ListView(
      padding: const EdgeInsets.all(12),
      children: items,
    );
  }
}

// ---------------------------------------------------------------------------
// FIXTURE Butiran Kedai
// ---------------------------------------------------------------------------

class _DetailPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final vm = RestaurantDetailViewModel(
      placeId: 'qa-fixture-001',
      title: 'Nasi Kandar Pelita',
      subtitle: 'Mamak',
      sourceMode: CardSourceMode.approvedCache,
      gallery: const DetailGallery(
          images: [DetailImageItem(image: CardImageModel(isFallback: true))]),
      businessState: CardBusinessState.temporarilyClosed,
      hours: const DetailHours(
          model: CardHoursModel(state: CardHoursState.hoursExpired)),
      rating: const CardRatingModel(rating: 4.2, reviewCount: 3),
      reviewCount: 3,
      price: const CardPriceModel(
          state: CardPriceState.estimatedRange, amountLabel: 'RM8-RM12'),
      location: const LocationInfo(
          address: 'Lot 149, Jalan Ampang, 50450 Kuala Lumpur',
          distanceMeters: 1200),
      contact: const ContactInfo(phone: '+60312345678'),
      cuisineLabels: const ['Mamak', 'Nasi Kandar'],
      halalState: HalalDisplayState.merchantClaimed,
      allergenStates: const [
        AllergenEvidence(
            allergenId: 'unspecified',
            presence: AllergenPresence.unknown,
            evidence: EvidenceLevel.inferred)
      ],
      dietaryStates: const [
        DietarySuitability(tagId: 'Vegetarian', evidence: EvidenceLevel.inferred)
      ],
      freshness: const FreshnessSummary(state: FreshnessState.expired),
      provenance: const ProvenanceSummary(
          sourceMode: CardSourceMode.approvedCache,
          lastUpdatedLabel: '2 days ago'),
      warnings: const [
        CardWarning(
            id: 'allergy_data_unknown',
            severity: 'caution',
            labelKey: 'warnAllergyUnknown',
            relatedField: 'allergy')
      ],
    );
    return CanonicalRestaurantDetailBody(vm: vm);
  }
}

// ---------------------------------------------------------------------------
// FIXTURE borang pembetulan (repositori mock tempatan)
// ---------------------------------------------------------------------------

class _CorrectionPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final snapshot = ReportOriginalSnapshot(
      placeId: 'qa-fixture-001',
      title: 'Nasi Kandar Pelita',
      capturedAt: DateTime.fromMillisecondsSinceEpoch(1700000000000),
      contentHash: 'qa-hash-001',
      address: 'Lot 149, Jalan Ampang',
      hoursState: 'hours_unknown',
      priceState: 'price_estimated',
      halalState: 'halal_merchant_claimed',
      sourceMode: 'approved_cache',
    );
    return ReportEntrySheetBody(
      snapshot: snapshot,
      repository: LocalPlaceCorrectionRepository(),
    );
  }
}

// ---------------------------------------------------------------------------
// Diagnostik shadow-read (perbandingan, bukan menggantikan legasi)
// ---------------------------------------------------------------------------

class _ShadowPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cases = <MapEntry<String, PlaceReadComparison>>[
      MapEntry('Perfect match', _cmp(_legacy(), _legacy())),
      MapEntry(
          'Legacy 0.0 rating vs canonical null',
          _cmp(_legacy(rating: 'rating_0_0'),
              _legacy(rating: 'rating_hidden'))),
      MapEntry(
          'Legacy open=true vs canonical hours_unknown',
          _cmp(_legacy(hours: 'open_now'),
              _legacy(hours: 'hours_unknown'))),
      MapEntry(
          'Estimated vs unknown price',
          _cmp(_legacy(price: 'price_estimated'),
              _legacy(price: 'price_unknown'))),
      MapEntry(
          'Expired halal evidence',
          _cmp(_legacy(halal: 'halal_certified'),
              _legacy(halal: 'halal_recheck_required'))),
      MapEntry(
          'Moved venue',
          _cmp(_legacy(business: 'active'),
              _legacy(business: 'moved'))),
      MapEntry(
          'Blocked canonical record',
          _cmp(_legacy(business: 'active'),
              _legacy(business: 'blocked'))),
      MapEntry(
          'Branch mismatch (title differs)',
          _cmp(_legacy(title: 'Pelita Ampang'),
              _legacy(title: 'Pelita Bangsar'))),
    ];
    final mm = context.mm;
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: MMColors.successGreen.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            'Legacy result stays user-visible. Canonical read is DIAGNOSTIC ONLY.',
            style: TextStyle(color: mm.onCard, fontSize: 12.5),
          ),
        ),
        for (final c in cases) _cmpCard(context, c.key, c.value),
      ],
    );
  }

  ComparablePlaceView _legacy({
    String title = 'Pelita Ampang',
    String rating = 'rating_hidden',
    String price = 'price_estimated',
    String hours = 'hours_unknown',
    String halal = 'halal_unknown',
    String business = 'active',
  }) =>
      ComparablePlaceView(
        placeId: 'qa-fixture-001',
        title: title,
        address: 'Jalan Ampang',
        ratingState: rating,
        priceState: price,
        hoursState: hours,
        halalState: halal,
        businessState: business,
      );

  PlaceReadComparison _cmp(ComparablePlaceView l, ComparablePlaceView c) =>
      comparePlaceReads(l, c,
          legacySource: 'legacy', canonicalSource: 'canonical_shadow');

  Widget _cmpCard(BuildContext context, String label, PlaceReadComparison r) {
    final mm = context.mm;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: mm.onCard, fontSize: 13)),
          const SizedBox(height: 6),
          for (final f in r.mismatches)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Row(
                children: [
                  Icon(Icons.circle,
                      size: 9, color: _sev(f.severity)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${f.field.name}: "${f.legacyValue}" → "${f.canonicalValue}"',
                      style: TextStyle(color: mm.onCardMuted, fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ),
          if (r.mismatches.isEmpty)
            Text('no mismatch',
                style: TextStyle(color: MMColors.successGreen, fontSize: 11.5)),
        ],
      ),
    );
  }

  Color _sev(ComparisonSeverity s) => switch (s) {
        ComparisonSeverity.critical => MMColors.danger,
        ComparisonSeverity.warning => MMColors.accentYellow,
        ComparisonSeverity.info => MMColors.successGreen,
        ComparisonSeverity.match => MMColors.successGreen,
      };
}
