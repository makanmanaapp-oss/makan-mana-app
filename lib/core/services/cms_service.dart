import 'package:cloud_functions/cloud_functions.dart';

import '../../features/cms/cms_content.dart';
import '../constants/app_constants.dart';

/// WAVE 5 — thin callable client for the runtime CMS projection.
///
/// `cms_content` is server-only under rules, so this is the single read path.
/// Every failure yields an EMPTY result rather than throwing: a CMS outage must
/// look exactly like "no banner today", never like a broken Home screen.
class CmsService {
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Map<String, dynamic> _map(dynamic value) {
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return <String, dynamic>{};
  }

  /// Eligible content for one placement.
  ///
  /// [language] and [region] are the viewer's own display context. The PLAN is
  /// deliberately not sent — the server reads it, so a client cannot assert an
  /// entitlement it does not have.
  Future<CmsFetchResult> fetch({
    required CmsPlacement placement,
    String? language,
    String? region,
    String? canonicalPlaceId,
    bool includeCollections = false,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('getCmsContent')
          .call<Map<dynamic, dynamic>>({
        'placement': placement.wire,
        if (language != null) 'language': language,
        if (region != null) 'region': region,
        if (canonicalPlaceId != null) 'canonicalPlaceId': canonicalPlaceId,
        if (includeCollections) 'includeCollections': true,
      });
      final root = _map(result.data);
      return CmsFetchResult(
        content: CmsContent.listFromMap(root['content']),
        collections: CmsCollection.listFromMap(root['collections']),
      );
    } on FirebaseFunctionsException {
      return const CmsFetchResult.empty();
    } catch (_) {
      return const CmsFetchResult.empty();
    }
  }
}

class CmsFetchResult {
  const CmsFetchResult({required this.content, required this.collections});
  const CmsFetchResult.empty()
      : content = const [],
        collections = const [];

  final List<CmsContent> content;
  final List<CmsCollection> collections;

  bool get isEmpty => content.isEmpty && collections.isEmpty;
}
