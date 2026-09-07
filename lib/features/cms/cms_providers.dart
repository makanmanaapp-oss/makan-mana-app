import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/services/cms_service.dart';
import 'cms_content.dart';

/// WAVE 5 — CMS runtime providers.
///
/// One provider per placement request, keyed so Home and Explore never share a
/// cache entry. Every provider resolves to an EMPTY result on any failure, so a
/// screen that mounts a banner slot degrades to exactly its pre-Wave-5 layout
/// rather than showing an error the user cannot act on.
final cmsServiceProvider = Provider<CmsService>((ref) => CmsService());

/// The request a surface makes. Language and region are the viewer's own
/// display context; the plan is resolved server-side and deliberately absent.
class CmsRequest {
  const CmsRequest({
    required this.placement,
    this.canonicalPlaceId,
    this.includeCollections = false,
  });

  final CmsPlacement placement;
  final String? canonicalPlaceId;
  final bool includeCollections;

  @override
  bool operator ==(Object other) =>
      other is CmsRequest &&
      other.placement == placement &&
      other.canonicalPlaceId == canonicalPlaceId &&
      other.includeCollections == includeCollections;

  @override
  int get hashCode => Object.hash(placement, canonicalPlaceId, includeCollections);
}

/// Malaysian state for region targeting, when the app already knows it.
///
/// Overridden in tests. The default returns null rather than guessing: an
/// unknown region must never satisfy a region gate.
final cmsViewerRegionProvider = Provider<String?>((ref) => null);

final cmsContentProvider =
    FutureProvider.autoDispose.family<CmsFetchResult, CmsRequest>((ref, request) async {
  if (!ref.watch(firebaseReadyProvider)) return const CmsFetchResult.empty();
  final locale = ref.watch(languageProvider);
  return ref.read(cmsServiceProvider).fetch(
        placement: request.placement,
        language: locale.languageCode,
        region: ref.watch(cmsViewerRegionProvider),
        canonicalPlaceId: request.canonicalPlaceId,
        includeCollections: request.includeCollections,
      );
});
