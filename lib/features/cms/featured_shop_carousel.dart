import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import 'cms_content.dart';
import 'cms_impression_tracker.dart';
import 'cms_providers.dart';
import 'featured_shop_card.dart';

/// FEATURED SHOPS on Explore — an editorially ordered row of real shops.
///
/// Built on the CMS COLLECTION that already existed server-side and was already
/// parsed by the client but had no renderer at all: the ids arrived and were
/// thrown away. This is that missing renderer, so no second content system was
/// invented to hold the same thing.
///
/// The ORDER is the product. An operator arranges shops deliberately, so the
/// row preserves the server's order exactly and never re-sorts.
///
/// STATES. A promotional slot renders nothing while loading or on error, and
/// that is right for a slot with no promise to keep. This section is different:
/// once it has a heading it has made a promise, so it shows skeletons while
/// resolving and an inline retry when the fetch failed. When there is genuinely
/// nothing to feature it renders nothing at all — an empty titled section is
/// worse than no section.
class FeaturedShopCarousel extends ConsumerWidget {
  const FeaturedShopCarousel({
    super.key,
    this.placement = CmsPlacement.exploreTop,
    this.sourceScreen,
  });

  final CmsPlacement placement;
  final String? sourceScreen;

  static const double _tileWidth = 168;
  static const double _gutter = 20;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = CmsRequest(placement: placement, includeCollections: true);
    final async = ref.watch(cmsContentProvider(request));

    return async.when(
      loading: () => const _CarouselFrame(child: _SkeletonRow()),
      // The provider itself does not error — the service degrades to a result
      // carrying `failed` — but an AsyncError must still not reach `.value`,
      // which throws. Treated as the same honest failure.
      error: (_, __) => _CarouselFrame(
        titled: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: _gutter),
          child: FeaturedShopError(
            onRetry: () => ref.invalidate(cmsContentProvider(request)),
          ),
        ),
      ),
      data: (result) {
        final collections = result.collections
            .where((c) => c.shops.isNotEmpty)
            .toList(growable: false);

        if (collections.isEmpty) {
          if (result.failed) {
            return _CarouselFrame(
              titled: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: _gutter),
                child: FeaturedShopError(
                  onRetry: () => ref.invalidate(cmsContentProvider(request)),
                ),
              ),
            );
          }
          // Nothing to feature today: the page is byte-for-byte what it was.
          return const SizedBox.shrink();
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final collection in collections)
              // Counted as an impression the same way a banner is, and by the
              // same tracker — a featured row that is scrolled past unseen must
              // not be reported as seen.
              CmsImpressionTracker(
                key: Key('cms-impression-${collection.collectionId}'),
                contentId: collection.collectionId,
                placement: placement.wire,
                sourceScreen: sourceScreen,
                child: _Collection(
                  collection: collection,
                  placement: placement,
                  sourceScreen: sourceScreen,
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Heading + body, with the padding the Explore sliver expects.
class _CarouselFrame extends StatelessWidget {
  const _CarouselFrame({required this.child, this.titled = true});

  final Widget child;
  final bool titled;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (titled)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  FeaturedShopCarousel._gutter, 0, FeaturedShopCarousel._gutter, 8),
              child: Text(
                AppLocalizations.of(context).t('featuredShopSectionTitle'),
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: mm.onCard,
                ),
              ),
            ),
          child,
        ],
      ),
    );
  }
}

class _Collection extends StatelessWidget {
  const _Collection({
    required this.collection,
    required this.placement,
    this.sourceScreen,
  });

  final CmsCollection collection;
  final CmsPlacement placement;
  final String? sourceScreen;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                FeaturedShopCarousel._gutter, 0, FeaturedShopCarousel._gutter, 2),
            child: Row(
              children: [
                Expanded(
                  // The operator's own title for this row.
                  child: Text(
                    collection.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: mm.onCard,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                const FeaturedShopSponsoredPill(),
              ],
            ),
          ),
          if (collection.description.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  FeaturedShopCarousel._gutter, 0, FeaturedShopCarousel._gutter, 0),
              child: Text(
                collection.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: mm.onCardMuted, fontSize: 12.5, height: 1.3),
              ),
            ),
          const SizedBox(height: 10),
          _ShopRow(
            collection: collection,
            placement: placement,
            sourceScreen: sourceScreen,
          ),
        ],
      ),
    );
  }
}

/// The scrolling row itself.
class _ShopRow extends StatelessWidget {
  const _ShopRow({
    required this.collection,
    required this.placement,
    this.sourceScreen,
  });

  final CmsCollection collection;
  final CmsPlacement placement;
  final String? sourceScreen;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      // A fixed height so the row can never grow with its content and push the
      // results below off screen. The tiles are intrinsically shorter than this;
      // the slack absorbs a large text scale without clipping or overflowing.
      height: 210,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: FeaturedShopCarousel._gutter),
        physics: const BouncingScrollPhysics(),
        itemCount: collection.shops.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final shop = collection.shops[i];
          return Align(
            alignment: Alignment.topCenter,
            child: FeaturedShopTile(
              shop: shop,
              contentId: collection.collectionId,
              placement: placement.wire,
              sourceScreen: sourceScreen,
              width: FeaturedShopCarousel._tileWidth,
            ),
          );
        },
      ),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 210,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: FeaturedShopCarousel._gutter),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 3,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, __) => const Align(
          alignment: Alignment.topCenter,
          child: FeaturedShopTileSkeleton(
              width: FeaturedShopCarousel._tileWidth),
        ),
      ),
    );
  }
}
