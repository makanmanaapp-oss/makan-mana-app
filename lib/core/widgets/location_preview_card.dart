import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../models/place_summary.dart';
import '../constants/app_colors.dart';
import '../providers/makanmana_user_context_provider.dart';
import '../utils/place_actions.dart';

/// Kad pratonton lokasi yang JUJUR (Prompt 4).
/// Kami tidak ada lat/lng dalam PlaceSummary, jadi ini BUKAN peta palsu —
/// ia kad lokasi berlabel dengan jarak, radius carian & butang Open Maps.
class LocationPreviewCard extends ConsumerWidget {
  const LocationPreviewCard({
    super.key,
    required this.place,
    required this.source, // suggestion_card | restaurant_detail
  });

  final PlaceSummary place;
  final String source;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final radiusKm = ref
        .watch(makanManaUserContextProvider.select((c) => c.effectiveRadiusKm))
        .round();

    return Container(
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Jalur "peta" berlabel — pin + kawasan, bukan grey palsu.
          Container(
            height: 96,
            width: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.softYellow, Color(0xFFFFF1C9)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Stack(
              children: [
                Positioned(
                  left: 12,
                  top: 10,
                  child: Row(
                    children: [
                      const Icon(Icons.place_outlined,
                          size: 16, color: AppColors.primaryRed),
                      const SizedBox(width: 4),
                      // Label ini duduk ATAS jalur kuning pucat → teks
                      // WAJIB kekal gelap dalam KEDUA-DUA mod.
                      Text(l.t('locationLabel'),
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: AppColors.darkText)),
                    ],
                  ),
                ),
                const Center(
                  child: Icon(Icons.location_on,
                      size: 40, color: AppColors.primaryRed),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // SP10.4: kad putih (B-style) — teks WAJIB eksplisit gelap,
                // jika tidak tema gelap jadikan nama putih-atas-putih.
                Text(place.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: context.mm.onCard)),
                if (place.address.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(place.address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: context.mm.onCardMuted, fontSize: 12.5)),
                ],
                const SizedBox(height: 10),
                // Wrap (bukan Row+Spacer) supaya cip jarak/radius tidak melimpah
                // pada skrin sempit + skala teks besar (mis. 360dp @ 1.3).
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _pill(context, '${place.distanceKm} km'),
                    _pill(context, 'Radius $radiusKm km'),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () =>
                        openPlaceInMaps(ref, place, source: source),
                    style: ElevatedButton.styleFrom(
                        minimumSize: const Size(0, 46)),
                    icon: const Icon(Icons.map_outlined, size: 20),
                    label: Text(l.t('openMap')),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(BuildContext context, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: context.mm.appBackground,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: context.mm.border),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: context.mm.onCard)),
      );
}
