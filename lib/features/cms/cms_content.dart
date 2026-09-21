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
    required this.readUrl,
  });

  final String storagePath;
  final String contentType;
  final int width;
  final int height;
  final String altText;

  /// B1 — short-lived signed READ url minted by the server for THIS request.
  ///
  /// `cms/` is private and Storage rules deny every client read, so this is the
  /// only way the image is reachable. Null means the server could not sign one
  /// this time; the card then renders as text, never as a broken image.
  final String? readUrl;

  /// Whether there is an image to show right now.
  bool get hasImage => (readUrl?.trim().isNotEmpty ?? false);

  /// Cache key for the image.
  ///
  /// The signed url carries a fresh expiry on every fetch, so using it as the
  /// key would re-download the same picture on every Home visit. The storage
  /// path is the stable identity of the object, so it is what the cache is
  /// keyed on while the url itself rotates.
  String get cacheKey => storagePath;

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
    final url = (value['readUrl'] as String?)?.trim();
    return CmsMedia(
      storagePath: path,
      contentType: (value['contentType'] as String?) ?? '',
      width: w,
      height: h,
      altText: (value['altText'] as String?) ?? '',
      readUrl: (url == null || url.isEmpty) ? null : url,
    );
  }
}


/// FEATURED SHOP — the registry-owned identity behind a shop banner.
///
/// Every field here was resolved SERVER-SIDE from the place registry and proven
/// to exist on this very request. The operator supplies the pitch (headline,
/// promo copy, CTA wording); this supplies who the shop actually is.
///
/// There is deliberately no `isOpen`, no `distanceKm` and no opening hours.
/// `place_details` does not carry opening hours or business status at all, and
/// a CMS read has no location context, so a distance here would be invented.
/// They are absent rather than nullable so a later edit cannot start filling
/// them in with something plausible.
class CmsShop {
  const CmsShop({
    required this.canonicalPlaceId,
    required this.name,
    required this.photoUrl,
    required this.address,
    required this.rating,
    required this.ratingCount,
    required this.destination,
  });

  final String canonicalPlaceId;

  /// The real registry name. Never an id, never operator text.
  final String name;

  /// A real https photo, or null — the card then draws a monogram, exactly as
  /// the Explore list already does for photo-less places.
  final String? photoUrl;
  final String? address;

  /// Non-null ONLY when a rating and a review count both exist.
  final double? rating;
  final int? ratingCount;

  /// Where tapping this shop goes. DERIVED server-side from the proven id, so
  /// a card can never name one shop and open another.
  final String destination;

  bool get hasPhoto => (photoUrl?.trim().isNotEmpty ?? false);
  bool get hasRating => rating != null && ratingCount != null;

  /// Up to two initials for the monogram fallback tile.
  String get monogram {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    if (words.isEmpty) return '?';
    final letters = words.take(2).map((w) => w[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  static CmsShop? fromMap(Object? value) {
    if (value is! Map) return null;
    final id = (value['canonicalPlaceId'] as String?)?.trim() ?? '';
    final name = (value['name'] as String?)?.trim() ?? '';
    final destination = (value['destination'] as String?)?.trim() ??
        (value['shopDestination'] as String?)?.trim() ??
        '';
    // A shop with no name or no way to reach it is not a shop card. The server
    // already drops these; refusing again here means a stale cached payload
    // cannot resurrect one.
    if (id.isEmpty || name.isEmpty) return null;
    if (!isSafeCtaDestination(destination)) return null;

    final rating = (value['rating'] as num?)?.toDouble();
    final ratingCount = (value['ratingCount'] as num?)?.toInt();
    final photo = (value['photoUrl'] as String?)?.trim();
    final address = (value['address'] as String?)?.trim();
    return CmsShop(
      canonicalPlaceId: id,
      name: name,
      photoUrl: (photo == null || photo.isEmpty) ? null : photo,
      address: (address == null || address.isEmpty) ? null : address,
      // Both, and both meaningful. A score of 0, or a score with no reviews
      // behind it, is not a rating — the server already applies this rule, and
      // repeating it here means a stale cached payload cannot smuggle one
      // through after the fact.
      rating: _ratingShown(rating, ratingCount) ? rating : null,
      ratingCount: _ratingShown(rating, ratingCount) ? ratingCount : null,
      destination: destination,
    );
  }

  static bool _ratingShown(double? rating, int? count) =>
      rating != null && rating > 0 && count != null && count > 0;

  static List<CmsShop> listFromMap(Object? value) {
    if (value is! List) return const [];
    return value.map(CmsShop.fromMap).whereType<CmsShop>().toList(growable: false);
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
    this.shop,
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

  /// Present ONLY on a featured-shop banner: the proven registry identity of
  /// the shop this banner is about. Null on an ordinary editorial banner, which
  /// is what every banner was before this feature.
  final CmsShop? shop;

  /// A banner that presents a real shop rather than operator text alone.
  bool get isFeaturedShop => shop != null;

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
      // The server sends the destination alongside the shop; fold it in so the
      // rest of the app only ever sees one object with everything proven.
      shop: CmsShop.fromMap(value['shop'] is Map
          ? {
              ...(value['shop'] as Map),
              'destination': value['shopDestination'],
            }
          : null),
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
    required this.shops,
  });

  final String collectionId;
  final String title;
  final String description;
  final List<String> canonicalPlaceIds;

  /// The resolved shops, in the operator's chosen order. The ORDER is the
  /// product, so it is preserved exactly as the server sent it.
  ///
  /// Shorter than [canonicalPlaceIds] when a member could not be proven on this
  /// request — a shop that was taken down simply stops appearing.
  final List<CmsShop> shops;

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
    final shops = CmsShop.listFromMap(value['shops']);
    // A curated row with nothing in it is worse than no row.
    //
    // Note what is NOT checked here: an empty `shops`. This model stays a
    // faithful reading of what the server sent, so a collection whose members
    // could not all be resolved is still representable. Deciding that such a
    // row cannot be DRAWN belongs to the carousel, which skips it — a parser
    // that silently discarded it would make the two cases indistinguishable.
    if (id.isEmpty || title.isEmpty || ids.isEmpty) return null;
    return CmsCollection(
      collectionId: id,
      title: title,
      description: (value['description'] as String?) ?? '',
      canonicalPlaceIds: ids,
      shops: shops,
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

/// Route paths that are StatefulShellBranch ROOTS in the app router.
///
/// These four are branches of the shell, not ordinary pages. `context.push`ing
/// one stacks a second copy of that branch's navigator while the shell still
/// holds the first, so the branch's GlobalKey is reserved twice and the
/// framework asserts `!keyReservation.contains(key)`. On a real device that is
/// a red screen, and backing out of it drops the user clean out of the app.
///
/// Sub-routes like `/profile/activity` are NOT branch roots — they are normal
/// pushable pages, and replacing the stack for them would break their back
/// button. The match is therefore exact, never a prefix: `/homework` is not
/// `/home`.
const _shellBranchRoots = <String>{'/home', '/explore', '/history', '/profile'};

/// Whether a CTA destination must be switched to rather than pushed.
bool cmsDestinationIsShellBranchRoot(String? value) {
  return _shellBranchRoots.contains(value?.trim() ?? '');
}

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
  if (!clean.toLowerCase().startsWith('https://')) return false;

  // DEF-2: "starts with https://" is not "is a url". `https://[b5c` used to
  // pass here, so the card rendered a CTA that looked live and `_open` then
  // threw the tap away when Uri.tryParse returned null - no navigation, no
  // event, no sign to anyone that the banner was dead. A destination that
  // cannot be parsed must not present a button in the first place.
  //
  // Whitespace is rejected before parsing because Dart and JS disagree about
  // it: Uri.parse turns "https://exa mple.com" into host "exa%20mple.com" while
  // `new URL` throws. The same three checks run in
  // functions/src/domain/cms/cmsLifecycle.ts so both sides give one answer.
  if (clean.contains(RegExp(r'\s'))) return false;
  final uri = Uri.tryParse(clean);
  return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty;
}
