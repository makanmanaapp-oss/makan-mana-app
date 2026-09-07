import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'cms_banner.dart';
import 'cms_content.dart';
import 'cms_providers.dart';

/// WAVE 5 — a drop-in CMS slot.
///
/// The ONLY thing a host screen adds. It renders nothing while loading, nothing
/// on error, and nothing when there is no eligible content — so a screen with
/// no banner is byte-for-byte the layout it had before Wave 5.
///
/// That "nothing" is deliberate rather than lazy: a spinner or an error card in
/// a promotional slot would push the real content down for something the user
/// never asked for and cannot act on.
class CmsSlot extends ConsumerWidget {
  const CmsSlot({
    super.key,
    required this.placement,
    this.canonicalPlaceId,
    this.sponsored = false,
  });

  final CmsPlacement placement;

  /// Required for [CmsPlacement.restaurantDetail]; a banner targeted at one
  /// restaurant may never appear on another.
  final String? canonicalPlaceId;

  final bool sponsored;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (placement == CmsPlacement.restaurantDetail &&
        (canonicalPlaceId == null || canonicalPlaceId!.trim().isEmpty)) {
      return const SizedBox.shrink();
    }

    final async = ref.watch(cmsContentProvider(CmsRequest(
      placement: placement,
      canonicalPlaceId: canonicalPlaceId,
    )));

    final result = async.valueOrNull;
    if (result == null || result.content.isEmpty) return const SizedBox.shrink();

    // Defence in depth: the server scoped this already, but a mis-scoped row
    // must not reach another restaurant's page.
    final items = placement == CmsPlacement.restaurantDetail
        ? result.content
            .where((c) => c.canonicalPlaceId == canonicalPlaceId!.trim())
            .toList(growable: false)
        : result.content;

    return CmsBannerList(items: items, sponsored: sponsored);
  }
}
