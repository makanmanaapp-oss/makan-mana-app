import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/models/makanmana_user_context.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/widgets/place_image.dart';
import '../taxonomy/taxonomy_data.dart';
import '../taxonomy/taxonomy_sheet.dart';

/// Tile untuk buka sheet taksonomi (mood/diet/allergy/cuisine).
class _TaxTile extends ConsumerWidget {
  const _TaxTile({
    required this.icon,
    required this.label,
    required this.type,
  });

  final IconData icon;
  final String label;
  final TaxonomyType type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(userTaxonomyProvider(type)).value?.length ?? 0;
    // SP10.4: PERATURAN KAD — bg mm.card, tajuk mm.onCard.
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () => showTaxonomySheet(context, ref, type: type, title: label),
        tileColor: mm.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: mm.border),
        ),
        leading: Container(
          height: 40,
          width: 40,
          decoration: BoxDecoration(
            color: AppColors.primaryRed
                .withValues(alpha: context.isDarkMode ? 0.18 : 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 21, color: AppColors.primaryRed),
        ),
        title: Text(label,
            style: TextStyle(fontWeight: FontWeight.w700, color: mm.onCard)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (count > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primaryRed,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text('$count',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800)),
              ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right, color: mm.iconMuted),
          ],
        ),
      ),
    );
  }
}

/// ❤️ Senarai kegemaran (ciri Plus).
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final favsAsync = ref.watch(favoritesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('favoritesTitle'))),
      body: favsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => const Center(child: Icon(Icons.error_outline)),
        data: (favs) {
          if (favs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  l.t('favoritesEmpty'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.mutedText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            itemCount: favs.length,
            separatorBuilder: (context, i) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final f = favs[i];
              final mm = context.mm;
              return ListTile(
                onTap: () => context.push('/restaurant/${f['placeId']}'),
                tileColor: mm.card,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: mm.border),
                ),
                leading: PlaceImage(
                  name: f['name'] as String? ?? 'M',
                  height: 46,
                  width: 46,
                  borderRadius: 13,
                  monogramFontSize: 15,
                ),
                title: Text(
                  f['name'] as String? ?? '',
                  style:
                      TextStyle(fontWeight: FontWeight.w700, color: mm.onCard),
                ),
                subtitle: Text(f['cuisine'] as String? ?? '',
                    style: TextStyle(color: mm.onCardMuted)),
                trailing: Icon(Icons.chevron_right, color: mm.iconMuted),
              );
            },
          );
        },
      ),
    );
  }
}

/// 👅 Taste Profile: paparan pilihan rasa dari onboarding.
class TasteProfileScreen extends ConsumerWidget {
  const TasteProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Prompt 3: baca dari MakanManaUserContext (bukan lagi baca Firestore
    // terus). Ini juga membetulkan pepijat lama (halalPreference bool
    // di-cast sebagai String yang boleh crash).
    final c = ref.watch(makanManaUserContextProvider);
    final rows = <(String, String)>[
      ('Diet', c.dietType),
      ('Halal', c.halalPreference ? l.t('halalYes') : l.t('halalAny')),
      ('Alahan', c.allergies.isEmpty ? '-' : c.allergies.join(', ')),
      ('Bajet', 'RM${c.budgetMin} - RM${c.budgetMax}'),
      ('Radius', '${c.effectiveRadiusKm.round()} km'),
      (
        'Cuisine',
        c.favoriteCuisines.isEmpty ? '-' : c.favoriteCuisines.join(', ')
      ),
      ('Pedas', '${c.spicyPreference.clamp(0, 3)}/3'),
      ('Diet Goal', c.dietGoal),
    ];
    // SP10.4: kad & teks theme-aware (label kiri dulunya hampir hilang
    // dlm mod gelap sebab warna teks default atas kad putih).
    final mm = context.mm;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('tasteProfile'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          ...rows.map((r) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: mm.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: mm.border),
                ),
                child: Row(
                  children: [
                    Text(r.$1,
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: mm.onCard,
                            fontSize: 14)),
                    const Spacer(),
                    Flexible(
                      child: Text(
                        r.$2.isEmpty ? '-' : r.$2,
                        style: TextStyle(color: mm.onCardMuted, fontSize: 13.5),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 8),
          // Taksonomi luas V4: keutamaan dipilih dari sheet carian.
          Text(l.t('advancedPrefsTitle'),
              style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                  color: mm.onCard)),
          const SizedBox(height: 8),
          _TaxTile(
              icon: Icons.mood, label: 'Mood makan', type: TaxonomyType.mood),
          _TaxTile(
              icon: Icons.spa_outlined,
              label: 'Diet & pemakanan',
              type: TaxonomyType.diet),
          _TaxTile(
              icon: Icons.warning_amber_outlined,
              label: 'Alahan & sensitiviti',
              type: TaxonomyType.allergy),
          _TaxTile(
              icon: Icons.restaurant_menu,
              label: 'Cuisine kegemaran',
              type: TaxonomyType.cuisine),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: () => context.push(RoutePaths.onboarding),
            icon: const Icon(Icons.tune, size: 20),
            label: Text(l.t('editTaste')),
          ),
        ],
      ),
    );
  }
}

/// 🧠 Food Memory: ringkasan perkara yang MakanMana pelajari.
/// Peta id sebab reject -> kunci l10n label (Prompt 7/9).
const Map<String, String> _rejectReasonKeys = {
  'too_far': 'tooFar',
  'too_expensive': 'tooExpensive',
  'not_mood': 'notMood',
  'recently_ate': 'recentlyAte',
  'want_healthy': 'wantHealthy',
  'want_cheaper': 'wantCheaper',
  'want_nearby': 'wantNearby',
  'halal_uncertain': 'halalUncertain',
  'allergy_concern': 'allergyConcern',
  'other': 'otherReason',
};

/// Food Memory (Prompt 9): baca user_brain_profiles melalui MakanManaUserContext.
/// Papar data SEBENAR + keadaan "sedang belajar" bila keyakinan rendah.
/// Tiada data palsu/statik; tiada butiran kesihatan/badan sensitif.
class FoodMemoryScreen extends ConsumerWidget {
  const FoodMemoryScreen({super.key});

  double _confidence(Map<String, dynamic>? brain) {
    final c = brain?['confidence'];
    if (c is Map) {
      final o = c['overall'];
      if (o is num) return o.toDouble();
    }
    return 0;
  }

  List<MapEntry<String, double>> _scoreMap(Object? v, {int max = 6}) {
    if (v is Map) {
      final e = v.entries
          .map((x) => MapEntry(x.key.toString(),
              (x.value is num) ? (x.value as num).toDouble() : 0.0))
          .where((x) => x.key.isNotEmpty)
          .toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return e.take(max).toList();
    }
    return const [];
  }

  Future<void> _refresh(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l.t('fmRefreshing'))),
    );
    final ok =
        await ref.read(userBrainServiceProvider).recalculate(force: true);
    if (ok) {
      await ref.read(makanManaUserContextProvider.notifier).refresh();
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t(ok ? 'fmUpdated' : 'postFailed'))),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final ctx = ref.watch(makanManaUserContextProvider);
    final brain = ctx.foodMemorySummary;
    final confidence = _confidence(brain);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('foodMemory')),
        actions: [
          IconButton(
            tooltip: l.t('fmRecalculate'),
            icon: const Icon(Icons.refresh),
            onPressed: () => _refresh(context, ref),
          ),
        ],
      ),
      body: (brain == null || confidence < 0.15)
          ? _LearningState(l: l)
          : _brainBody(context, l, ctx, brain, confidence),
    );
  }

  Widget _brainBody(
    BuildContext context,
    AppLocalizations l,
    MakanManaUserContext ctx,
    Map<String, dynamic> brain,
    double confidence,
  ) {
    final topCuisines = _scoreMap(brain['topCuisines']);
    final timeSlots = _scoreMap(brain['preferredTimeSlots'], max: 4);
    final rejectReasons = _scoreMap(brain['commonRejectReasons'], max: 4);
    final acceptRate = ctx.acceptRate ?? 0;
    final rejectRate = ctx.rejectRate ?? 0;
    final priceLevel = ctx.preferredPriceLevel;
    final distanceKm = ctx.preferredDistanceKm;
    final repeatTolerance = ctx.repeatTolerance;
    final healthy = ctx.healthyPreference ?? 0;
    final heavy = ctx.heavyFoodFrequency ?? 0;
    final updatedAt = ctx.lastFoodMemoryUpdatedAt;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        // Keyakinan brain (jujur: makin banyak guna, makin tinggi).
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.softYellow,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              const MmIcon(MmIconType.foodMemory,
                  size: 20, color: AppColors.darkText),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${l.t('fmConfidence')}: ${(confidence * 100).round()}% • '
                  '${l.t('fmLearningMore')}',
                  // Banner kuning kekal dua-dua mod → teks WAJIB gelap
                  // eksplisit (dulu ikut tema = putih atas kuning).
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: AppColors.darkText),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        if (topCuisines.isNotEmpty) ...[
          _sectionTitle(l.t('topCuisinesLabel')),
          ...topCuisines.map((c) => _bar(c.key, c.value)),
          const SizedBox(height: 16),
        ],

        _sectionTitle(l.t('fmBudgetPref')),
        Text(
          priceLevel != null
              ? _priceRange(priceLevel)
              : l.t('priceRangeUnknown'),
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        _sectionTitle(l.t('fmDistancePref')),
        Text(
          '${distanceKm.toStringAsFixed(1)} km',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        if (timeSlots.isNotEmpty) ...[
          _sectionTitle(l.t('fmTimePattern')),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: timeSlots
                .map((t) => _chip('${l.t(t.key)} ${(t.value * 100).round()}%'))
                .toList(),
          ),
          const SizedBox(height: 16),
        ],

        if (rejectReasons.isNotEmpty) ...[
          _sectionTitle(l.t('fmRejectPattern')),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: rejectReasons.map((r) {
              final key = _rejectReasonKeys[r.key] ?? r.key;
              return _chip('${l.t(key)} • ${r.value.round()}');
            }).toList(),
          ),
          const SizedBox(height: 16),
        ],

        _sectionTitle(l.t('fmVariety')),
        Text(
          repeatTolerance < 0.35
              ? l.t('fmVarietyBored')
              : (repeatTolerance > 0.65
                  ? l.t('fmVarietyOk')
                  : l.t('fmVarietyMixed')),
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        if (healthy > 0 || heavy > 0) ...[
          _sectionTitle(l.t('fmHealthyPattern')),
          Text(
            healthy >= heavy ? l.t('fmHealthyLean') : l.t('fmHeavyLean'),
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
        ],

        _sectionTitle(l.t('fmActionRate')),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _chip('${l.t('fmAcceptRate')} ${(acceptRate * 100).round()}%'),
            _chip('${l.t('fmRejectRate')} ${(rejectRate * 100).round()}%'),
          ],
        ),
        const SizedBox(height: 18),

        if (updatedAt != null)
          Text(
            '${l.t('fmLastUpdated')}: '
            '${updatedAt.day}/${updatedAt.month}/${updatedAt.year}',
            style: const TextStyle(fontSize: 12, color: AppColors.mutedText),
          ),
      ],
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      );

  Widget _bar(String label, double value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(
              width: 96,
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: value.clamp(0.0, 1.0),
                  minHeight: 12,
                  backgroundColor: AppColors.softBorder,
                  valueColor:
                      const AlwaysStoppedAnimation<Color>(AppColors.warmYellow),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text('${(value * 100).round()}',
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          ],
        ),
      );

  Widget _chip(String text) => Builder(
        builder: (context) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: context.mm.chipBackground,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.mm.border),
          ),
          child: Text(text,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.mm.chipText)),
        ),
      );

  String _priceRange(int level) => const [
        '< RM5',
        'RM5 - RM10',
        'RM10 - RM20',
        'RM20 - RM40',
        '> RM40',
      ][level.clamp(0, 4)];
}

/// Keadaan "MakanMana sedang belajar" — data brain belum cukup.
class _LearningState extends StatelessWidget {
  const _LearningState({required this.l});
  final AppLocalizations l;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const MmIcon(MmIconType.foodMemory,
                size: 48, color: AppColors.primaryRed),
            const SizedBox(height: 14),
            Text(
              l.t('fmLearningTitle'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Text(
              l.t('fmNotEnough'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 13.5, height: 1.4, color: AppColors.mutedText),
            ),
          ],
        ),
      ),
    );
  }
}

/// ❓ Bantuan / FAQ ringkas.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final faqs = [
      (l.t('faq1Q'), l.t('faq1A')),
      (l.t('faq2Q'), l.t('faq2A')),
      (l.t('faq3Q'), l.t('faq3A')),
      (l.t('faq4Q'), l.t('faq4A')),
      (l.t('faq5Q'), l.t('faq5A')),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(l.t('helpLabel'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: faqs
            .map((f) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    // SP10.4: kad FAQ theme-aware — soalan dulunya
                    // putih-atas-putih dalam mod gelap.
                    color: context.mm.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.mm.border),
                  ),
                  child: ExpansionTile(
                    shape: const Border(),
                    iconColor: context.mm.iconMuted,
                    collapsedIconColor: context.mm.iconMuted,
                    title: Text(
                      f.$1,
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14.5,
                          color: context.mm.onCard),
                    ),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          f.$2,
                          style: TextStyle(
                              color: context.mm.onCardMuted,
                              fontSize: 13.5,
                              height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ))
            .toList(),
      ),
    );
  }
}
