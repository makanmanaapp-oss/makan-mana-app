import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/app_chip.dart';
import '../../core/widgets/place_image.dart';
import '../../models/place_summary.dart';

/// Explore: tempat sebenar berdekatan (cache pelayan 7 hari) +
/// carian nama + penapis cuisine. Fallback dummy semasa loading.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  String? _cuisineFilter;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final nearbyAsync = ref.watch(nearbyPlacesProvider);
    final all = nearbyAsync.value ??
        ref.watch(dummySuggestionServiceProvider).nearby(limit: 12);

    final cuisines = all.map((p) => p.cuisine).toSet().toList()..sort();
    var places = _cuisineFilter == null
        ? all
        : all.where((p) => p.cuisine == _cuisineFilter).toList();
    if (_query.isNotEmpty) {
      final q = _query.toLowerCase();
      places = places
          .where((p) =>
              p.name.toLowerCase().contains(q) ||
              p.cuisine.toLowerCase().contains(q))
          .toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('navExplore')),
        actions: [
          IconButton(
            tooltip: l.t('feedTitle'),
            icon: const Icon(Icons.local_fire_department_outlined),
            onPressed: () => context.push(RoutePaths.social),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: l.t('searchHint'),
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppColors.cardWhite,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: AppColors.softBorder),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: AppColors.softBorder),
                ),
              ),
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              children: cuisines
                  .map((c) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: AppChip(
                          label: c,
                          selected: _cuisineFilter == c,
                          onTap: () => setState(() =>
                              _cuisineFilter = _cuisineFilter == c ? null : c),
                        ),
                      ))
                  .toList(),
            ),
          ),
          if (nearbyAsync.isLoading)
            const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: places.isEmpty
                ? Center(
                    child: Text(
                      '🔍 ${l.t('noResults')}',
                      style: const TextStyle(
                        color: AppColors.mutedText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
                    itemCount: places.length,
                    separatorBuilder: (context, i) =>
                        const SizedBox(height: 12),
                    itemBuilder: (context, i) =>
                        _PlaceTile(place: places[i]),
                  ),
          ),
        ],
      ),
    );
  }
}

class _PlaceTile extends ConsumerWidget {
  const _PlaceTile({required this.place});

  final PlaceSummary place;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return ListTile(
      onTap: () {
        ref.read(currentSuggestionProvider.notifier).state = place;
        context.push('/restaurant/${place.placeId}');
      },
      tileColor: AppColors.cardWhite,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.softBorder),
      ),
      leading: PlaceImage(
        name: place.name,
        photoUrl: place.photoUrl,
        height: 48,
        width: 48,
        borderRadius: 14,
        monogramFontSize: 16,
      ),
      title: Text(
        place.name,
        style: const TextStyle(fontWeight: FontWeight.w700),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        '${place.cuisine} • ⭐ ${place.rating} • ${place.distanceKm} km'
        '${place.isOpen ? '' : ' • ${l.t('closedNow')}'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing:
          const Icon(Icons.chevron_right, color: AppColors.mutedText),
    );
  }
}
