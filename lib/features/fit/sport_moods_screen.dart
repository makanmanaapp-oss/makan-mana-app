import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import 'fit_providers.dart';
import 'sport_mood_display.dart';
import 'sport_moods_data.dart';

class SportMoodsScreen extends ConsumerWidget {
  const SportMoodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final isPro = access == FitAccess.full;
    final selected = ref.watch(fitProfileProvider).value?.selectedSportMood;
    final grouped = sportMoodsByCategory();

    void onTapMood(SportMood mood, String category) {
      if (!isPro) {
        // Free/Plus: preview + paywall (TIDAK simpan sebagai mood aktif).
        ref.read(eventLoggerProvider).logEvent(
          EventType.sportMoodPreviewed,
          sourceScreen: 'sport_moods',
          metadata: {
            'moodId': mood.id,
            'group': category,
            'intensity': mood.intensity,
            'requiredPlan': 'pro',
          },
        );
        context.push(
          RoutePaths.paywall,
          extra: fitPaywallArgs('sport_mood', 'sport_moods'),
        );
        return;
      }
      // Pro: simpan ke fitness_profiles + kemas kini konteks global.
      // updateSportMood menulis sport_preferences + log sport_mood_selected.
      ref
          .read(makanManaUserContextProvider.notifier)
          .updateSportMood(mood.id);
      ref
          .read(fitServiceProvider)
          .updateProfileFields({'selectedSportMood': mood.id});
      Navigator.pop(context, mood.id);
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.t('fitSportMoodTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: AppColors.softYellow,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Text(
              isPro ? l.t('fitSportMoodIntro') : l.t('sportMoodPreviewNote'),
              style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  height: 1.4,
                  color: AppColors.darkText),
            ),
          ),
          for (final category in SportMoodCategories.order) ...[
            Padding(
              padding: const EdgeInsets.only(top: 10, bottom: 8),
              child: Row(
                children: [
                  Icon(
                    SportMoodCategories.icons[category],
                    color: AppColors.primaryRed,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  // Expanded: label kategori mesti boleh balut pada skala teks
                  // besar (360dp @ 1.30) - tanpa ini Row melimpah.
                  Expanded(
                    child: Text(
                      resolveSportMoodCategoryLabel(l, category),
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.mm.onCard,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            ...(grouped[category] ?? const []).map(
              (mood) => _MoodTile(
                mood: mood,
                selected: isPro && selected == mood.id,
                locked: !isPro,
                onTap: () => onTapMood(mood, category),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MoodTile extends StatelessWidget {
  const _MoodTile({
    required this.mood,
    required this.selected,
    required this.onTap,
    this.locked = false,
  });

  final SportMood mood;
  final bool selected;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        tileColor: context.mm.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: selected ? AppColors.primaryRed : context.mm.border,
          ),
        ),
        leading: Container(
          height: 42,
          width: 42,
          decoration: BoxDecoration(
            color: AppColors.primaryRed.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(mood.icon, color: AppColors.primaryRed),
        ),
        title: Text(
          resolveSportMoodTitle(l, moodId: mood.id),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          '${l.t(mood.purposeKey)}\n${mood.baseDuration} min - '
          '${resolveIntensityLabel(l, mood.intensity)}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: true,
        trailing: locked
            ? Icon(Icons.lock_outline, color: context.mm.iconMuted)
            : (selected
                ? const Icon(Icons.check_circle, color: AppColors.healthyGreen)
                : Icon(Icons.chevron_right, color: context.mm.iconMuted)),
      ),
    );
  }
}
