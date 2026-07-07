import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/app_chip.dart';
import '../../core/widgets/place_image.dart';
import '../../models/meal.dart';
import '../../models/place_summary.dart';
import '../fit/fit_widgets.dart';
import '../reviews/rating_page.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Teaser mood premium: tunjuk nilai dulu, paywall kemudian (soft).
  void _showMoodPreview(String moodKey, String emoji, String tier) {
    final l = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.cardWhite,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 52)),
            const SizedBox(height: 10),
            Text(
              l.t(moodKey),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l.t('previewNotice'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.mutedText,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(sheetContext);
                  context.push(RoutePaths.paywall);
                },
                child: Text(
                  tier == 'pro' ? l.t('unlockWithPro') : l.t('unlockWithPlus'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

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
    });
  }

  String _greetingKey() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'greetingMorning';
    if (hour < 15) return 'greetingAfternoon';
    if (hour < 19) return 'greetingEvening';
    return 'greetingNight';
  }

  void _openSuggestion(PlaceSummary place) {
    ref.read(currentSuggestionProvider.notifier).state = place;
    context.push(RoutePaths.suggestion);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final service = ref.watch(dummySuggestionServiceProvider);

    // Tempat sebenar dari pelayan (cache 7 hari); dummy semasa loading.
    final nearbyAsync = ref.watch(nearbyPlacesProvider);
    final places = nearbyAsync.value ?? service.nearby();
    final openPlaces = places.where((p) => p.isOpen).toList();
    final hero = openPlaces.isNotEmpty
        ? openPlaces.reduce((a, b) => a.matchScore >= b.matchScore ? a : b)
        : service.heroPick();
    final nearby = [...places]
      ..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));

    // Mood asas (penuh untuk Free) + mood premium (preview - Milestone 5).
    final basicMoods = [
      ('moodPedas', '🌶️'),
      ('moodJimat', '💸'),
      ('moodLapar', '🤤'),
      ('moodSurprise', '🎲'),
    ];
    final plusMoods = [
      ('moodCafe', '☕'),
      ('moodHujan', '🌧️'),
      ('moodSupper', '🌙'),
      ('moodHighRating', '⭐'),
      ('moodNearby', '📍'),
    ];
    final proMoods = [
      ('moodHealthy', '🥗'),
    ];

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
          children: [
            // Header banner gradient sambal - identiti visual utama Home.
            Container(
              padding: const EdgeInsets.fromLTRB(18, 16, 12, 16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primaryRed,
                    Color(0xFFFF6B45),
                  ],
                ),
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primaryRed.withValues(alpha: 0.35),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${l.t(_greetingKey())} 👋',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.white.withValues(alpha: 0.85),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: l.t('feedTitle'),
                        onPressed: () => context.push(RoutePaths.social),
                        icon: const Icon(
                          Icons.local_fire_department,
                          color: AppColors.warmYellow,
                          size: 26,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    l.t('tagline'),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(Icons.location_on,
                          size: 16,
                          color: Colors.white.withValues(alpha: 0.85)),
                      const SizedBox(width: 4),
                      Text(
                        l.t('yourArea'),
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.white.withValues(alpha: 0.85),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),
                      // Penunjuk spin harian (Free: 3/hari).
                      ref.watch(dailyUsageProvider).maybeWhen(
                            data: (usage) => Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                usage.unlimited
                                    ? '🎡 ∞'
                                    : '🎡 ${l.t('spinToday')}: '
                                        '${usage.spinUsed}/${usage.spinLimit}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primaryRed,
                                ),
                              ),
                            ),
                            orElse: () => const SizedBox.shrink(),
                          ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Bar carian - terus ke Explore (ada carian penuh).
            GestureDetector(
              onTap: () => context.go(RoutePaths.explore),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.cardWhite,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.softBorder),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search, color: AppColors.mutedText),
                    const SizedBox(width: 10),
                    Text(
                      l.t('searchHint'),
                      style: const TextStyle(color: AppColors.mutedText),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Mood chips
            Text(
              l.t('moodTitle'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            // Gating M5: Basic percuma; Plus/Pro penuh ikut pelan,
            // selain tu teaser -> paywall (soft, tunjuk nilai dulu).
            Builder(builder: (builderContext) {
              final plan = ref.watch(userPlanProvider).value ?? 'free';
              final plusOk = plan == 'plus' || plan == 'pro';
              final proOk = plan == 'pro';
              final selectedMood = ref.watch(selectedMoodProvider);

              void select(String mood) =>
                  ref.read(selectedMoodProvider.notifier).state = mood;

              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    ...basicMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: AppChip(
                            label: l.t(m.$1),
                            emoji: m.$2,
                            selected: selectedMood == m.$1,
                            onTap: () => select(m.$1),
                          ),
                        )),
                    ...plusMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: AppChip(
                            label: l.t(m.$1),
                            emoji: m.$2,
                            selected: selectedMood == m.$1,
                            badge: plusOk ? null : l.t('plusBadge'),
                            onTap: plusOk
                                ? () => select(m.$1)
                                : () => _showMoodPreview(m.$1, m.$2, 'plus'),
                          ),
                        )),
                    ...proMoods.map((m) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: AppChip(
                            label: l.t(m.$1),
                            emoji: m.$2,
                            selected: selectedMood == m.$1,
                            badge: proOk ? null : l.t('proBadge'),
                            onTap: proOk
                                ? () => select(m.$1)
                                : () => _showMoodPreview(m.$1, m.$2, 'pro'),
                          ),
                        )),
                    // Pintasan hub Pro Tools 👑.
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: AppChip(
                        label: l.t('proHubTitle'),
                        emoji: '👑',
                        badge: proOk ? null : l.t('proBadge'),
                        onTap: () => context.push('/pro'),
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 24),

            const FitCoachCard(),
            const SizedBox(height: 8),

            // Hero AI Pick
            Text(
              l.t('aiPickTitle'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            _HeroPickCard(place: hero, onTap: () => _openSuggestion(hero)),
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
                            color: AppColors.softYellow,
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
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14.5,
                                    color: AppColors.darkText,
                                  ),
                                ),
                              ),
                              const Text('⭐', style: TextStyle(fontSize: 22)),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            const SizedBox(height: 24),

            // Berdekatan
            Text(
              l.t('nearbyTitle'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.92,
              children: nearby
                  .map((p) => _NearbyCard(
                        place: p,
                        openLabel: p.isOpen ? l.t('openNow') : l.t('closedNow'),
                        onTap: () => _openSuggestion(p),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 20),

            // Kad insight AI
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.softYellow, AppColors.creamBackground],
                ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.warmYellow),
              ),
              child: Row(
                children: [
                  const Text('🧠', style: TextStyle(fontSize: 28)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l.t('aiInsight'),
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkText,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroPickCard extends StatelessWidget {
  const _HeroPickCard({required this.place, required this.onTap});

  final PlaceSummary place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.softBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Foto sebenar kedai (Google Places) / monogram profesional.
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(24)),
              child: PlaceImage(
                name: place.name,
                photoUrl: place.photoUrl,
                height: 150,
                width: double.infinity,
                borderRadius: 0,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          place.name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.darkText,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.primaryRed,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${place.matchScore}% ${l.t('matchLabel')}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${place.cuisine} • ⭐ ${place.rating} • '
                    '${place.distanceKm} km • ${place.priceEstimate}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.mutedText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.softBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(20)),
              child: PlaceImage(
                name: place.name,
                photoUrl: place.photoUrl,
                height: 84,
                width: double.infinity,
                borderRadius: 0,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    place.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '⭐ ${place.rating} • ${place.distanceKm} km',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.mutedText,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: place.isOpen
                          ? AppColors.openGreen.withValues(alpha: 0.12)
                          : AppColors.mutedText.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      openLabel,
                      style: TextStyle(
                        fontSize: 11,
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
          ],
        ),
      ),
    );
  }
}
