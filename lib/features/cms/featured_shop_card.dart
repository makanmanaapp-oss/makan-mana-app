import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'cms_content.dart';

/// FEATURED SHOP BANNER — the shared pieces for presenting a real shop.
///
/// Home and Explore show the same shop in two shapes (a wide card and a
/// carousel tile), so the parts that must not drift — the photo with its
/// monogram fallback, the honest rating row, the navigation — live here once.
///
/// Everything drawn below comes from [CmsShop], which the server resolved from
/// the place registry and proved on this very request. Nothing here can invent
/// a name, a rating, a distance or an opening status, because none of those are
/// reachable from this widget.

/// Opens a shop and records the tap.
///
/// The destination is the SERVER-DERIVED shop route, re-validated here because
/// a cached payload could outlive a rules change. `push`, never `go`: a shop is
/// an ordinary page, so Back returns to the banner the customer tapped.
void openFeaturedShop(
  BuildContext context,
  WidgetRef ref,
  CmsShop shop, {
  required String contentId,
  required String placement,
  String? sourceScreen,
}) {
  if (!isSafeCtaDestination(shop.destination)) return;
  ref.read(eventLoggerProvider).logEvent(
    EventType.cmsCtaTapped,
    sourceScreen: sourceScreen,
    metadata: {
      'contentId': contentId,
      'placement': placement,
      'ctaKind': 'featured_shop',
    },
  );
  context.push(shop.destination);
}

/// The shop's picture, or a monogram when there is none.
///
/// The monogram mirrors what the Explore list already draws for photo-less
/// places, so a shop with no photo looks like the rest of the app rather than
/// like a fault. A broken download lands on the same monogram — never a broken
/// image glyph.
class FeaturedShopImage extends StatelessWidget {
  const FeaturedShopImage({
    super.key,
    required this.shop,
    this.borderRadius = BorderRadius.zero,
  });

  final CmsShop shop;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    final l = AppLocalizations.of(context);

    final monogram = Container(
      color: mm.softFill,
      alignment: Alignment.center,
      child: Text(
        shop.monogram,
        style: TextStyle(
          color: mm.onCardMuted,
          fontWeight: FontWeight.w800,
          fontSize: 22,
        ),
      ),
    );

    return ClipRRect(
      borderRadius: borderRadius,
      child: Semantics(
        // A screen reader gets the shop's name either way; the photo is
        // decoration on top of an identity that is already announced.
        label: shop.hasPhoto ? shop.name : l.t('featuredShopNoPhoto'),
        image: true,
        child: shop.hasPhoto
            ? CachedNetworkImage(
                imageUrl: shop.photoUrl!,
                // Keyed on the canonical id: the registry photo url can rotate
                // while the shop stays the same picture.
                cacheKey: 'shop-${shop.canonicalPlaceId}',
                fit: BoxFit.cover,
                fadeInDuration: const Duration(milliseconds: 180),
                placeholder: (_, __) => Container(color: mm.softFill),
                errorWidget: (_, __, ___) => monogram,
              )
            : monogram,
      ),
    );
  }
}

/// Name + the facts the registry actually proved.
///
/// The rating row appears ONLY when a rating and a review count both exist.
/// There is no distance and no open/closed pill, because neither is knowable
/// here — and a plausible-looking guess is worse than an absence.
class FeaturedShopFacts extends StatelessWidget {
  const FeaturedShopFacts({
    super.key,
    required this.shop,
    this.nameMaxLines = 2,
    this.nameSize = 16,
    this.showAddress = true,
  });

  final CmsShop shop;
  final int nameMaxLines;
  final double nameSize;
  final bool showAddress;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // The REAL registry name. Long names wrap then ellipsise, so a card can
        // never be stretched or clipped mid-layout by an unusually long one.
        Text(
          shop.name,
          maxLines: nameMaxLines,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: nameSize,
            height: 1.2,
            color: mm.onCard,
          ),
        ),
        if (shop.hasRating)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.star_rounded, size: 15, color: mm.chipText),
                const SizedBox(width: 3),
                Text(
                  '${shop.rating!.toStringAsFixed(1)} (${shop.ratingCount})',
                  style: TextStyle(
                    color: mm.onCardMuted,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        if (showAddress && shop.address != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child:
                      Icon(Icons.place_outlined, size: 13, color: mm.iconMuted),
                ),
                const SizedBox(width: 3),
                Expanded(
                  child: Text(
                    shop.address!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: mm.onCardMuted, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// The small "Tajaan"/"Sponsored" pill.
///
/// Localised, unlike the hardcoded one the editorial card still carries — a
/// promotional marker that only Malay speakers can read is not a marker.
class FeaturedShopSponsoredPill extends StatelessWidget {
  const FeaturedShopSponsoredPill({super.key});

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Container(
      key: const Key('featured-shop-sponsored'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: mm.chipBackground,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        AppLocalizations.of(context).t('featuredShopSponsored'),
        style: TextStyle(
          color: mm.chipText,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// A carousel tile — one shop, fixed width so the row scrolls predictably.
class FeaturedShopTile extends ConsumerWidget {
  const FeaturedShopTile({
    super.key,
    required this.shop,
    required this.contentId,
    required this.placement,
    this.sourceScreen,
    this.width = 168,
  });

  final CmsShop shop;
  final String contentId;
  final String placement;
  final String? sourceScreen;
  final double width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mm = context.mm;
    return SizedBox(
      width: width,
      child: Material(
        color: mm.card,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('featured-shop-tile-${shop.canonicalPlaceId}'),
          onTap: () => openFeaturedShop(
            context,
            ref,
            shop,
            contentId: contentId,
            placement: placement,
            sourceScreen: sourceScreen,
          ),
          child: Semantics(
            button: true,
            // ONE node for the whole tile. `container: true` plus an excluded
            // subtree is what actually collapses it: without them the photo and
            // the name each publish their own node and the tile itself
            // publishes none, so a screen reader reads disconnected scraps and
            // nothing announces that the tile opens anything.
            container: true,
            label: shop.name,
            child: ExcludeSemantics(
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: mm.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AspectRatio(
                      aspectRatio: 16 / 10,
                      child: FeaturedShopImage(shop: shop),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                      child: FeaturedShopFacts(
                        shop: shop,
                        nameMaxLines: 2,
                        nameSize: 13.5,
                        // An address inside a 168 px tile is one clipped line
                        // that tells nobody anything; the shop page has it.
                        showAddress: false,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A fixed-size placeholder used while a carousel is still resolving.
class FeaturedShopTileSkeleton extends StatelessWidget {
  const FeaturedShopTileSkeleton({super.key, this.width = 168});

  final double width;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    Widget bar(double w, double h) => Container(
          width: w,
          height: h,
          decoration: BoxDecoration(
            color: mm.softFill,
            borderRadius: BorderRadius.circular(6),
          ),
        );
    return ExcludeSemantics(
      child: SizedBox(
        width: width,
        child: Container(
          decoration: BoxDecoration(
            color: mm.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: mm.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: Container(color: mm.softFill),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    bar(width - 40, 11),
                    const SizedBox(height: 6),
                    bar(width - 80, 9),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Inline failure for a section that IS supposed to be there.
///
/// Deliberately different from an ordinary CMS slot, which renders nothing on
/// error. A slot has no promise to keep; a named section that has already drawn
/// its heading does, so it says what went wrong and offers a way back rather
/// than leaving a titled void.
class FeaturedShopError extends StatelessWidget {
  const FeaturedShopError({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    final l = AppLocalizations.of(context);
    return Container(
      key: const Key('featured-shop-error'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: mm.border),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off_outlined, size: 16, color: mm.iconMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              l.t('featuredShopLoadFailed'),
              style: TextStyle(color: mm.onCardMuted, fontSize: 12.5),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            key: const Key('featured-shop-retry'),
            onPressed: () {
              HapticFeedback.selectionClick();
              onRetry();
            },
            child: Text(
              l.t('featuredShopRetry'),
              style: TextStyle(
                color: mm.chipText,
                fontWeight: FontWeight.w800,
                fontSize: 12.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The HOME featured-shop banner.
///
/// Follows the same rounded-card language as the MakanMana Pick card it sits
/// near: photo on one side, identity on the other, facts underneath. What makes
/// it a SHOP banner rather than an editorial one is that the name, picture,
/// address and rating all come from [CmsShop] — the operator only supplies the
/// pitch above them and the wording of the button.
class FeaturedShopBanner extends ConsumerWidget {
  const FeaturedShopBanner({
    super.key,
    required this.content,
    this.sponsored = false,
    this.sourceScreen,
  });

  final CmsContent content;
  final bool sponsored;
  final String? sourceScreen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = content.shop;
    // Structurally unreachable — the caller only builds this for a featured
    // banner — but a shop card with no shop must never be a possibility.
    if (shop == null) return const SizedBox.shrink();

    final mm = context.mm;
    final l = AppLocalizations.of(context);

    return Container(
      key: Key('featured-shop-banner-${content.contentId}'),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: mm.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => openFeaturedShop(
            context,
            ref,
            shop,
            contentId: content.contentId,
            placement: content.placement.wire,
            sourceScreen: sourceScreen,
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (sponsored)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: FeaturedShopSponsoredPill(),
                  ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // A fixed square, so the row's height never depends on how
                    // tall the shop's photo happens to be.
                    SizedBox(
                      width: 92,
                      height: 92,
                      child: FeaturedShopImage(
                        shop: shop,
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // The operator's promotional headline, ABOVE the
                          // identity and visibly secondary to it — it is the
                          // pitch, not the shop's name.
                          if (content.title.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 3),
                              child: Text(
                                content.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: mm.chipText,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                            ),
                          FeaturedShopFacts(shop: shop),
                          if (content.subtitle.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: Text(
                                content.subtitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: mm.onCardMuted,
                                  fontSize: 12.5,
                                  height: 1.3,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          // The operator may word the button; if they left it
                          // empty the shop still needs an obvious way in.
                          content.ctaLabel.trim().isNotEmpty
                              ? content.ctaLabel
                              : l.t('featuredShopViewShop'),
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: mm.chipText,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 3),
                      Icon(Icons.chevron_right, size: 18, color: mm.chipText),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
