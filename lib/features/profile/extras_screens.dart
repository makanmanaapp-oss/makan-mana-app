import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () =>
            showTaxonomySheet(context, ref, type: type, title: label),
        tileColor: AppColors.cardWhite,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.softBorder),
        ),
        leading: Container(
          height: 40,
          width: 40,
          decoration: BoxDecoration(
            color: AppColors.primaryRed.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 21, color: AppColors.primaryRed),
        ),
        title: Text(label,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (count > 0)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
            const Icon(Icons.chevron_right, color: AppColors.mutedText),
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
        error: (e, st) => const Center(child: Text('😕')),
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
              return ListTile(
                onTap: () =>
                    context.push('/restaurant/${f['placeId']}'),
                tileColor: AppColors.cardWhite,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: AppColors.softBorder),
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
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(f['cuisine'] as String? ?? ''),
                trailing: const Icon(Icons.chevron_right,
                    color: AppColors.mutedText),
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
    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';

    return Scaffold(
      appBar: AppBar(title: Text(l.t('tasteProfile'))),
      body: FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        future: FirebaseFirestore.instance
            .collection('user_profiles')
            .doc(uid)
            .get(),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final p = snap.data?.data() ?? {};
          final rows = <(String, String)>[
            ('🍽️ Diet', (p['dietType'] as String?) ?? '-'),
            ('☪️ Halal', (p['halalPreference'] as String?) ?? '-'),
            (
              '🚫 Alahan',
              ((p['allergies'] as List?)?.cast<String>().join(', ') ??
                      '')
                  .replaceAll(RegExp(r'^$'), '-'),
            ),
            (
              '💸 Bajet',
              'RM${p['budgetMin'] ?? '-'} - RM${p['budgetMax'] ?? '-'}',
            ),
            (
              '🍜 Cuisine',
              ((p['favoriteCuisines'] as List?)
                          ?.cast<String>()
                          .join(', ') ??
                      '')
                  .replaceAll(RegExp(r'^$'), '-'),
            ),
            ('🌶️ Pedas', (p['spicyPreference'] as String?) ?? '-'),
            ('🎯 Diet Goal', (p['dietGoal'] as String?) ?? '-'),
          ];
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              ...rows.map((r) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.cardWhite,
                      borderRadius: BorderRadius.circular(14),
                      border:
                          Border.all(color: AppColors.softBorder),
                    ),
                    child: Row(
                      children: [
                        Text(r.$1,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14)),
                        const Spacer(),
                        Flexible(
                          child: Text(
                            r.$2.isEmpty ? '-' : r.$2,
                            style: const TextStyle(
                                color: AppColors.mutedText,
                                fontSize: 13.5),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                  )),
              const SizedBox(height: 8),
              // Taksonomi luas V4: keutamaan dipilih dari sheet carian.
              const Text('Keutamaan lanjut',
                  style: TextStyle(
                      fontSize: 14.5, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              _TaxTile(
                  icon: Icons.mood,
                  label: 'Mood makan',
                  type: TaxonomyType.mood),
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
          );
        },
      ),
    );
  }
}

/// 🧠 Food Memory: ringkasan apa MakanMana belajar tentang kau.
class FoodMemoryScreen extends ConsumerWidget {
  const FoodMemoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final mealsAsync = ref.watch(mealsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('foodMemory'))),
      body: mealsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => const Center(child: Text('😕')),
        data: (meals) {
          if (meals.isEmpty) {
            return Center(
              child: Text(
                l.t('historyEmpty'),
                style: const TextStyle(
                  color: AppColors.mutedText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            );
          }
          final cuisineCount = <String, int>{};
          final placeCount = <String, (String, String, int)>{};
          var rated = 0;
          for (final m in meals) {
            cuisineCount[m.cuisine] =
                (cuisineCount[m.cuisine] ?? 0) + 1;
            final e = placeCount[m.placeId];
            placeCount[m.placeId] =
                (m.placeNameSnapshot, m.emoji, (e?.$3 ?? 0) + 1);
            if (m.satisfactionRating != null) rated++;
          }
          final topCuisines = cuisineCount.entries.toList()
            ..sort((a, b) => b.value.compareTo(a.value));
          final topPlaces = placeCount.values.toList()
            ..sort((a, b) => b.$3.compareTo(a.$3));
          final maxN =
              topCuisines.isEmpty ? 1 : topCuisines.first.value;

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.softYellow,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  '${l.t('memoryIntro')} ${meals.length} '
                  '${l.t('statMeals').toLowerCase()} • $rated ⭐',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13.5),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                l.t('topCuisinesLabel'),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              ...topCuisines.take(5).map((c) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 96,
                          child: Text(
                            c.key,
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: LinearProgressIndicator(
                              value: c.value / maxN,
                              minHeight: 12,
                              backgroundColor: AppColors.softBorder,
                              valueColor:
                                  const AlwaysStoppedAnimation<Color>(
                                      AppColors.warmYellow),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text('${c.value}',
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800)),
                      ],
                    ),
                  )),
              const SizedBox(height: 16),
              Text(
                l.t('favoritePlaceLabel'),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              ...topPlaces.take(3).map((p) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.cardWhite,
                      borderRadius: BorderRadius.circular(14),
                      border:
                          Border.all(color: AppColors.softBorder),
                    ),
                    child: Row(
                      children: [
                        Text(p.$2,
                            style: const TextStyle(fontSize: 24)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            p.$1,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text('${p.$3}x',
                            style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryRed)),
                      ],
                    ),
                  )),
            ],
          );
        },
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
                    color: AppColors.cardWhite,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.softBorder),
                  ),
                  child: ExpansionTile(
                    shape: const Border(),
                    title: Text(
                      f.$1,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14.5),
                    ),
                    childrenPadding:
                        const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          f.$2,
                          style: const TextStyle(
                              color: AppColors.mutedText,
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
