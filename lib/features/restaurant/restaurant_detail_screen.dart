import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/place_image.dart';
import '../../models/place_summary.dart';
import '../reviews/rating_page.dart';

class RestaurantDetailScreen extends ConsumerStatefulWidget {
  const RestaurantDetailScreen({super.key, required this.placeId});

  final String placeId;

  @override
  ConsumerState<RestaurantDetailScreen> createState() =>
      _RestaurantDetailScreenState();
}

class _RestaurantDetailScreenState
    extends ConsumerState<RestaurantDetailScreen> {
  String get placeId => widget.placeId;

  /// Tempat Google sebenar: pautan tepat guna query_place_id.
  /// Tempat dummy: carian ikut nama sahaja.
  Future<void> _openMap(WidgetRef ref, PlaceSummary place) async {
    final query = Uri.encodeComponent('${place.name} ${place.address}');
    final idParam = place.placeId.startsWith('dummy_')
        ? ''
        : '&query_place_id=${place.placeId}';
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$query$idParam',
    );
    // Log ke AI Brain: open_map ialah isyarat minat yang kuat.
    ref.read(spinControllerProvider).logAppEvent('open_map');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _share(BuildContext context, PlaceSummary place) async {
    final text = '🍽️ ${place.name} (${place.cuisine}) — ⭐ ${place.rating}\n'
        'Jom makan sini! Dicadangkan oleh MakanMana 😋\n'
        'https://www.google.com/maps/search/?api=1&query='
        '${Uri.encodeComponent(place.name)}';
    try {
      await SharePlus.instance.share(ShareParams(text: text));
    } catch (e) {
      // Fallback: salin ke clipboard supaya pengguna tetap boleh kongsi.
      debugPrint('MakanMana: share gagal, fallback clipboard: $e');
      await Clipboard.setData(ClipboardData(text: text));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('📋 Disalin! Paste untuk kongsi.')),
        );
      }
    }
  }

  /// Check-in di kedai (bukti dine-in >= 5 minit untuk rating walk-in).
  Future<void> _checkIn(PlaceSummary place) async {
    final l = AppLocalizations.of(context);
    final pos = await ref.read(locationServiceProvider).getPosition();
    if (pos == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
      return;
    }
    try {
      await ref.read(reviewServiceProvider).checkIn(
            placeId: place.placeId,
            placeName: place.name,
            lat: pos.latitude,
            lng: pos.longitude,
          );
      if (mounted) {
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('checkinDone'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    }
  }

  /// Simpan/buang kegemaran (ciri Plus - gate lembut ke paywall).
  Future<void> _toggleFavorite(PlaceSummary place, bool isFav) async {
    final l = AppLocalizations.of(context);
    final plan = ref.read(userPlanProvider).value ?? 'free';
    if (plan == 'free') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('lockedPlus'))),
      );
      context.push(RoutePaths.paywall);
      return;
    }
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final docRef = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('favorites')
        .doc(place.placeId);
    if (isFav) {
      await docRef.delete();
    } else {
      await docRef.set({
        'placeId': place.placeId,
        'name': place.name,
        'emoji': place.emoji,
        'cuisine': place.cuisine,
        'addedAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('favoriteAdded'))),
        );
      }
    }
  }

  void _rate(PlaceSummary place, String source) {
    context.push(
      '/rate',
      extra: RatingArgs(
        placeId: place.placeId,
        placeName: place.name,
        emoji: place.emoji,
        cuisine: place.cuisine,
        source: source,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final current = ref.watch(currentSuggestionProvider);
    // Utamakan tempat semasa jika ID sepadan (tempat Google sebenar);
    // jika tidak cuba senarai dummy.
    final place = (current != null && current.placeId == placeId)
        ? current
        : ref.read(dummySuggestionServiceProvider).byId(placeId) ?? current;

    if (place == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('😕')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(place.name)),
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
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    place.name,
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: place.isOpen
                        ? AppColors.openGreen.withValues(alpha: 0.12)
                        : AppColors.mutedText.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    place.isOpen ? l.t('openNow') : l.t('closedNow'),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: place.isOpen
                          ? AppColors.openGreen
                          : AppColors.mutedText,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${place.cuisine} • ⭐ ${place.rating} '
              '(${place.userRatingCount}) • ${place.distanceKm} km',
              style: const TextStyle(
                color: AppColors.mutedText,
                fontWeight: FontWeight.w600,
              ),
            ),
            // Rating komuniti MakanMana (berasingan dari Google, verified).
            ref.watch(placeCommunityProvider(place.placeId)).maybeWhen(
                  data: (details) {
                    final rating = details?['communityRating'] as num?;
                    final count = details?['communityCount'] as num?;
                    if (rating == null) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color:
                              AppColors.openGreen.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '✅ $rating ${l.t('communityRatingLabel')}'
                          ' (${count ?? 0})',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppColors.openGreen,
                          ),
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _openMap(ref, place),
                    icon: const Icon(Icons.map_outlined, size: 20),
                    label: Text(l.t('openMap')),
                  ),
                ),
                const SizedBox(width: 10),
                // Save/Kegemaran (ciri Plus).
                ref.watch(isFavoriteProvider(place.placeId)).maybeWhen(
                      data: (isFav) => _RoundAction(
                        icon: isFav
                            ? Icons.bookmark
                            : Icons.bookmark_border,
                        onTap: () => _toggleFavorite(place, isFav),
                      ),
                      orElse: () => _RoundAction(
                        icon: Icons.bookmark_border,
                        onTap: () => _toggleFavorite(place, false),
                      ),
                    ),
                const SizedBox(width: 8),
                _RoundAction(
                  icon: Icons.share_outlined,
                  onTap: () => _share(context, place),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Bukti dine-in: check-in >= 5 minit membolehkan rating walk-in.
            Builder(builder: (builderContext) {
              final checkinAt = ref
                  .read(reviewServiceProvider)
                  .checkinTime(place.placeId);
              final minutes = checkinAt == null
                  ? null
                  : DateTime.now().difference(checkinAt).inMinutes;
              final Widget mainButton;
              if (minutes == null) {
                mainButton = OutlinedButton.icon(
                  onPressed: () => _checkIn(place),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.where_to_vote_outlined, size: 20),
                  label: Text(l.t('checkinAction')),
                );
              } else if (minutes < 5) {
                mainButton = OutlinedButton.icon(
                  onPressed: null,
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.hourglass_top, size: 20),
                  label: Text(
                      '${l.t('rateWaitPrefix')} ${5 - minutes} min'),
                );
              } else {
                mainButton = ElevatedButton.icon(
                  onPressed: () => _rate(place, 'checkin'),
                  style: ElevatedButton.styleFrom(
                      minimumSize: const Size(0, 46)),
                  icon: const Icon(Icons.star_rounded, size: 20),
                  label: Text(l.t('rateAction')),
                );
              }
              return Row(
                children: [
                  Expanded(child: mainButton),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _rate(place, 'delivery'),
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 46)),
                      icon: const Icon(Icons.delivery_dining, size: 20),
                      label: Text(
                        l.t('deliveryRate'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              );
            }),
            const SizedBox(height: 10),
            // Log belanja ke Meal Wallet (V4).
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => context.push(
                  '/meal-wallet/add',
                  extra: <String, String?>{
                    'placeId': place.placeId,
                    'placeName': place.name,
                  },
                ),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 46)),
                icon: const Icon(
                    Icons.account_balance_wallet_outlined, size: 20),
                label: const Text('Log belanja ke Meal Wallet',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 22),
            Text(
              l.t('quickInfo'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.cardWhite,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.softBorder),
              ),
              child: Column(
                children: [
                  _InfoRow(icon: Icons.location_on, text: place.address),
                  const SizedBox(height: 10),
                  _InfoRow(
                      icon: Icons.payments_outlined,
                      text: place.priceEstimate),
                ],
              ),
            ),
            const SizedBox(height: 22),
            Text(
              l.t('whyFits'),
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
            const SizedBox(height: 22),
            // Ulasan komuniti (verified MakanMana).
            Text(
              l.t('reviewsTitle'),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 10),
            ref.watch(placeReviewsProvider(place.placeId)).maybeWhen(
                  data: (reviews) {
                    if (reviews.isEmpty) {
                      return Text(
                        l.t('noReviews'),
                        style: const TextStyle(
                          color: AppColors.mutedText,
                          fontSize: 13.5,
                        ),
                      );
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: reviews
                          .map((r) => _ReviewTile(review: r))
                          .toList(),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
            const SizedBox(height: 18),
            // Placeholder peta mini (Milestone 4: peta sebenar / pautan Places).
            Container(
              height: 120,
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppColors.softYellow,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.softBorder),
              ),
              child: Center(
                child: Text(
                  '🗺️ ${l.t('mapPlaceholder')}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.mutedText,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.review});

  final Map<String, dynamic> review;

  @override
  Widget build(BuildContext context) {
    final name = review['displayName'] as String? ?? 'Foodie';
    final rating = (review['rating'] as num?)?.toInt() ?? 0;
    final text = review['text'] as String?;
    final source = review['source'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (source != 'delivery')
                const Text('✅ ', style: TextStyle(fontSize: 12)),
              Text(
                '⭐' * rating,
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
          if (text != null && text.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              text,
              style: const TextStyle(fontSize: 13.5, height: 1.3),
            ),
          ],
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 52,
        width: 52,
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.softBorder),
        ),
        child: Icon(icon, color: AppColors.darkText),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.primaryRed),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ],
    );
  }
}
