import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'pro_providers.dart';

/// 🧠 AI Food Coach (Pro): tips peribadi dari corak makan sebenar,
/// dipaparkan gaya perbualan.
class CoachScreen extends ConsumerWidget {
  const CoachScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final reportAsync = ref.watch(weeklyReportProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proCoachTitle'))),
      body: reportAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(
            child: Text('📡 ${l.t('postFailed')}',
                style: const TextStyle(fontSize: 13))),
        data: (r) {
          if (r['status'] != 'OK') {
            return Center(child: Text(l.t('lockedPro')));
          }
          final tips = (r['tips'] as List? ?? [])
              .map((t) => Map<String, dynamic>.from(t as Map))
              .toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              // Pembuka coach.
              _CoachBubble(
                text: l.t('coachIntro'),
                emoji: '🧠',
              ),
              const SizedBox(height: 10),
              ...tips.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _CoachBubble(
                      text: t['text'] as String? ?? '',
                      emoji: t['emoji'] as String? ?? '💡',
                    ),
                  )),
              if (tips.isEmpty)
                _CoachBubble(text: l.t('coachNoData'), emoji: '🍽️'),
            ],
          );
        },
      ),
    );
  }
}

class _CoachBubble extends StatelessWidget {
  const _CoachBubble({required this.text, required this.emoji});

  final String text;
  final String emoji;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 38,
          width: 38,
          decoration: const BoxDecoration(
            color: AppColors.softYellow,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(emoji, style: const TextStyle(fontSize: 20)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              color: AppColors.cardWhite,
              borderRadius: BorderRadius.only(
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
            ),
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 14.5,
                height: 1.4,
                color: AppColors.darkText,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
