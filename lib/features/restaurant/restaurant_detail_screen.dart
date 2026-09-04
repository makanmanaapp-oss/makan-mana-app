import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/mood/availability_label.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/services/restaurant_profile_v2_service.dart';
import '../../core/utils/place_actions.dart';
import '../../core/widgets/location_preview_card.dart';
import '../../core/widgets/place_image.dart';
import '../../models/place_summary.dart';
import '../home/home_palette.dart';
import '../place_migration/cohort_diagnostics_overlay.dart';
import '../reviews/rating_page.dart';
import 'canonical/canonical_restaurant_detail_screen.dart';
import 'canonical/restaurant_detail_adapter.dart';
import 'canonical/restaurant_detail_view_model.dart';
import 'canonical/restaurant_profile_v2_adapter.dart';
import '../place_corrections/correction_providers.dart';
import '../place_corrections/correction_snapshot.dart';
import '../place_corrections/report_entry_sheet.dart';
import 'canonical/restaurant_detail_flags.dart';

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

  Future<RestaurantDetailViewModel?>? _canonicalProfileFuture;
  String? _canonicalProfilePlaceId;

  Future<RestaurantDetailViewModel?> _loadCanonicalProfile(
      String requestedPlaceId) async {
    final profile = await RestaurantProfileV2Service()
        .getPublishedProfile(requestedPlaceId);
    if (profile == null) return null;
    return restaurantDetailFromPublicProfile(profile);
  }

  Future<RestaurantDetailViewModel?> _canonicalFuture() {
    if (_canonicalProfileFuture == null ||
        _canonicalProfilePlaceId != placeId) {
      _canonicalProfilePlaceId = placeId;
      _canonicalProfileFuture = _loadCanonicalProfile(placeId);
    }
    return _canonicalProfileFuture!;
  }

  Future<void> _share(BuildContext context, PlaceSummary place) async {
    // Selesaikan sebelum jurang async - context mungkin hilang selepas await.
    final l = AppLocalizations.of(context);
    final copiedMessage = l.t('copiedToClipboard');
    // Templat statik dilokalkan; nama kedai, masakan, rating dan pautan
    // kekal dinamik dan tidak diterjemah.
    final text = '🍽️ ${place.name} (${place.cuisine}) — ⭐ ${place.rating}\n'
        '${l.t('shareInviteText')}\n'
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
          SnackBar(content: Text(copiedMessage)),
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
          SnackBar(content: Text(l.t('postFailed'))),
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
          SnackBar(content: Text(l.t('postFailed'))),
        );
      }
    }
  }

  /// Simpan/buang kegemaran (ciri Plus - gate lembut ke paywall).
  Future<void> _toggleFavorite(PlaceSummary place, bool isFav) async {
    final l = AppLocalizations.of(context);
    final ent = ref.read(entitlementProvider);
    if (!ent.isPlusOrAbove) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('lockedPlus'))),
      );
      context.push(
        RoutePaths.paywall,
        extra: ent.buildPaywallArgs(
          featureId: FeatureId.favoritesFull,
          sourceScreen: 'restaurant_detail',
          requiredPlan: PlanTier.plus,
        ),
      );
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

  void _logMeal(PlaceSummary place) {
    context.push(
      '/meal-wallet/add',
      extra: <String, String?>{
        'placeId': place.placeId,
        'placeName': place.name,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    // Phase 1.14F-R: strip diagnostik kohort DEBUG-ONLY (tidak dalam keluaran).
    // Kini juga digate oleh flag kebolehlihatan (default OFF) supaya paparan
    // biasa BERSIH; hidupkan eksplisit untuk QA. Logik produksi tak berubah.
    final String? diagUid =
        ref.read(authRepositoryProvider).currentUser?.uid;
    Widget diag(Widget w, String surface) =>
        (kDebugMode && RestaurantDetailFlags.cohortDiagnosticsVisible)
            ? CohortDiagnosticsOverlay(
                uid: diagUid, surfaceSourceLabel: surface, child: w)
            : w;
    final current = ref.watch(currentSuggestionProvider);
    // Utamakan tempat semasa jika ID sepadan (tempat Google sebenar);
    // jika tidak cuba senarai dummy.
    final place = (current != null && current.placeId == placeId)
        ? current
        : ref.read(dummySuggestionServiceProvider).byId(placeId) ?? current;

    // WAVE 2 Restaurant Profile V2: hanya apabila flag canonical ON, cuba baca
    // ACTIVE published canonical profile melalui callable server-only. Flutter
    // tidak pernah membaca place_publications / place_publication_heads terus.
    // Jika tiada publication atau callable gagal, PlaceSummary legasi kekal
    // fallback supaya skrin produksi tidak menjadi kosong.
    if (RestaurantDetailFlags.canonicalRestaurantDetailEnabled) {
      final legacyVm = place == null ? null : restaurantDetailFromSummary(place);
      return FutureBuilder<RestaurantDetailViewModel?>(
        future: _canonicalFuture(),
        builder: (context, snapshot) {
          final publishedVm = snapshot.data;
          final vm = publishedVm ?? legacyVm;

          if (vm == null) {
            if (snapshot.connectionState != ConnectionState.done) {
              return Scaffold(
                appBar: AppBar(),
                body: const Center(child: CircularProgressIndicator()),
              );
            }
            return RestaurantDetailNotFound(onBack: () => context.pop());
          }

          return diag(
            CanonicalRestaurantDetailScreen(
              vm: vm,
              callbacks: RestaurantDetailCallbacks(
                onBack: () => context.pop(),
                onOpenMaps: place == null
                    ? null
                    : () => openPlaceInMaps(
                          ref,
                          place,
                          source: 'restaurant_detail',
                        ),
                onSave:
                    place == null ? null : () => _toggleFavorite(place, false),
                onShare:
                    place == null ? null : () => _share(context, place),
                onRate: place == null ? null : () => _rate(place, 'checkin'),
                onLogMeal: place == null ? null : () => _logMeal(place),
                // Laporan pembetulan sentiasa menggunakan VM yang sedang
                // dipapar, termasuk published canonical publication.
                onReportIncorrectInformation: () => showReportEntrySheet(
                  context,
                  snapshot: captureSnapshot(vm, capturedAt: DateTime.now()),
                  repository: ref.read(placeCorrectionRepositoryProvider),
                ),
              ),
            ),
            publishedVm != null
                ? 'detail:canonical_publication (backend)'
                : 'detail:${place?.dataSource ?? "legacy"} (fallback)',
          );
        },
      );
    }

    if (place == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Icon(Icons.error_outline)),
      );
    }

    // ================= REDESIGN (Image 3) — laluan LEGASI (produksi) =========
    // Presentation-only: susunan hero → nama+badge → metrik → cip → aksi
    // ikon-sahaja → sebab → ulasan → lokasi. Semua callback & data kekal.
    final palette = HomePalette.of(context);
    final bool showMatch = place.matchScore > 0; // badge hanya bila autoritatif
    final bool hasRating = place.rating > 0 && place.userRatingCount > 0;
    final bool open = showsOpenNow(place);
    final String moodId = ref.watch(selectedMoodProvider);
    final int radiusKm =
        ref.watch(makanManaUserContextProvider).effectiveRadiusKm.round();
    final String? priceText = place.priceEstimate.trim().isNotEmpty
        ? place.priceEstimate
        : (place.priceLevel > 0 ? place.priceLabel : null);

    // Check-in dinamik (semantik sama: check-in → tunggu 5 min → rate).
    final checkinAt =
        ref.read(reviewServiceProvider).checkinTime(place.placeId);
    final int? checkinMinutes = checkinAt == null
        ? null
        : DateTime.now().difference(checkinAt).inMinutes;

    return diag(
      Scaffold(
        backgroundColor: palette.background,
        appBar: AppBar(
          backgroundColor: palette.background,
          elevation: 0,
          scrolledUnderElevation: 0,
          foregroundColor: palette.text,
          title: Text(
            place.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: FontWeight.w700, color: palette.text),
          ),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 2. Hero — foto sebenar (Google) / monogram jujur. BoxFit.cover
              //    dikendali oleh PlaceImage; peraturan fallback kanonikal kekal.
              PlaceImage(
                name: place.name,
                photoUrl: place.photoUrl,
                width: double.infinity,
                height: 200,
                borderRadius: 26,
              ),
              const SizedBox(height: 16),
              // 3–4. Nama + badge padanan autoritatif (jika ada).
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      place.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                        color: palette.text,
                      ),
                    ),
                  ),
                  if (showMatch) ...[
                    const SizedBox(width: 10),
                    _MatchBadge(
                      label: '${place.matchScore}% ${l.t('matchLabel')}',
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              // 5. Baris kategori (masakan) — tidak diulang di tempat lain.
              Row(
                children: [
                  Icon(Icons.circle, size: 8, color: palette.primary),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      place.cuisine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.subtext,
                        fontWeight: FontWeight.w600,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // 6. Kad metrik padat (jujur; tiada 0.0 palsu / "buka" palsu).
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  if (hasRating)
                    _MetricCard(
                      icon: Icons.star_rounded,
                      iconColor: AppColors.warmYellow,
                      text: '${place.rating} (${place.userRatingCount})',
                    ),
                  if (place.distanceKm > 0)
                    _MetricCard(
                      icon: Icons.location_on_outlined,
                      text: '${place.distanceKm} km',
                    ),
                  _MetricCard(
                    icon: open
                        ? Icons.circle
                        : Icons.schedule_outlined,
                    iconColor: open
                        ? AppColors.openGreen
                        : palette.subtext,
                    text: l.t(availabilityLabelKey(place)),
                    textColor: open ? AppColors.openGreen : null,
                  ),
                  if (priceText != null)
                    _MetricCard(
                      icon: Icons.receipt_long_outlined,
                      text: priceText,
                    ),
                  // Rating komuniti MakanMana (verified) — jika autoritatif.
                  ref
                      .watch(placeCommunityProvider(place.placeId))
                      .maybeWhen(
                        data: (details) {
                          final rating =
                              details?['communityRating'] as num?;
                          final count = details?['communityCount'] as num?;
                          if (rating == null) return const SizedBox.shrink();
                          return _MetricCard(
                            icon: Icons.verified_outlined,
                            iconColor: AppColors.openGreen,
                            text: '★ $rating '
                                '${l.t('communityRatingLabel')} '
                                '(${count ?? 0})',
                            textColor: AppColors.openGreen,
                          );
                        },
                        orElse: () => const SizedBox.shrink(),
                      ),
                ],
              ),
              const SizedBox(height: 12),
              // 6b. Cip konteks mood/radius (autoritatif; sembunyi bila tiada).
              Wrap(
                spacing: 10,
                runSpacing: 8,
                children: [
                  if (moodId.isNotEmpty)
                    _SoftChip(
                      icon: Icons.mood,
                      label: '${l.t('moodLabel')}: ${l.t(moodId)}',
                    ),
                  if (radiusKm > 0)
                    _SoftChip(
                      icon: Icons.my_location,
                      label: '${l.t('withinRadius')} ${radiusKm}km',
                    ),
                ],
              ),
              const SizedBox(height: 18),
              // 7. Baris aksi IKON-SAHAJA — semua callback kekal; Tooltip +
              //    semantik + sasaran sentuh >= 48dp; Wrap 6→3+3 bila sempit.
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _IconAction(
                    icon: Icons.directions_outlined,
                    tooltip: l.t('openMap'),
                    filled: true,
                    onTap: () => openPlaceInMaps(ref, place,
                        source: 'restaurant_detail'),
                  ),
                  ref.watch(isFavoriteProvider(place.placeId)).maybeWhen(
                        data: (isFav) => _IconAction(
                          icon: isFav
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          tooltip: l.t('save'),
                          onTap: () => _toggleFavorite(place, isFav),
                        ),
                        orElse: () => _IconAction(
                          icon: Icons.bookmark_border,
                          tooltip: l.t('save'),
                          onTap: () => _toggleFavorite(place, false),
                        ),
                      ),
                  _IconAction(
                    icon: Icons.share_outlined,
                    tooltip: l.t('share'),
                    onTap: () => _share(context, place),
                  ),
                  // Check-in dinamik dlm bentuk ikon (semantik dikekalkan).
                  if (checkinMinutes == null)
                    _IconAction(
                      icon: Icons.where_to_vote_outlined,
                      tooltip: l.t('checkinAction'),
                      onTap: () => _checkIn(place),
                    )
                  else if (checkinMinutes < 5)
                    _IconAction(
                      icon: Icons.hourglass_top,
                      tooltip: '${l.t('rateWaitPrefix')} '
                          '${5 - checkinMinutes} min',
                      onTap: null, // masih tunggu (disabled)
                    )
                  else
                    _IconAction(
                      icon: Icons.star_rounded,
                      tooltip: l.t('rateAction'),
                      onTap: () => _rate(place, 'checkin'),
                    ),
                  // Ordered / rate penghantaran.
                  _IconAction(
                    icon: Icons.receipt_long_outlined,
                    tooltip: l.t('deliveryRate'),
                    onTap: () => _rate(place, 'delivery'),
                  ),
                  // Log belanja ke Meal Wallet.
                  _IconAction(
                    icon: Icons.account_balance_wallet_outlined,
                    tooltip: l.t('logSpendToWallet'),
                    onTap: () => _logMeal(place),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              // 8. "Why MakanMana picked this" — hanya sebab autoritatif.
              if (place.matchReasonKeys.isNotEmpty) ...[
                Text(
                  l.t('whyFits'),
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: palette.text,
                  ),
                ),
                const SizedBox(height: 10),
                ...place.matchReasonKeys.map(
                  (key) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle,
                            color: AppColors.primaryRed, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            l.t(key),
                            style: TextStyle(color: palette.text),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 22),
              ],
              // 10. Ulasan komuniti (data/callback kekal).
              Text(
                l.t('reviewsTitle'),
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: palette.text,
                ),
              ),
              const SizedBox(height: 10),
              ref.watch(placeReviewsProvider(place.placeId)).maybeWhen(
                    data: (reviews) {
                      if (reviews.isEmpty) {
                        return Text(
                          l.t('noReviews'),
                          style: TextStyle(
                            color: palette.subtext,
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
              // 11. Kad lokasi premium (jujur; guna callback Open Maps sedia
              //     ada; alamat penuh dipapar SEKALI di sini).
              LocationPreviewCard(place: place, source: 'restaurant_detail'),
            ],
          ),
        ),
      ),
      'detail:${place.dataSource ?? "legacy"} (backend)',
    );
  }
}

/// Badge padanan merah padat (autoritatif sahaja — nilai dari place.matchScore).
class _MatchBadge extends StatelessWidget {
  const _MatchBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.primaryRed,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.auto_awesome, size: 14, color: Colors.white),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Kad metrik padat (rating/jarak/status/harga). Saiz ikut kandungan (Wrap).
class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.text,
    this.iconColor,
    this.textColor,
  });

  final IconData icon;
  final String text;
  final Color? iconColor;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    // Wrap memberi anak lebar TAK TERBATAS → hadkan setiap kad kepada lebar
    // kandungan Home (skrin − padding 20×2) supaya teks panjang (skala 1.3)
    // ellipsis, bukan melimpah lajur.
    final double maxW =
        (MediaQuery.sizeOf(context).width - 40).clamp(120.0, 640.0);
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxW),
      child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(14),
        border: palette.isDark ? Border.all(color: palette.border) : null,
        boxShadow: palette.isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF7A3B1E).withValues(alpha: 0.06),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: iconColor ?? palette.primary),
          const SizedBox(width: 7),
          // Fleksibel + ellipsis: teks status panjang (cth. jam tak disahkan)
          // pada skala 1.3 tidak melimpah lebar baris Wrap.
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              softWrap: false,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: textColor ?? palette.text,
              ),
            ),
          ),
        ],
      ),
      ),
    );
  }
}

/// Cip lembut merah untuk konteks (mood / radius).
class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: palette.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: palette.primary),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: palette.primary,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Butang aksi IKON-SAHAJA — sasaran sentuh 48dp, bulatan tampak 46dp, Tooltip
/// + semantik butang berlokal. `onTap == null` => keadaan dilumpuhkan.
class _IconAction extends StatelessWidget {
  const _IconAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    final bool enabled = onTap != null;
    final Color bg = filled ? palette.primary : palette.card;
    Color fg = filled ? Colors.white : palette.primary;
    if (!enabled) fg = fg.withValues(alpha: 0.4);
    return Semantics(
      button: true,
      enabled: enabled,
      label: tooltip,
      child: Tooltip(
        message: tooltip,
        child: SizedBox(
          width: 48, // sasaran sentuh minimum
          height: 48,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(15),
              onTap: onTap,
              child: Center(
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(15),
                    border: filled
                        ? null
                        : Border.all(color: palette.border),
                    boxShadow: (filled && !palette.isDark)
                        ? [
                            BoxShadow(
                              color: AppColors.primaryRed
                                  .withValues(alpha: 0.28),
                              blurRadius: 14,
                              offset: const Offset(0, 6),
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(icon, color: fg, size: 22),
                ),
              ),
            ),
          ),
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

    final mm = context.mm;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                    color: mm.onCard,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (source != 'delivery')
                const Padding(
                  padding: EdgeInsets.only(right: 3),
                  child: Icon(Icons.verified_outlined,
                      size: 13, color: AppColors.openGreen),
                ),
              Text(
                '★' * rating,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.warmYellow),
              ),
            ],
          ),
          if (text != null && text.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              text,
              style: TextStyle(
                  fontSize: 13.5, height: 1.3, color: mm.onCardMuted),
            ),
          ],
        ],
      ),
    );
  }
}
