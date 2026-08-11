import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/location/location_display.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/events/event_types.dart';
import '../../core/mood/availability_label.dart';
import '../../core/mood/mood_formula.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/widgets/place_image.dart';
import 'home_palette.dart';
import '../notifications/notification_providers.dart';
import '../../models/meal.dart';
import '../../models/place_summary.dart';
import '../fit/fit_widgets.dart';
import '../reviews/rating_page.dart';
import '../suggestions/suggestion_repository.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// UI-02: elak sheet preview mood bertindan bila tekan pantas.
  bool _moodSheetOpen = false;

  /// Teaser mood premium: tunjuk nilai dulu, paywall kemudian (soft).
  /// Prompt 10: log locked_feature_previewed + hantar PaywallArgs (tiada
  /// kuota spin digunakan; selectedMood TIDAK ditukar kepada mood terkunci).
  void _showMoodPreview(String moodKey, MmIconType icon, String tier) {
    if (_moodSheetOpen) return;
    _moodSheetOpen = true;
    final l = AppLocalizations.of(context);
    final ent = ref.read(entitlementProvider);
    final isPro = tier == 'pro';
    final featureId = isPro ? FeatureId.moodHealthy : FeatureId.moodLifestyle;
    ref.read(eventLoggerProvider).logEvent(
      EventType.lockedFeaturePreviewed,
      sourceScreen: SourceScreen.home,
      sourceMode: 'locked_preview',
      metadata: {
        'featureId': featureId,
        'requiredPlan': isPro ? 'pro' : 'plus',
        'userPlan': ent.plan.id,
        'moodId': moodKey,
        'previewType': 'mood',
      },
    );
    final args = ent.buildPaywallArgs(
      featureId: featureId,
      sourceScreen: SourceScreen.home,
      requiredPlan: isPro ? PlanTier.pro : PlanTier.plus,
      moodId: moodKey,
    );
    // UI-02: useRootNavigator supaya sheet terapung DI ATAS bottom nav +
    // butang Spin AppShell (sebelum ini CTA tertutup pada peranti 360dp).
    showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      // FIX 10.6: guna bottomSheetTheme (mm.card gelap) — tajuk sheetContext.tText
      // jadi tak nampak atas bg putih dalam mod gelap.
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              MmIcon(icon, size: 52, color: AppColors.primaryRed),
              const SizedBox(height: 10),
              Text(
                l.t(moodKey),
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: sheetContext.tText,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l.t('previewNotice'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: sheetContext.mm.onCardMuted,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    context.push(RoutePaths.paywall, extra: args);
                  },
                  child: Text(
                    tier == 'pro'
                        ? l.t('unlockWithPro')
                        : l.t('unlockWithPlus'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ).whenComplete(() => _moodSheetOpen = false);
  }

  /// Dedupe: elak log suggestion_preview_shown berulang setiap rebuild.
  String? _lastPreviewPlaceId;
  bool _previewFailedLogged = false;

  @override
  void initState() {
    super.initState();
    // Log app_open + home_view sekali setiap kali Home dibuka (AI Brain).
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      final controller = ref.read(spinControllerProvider);
      controller.logAppEvent('app_open');
      controller.logAppEvent('home_view');
      // Daftar notifikasi push (sekali sahaja per sesi).
      final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      ref.read(notificationServiceProvider).init(uid);
      // Core Spine: pastikan konteks global terhidrat (dilangkau jika sudah).
      if (uid.isNotEmpty) {
        ref.read(makanManaUserContextProvider.notifier).loadForUser(uid);
        // Prompt 9: kemas kini Food Memory di latar (throttled, non-blocking).
        ref.read(userBrainServiceProvider).recalculate();
      }
    });
  }

  String _greetingKey() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'greetingMorning';
    if (hour < 15) return 'greetingAfternoon';
    if (hour < 19) return 'greetingEvening';
    return 'greetingNight';
  }

  /// Buka dari senarai berdekatan (tempat tunggal, tiada sesi/alternatif).
  void _openSuggestion(PlaceSummary place) {
    ref.read(suggestionActionControllerProvider.notifier).beginFromPlace(place);
    context.push(RoutePaths.suggestion);
  }

  /// Buka dari AI Pick (Home preview): bawa alternatif + sumber + label sample
  /// supaya Accept/Reject di skrin cadangan berkelakuan betul (Prompt 7).
  void _openSuggestionFromHome(HomeSuggestion s) {
    final ctx = ref.read(makanManaUserContextProvider);
    ref.read(suggestionActionControllerProvider.notifier).beginFromPreview(
          s.primary!,
          alternatives: s.alternatives,
          source: s.source,
          sessionId: s.sessionId,
          isSample: s.isSample,
          mood: ctx.selectedMood,
          radiusMeters: ctx.effectiveRadiusMeters,
        );
    context.push(RoutePaths.suggestion);
  }

  /// Prompt 4: pemilih radius carian (KM). Guna = sesi; Jadikan lalai =
  /// simpan ke user_profiles. Kedua-dua log radius_changed via notifier.
  void _showRadiusSheet(BuildContext context) {
    final l = AppLocalizations.of(context);
    final notifier = ref.read(makanManaUserContextProvider.notifier);
    var sel = ref.read(makanManaUserContextProvider).effectiveRadiusKm;
    const options = [1.0, 3.0, 5.0, 10.0, 15.0];

    showModalBottomSheet<void>(
      context: context,
      // FIX 10.6: biar bottomSheetTheme uruskan bg supaya tajuk/subtajuk radius
      // kekal terbaca dalam mod gelap (bukan putih-atas-putih).
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (builderContext, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.t('radiusTitle'),
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(l.t('radiusSubtitle'),
                    style: const TextStyle(
                        fontSize: 12.5, color: AppColors.mutedText)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: options
                      .map((r) => ChoiceChip(
                            selected: sel == r,
                            label: Text('${r.round()} km'),
                            selectedColor: AppColors.primaryRed,
                            labelStyle: TextStyle(
                                // FIX 10.6: label tak-terpilih ikut tema — chip
                                // gelap + darkText dulu jadi gelap-atas-gelap.
                                color: sel == r
                                    ? Colors.white
                                    : builderContext.tText,
                                fontWeight: FontWeight.w700),
                            onSelected: (_) => setSheet(() => sel = r),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          notifier.updateDefaultRadiusKm(sel);
                          Navigator.pop(sheetContext);
                        },
                        style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 46)),
                        child: Text(l.t('setDefaultAction'),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          notifier.updateSelectedRadiusKm(sel);
                          Navigator.pop(sheetContext);
                        },
                        style: ElevatedButton.styleFrom(
                            minimumSize: const Size(0, 46)),
                        child: Text(l.t('applyAction')),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---- Prompt 6: keadaan AI Pick (loading/error/empty/sample) ----

  Widget _aiPickShell({required Widget child, Color? color}) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: color ?? context.mm.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.mm.border),
        ),
        child: child,
      );

  Widget _aiPickLoading(AppLocalizations l) => _aiPickShell(
        child: Row(
          children: [
            const SizedBox(
              height: 22,
              width: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(l.t('aiPickLoading'),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.mutedText)),
            ),
          ],
        ),
      );

  Widget _aiPickError(AppLocalizations l) => _aiPickShell(
        child: Column(
          children: [
            Text(l.t('aiPickError'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () => ref.invalidate(homeSuggestionProvider),
              child: Text(l.t('retryAction')),
            ),
          ],
        ),
      );

  Widget _aiPickEmpty(AppLocalizations l, int r) {
    final notifier = ref.read(makanManaUserContextProvider.notifier);
    final bigger = [5, 10, 15].where((v) => v > r).take(2).toList();
    return _aiPickShell(
      color: context.mm.softFill,
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded,
              size: 34, color: AppColors.mutedText),
          const SizedBox(height: 8),
          Text('${l.t('noNearbyTitle')} (${r}km)',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final v in bigger)
                ElevatedButton(
                  onPressed: () =>
                      notifier.updateSelectedRadiusKm(v.toDouble()),
                  style: ElevatedButton.styleFrom(
                      minimumSize: const Size(0, 40)),
                  child: Text('${l.t('increaseTo')} ${v}km'),
                ),
              OutlinedButton(
                onPressed: () => notifier.updateSelectedMood('moodSurprise',
                    category: 'variety'),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                child: Text(l.t('changeMoodAction')),
              ),
              OutlinedButton(
                onPressed: () => ref.invalidate(homeSuggestionProvider),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                child: Text(l.t('retryAction')),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sampleBanner(AppLocalizations l) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.warningOrange.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border:
              Border.all(color: AppColors.warningOrange.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline,
                size: 16, color: AppColors.warningOrange),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${l.t('samplePreview')} · ${l.t('sampleNote')}',
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.warningOrange),
              ),
            ),
          ],
        ),
      );

  /// Prompt 4: keadaan "tiada hasil" jujur — tawar besarkan radius + cuba
  /// lagi (tidak memalsukan hasil). Naikkan radius akan segarkan nearby.
  Widget _nearbyEmptyState(BuildContext context, AppLocalizations l, int r) {
    final notifier = ref.read(makanManaUserContextProvider.notifier);
    final bigger = [5, 10, 15].where((v) => v > r).take(2).toList();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.mm.softFill,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded,
              size: 38, color: AppColors.mutedText),
          const SizedBox(height: 8),
          Text('${l.t('noNearbyTitle')} (${r}km)',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final v in bigger)
                ElevatedButton(
                  onPressed: () =>
                      notifier.updateSelectedRadiusKm(v.toDouble()),
                  style: ElevatedButton.styleFrom(
                      minimumSize: const Size(0, 42)),
                  child: Text('${l.t('increaseTo')} ${v}km'),
                ),
              OutlinedButton(
                onPressed: () => ref.invalidate(nearbyPlacesProvider),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(0, 42)),
                child: Text(l.t('retryAction')),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final service = ref.watch(dummySuggestionServiceProvider);
    final ctx = ref.watch(makanManaUserContextProvider);
    // Front Page Redesign 1A — palet skop-Home (bright = hex spesifikasi
    // tepat; dark = token tema). Global AppColors/context.mm tidak diubah.
    final palette = HomePalette.of(context);

    // Prompt 8: log suggestion_preview_shown bila AI Pick memapar hasil
    // (dedupe ikut placeId) + suggestion_request_failed bila gagal. Preview
    // TIDAK cipta sesi spin / guna kuota (Prompt 6.1).
    ref.listen(homeSuggestionProvider, (prev, next) {
      next.whenOrNull(
        data: (s) {
          _previewFailedLogged = false;
          final p = s.primary;
          if (p != null && p.placeId != _lastPreviewPlaceId) {
            _lastPreviewPlaceId = p.placeId;
            ref.read(eventLoggerProvider).logPreviewShown(
                  placeId: p.placeId,
                  placeNameSnapshot: p.name,
                  resultSource: s.source,
                  matchScore: p.matchScore.toDouble(),
                  rankPosition: 1,
                  candidateCount: s.alternatives.length + 1,
                  isSample: s.isSample,
                );
          }
        },
        error: (e, _) {
          if (!_previewFailedLogged) {
            _previewFailedLogged = true;
            ref.read(eventLoggerProvider).logEvent(
                  EventType.suggestionRequestFailed,
                  sourceScreen: SourceScreen.home,
                  sourceMode: SourceMode.preview,
                  metadata: {'error': e.runtimeType.toString()},
                );
          }
        },
      );
    });
    final radiusKm = ctx.effectiveRadiusKm.round();
    // Phase 2.8A — label lokasi JUJUR: fallback KL didedah, bukan didakwa
    // sebagai lokasi semasa pengguna (sumber tunggal LocationDisplay).
    final locKind = LocationDisplay.resolve(
        lat: ctx.currentLat, manualName: ctx.locationName);
    final locName = locKind == LocationDisplayKind.manual
        ? ctx.locationName!
        : l.t(LocationDisplay.labelKey(locKind));

    // Tempat sebenar dari pelayan (cache 7 hari); dummy semasa loading.
    final nearbyAsync = ref.watch(nearbyPlacesProvider);
    final places = nearbyAsync.value ?? service.nearby();
    final nearby = [...places]
      ..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));

    // Mood asas (penuh untuk Free) + mood premium (preview - Milestone 5).
    // BRIGHT MODE spec: ikon proprietary MakanMana, TIADA emoji sistem.
    final basicMoods = [
      ('moodPedas', MmIconType.pedas),
      ('moodJimat', MmIconType.bajet),
      ('moodLapar', MmIconType.lapar),
      ('moodSurprise', MmIconType.surprise),
    ];
    final plusMoods = [
      ('moodCafe', MmIconType.cafe),
      ('moodHujan', MmIconType.hujan),
      ('moodSupper', MmIconType.supper),
      ('moodHighRating', MmIconType.highRating),
      ('moodNearby', MmIconType.berhampiran),
    ];
    final proMoods = [
      ('moodHealthy', MmIconType.healthy),
    ];

    return Scaffold(
      backgroundColor: palette.background,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          // Front Page Redesign 1A — HERO HEADER warm-white (imej rujukan):
          // logo kiri-atas + loceng/profil kanan-atas → salam+nama → tajuk
          // besar 2-3 baris (satu perkataan disorot merah #DD1F22) → visual
          // hero makanan (bulatan merah hiasan) → lokasi + kuota Spin.
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(
                20, MediaQuery.paddingOf(context).top + 8, 16, 14),
            color: palette.background,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Wordmark rasmi (kiri) + 2. loceng notifikasi + 3. butang
                //    Threads api (kanan). Butang profil dikeluarkan dari header
                //    (profil kekal di tab bawah — flow tak berubah).
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: _BrandWordmark(palette: palette),
                    ),
                    const Spacer(),
                    _NotificationBell(onLight: false),
                    const SizedBox(width: 10),
                    _ThreadsButton(palette: palette),
                  ],
                ),
                const SizedBox(height: 10),
                // PRE-AAB: salam PREMIUM dua-lapis — frasa masa ringan (subtext)
                // di baris atas, NAMA sebenar pengguna disorot kuat (w800, teks
                // gelap, lebih besar) di baris bawah. Localization dikekalkan
                // (greetingMorning/Afternoon/Evening/Night ×4 bahasa); nama
                // dinamik (ctx.displayName) — TIADA "Superem" hardcode; nama
                // panjang → ellipsis (tiada pil/badge besar / tiada overflow).
                Builder(builder: (context) {
                  final name = ctx.displayName.trim().isEmpty
                      ? ''
                      : ctx.displayName.trim().split(' ').first;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name.isEmpty
                            ? l.t(_greetingKey())
                            : '${l.t(_greetingKey())},',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          color: palette.subtext,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.1,
                        ),
                      ),
                      if (name.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 20,
                            height: 1.05,
                            color: palette.text,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ],
                  );
                }),
                const SizedBox(height: 8),
                // 4 + 5. Tajuk besar (satu perkataan disorot) + visual hero.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Text.rich(
                        TextSpan(children: [
                          TextSpan(text: '${l.t('homeHeroLead')} '),
                          TextSpan(
                            text: l.t('homeHeroAccent'),
                            style: TextStyle(color: palette.primary),
                          ),
                        ]),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 29,
                          fontWeight: FontWeight.w800,
                          height: 1.12,
                          color: palette.text,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Carousel makanan (ganti grafik bulatan-merah/ikon lama).
                    HomeFoodHeroCarousel(palette: palette),
                  ],
                ),
                const SizedBox(height: 14),
                  // UI-01b: chip spin ambil saiz intrinsik (sentiasa boleh
                  // dibaca); chip radius pula yang mengecil dahulu — Spacer
                  // lama memampatkan chip spin kepada "S…" pada 360dp.
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Prompt 4: cip radius boleh tap (lokasi · radius).
                      Flexible(
                        child: GestureDetector(
                          onTap: () => _showRadiusSheet(context),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: palette.offWhite,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: palette.border),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.location_on,
                                    size: 15, color: palette.primary),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: ConstrainedBox(
                                    // Inter sedikit lebih lebar — beri ruang
                                    // supaya "· 3km" tidak dielipsiskan.
                                    constraints:
                                        const BoxConstraints(maxWidth: 168),
                                    child: Text(
                                      '$locName · ${radiusKm}km',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        color: palette.text,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                                Icon(Icons.expand_more,
                                    size: 16, color: palette.subtext),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Penunjuk spin harian: "Spin 2/3" (Free) / "Spin ∞"
                      // (Plus/Pro) — saiz intrinsik, tidak dimampatkan.
                      ref.watch(dailyUsageProvider).maybeWhen(
                            data: (usage) => Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: palette.offWhite,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: palette.border),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  MmIcon(MmIconType.spin,
                                      size: 14,
                                      color: palette.primary,
                                      accent: palette.primary),
                                  const SizedBox(width: 5),
                                  Text(
                                    usage.unlimited
                                        ? '${l.t('spinShort')} ∞'
                                        : '${l.t('spinShort')} '
                                            '${usage.spinUsed}'
                                            '/${usage.spinLimit}',
                                    maxLines: 1,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: palette.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            orElse: () => const SizedBox.shrink(),
                          ),
                    ],
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
            // Bar carian - terus ke Explore (ada carian penuh).
            // Front Page Redesign 1A — bar carian: 56dp, radius 22, permukaan
            // kad, sempadan halus, elevasi lembut, ikon carian besar + ikon
            // penapis merah. Callback dikekalkan (→ Explore carian penuh).
            GestureDetector(
              onTap: () => context.go(RoutePaths.explore),
              child: Container(
                height: 56,
                padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
                decoration: BoxDecoration(
                  color: palette.card,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: palette.border),
                  boxShadow: palette.isDark
                      ? null
                      : [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.05),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                ),
                child: Row(
                  children: [
                    Icon(Icons.search, size: 26, color: palette.subtext),
                    const SizedBox(width: 10),
                    // QA akhir: Expanded + ellipsis — hint melimpah pada
                    // 360dp skala teks 1.30.
                    Expanded(
                      child: Text(
                        l.t('searchHint'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.subtext),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Ikon penapis merah (kanan) — buka Explore (penapis penuh).
                    Container(
                      height: 40,
                      width: 40,
                      decoration: BoxDecoration(
                        color: palette.primary.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(Icons.tune_rounded,
                          size: 20, color: palette.primary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Mood chips
            Text(
              l.t('moodTitle'),
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                // SP10: theme-aware (mod gelap boleh dibaca).
                color: context.tText,
              ),
            ),
            const SizedBox(height: 10),
            // Gating M5: Basic percuma; Plus/Pro penuh ikut pelan,
            // selain tu teaser -> paywall (soft, tunjuk nilai dulu).
            Builder(builder: (builderContext) {
              final ent = ref.watch(entitlementProvider);
              final plusOk = ent.isPlusOrAbove;
              final proOk = ent.isPro;
              final selectedMood = ref.watch(selectedMoodProvider);

              // Prompt 5: pilih mood -> kemas kini konteks (yang turut
              // menyegerak selectedMoodProvider + log mood_selected).
              // nearbyPlacesProvider mendengar mood -> Home susun semula.
              void select(String mood) {
                final f = moodFormulaFor(mood);
                ref
                    .read(makanManaUserContextProvider.notifier)
                    .updateSelectedMood(mood, category: f.category.name);
              }

              // Front Page Redesign 1A — jubin mood (bukan chip rata):
              // dipilih = merah + ikon/label putih + kedalaman merah-gelap;
              // tak dipilih = putih + ikon merah + label gelap + sempadan.
              // ID kanonikal, kelakuan pilih, skrol mendatar dikekalkan.
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    ...basicMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: _MoodTile(
                            label: l.t(m.$1),
                            icon: m.$2,
                            selected: selectedMood == m.$1,
                            palette: palette,
                            onTap: () => select(m.$1),
                          ),
                        )),
                    ...plusMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: _MoodTile(
                            label: l.t(m.$1),
                            icon: m.$2,
                            selected: selectedMood == m.$1,
                            palette: palette,
                            badge: plusOk ? null : l.t('plusBadge'),
                            onTap: plusOk
                                ? () => select(m.$1)
                                : () => _showMoodPreview(m.$1, m.$2, 'plus'),
                          ),
                        )),
                    ...proMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: _MoodTile(
                            label: l.t(m.$1),
                            icon: m.$2,
                            selected: selectedMood == m.$1,
                            palette: palette,
                            badge: proOk ? null : l.t('proBadge'),
                            onTap: proOk
                                ? () => select(m.$1)
                                : () => _showMoodPreview(m.$1, m.$2, 'pro'),
                          ),
                        )),
                    // Pintasan hub Pro Tools (meterai Pro proprietary).
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: _MoodTile(
                        label: l.t('proHubTitle'),
                        icon: MmIconType.proSeal,
                        selected: false,
                        palette: palette,
                        badge: proOk ? null : l.t('proBadge'),
                        onTap: () => context.push('/pro'),
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 24),

            // Hero AI Pick
            Text(
              l.t('aiPickTitle'),
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: context.tText,
              ),
            ),
            const SizedBox(height: 10),
            // Prompt 6: AI Pick sebenar dari getSuggestions (mode preview).
            ref.watch(homeSuggestionProvider).when(
                  loading: () => _aiPickLoading(l),
                  error: (e, _) => _aiPickError(l),
                  data: (s) {
                    if (s.isEmpty || s.primary == null) {
                      return _aiPickEmpty(l, radiusKm);
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (s.isSample) _sampleBanner(l),
                        if (s.isSample) const SizedBox(height: 8),
                        _HeroPickCard(
                          place: s.primary!,
                          onTap: () => _openSuggestionFromHome(s),
                        ),
                      ],
                    );
                  },
                ),
            // Kad "Macam mana makan tadi?" - makan 24 jam yang belum dinilai.
            ref.watch(mealsProvider).maybeWhen(
                  data: (meals) {
                    Meal? unrated;
                    for (final m in meals) {
                      if (m.id.isNotEmpty &&
                          m.satisfactionRating == null &&
                          DateTime.now().difference(m.mealTime).inHours < 24) {
                        unrated = m;
                        break;
                      }
                    }
                    if (unrated == null) return const SizedBox.shrink();
                    final meal = unrated;
                    return Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: InkWell(
                        onTap: () => context.push(
                          '/rate',
                          extra: RatingArgs(
                            placeId: meal.placeId,
                            placeName: meal.placeNameSnapshot,
                            emoji: meal.emoji,
                            cuisine: meal.cuisine,
                            source: 'meal',
                            mealId: meal.id,
                          ),
                        ),
                        borderRadius: BorderRadius.circular(18),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: context.mm.softFill,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              PlaceImage(
                                name: meal.placeNameSnapshot,
                                height: 40,
                                width: 40,
                                borderRadius: 12,
                                monogramFontSize: 15,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  '${l.t('howWasMeal')} '
                                  '${meal.placeNameSnapshot}?',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14.5,
                                    color: context.mm.onCard,
                                  ),
                                ),
                              ),
                              const Icon(Icons.chevron_right,
                                  size: 24, color: AppColors.mutedText),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            const SizedBox(height: 24),

            // Berdekatan + penunjuk mood semasa (Prompt 5).
            // QA akhir: tajuk Expanded + chip Flexible — Row tegar melimpah
            // kanan pada 360dp skala teks 1.30.
            Row(
              children: [
                Expanded(
                  child: Text(
                    l.t('nearbyTitle'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: context.tText,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: context.mm.softFill,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${l.t('moodLabel')}: ${l.t(ctx.selectedMood)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: context.mm.onCard),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (nearby.isEmpty)
              _nearbyEmptyState(context, l, radiusKm)
            else
              // Front Page Redesign 1A — karusel mendatar kad penemuan makanan.
              // Tinggi kad diberi pampasan skala teks supaya tiada kliping pada
              // 1.30. Lebar kad konsisten. Penyedia/callback nearby dikekalkan.
              SizedBox(
                height: 214 *
                    (1 +
                        0.55 *
                            (MediaQuery.textScalerOf(context).scale(14) / 14 -
                                1)),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: EdgeInsets.zero,
                  clipBehavior: Clip.none,
                  itemCount: nearby.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => SizedBox(
                    width: 158,
                    child: _NearbyCard(
                      place: nearby[i],
                      // Phase 2.3C — status buka berasas bukti (helper tunggal).
                      openLabel: l.t(availabilityLabelKey(nearby[i])),
                      onTap: () => _openSuggestion(nearby[i]),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 24),

            // Front Page Redesign 1 — Fit Coach DI BAWAH AI Pick + Nearby
            // (bukan antara Mood dan AI Pick). Susunan: Mood → AI Pick →
            // Nearby → Fit Coach → promo pilihan. Fungsi & callback dikekalkan.
            const FitCoachCard(),
            const SizedBox(height: 24),

            // Kad insight AI (promo pilihan sedia ada — dikekalkan di bawah).
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.mm.softFill,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                    color:
                        AppColors.warmYellow.withValues(alpha: 0.55)),
              ),
              child: Row(
                children: [
                  const MmIcon(MmIconType.foodMemory,
                      size: 26, color: AppColors.primaryRed),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l.t('aiInsight'),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: context.mm.onCard,
                      ),
                    ),
                  ),
                ],
              ),
            ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Front Page Redesign 1A — AI Pick sebagai kad HERO MERAH (imej rujukan).
/// Kiri: badge AI Pick + tajuk + meta (rating/jarak/harga/padanan — hanya bila
/// authoritatif) + sebab ringkas + butang aksi putih. Kanan: imej cadangan +
/// butang kegemaran berfungsi. Penyedia/callback + peraturan papar-jujur kekal.
class _HeroPickCard extends StatelessWidget {
  const _HeroPickCard({required this.place, required this.onTap});

  final PlaceSummary place;
  final VoidCallback onTap;

  Widget _meta(IconData? icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: Colors.white.withValues(alpha: 0.9)),
            const SizedBox(width: 3),
          ],
          Text(text,
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white.withValues(alpha: 0.95))),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    // Papar-jujur: tunjuk medan HANYA bila authoritatif (tiada nilai palsu).
    final showRating = place.rating > 0;
    final showDistance = place.distanceKm > 0;
    final showPrice = place.priceEstimate.trim().isNotEmpty;
    final showMatch = place.matchScore > 0;
    final reason = place.matchReasonKeys.isNotEmpty
        ? l.t(place.matchReasonKeys.first)
        : place.cuisine;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.primary, palette.primaryDark],
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: palette.primary.withValues(alpha: 0.28),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const MmIcon(MmIconType.pick,
                            size: 14, color: Colors.white),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(l.t('aiPickTitle'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    place.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                        color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      if (showRating) _meta(Icons.star_rounded, '${place.rating}'),
                      if (showDistance)
                        _meta(Icons.place_rounded, '${place.distanceKm} km'),
                      if (showPrice) _meta(null, place.priceEstimate),
                      if (showMatch)
                        _meta(Icons.bolt_rounded,
                            '${place.matchScore}% ${l.t('matchLabel')}'),
                    ],
                  ),
                  if (reason.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      reason,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5,
                          height: 1.25,
                          color: Colors.white.withValues(alpha: 0.92)),
                    ),
                  ],
                  const SizedBox(height: 14),
                  ElevatedButton(
                    onPressed: onTap,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: palette.primary,
                      elevation: 0,
                      minimumSize: const Size(0, 42),
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(l.t('viewDetails'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 14)),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: PlaceImage(
                    name: place.name,
                    photoUrl: place.photoUrl,
                    height: 150,
                    width: 110,
                    borderRadius: 0,
                  ),
                ),
                Positioned(
                  top: 6,
                  right: 6,
                  child: _FavoriteButton(place: place, onLight: false),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Front Page Redesign 1A — kad penemuan makanan padat (karusel Nearby).
/// Imej sudut-atas bulat + badge padanan (bila authoritatif) + kegemaran +
/// nama + rating/jarak/masakan (bila ada) + status buka jujur. Hanya medan
/// authoritatif dipapar. Penyedia/callback nearby dikekalkan.
class _NearbyCard extends StatelessWidget {
  const _NearbyCard({
    required this.place,
    required this.openLabel,
    required this.onTap,
  });

  final PlaceSummary place;
  final String openLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    final showRating = place.rating > 0;
    final showDistance = place.distanceKm > 0;
    final showMatch = place.matchScore > 0;
    final metaBits = <String>[
      if (showRating) '★ ${place.rating}',
      if (showDistance) '${place.distanceKm} km',
    ];
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: palette.border),
          boxShadow: palette.isDark
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                ClipRRect(
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(20)),
                  child: PlaceImage(
                    name: place.name,
                    photoUrl: place.photoUrl,
                    height: 92,
                    width: double.infinity,
                    borderRadius: 0,
                  ),
                ),
                if (showMatch)
                  Positioned(
                    left: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: palette.primary,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text('${place.matchScore}%',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800)),
                    ),
                  ),
                Positioned(
                  right: 6,
                  top: 6,
                  child: _FavoriteButton(place: place, onLight: false),
                ),
              ],
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      place.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13.5,
                        color: palette.text,
                      ),
                    ),
                    if (metaBits.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        metaBits.join(' • '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11.5, color: palette.subtext),
                      ),
                    ],
                    if (place.cuisine.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        place.cuisine,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 11, color: palette.subtext),
                      ),
                    ],
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: place.isOpen
                            ? AppColors.openGreen.withValues(alpha: 0.12)
                            : AppColors.mutedText.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        openLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: place.isOpen
                              ? AppColors.openGreen
                              : AppColors.mutedText,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Front Page Redesign 1A — jubin mood (Part 3). Dipilih = merah + ikon/label
/// putih + kedalaman merah-gelap; tak dipilih = kad putih + ikon merah + label
/// gelap + sempadan/bayang halus. Sasaran sentuh ≥48dp; label boleh 2 baris.
class _MoodTile extends StatelessWidget {
  const _MoodTile({
    required this.label,
    required this.icon,
    required this.selected,
    required this.palette,
    required this.onTap,
    this.badge,
  });

  final String label;
  final MmIconType icon;
  final bool selected;
  final HomePalette palette;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final iconColor = selected ? Colors.white : palette.primary;
    final labelColor = selected ? Colors.white : palette.text;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 80,
          constraints: const BoxConstraints(minHeight: 84),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? palette.primary : palette.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
                color: selected ? palette.primaryDark : palette.border),
            boxShadow: palette.isDark
                ? null
                : [
                    BoxShadow(
                      color: (selected ? palette.primary : Colors.black)
                          .withValues(alpha: selected ? 0.30 : 0.05),
                      blurRadius: selected ? 12 : 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  MmIcon(icon, size: 26, color: iconColor, accent: iconColor),
                  if (badge != null)
                    Positioned(
                      right: -14,
                      top: -8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: palette.yellow,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Text(badge!,
                            style: const TextStyle(
                                fontSize: 8.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.darkText)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  height: 1.05,
                  color: labelColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Home Food Hero Carousel — PRESENTATION ONLY.
///
/// Menggantikan grafik bulatan-merah/ikon-putih lama dengan carousel 9 aset PNG
/// makanan telus (disc merah sudah sebahagian artwork). Timer tempatan memutar
/// imej setiap ~5s dengan peralihan slaid+pudar (AnimatedSwitcher). TIADA
/// provider/backend/recommendation: keadaan indeks adalah state UI tempatan
/// semata. Rebuild provider TIDAK reset carousel (state kekal dlm State, tiada
/// key berubah). Aset gagal dilangkau; jika SEMUA gagal → fallback jenama
/// selamat. Hiasan sahaja (ExcludeSemantics). Timer dibatalkan dalam dispose.
class HomeFoodHeroCarousel extends StatefulWidget {
  const HomeFoodHeroCarousel({
    super.key,
    required this.palette,
    this.initialIndex, // null = mula berbeza ikut sesi; disuntik untuk ujian
    this.autoPlay = true, // ujian boleh matikan Timer
    this.assetsOverride, // hanya untuk ujian fallback/skip aset gagal
  });

  final HomePalette palette;
  final int? initialIndex;
  final bool autoPlay;
  final List<String>? assetsOverride;

  /// 9 aset dibekalkan (nama dinormalisasi). Rujukan tunggal untuk widget+ujian.
  static const List<String> assets = [
    'assets/images/home_food_carousel/nasi_lemak.png',
    'assets/images/home_food_carousel/ayam_gepuk.png',
    'assets/images/home_food_carousel/nasi_kandar.png',
    'assets/images/home_food_carousel/char_kuey_teow.png',
    'assets/images/home_food_carousel/sukiya_bowl.png',
    'assets/images/home_food_carousel/chicken_tenders.png',
    'assets/images/home_food_carousel/mee_bandung_muar.png',
    'assets/images/home_food_carousel/roti_canai.png',
    'assets/images/home_food_carousel/chicken_grill.png',
  ];

  @override
  State<HomeFoodHeroCarousel> createState() => _HomeFoodHeroCarouselState();
}

class _HomeFoodHeroCarouselState extends State<HomeFoodHeroCarousel> {
  late int _index;
  final Set<int> _failed = {};
  Timer? _timer;
  bool _didPrecache = false;

  List<String> get _assets =>
      widget.assetsOverride ?? HomeFoodHeroCarousel.assets;
  int get _n => _assets.length;

  @override
  void initState() {
    super.initState();
    // Imej awal muncul SERTA-MERTA (tiada placeholder kosong). Mula
    // deterministik (indeks 0) supaya render Home + golden stabil dan tidak
    // bergantung pada masa; auto-putar tetap melalui KESEMUA 9 dalam satu sesi.
    // initialIndex kekal sebagai suntikan ujian.
    _index = (widget.initialIndex ?? 0) % _n;
    if (widget.autoPlay) {
      // 5s berada dalam sasaran 4.5–6s; gelung berterusan.
      _timer =
          Timer.periodic(const Duration(milliseconds: 5000), (_) => _advance());
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didPrecache) return;
    _didPrecache = true;
    // Precache imej SETERUSNYA selepas frame pertama (tak sekat paint awal).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _precache(_nextIndex(_index));
    });
  }

  void _precache(int i) {
    precacheImage(AssetImage(_assets[i]), context)
        .catchError((Object _) {});
  }

  int _nextIndex(int from) {
    if (_failed.length >= _n) return from;
    var i = from;
    do {
      i = (i + 1) % _n;
    } while (_failed.contains(i) && i != from);
    return i;
  }

  void _advance() {
    if (!mounted) return;
    final next = _nextIndex(_index);
    if (next == _index) return;
    setState(() => _index = next);
    _precache(_nextIndex(next)); // sedia imej berikutnya utk slaid seterusnya
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.maybeOf(context);
    final width = mq?.size.width ?? 412;
    final small = width < 360;
    // PRE-AAB: hero makanan DIBESARKAN ~20% (dominan visual lebih premium),
    // nisbah dikekalkan, kekal di kanan. 412: 164→197 ×146→175 (≈+20%);
    // <360: 140→168 ×124→149. Title kekal Expanded di kiri (tiada overflow;
    // tajuk hanya membalut lebih rapat) — tidak menutup loceng/Threads/tajuk.
    final boxW = small ? 168.0 : 197.0;
    final boxH = small ? 149.0 : 175.0;
    final reduceMotion = mq?.disableAnimations ?? false;
    final dpr = mq?.devicePixelRatio ?? 2.0;
    final cacheW = (boxW * dpr).round().clamp(220, 840);

    // Semua aset gagal → fallback jenama selamat (bukan ikon pecah/teks ralat).
    if (_failed.length >= _n) {
      return SizedBox(
        width: boxW,
        height: boxH,
        child: _HeroFoodVisual(palette: widget.palette),
      );
    }

    final path = _assets[_index];
    final image = Image.asset(
      path,
      key: ValueKey<String>(path), // ValueKey ikut aset → AnimatedSwitcher tukar
      width: boxW,
      height: boxH,
      fit: BoxFit.contain, // jangan potong pinggan / jangan herot nisbah
      cacheWidth: cacheW, // decode cekap; tiada dekod segerak 9 imej penuh
      errorBuilder: (_, __, ___) {
        // Aset ini gagal → tanda & maju ke aset sah seterusnya (Home tak crash,
        // tiada UI imej-pecah / laluan aset terdedah).
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          setState(() {
            _failed.add(_index);
            _index = _nextIndex(_index);
          });
        });
        return const SizedBox.shrink();
      },
    );

    return ExcludeSemantics(
      // Hiasan — jangan umum imej baharu setiap beberapa saat kpd screen reader.
      child: SizedBox(
        width: boxW,
        height: boxH,
        child: AnimatedSwitcher(
          duration: reduceMotion
              ? const Duration(milliseconds: 1) // hormati kurang-gerakan
              : const Duration(milliseconds: 430), // 350–550ms
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, animation) {
            // Slaid mendatar lembut + pudar (tiada putar/lantun/zum agresif).
            final slide = Tween<Offset>(
              begin: const Offset(0.16, 0),
              end: Offset.zero,
            ).animate(animation);
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(position: slide, child: child),
            );
          },
          child: image,
        ),
      ),
    );
  }
}

/// Front Page Redesign 1A — visual hero makanan (Part 1). Bulatan merah hiasan
/// + aset hero makanan bila tersedia; jika tiada aset, degrade anggun ke glif
/// makanan putih (BUKAN keratan tangkap-layar). Kecil pada skrin sempit.
/// (Kini juga: fallback selamat bila SEMUA aset carousel gagal.)
class _HeroFoodVisual extends StatelessWidget {
  const _HeroFoodVisual({required this.palette});
  final HomePalette palette;

  @override
  Widget build(BuildContext context) {
    final dia = MediaQuery.sizeOf(context).width < 360 ? 92.0 : 116.0;
    return SizedBox(
      width: dia,
      height: dia,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: dia,
            height: dia,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [palette.softRed, palette.primary],
              ),
              boxShadow: palette.isDark
                  ? null
                  : [
                      BoxShadow(
                        color: palette.primary.withValues(alpha: 0.28),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                    ],
            ),
          ),
          ClipOval(
            child: Image.asset(
              'assets/images/home_food_hero.png',
              width: dia,
              height: dia,
              fit: BoxFit.cover,
              // Slot aset hero masih PENDING → glif makanan (tiada crop palsu).
              errorBuilder: (_, __, ___) => Center(
                child: MmIcon(MmIconType.lapar,
                    size: dia * 0.52,
                    color: Colors.white,
                    accent: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Front Page Redesign 1A — butang kegemaran BERFUNGSI (Part 4/5). Guna semula
/// kontrak sedia ada: `isFavoriteProvider` + gate Plus + tulis
/// users/{uid}/favorites/{placeId} (skema sama dgn skrin restoran). Bukan
/// kawalan palsu. Selamat bila belum log masuk / Firebase belum sedia.
class _FavoriteButton extends ConsumerWidget {
  const _FavoriteButton({required this.place, required this.onLight});
  final PlaceSummary place;
  final bool onLight;

  Future<void> _toggle(
      BuildContext context, WidgetRef ref, bool isFav) async {
    final l = AppLocalizations.of(context);
    final ent = ref.read(entitlementProvider);
    // Gate lembut Plus (sama seperti skrin restoran) — tiada pintasan.
    if (!ent.isPlusOrAbove) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('lockedPlus'))),
      );
      context.push(
        RoutePaths.paywall,
        extra: ent.buildPaywallArgs(
          featureId: FeatureId.favoritesFull,
          sourceScreen: 'home',
          requiredPlan: PlanTier.plus,
        ),
      );
      return;
    }
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty) return;
    final docRef = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('favorites')
        .doc(place.placeId);
    try {
      if (isFav) {
        await docRef.delete();
      } else {
        await docRef.set({
          'placeId': place.placeId,
          'name': place.name,
          'emoji': place.emoji,
          'cuisine': place.cuisine,
          'addedAt': FieldValue.serverTimestamp(),
        });
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('favoriteAdded'))),
          );
        }
      }
    } catch (_) {
      /* best-effort; jangan crash UI */
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final isFav = ref.watch(isFavoriteProvider(place.placeId)).maybeWhen(
          data: (v) => v,
          orElse: () => false,
        );
    return Semantics(
      button: true,
      label: l.t('favoritePlaceLabel'),
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _toggle(context, ref, isFav),
          child: Padding(
            padding: const EdgeInsets.all(5),
            child: Icon(
              isFav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              size: 18,
              color: AppColors.primaryRed,
            ),
          ),
        ),
      ),
    );
  }
}

/// Front Page Redesign 1 — loceng notifikasi berfungsi.
///
/// Badge belum-baca AUTHORITATIF dari [unreadNotificationCountProvider] (tiada
/// kiraan palsu). 0 → tiada badge; 1–99 → nombor; 100+ → "99+". Tap → skrin
/// Notification Center. Berskop UID (auto-kosong bila tukar akaun/log keluar).
/// Wordmark jenama Home. Guna aset RASMI telus
/// (assets/branding/makanmana_wordmark.png — "makan" merah / "mana" kuning +
/// pin). Teks dwi-warna hanya fallback bila aset GAGAL dimuat (bukan produksi).
class _BrandWordmark extends StatelessWidget {
  const _BrandWordmark({required this.palette});
  final HomePalette palette;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'MakanMana',
      image: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 160, maxHeight: 46),
        child: Image.asset(
          'assets/branding/makanmana_wordmark.png',
          fit: BoxFit.contain,
          alignment: Alignment.centerLeft,
          // Wordmark tak patut membesar dgn skala teks aksesibiliti → FittedBox
          // sentiasa muat dalam kotak (elak overflow pada skala 1.3).
          errorBuilder: (_, __, ___) => FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('makan',
                  style: TextStyle(
                    fontSize: 22,
                    height: 0.98,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: palette.primary,
                  )),
              Text('mana',
                  style: TextStyle(
                    fontSize: 22,
                    height: 0.98,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: palette.yellow,
                  )),
            ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Butang Threads (api) — pasangan konsisten dgn loceng. Ke feed sosial sedia
/// ada (destinasi Threads). Label "Threads" di bawah bulatan (ikut rujukan).
class _ThreadsButton extends StatelessWidget {
  const _ThreadsButton({required this.palette});
  final HomePalette palette;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: l.t('threadsLabel'),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.push(RoutePaths.social),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 38,
              width: 38,
              decoration: BoxDecoration(
                color: palette.offWhite,
                shape: BoxShape.circle,
                border: Border.all(color: palette.border),
              ),
              child: Icon(Icons.local_fire_department_rounded,
                  size: 21, color: palette.primary),
            ),
            const SizedBox(height: 2),
            Text(l.t('threadsLabel'),
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w700,
                  color: palette.subtext,
                )),
          ],
        ),
      ),
    );
  }
}

/// Loceng notifikasi bertema (badge belum-baca authoritatif). Padanan saiz
/// dengan butang Threads (keluarga bulatan 38dp sama).
class _NotificationBell extends ConsumerWidget {
  const _NotificationBell({required this.onLight});

  /// Dikekalkan untuk keserasian pemanggil; warna dari HomePalette.
  final bool onLight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    final unread = ref.watch(unreadNotificationCountProvider);
    final badge = notificationBadgeLabel(unread);

    return Semantics(
      button: true,
      label: unread > 0
          ? '${l.t('notificationsTitle')}, $unread'
          : l.t('notificationsTitle'),
      child: Tooltip(
        message: l.t('notificationsTitle'),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => context.push(RoutePaths.notifications),
          // Kotak sedikit lebih besar dari bulatan → badge "99+" tidak terpotong.
          child: SizedBox(
            width: 44,
            height: 40,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.topCenter,
              children: [
                Container(
                  height: 38,
                  width: 38,
                  decoration: BoxDecoration(
                    color: palette.offWhite,
                    shape: BoxShape.circle,
                    border: Border.all(color: palette.border),
                  ),
                  child: Icon(Icons.notifications_none_rounded,
                      size: 20, color: palette.primary),
                ),
                if (badge != null)
                  Positioned(
                    top: -2,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      constraints:
                          const BoxConstraints(minWidth: 18, minHeight: 18),
                      decoration: BoxDecoration(
                        color: palette.primary,
                        borderRadius: BorderRadius.circular(9),
                        border:
                            Border.all(color: palette.background, width: 1.5),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        badge,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
