import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/mood/availability_label.dart';
import '../../core/mood/mood_formula.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/utils/place_actions.dart';
import '../../core/widgets/location_preview_card.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/widgets/place_image.dart';
import '../../core/widgets/primary_cta_button.dart';
import '../../models/place_summary.dart';
import 'suggestion_action_controller.dart';

/// Sebab reject kanonik (id) -> kunci l10n untuk label chip (Prompt 7).
const List<(String, String)> _rejectReasons = [
  ('too_far', 'tooFar'),
  ('too_expensive', 'tooExpensive'),
  ('not_mood', 'notMood'),
  ('recently_ate', 'recentlyAte'),
  ('want_healthy', 'wantHealthy'),
  ('want_cheaper', 'wantCheaper'),
  ('want_nearby', 'wantNearby'),
  ('halal_uncertain', 'halalUncertain'),
  ('allergy_concern', 'allergyConcern'),
  ('other', 'otherReason'),
];

/// Isyarat negatif (id backend) -> kunci l10n mesej jujur (bukan panik).
/// Termasuk id legasi + id Phase 2.3 (pemarkahan bersatu).
const Map<String, String> _negativeSignalKeys = {
  // Legasi (scoreAndRank)
  'possible_allergy_conflict': 'maybeAllergyConflict',
  'allergy_data_unknown': 'allergyDataUnknown',
  'possible_non_halal': 'halalStatusUnknown',
  'price_unknown': 'priceUnknown',
  // Phase 2.3 (model bersatu) — mesej jujur untuk data tidak disahkan.
  'price_estimated': 'priceEstimated',
  'hours_unverified': 'hoursUnverified',
  'halal_status_unknown': 'halalStatusUnknown',
  'beyond_preferred_distance': 'beyondPreferredDistance',
  'similar_to_recent': 'similarToRecent',
  'nutrition_not_verified': 'nutritionNotVerified',
};

/// Skrin Suggestion Result (Prompt 7): kontrak penuh + Accept/Reject/Next
/// dengan pengendalian selamat untuk spin / preview / sample.
class SuggestionScreen extends ConsumerStatefulWidget {
  const SuggestionScreen({super.key});

  @override
  ConsumerState<SuggestionScreen> createState() => _SuggestionScreenState();
}

class _SuggestionScreenState extends ConsumerState<SuggestionScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Segerak keadaan jika skrin dibuka dari laluan yang hanya set
      // currentSuggestionProvider (explore / meal plan / deep link).
      final current = ref.read(currentSuggestionProvider);
      final st = ref.read(suggestionActionControllerProvider);
      if (current != null && st.place?.placeId != current.placeId) {
        ref
            .read(suggestionActionControllerProvider.notifier)
            .beginFromPlace(current);
      }
      // Log suggestion_viewed (tidak crash jika suggestionId hilang).
      final s = ref.read(suggestionActionControllerProvider);
      final place = s.place ?? current;
      if (place != null) {
        logSuggestionViewed(ref, place,
            source: 'suggestion_card',
            suggestionId: s.suggestionId,
            sessionId: s.sessionId);
      }
    });
  }

  Future<void> _accept() async {
    final l = AppLocalizations.of(context);
    final ok = await ref
        .read(suggestionActionControllerProvider.notifier)
        .accept();
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('savedToHistory'))),
      );
      context.pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('postFailed'))),
      );
    }
  }

  Future<void> _sampleManualLog() async {
    final l = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Text(l.t('sampleLogConfirm')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l.t('cancelAction')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(l.t('logManually')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final ok = await ref
        .read(suggestionActionControllerProvider.notifier)
        .logSampleManually();
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('savedToHistory'))),
      );
      context.pop();
    }
  }

  void _openRejectSheet() {
    final l = AppLocalizations.of(context);
    final isSample = ref.read(suggestionActionControllerProvider).isSample;
    showModalBottomSheet<void>(
      context: context,
      // FIX 10.6: biar bottomSheetTheme uruskan bg (gelap/terang).
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.t('whyReject'),
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  // FIX 10.6: tajuk ikut tema — darkText dulu tak nampak gelap.
                  color: context.mm.onCard,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: _rejectReasons
                    .map(
                      (r) => ActionChip(
                        // Dark: isian kuning gelap + teks tema; Bright:
                        // kuning pucat + teks gelap (dari chipTheme).
                        label: Text(l.t(r.$2)),
                        backgroundColor: sheetContext.mm.softFill,
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _doReject(r.$1);
                        },
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    // "Cadangkan yang lain" tanpa sebab spesifik = other.
                    _doReject('other');
                  },
                  style: ElevatedButton.styleFrom(minimumSize: const Size(0, 48)),
                  child: Text(
                    isSample ? l.t('tryLiveSuggestion') : l.t('suggestAnother'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _doReject(String reasonId) async {
    final l = AppLocalizations.of(context);
    await ref
        .read(suggestionActionControllerProvider.notifier)
        .rejectWithReason(reasonId);
    if (!mounted) return;
    final s = ref.read(suggestionActionControllerProvider);
    // SESI ALGORITHM 2: Reject authoritative gagal sementara → keadaan "cuba lagi"
    // JUJUR (kad semasa dikekalkan; TIADA dummy). Pengguna boleh Reject semula.
    if (s.rejectError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('retry'))),
      );
      return;
    }
    // Log paparan calon seterusnya (jika ada).
    if (!s.noMore && s.place != null) {
      logSuggestionViewed(ref, s.place!,
          source: 'suggestion_card_next',
          suggestionId: s.suggestionId,
          sessionId: s.sessionId);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l.t('rejectThanks'))),
    );
  }

  void _openDetail(PlaceSummary place) {
    final s = ref.read(suggestionActionControllerProvider);
    logRestaurantDetailViewed(ref, place,
        suggestionId: s.suggestionId,
        sessionId: s.sessionId,
        source: s.source);
    context.push('/restaurant/${place.placeId}');
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final s = ref.watch(suggestionActionControllerProvider);
    final place = s.place ??
        ref.watch(currentSuggestionProvider) ??
        ref.watch(dummySuggestionServiceProvider).heroPick();

    return Scaffold(
      appBar: AppBar(title: Text(l.t('aiPickTitle'))),
      body: s.noMore
          ? _NoMoreState(
              onIncreaseRadius: () {
                context.pop();
              },
              onChangeMood: () {
                context.pop();
              },
              onSpinAgain: () => context.pop(),
              onBackHome: () => context.pop(),
            )
          : _buildResult(context, l, s, place),
    );
  }

  Widget _buildResult(BuildContext context, AppLocalizations l,
      SuggestionActionState s, PlaceSummary place) {
    // Prompt 5: sebab mesra-mood didahulukan (2-3 sahaja, tanpa dakwaan palsu).
    final ctx = ref.watch(makanManaUserContextProvider);
    final reasons = <String>{
      ...moodReasonKeys(ctx.selectedMood, place,
          radiusKm: ctx.effectiveRadiusKm.round()),
      ...place.matchReasonKeys,
    }.where((k) => _isDisplayable(l, k)).take(3).toList();

    // Isyarat negatif: papar maksimum 2 pada kad utama (baki di detail).
    // Phase 2.3C — 'hours_unverified' sudah ditunjuk oleh cip status ("Hours not
    // verified"); elak paparan berganda dalam senarai amaran.
    final signals = place.negativeSignals
        .where(_negativeSignalKeys.containsKey)
        .where((s) => s != 'hours_unverified')
        .take(2)
        .toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (s.isSample) ...[
            _SampleBanner(l: l, offline: s.source == 'offline_fallback'),
            const SizedBox(height: 12),
          ],
          PlaceImage(
            name: place.name,
            photoUrl: place.photoUrl,
            height: 210,
            width: double.infinity,
            borderRadius: 24,
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  place.name,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: context.mm.onCard,
                  ),
                ),
              ),
              _MatchBadge(score: place.matchScore, isSample: s.isSample),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoBadge(
                text: place.rating > 0
                    ? '★ ${place.rating} (${place.userRatingCount})'
                    : l.t('ratingUnknown'),
              ),
              _InfoBadge(
                text: place.distanceKm > 0
                    ? '${place.distanceKm} km'
                    : l.t('distanceUnknown'),
              ),
              // Phase 2.3C — status buka BERASAS BUKTI (helper tunggal). "Open
              // now" HANYA bila waktu disahkan + buka; jika tidak → neutral.
              _InfoBadge(
                text: l.t(availabilityLabelKey(place)),
                color: showsOpenNow(place)
                    ? AppColors.openGreen
                    : context.mm.onCardMuted,
              ),
              _InfoBadge(
                text: place.priceEstimate.isNotEmpty
                    ? place.priceEstimate
                    : l.t('priceRangeUnknown'),
              ),
            ],
          ),
          // Cip mood + radius kecil (Prompt 5/7).
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _SoftChip(text: '${l.t('moodLabel')}: ${l.t(ctx.selectedMood)}'),
              _SoftChip(text: '${ctx.effectiveRadiusKm.round()} km'),
            ],
          ),
          if (signals.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...signals.map((sig) => _WarningChip(text: l.t(_negativeSignalKeys[sig]!))),
          ],
          const SizedBox(height: 20),
          Text(
            l.t('whyPicked'),
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: context.mm.onCard,
            ),
          ),
          const SizedBox(height: 10),
          ...reasons.map(
            (key) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.check_circle,
                      color: AppColors.healthyGreen, size: 20),
                  const SizedBox(width: 8),
                  Expanded(child: Text(l.t(key))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          LocationPreviewCard(place: place, source: 'suggestion_card'),
          const SizedBox(height: 24),
          // CTA utama: accept sebenar, atau log manual untuk sample.
          PrimaryCtaButton(
            label: s.isSample
                ? l.t('logManually')
                : l.t('letsEatHere'),
            onPressed: s.processing
                ? null
                : (s.isSample ? _sampleManualLog : _accept),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: s.processing ? null : _openRejectSheet,
            child: Text(l.t('rejectSuggestion')),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => _openDetail(place),
            child: Text(l.t('viewDetails')),
          ),
        ],
      ),
    );
  }

  /// Elak papar kunci teknikal mentah (cth. some_raw_key tanpa terjemahan).
  bool _isDisplayable(AppLocalizations l, String key) {
    final v = l.t(key);
    if (v == key && !v.contains(' ')) return false;
    return true;
  }
}

class _SampleBanner extends StatelessWidget {
  const _SampleBanner({required this.l, this.offline = false});
  final AppLocalizations l;

  /// NET-01: fallback offline dapat label khusus "Mod offline".
  final bool offline;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.softYellow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warmYellow),
      ),
      child: Row(
        children: [
          Icon(offline ? Icons.wifi_off : Icons.science_outlined,
              size: 18, color: AppColors.warningOrange),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Kad kuning kekal dua-dua mod → teks WAJIB gelap.
                Text(l.t(offline ? 'offlineSample' : 'samplePreview'),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13.5,
                        color: AppColors.darkText)),
                Text(l.t('sampleNote'),
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.mutedText)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MatchBadge extends StatelessWidget {
  const _MatchBadge({required this.score, required this.isSample});
  final int score;
  final bool isSample;

  @override
  Widget build(BuildContext context) {
    // Sample = skor dilembutkan (kelabu + tilde), bukan dakwaan padanan sebenar.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: isSample ? AppColors.mutedText : AppColors.primaryRed,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        isSample ? '~$score%' : '$score%',
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 16,
        ),
      ),
    );
  }
}

class _WarningChip extends StatelessWidget {
  const _WarningChip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.softYellow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warmYellow),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, size: 18, color: AppColors.darkText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                  fontSize: 12.5, height: 1.3, color: AppColors.darkText),
            ),
          ),
        ],
      ),
    );
  }
}

class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.softYellow,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: AppColors.darkText),
      ),
    );
  }
}

class _InfoBadge extends StatelessWidget {
  const _InfoBadge({required this.text, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.mm.border),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: color ?? context.mm.onCard,
        ),
      ),
    );
  }
}

/// Keadaan "tiada lagi cadangan" — pilihan luaskan radius / tukar mood /
/// spin semula / balik Home (Prompt 7).
class _NoMoreState extends StatelessWidget {
  const _NoMoreState({
    required this.onIncreaseRadius,
    required this.onChangeMood,
    required this.onSpinAgain,
    required this.onBackHome,
  });

  final VoidCallback onIncreaseRadius;
  final VoidCallback onChangeMood;
  final VoidCallback onSpinAgain;
  final VoidCallback onBackHome;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            MmIcon(MmIconType.lapar,
                size: 48, color: context.mm.onCardMuted),
            const SizedBox(height: 12),
            Text(
              l.t('noMoreSuggestions'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: context.mm.onCard,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onIncreaseRadius,
                icon: const Icon(Icons.zoom_out_map, size: 20),
                label: Text(l.t('increaseRadius')),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onChangeMood,
                icon: const Icon(Icons.mood, size: 20),
                label: Text(l.t('changeMood')),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onSpinAgain,
                icon: const Icon(Icons.casino, size: 20),
                label: Text(l.t('spinAgain')),
              ),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: onBackHome,
              child: Text(l.t('backHome')),
            ),
          ],
        ),
      ),
    );
  }
}
