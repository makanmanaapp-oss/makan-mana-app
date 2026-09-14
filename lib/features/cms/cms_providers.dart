import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/location/malaysia_state_hero_voice.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
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
/// B3 — wired to the SAME coarse state Home's local hero already renders, so
/// there is exactly one location system in the app. Before this it always
/// returned null, and because the server fails closed on an unknown attribute,
/// every region-targeted banner was invisible to every user.
///
/// Normalised through the existing allowlist rather than passed through raw.
/// The live resolver already normalises, so for real devices this is a no-op —
/// but the QA debug-state injection path bypasses it, and an unnormalised
/// "selangor" would silently miss a "Selangor" target. Normalising here means
/// the two paths cannot disagree.
///
/// Unknown, non-Malaysian or unresolved locations yield null and therefore see
/// no region-targeted content at all. That is the intended direction: showing a
/// Selangor promotion to someone whose location we could not establish is worse
/// than showing them nothing.
final cmsViewerRegionProvider = Provider<String?>((ref) {
  // `.select` keeps this tied to the state alone — moving a few metres or
  // changing radius rewrites the location context constantly, and rebuilding
  // the CMS request on every one of those would refetch for no reason.
  final resolved = ref.watch(
    makanManaUserContextProvider.select((context) => context.locationState),
  );
  return MalaysiaStateHeroVoice.normalize(resolved);
});

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
