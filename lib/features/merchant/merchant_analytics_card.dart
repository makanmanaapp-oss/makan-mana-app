import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/merchant_service.dart';
import 'merchant_analytics_screen.dart';

/// WAVE 6 — pintu masuk Prestasi di dalam Merchant Center sedia ada.
///
/// Hanya kedai yang peniaga ini benar-benar boleh urus disenaraikan, dan
/// senarai itu datang daripada `engagementRestaurants` — projeksi yang sudah
/// membawa identiti kanonik yang terbukti. Kebenaran sebenar tetap diputuskan
/// semula di pelayan apabila skrin dibuka; senarai ini cuma navigasi.
class MerchantAnalyticsCard extends ConsumerWidget {
  const MerchantAnalyticsCard({super.key, required this.state});

  final MerchantState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mm = context.mm;
    final restaurants = state.engagementRestaurants;

    return Container(
      key: const Key('merchant-analytics-card'),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Prestasi kedai',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: mm.onCard,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Berapa ramai yang melihat, mengikuti dan menunjukkan minat pada '
            'kedai anda. Semua nombor ialah jumlah keseluruhan — MakanMana '
            'tidak memberi anda maklumat sesiapa secara individu.',
            style: TextStyle(color: mm.onCardMuted, fontSize: 12.5, height: 1.35),
          ),
          const SizedBox(height: 12),
          if (restaurants.isEmpty)
            Text(
              'Belum ada kedai yang diluluskan untuk akaun ini. Prestasi akan '
              'muncul selepas tuntutan kedai anda diluluskan.',
              key: const Key('merchant-analytics-empty'),
              style: TextStyle(color: mm.onCardMuted, fontSize: 12.5, height: 1.35),
            )
          else
            for (final restaurant in restaurants)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OutlinedButton.icon(
                  key: Key('merchant-analytics-open-${restaurant.canonicalPlaceId}'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => MerchantAnalyticsScreen(
                        canonicalPlaceId: restaurant.canonicalPlaceId,
                        // Nama kedai, bukan ID — ID kekal dalaman.
                        placeLabel: restaurant.displayName.isEmpty
                            ? 'Kedai anda'
                            : restaurant.displayName,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.insights_outlined, size: 18),
                  label: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      restaurant.displayName.isEmpty
                          ? 'Lihat prestasi'
                          : 'Prestasi · ${restaurant.displayName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
