/// WAVE 5 — CMS content model + PURE display helpers.
///
/// The client is not the authority on whether a banner may render. The server
/// already applied the schedule (its own clock) and the viewer's targeting, so
/// everything that arrives here is showable. Nothing below re-derives
/// visibility from local time.
///
/// The one thing the client DOES decide is safety at the point of action: a CTA
/// destination is re-checked before it is opened, because a stale payload from
/// a cache must never be able to launch something the current rules forbid.
library;

/// Surfaces the app can render. Mirrors the server allowlist exactly.
enum CmsPlacement {
  homeTop('home_top'),
  homeMid('home_mid'),
  exploreTop('explore_top'),
  restaurantDetail('restaurant_detail');

  const CmsPlacement(this.wire);
  final String wire;

  static CmsPlacement? parse(Object? value) {
    for (final p in CmsPlacement.values) {
      if (p.wire == value) return p;
    }
    return null;
  }
}

class CmsMedia {
  const CmsMedia({
    required this.storagePath,
    required this.contentType,
    required this.width,
    required this.height,
    required this.altText,
  });

  final String storagePath;
  final String contentType;
  final int width;
  final int height;
  final String altText;

  /// Aspect ratio for a stable layout box, so a banner never causes a jump
  /// while its image loads. Falls back to a safe wide ratio.
  double get aspectRatio =>
      (width > 0 && height > 0) ? width / height : 2.0;

  static CmsMedia? fromMap(Object? value) {
    if (value is! Map) return null;
    final path = (value['storagePath'] as String?)?.trim() ?? '';
    if (path.isEmpty) return null;
    final w = (value['width'] as num?)?.toInt() ?? 0;
    final h = (value['height'] as num?)?.toInt() ?? 0;
    return CmsMedia(
      storagePath: path,
      contentType: (value['contentType'] as String?) ?? '',
      width: w,
      height: h,
      altText: (value['altText'] as String?) ?? '',
    );
  }
}

class CmsContent {
  const CmsContent({
    required this.contentId,
    required this.placement,
    required this.title,
    required this.subtitle,
    required this.body,
    required this.ctaLabel,
    required this.ctaDestination,
    required this.media,
    required this.priority,
    required this.canonicalPlaceId,
  });

  final String contentId;
  final CmsPlacement placement;
  final String title;
  final String subtitle;
  final String body;
  final String ctaLabel;
  final String ctaDestination;
  final CmsMedia? media;
  final int priority;
  final String? canonicalPlaceId;

  bool get hasCta => ctaLabel.trim().isNotEmpty && isSafeCtaDestination(ctaDestination);

  static CmsContent? fromMap(Object? value) {
    if (value is! Map) return null;
    final id = (value['contentId'] as String?)?.trim() ?? '';
    final placement = CmsPlacement.parse(value['placement']);
    final title = (value['title'] as String?)?.trim() ?? '';
    // An unknown placement means a server we do not understand; rendering it
    // somewhere arbitrary would be worse than skipping it.
    if (id.isEmpty || placement == null || title.isEmpty) return null;
    return CmsContent(
      contentId: id,
      placement: placement,
      title: title,
      subtitle: (value['subtitle'] as String?) ?? '',
      body: (value['body'] as String?) ?? '',
      ctaLabel: (value['ctaLabel'] as String?) ?? '',
      ctaDestination: (value['ctaDestination'] as String?) ?? '',
      media: CmsMedia.fromMap(value['media']),
      priority: (value['priority'] as num?)?.toInt() ?? 100,
      canonicalPlaceId: (value['canonicalPlaceId'] as String?)?.trim(),
    );
  }

  static List<CmsContent> listFromMap(Object? value) {
    if (value is! List) return const [];
    return value.map(CmsContent.fromMap).whereType<CmsContent>().toList(growable: false);
  }
}

class CmsCollection {
  const CmsCollection({
    required this.collectionId,
    required this.title,
    required this.description,
    required this.canonicalPlaceIds,
  });

  final String collectionId;
  final String title;
  final String description;
  final List<String> canonicalPlaceIds;

  static CmsCollection? fromMap(Object? value) {
    if (value is! Map) return null;
    final id = (value['collectionId'] as String?)?.trim() ?? '';
    final title = (value['title'] as String?)?.trim() ?? '';
    final ids = (value['canonicalPlaceIds'] as List?)
            ?.whereType<String>()
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList(growable: false) ??
        const <String>[];
    // A curated row with nothing in it is worse than no row.
    if (id.isEmpty || title.isEmpty || ids.isEmpty) return null;
    return CmsCollection(
      collectionId: id,
      title: title,
      description: (value['description'] as String?) ?? '',
      canonicalPlaceIds: ids,
    );
  }

  static List<CmsCollection> listFromMap(Object? value) {
    if (value is! List) return const [];
    return value.map(CmsCollection.fromMap).whereType<CmsCollection>().toList(growable: false);
  }
}

/// Schemes that must never be launched from operator-authored content.
const _forbiddenSchemes = [
  'javascript:', 'data:', 'file:', 'intent:', 'content:', 'blob:',
  'vbscript:', 'about:', 'tel:', 'sms:', 'market:', 'app:',
];

/// Internal routes a CTA may open. Mirrors the server allowlist.
const _allowedRoutePrefixes = [
  '/home', '/explore', '/history', '/profile', '/social', '/groups',
  '/restaurant/', '/paywall', '/pro', '/fit/', '/favorites', '/taste',
  '/meal-wallet', '/settings', '/coupon',
];

/// Re-check a destination at the point of action.
///
/// The server validates on write, but a cached payload could outlive a rule
/// change, and the cost of being wrong here is launching something hostile.
/// Whitespace and separators are stripped before the scheme check so
/// "java script:" and "JAVASCRIPT:" cannot slip past.
bool isSafeCtaDestination(String? value) {
  final clean = value?.trim() ?? '';
  if (clean.isEmpty) return false;
  final collapsed = clean.replaceAll(RegExp(r'[\s-]'), '').toLowerCase();
  for (final scheme in _forbiddenSchemes) {
    if (collapsed.startsWith(scheme)) return false;
  }
  if (collapsed.contains(':') && !collapsed.startsWith('https://')) return false;
  if (clean.startsWith('/')) {
    return _allowedRoutePrefixes.any(clean.startsWith);
  }
  return clean.toLowerCase().startsWith('https://');
}
