import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../../core/widgets/place_image.dart';
import '../../core/widgets/primary_cta_button.dart';

/// Skrin Suggestion Result (Milestone 1: data dummy, tindakan log penuh di Milestone 2).
class SuggestionScreen extends ConsumerWidget {
  const SuggestionScreen({super.key});

  void _accept(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final place = ref.read(currentSuggestionProvider);
    if (place != null) {
      // Rekod meal + status accepted + event accept (AI Brain)
      // di belakang tabir - UI terus respons.
      unawaited(ref.read(spinControllerProvider).accept(place));
    }
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(l.t('accepted'))));
    context.pop();
  }

  void _reject(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final reasons = [
      'rejectTooFar',
      'rejectTooPricey',
      'rejectNotMood',
      'rejectAteRecently',
      'rejectOther',
    ];

    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.t('rejectTitle'),
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: reasons
                    .map(
                      (r) => ActionChip(
                        label: Text(l.t(r)),
                        onPressed: () async {
                          Navigator.pop(sheetContext);
                          final place =
                              ref.read(currentSuggestionProvider);
                          if (place != null) {
                            // Log sebab reject ke AI Brain + calon seterusnya.
                            await ref
                                .read(spinControllerProvider)
                                .reject(place, r);
                          }
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content: Text(l.t('rejectThanks'))),
                            );
                          }
                        },
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final place = ref.watch(currentSuggestionProvider) ??
        ref.watch(dummySuggestionServiceProvider).heroPick();

    return Scaffold(
      appBar: AppBar(title: Text(l.t('aiPickTitle'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Foto sebenar kedai (Google Places) / monogram profesional.
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
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: AppColors.primaryRed,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    '${place.matchScore}%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _InfoBadge(text: '⭐ ${place.rating} (${place.userRatingCount})'),
                _InfoBadge(text: '📍 ${place.distanceKm} km'),
                _InfoBadge(
                  text: place.isOpen ? l.t('openNow') : l.t('closedNow'),
                  color: place.isOpen
                      ? AppColors.openGreen
                      : AppColors.mutedText,
                ),
                _InfoBadge(text: '💰 ${place.priceEstimate}'),
              ],
            ),
            const SizedBox(height: 22),
            Text(
              l.t('whyPicked'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            ...place.matchReasonKeys.map(
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
            const SizedBox(height: 24),
            PrimaryCtaButton(
              label: '😋 ${l.t('letsEatHere')}',
              onPressed: () => _accept(context, ref),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => _reject(context, ref),
              child: Text('🙅 ${l.t('notFeeling')}'),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () =>
                  context.push('/restaurant/${place.placeId}'),
              child: Text(l.t('viewDetails')),
            ),
          ],
        ),
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
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: color ?? AppColors.darkText,
        ),
      ),
    );
  }
}
