import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/location/location_display.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/place_image.dart';
import '../../models/place_summary.dart';
import '../home/home_palette.dart';
import 'explore_flags.dart';
import 'explore_pagination_controller.dart';

/// Explore: tempat sebenar berdekatan (cache pelayan 7 hari) +
/// carian nama + penapis cuisine. Fallback dummy semasa loading.
///
/// Redesign (Image 2): tajuk besar + pil Trending, bar carian premium, cip
/// kategori merah-aktif, dan kad premium dengan NAMA PENUH sehingga 2 baris.
/// Semua penyedia/callback/pagination/route KEKAL (lapisan paparan sahaja).
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  String? _cuisineFilter;
  String _query = '';

  @override
  void initState() {
    super.initState();
    // Phase 2.2A — muat halaman pertama (incremental pagination).
    Future.microtask(
        () => ref.read(explorePaginationProvider.notifier).loadFirst());
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    final page = ref.watch(explorePaginationProvider);
    final all = page.places.isNotEmpty
        ? page.places
        : ref.watch(dummySuggestionServiceProvider).nearby(limit: 12);

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
      backgroundColor: palette.background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // 1–3. Tajuk besar "Explore" + pil Trending (callback sosial kekal).
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l.t('navExplore'),
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  _TrendingPill(onTap: () => context.push(RoutePaths.social)),
                ],
              ),
            ),
            // Panel diagnostik: debug + flag ON sahaja (default BERSIH).
            if (kDebugMode && ExploreFlags.diagnosticsVisible)
              _buildDiagnosticPanel(context, page),
            // Label lokasi jujur (kongsi sumber lokasi dengan Home).
            _buildNearLocationLabel(context, l),
            // 4. Bar carian premium (controller/onChanged/_query KEKAL).
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                style: TextStyle(color: palette.text),
                decoration: InputDecoration(
                  hintText: l.t('searchHint'),
                  hintStyle: TextStyle(color: palette.subtext),
                  prefixIcon: Icon(Icons.search, color: palette.subtext),
                  filled: true,
                  fillColor: palette.card,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(color: palette.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(color: palette.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(color: palette.primary, width: 1.4),
                  ),
                ),
              ),
            ),
            // 5. Cip kategori merah-aktif (semantik penapis _cuisineFilter KEKAL).
            SizedBox(
              height: 54,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: cuisines.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, i) {
                  final c = cuisines[i];
                  return Center(
                    child: _CategoryChip(
                      label: c,
                      selected: _cuisineFilter == c,
                      onTap: () => setState(() =>
                          _cuisineFilter = _cuisineFilter == c ? null : c),
                    ),
                  );
                },
              ),
            ),
            if (page.loading && page.places.isEmpty)
              const LinearProgressIndicator(minHeight: 2),
            // 6. Senarai kad premium (pagination/cursor KEKAL).
            Expanded(
              child: RefreshIndicator(
                onRefresh: () =>
                    ref.read(explorePaginationProvider.notifier).refresh(),
                child: places.isEmpty
                    ? ListView(
                        // ListView (bukan Center) supaya pull-to-refresh berfungsi.
                        children: [
                          const SizedBox(height: 120),
                          Center(
                            child: Text(
                              l.t('noResults'),
                              style: TextStyle(
                                color: palette.subtext,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      )
                    : _buildPaginatedList(context, l, page, places),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// "Near [kawasan]" — kawasan aktif dikongsi dengan Home (satu sumber lokasi).
  Widget _buildNearLocationLabel(BuildContext context, AppLocalizations l) {
    final ctx = ref.watch(makanManaUserContextProvider);
    final palette = HomePalette.of(context);
    // Phase 2.8A — label lokasi JUJUR + notis fallback (sumber tunggal).
    final kind = LocationDisplay.resolve(
        lat: ctx.currentLat, manualName: ctx.locationName);
    final area = kind == LocationDisplayKind.manual
        ? '${l.t('near')} ${ctx.locationName}'
        : l.t(LocationDisplay.labelKey(kind));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 2, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.location_on_outlined,
                  size: 16, color: palette.subtext),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  area,
                  style: TextStyle(
                    color: palette.subtext,
                    fontWeight: FontWeight.w600,
                    fontSize: 12.5,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          // Fallback KL didedah secara jujur (tak-menghalang). Tindakan "pilih
          // kawasan" tersedia melalui cip lokasi Home yang boleh diketik.
          if (LocationDisplay.showsFallbackNotice(kind))
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                l.t('locFallbackNotice'),
                style: TextStyle(
                  color: palette.subtext,
                  fontSize: 11.5,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDiagnosticPanel(
      BuildContext context, ExplorePaginationState page) {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid;
    final masked = (uid == null || uid.length < 8)
        ? (uid ?? 'none')
        : '${uid.substring(0, 4)}…${uid.substring(uid.length - 4)}';
    final diag = page.diagnostics;
    final cohortEligible = diag.isNotEmpty; // pelayan hantar diag hanya utk kohort
    final paginated = diag['paginated'] == true;
    final loc = page.location;
    final serverLoc = diag['requestLocation'];
    final lines = <String>[
      'BUILD $kAlgo2BuildId',
      'uid $masked  cohortEligible=$cohortEligible',
      'items=${page.places.length}  poolSize=${page.poolSize ?? "?"}  paginated=$paginated',
      'nextCursor=${page.endOfResults ? "none" : page.cursor}  endOfResults=${page.endOfResults}',
      // LOCATION CONSISTENCY diagnostik (requirement 8): lat/lng bertopeng,
      // radius, cell, cacheKey KLIEN + lokasi yang PELAYAN guna (echo).
      'EXPLORE loc=${loc?.maskedLatLng() ?? "?"}  radiusM=${loc?.radiusMeters ?? "?"}',
      'cell=${loc?.locationGrid ?? "?"}  cacheKey=${loc?.cacheKey ?? "?"}  src=${loc?.source ?? "?"}',
      'SERVER used=${serverLoc == null ? "(n/a)" : serverLoc.toString()}',
      'diag=${diag.isEmpty ? "(none — public/legacy path)" : diag.toString()}',
    ];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: (cohortEligible ? Colors.teal : Colors.blueGrey)
            .withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        lines.join('\n'),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 9.5,
          height: 1.25,
          fontFamily: 'monospace',
        ),
      ),
    );
  }

  Widget _buildPaginatedList(
    BuildContext context,
    AppLocalizations l,
    ExplorePaginationState page,
    List<PlaceSummary> places,
  ) {
    // Footer pagination hanya bermakna pada senarai penuh (tiada tapis/carian).
    final showFooter = _query.isEmpty && _cuisineFilter == null;
    final count = places.length + (showFooter ? 1 : 0);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      itemCount: count,
      separatorBuilder: (context, i) => const SizedBox(height: 14),
      itemBuilder: (context, i) {
        if (showFooter && i == places.length) {
          if (page.error) {
            return Center(
              child: TextButton.icon(
                onPressed: () =>
                    ref.read(explorePaginationProvider.notifier).loadMore(),
                icon: const Icon(Icons.refresh),
                label: Text(l.t('retry')),
              ),
            );
          }
          if (page.loading) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          if (!page.endOfResults) {
            return Center(
              child: OutlinedButton(
                onPressed: () =>
                    ref.read(explorePaginationProvider.notifier).loadMore(),
                child: Text(l.t('loadMore')),
              ),
            );
          }
          return Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                l.t('endOfResults'),
                style:
                    TextStyle(color: context.mm.onCardMuted, fontSize: 12.5),
              ),
            ),
          );
        }
        return ExplorePlaceCard(place: places[i]);
      },
    );
  }
}

/// Pil "Trending" — restyle butang api sedia ada; callback (ke Feed sosial)
/// KEKAL, hanya paparan bertukar. Tooltip + semantik disediakan.
class _TrendingPill extends StatelessWidget {
  const _TrendingPill({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    return Semantics(
      button: true,
      label: l.t('trending'),
      child: Tooltip(
        message: l.t('trending'),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: palette.primary.withValues(alpha: 0.35)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.local_fire_department_rounded,
                      size: 16, color: palette.primary),
                  const SizedBox(width: 5),
                  Text(
                    l.t('trending'),
                    style: TextStyle(
                      color: palette.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cip kategori: TIDAK dipilih = permukaan kad + sempadan; dipilih = merah
/// MakanMana + teks putih (spec Image 2). Semantik penapis kekal di pemanggil.
class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        constraints: const BoxConstraints(minHeight: 44),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? palette.primary : palette.card,
          borderRadius: BorderRadius.circular(22),
          border: selected ? null : Border.all(color: palette.border),
          boxShadow: (!selected && !palette.isDark)
              ? [
                  BoxShadow(
                    color: const Color(0xFF7A3B1E).withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: selected ? Colors.white : palette.text,
            fontWeight: FontWeight.w700,
            fontSize: 13.5,
          ),
        ),
      ),
    );
  }
}

/// Kad restoran Explore (Image 2): foto besar kiri, NAMA PENUH sehingga 2
/// baris, kategori, lalu baris metadata jujur (★ rating (ulasan) • jarak),
/// chevron kanan. Seluruh kad boleh diketik — destinasi & route KEKAL.
class ExplorePlaceCard extends ConsumerWidget {
  const ExplorePlaceCard({super.key, required this.place});

  final PlaceSummary place;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = HomePalette.of(context);
    final bool small = MediaQuery.sizeOf(context).width < 360;
    final double photo = small ? 96 : 108;

    // Paparan JUJUR: sembunyi rating 0.0 / jarak 0.0 / kiraan ulasan palsu.
    final bool hasRating = place.rating > 0;
    final bool hasReviews = place.userRatingCount > 0;
    final bool hasDistance = place.distanceKm > 0;
    final metaParts = <String>[
      if (hasRating)
        hasReviews
            ? '${place.rating} (${place.userRatingCount})'
            : '${place.rating}',
      if (hasDistance) '${place.distanceKm} km',
    ];
    final String metaText = metaParts.join('  •  ');

    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(22),
        border: palette.isDark ? Border.all(color: palette.border) : null,
        boxShadow: palette.isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF7A3B1E).withValues(alpha: 0.06),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          // Seluruh kad boleh diketik — destinasi & route KEKAL.
          onTap: () {
            ref.read(currentSuggestionProvider.notifier).state = place;
            context.push('/restaurant/${place.placeId}');
          },
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Foto sebenar (Google) / monogram jujur. BoxFit.cover dlm
                // PlaceImage; tiada imej ganti/rekaan.
                PlaceImage(
                  name: place.name,
                  photoUrl: place.photoUrl,
                  width: photo,
                  height: photo,
                  borderRadius: 18,
                  monogramFontSize: 22,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // NAMA PENUH — sehingga 2 baris sebelum ellipsis.
                      Text(
                        place.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17.5,
                          height: 1.15,
                          color: palette.text,
                        ),
                      ),
                      const SizedBox(height: 3),
                      // Kategori / jenis tempat (autoritatif).
                      Text(
                        place.cuisine,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.subtext,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (metaText.isNotEmpty) ...[
                        const SizedBox(height: 7),
                        Row(
                          children: [
                            if (hasRating) ...[
                              const Icon(Icons.star_rounded,
                                  size: 16, color: Color(0xFFF59E14)),
                              const SizedBox(width: 3),
                            ],
                            Flexible(
                              child: Text(
                                metaText,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: palette.subtext,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: palette.subtext),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
