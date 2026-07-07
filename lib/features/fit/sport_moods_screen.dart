import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'fit_providers.dart';
import 'sport_moods_data.dart';

class SportMoodsScreen extends ConsumerWidget {
  const SportMoodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final selected = ref.watch(fitProfileProvider).value?.selectedSportMood;
    final grouped = sportMoodsByCategory();
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
              l.t('fitSportMoodIntro'),
              style: const TextStyle(fontWeight: FontWeight.w700, height: 1.4),
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
                  Text(
                    SportMoodCategories.labels[category] ?? category,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ],
              ),
            ),
            ...(grouped[category] ?? const []).map(
              (mood) => _MoodTile(
                mood: mood,
                selected: selected == mood.id,
                onTap: () {
                  ref.read(fitServiceProvider).selectSportMood(mood.id);
                  Navigator.pop(context, mood.id);
                },
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
  });

  final SportMood mood;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        tileColor: AppColors.cardWhite,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: selected ? AppColors.primaryRed : AppColors.softBorder,
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
          mood.name,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          '${mood.purpose}\n${mood.baseDuration} min - ${mood.intensity}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: true,
        trailing: selected
            ? const Icon(Icons.check_circle, color: AppColors.healthyGreen)
            : const Icon(Icons.chevron_right, color: AppColors.mutedText),
      ),
    );
  }
}
