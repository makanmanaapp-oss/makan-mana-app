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
      return const CmsFetchResult.failure();
    } catch (_) {
      return const CmsFetchResult.failure();
    }
  }
}

class CmsFetchResult {
  const CmsFetchResult({
    required this.content,
    required this.collections,
    this.failed = false,
  });

  /// The fetch did not succeed.
  ///
  /// Kept SEPARATE from "empty" on purpose. An ordinary banner slot treats both
  /// the same and renders nothing — that behaviour is unchanged. But a named
  /// section that has already drawn a heading needs to tell a customer that
  /// something failed rather than sit there looking deliberately empty.
  const CmsFetchResult.failure()
      : content = const [],
        collections = const [],
        failed = true;

  const CmsFetchResult.empty()
      : failed = false,
        content = const [],
        collections = const [];

  final List<CmsContent> content;
  final List<CmsCollection> collections;

  /// True when the fetch itself failed, as opposed to succeeding with nothing
  /// to show. See [CmsFetchResult.failure].
  final bool failed;

  bool get isEmpty => content.isEmpty && collections.isEmpty;
}
