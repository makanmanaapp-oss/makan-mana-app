import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import 'cms_content.dart';

/// WAVE 5 — the CMS banner surface.
///
/// Additive by construction: with no content it renders NOTHING, so every
/// screen it sits on looks exactly as it did before Wave 5. That is the whole
/// contract with the approved Home UI — the banner is a guest, not a tenant.
///
/// Uses the app's own palette tokens rather than any colour of its own, so an
/// operator cannot make a banner clash with (or impersonate) product chrome.
class CmsBannerList extends StatelessWidget {
  const CmsBannerList({super.key, required this.items, this.sponsored = false});

  final List<CmsContent> items;

  /// Marks the block as promotional. Used on discovery surfaces so editorial
  /// content is never mistaken for an organic recommendation.
  final bool sponsored;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      key: const Key('cms-banner-list'),
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final item in items)
            CmsBannerCard(content: item, sponsored: sponsored),
        ],
      ),
    );
  }
}

class CmsBannerCard extends StatelessWidget {
  const CmsBannerCard({super.key, required this.content, this.sponsored = false});

  final CmsContent content;
  final bool sponsored;

  Future<void> _open(BuildContext context) async {
    // Re-checked at the point of action: a cached payload must never be able to
    // launch something the current rules forbid.
    if (!isSafeCtaDestination(content.ctaDestination)) return;
    final destination = content.ctaDestination.trim();
    if (destination.startsWith('/')) {
      // A shell branch root is SWITCHED to. Pushing one stacks a second copy of
      // that branch's navigator over the shell's own and the duplicated
      // GlobalKey crashes the app — /explore, the most natural CTA this app
      // has, did exactly that. Everything else is pushed, so back returns to
      // the banner the customer tapped.
      if (cmsDestinationIsShellBranchRoot(destination)) {
        context.go(destination);
      } else {
        context.push(destination);
      }
      return;
    }
    final uri = Uri.tryParse(destination);
    if (uri == null || uri.scheme.toLowerCase() != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    final media = content.media;

    return Container(
      key: Key('cms-banner-${content.contentId}'),
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
          onTap: content.hasCta ? () => _open(context) : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // B1 — the real image.
              //
              // The area is reserved ONLY when there is a url to load. Media
              // with no usable url (signing failed, or none was uploaded) is
              // known before layout, so the card collapses to a clean text card
              // instead of reserving a large empty rectangle — which is exactly
              // what this slot used to render for every banner.
              if (media != null && media.hasImage)
                // A fixed aspect box so the layout never jumps while loading,
                // and the image can never dictate the card's height.
                AspectRatio(
                  aspectRatio: media.aspectRatio,
                  child: Semantics(
                    label: media.altText.isNotEmpty ? media.altText : content.title,
                    image: true,
                    child: CachedNetworkImage(
                      key: Key('cms-banner-image-${content.contentId}'),
                      imageUrl: media.readUrl!,
                      // Keyed on the STORAGE PATH, not the url: the signed url
                      // carries a fresh expiry every fetch, so keying on it
                      // would re-download the same picture on every visit.
                      cacheKey: media.cacheKey,
                      fit: BoxFit.cover,
                      fadeInDuration: const Duration(milliseconds: 200),
                      // Both states are the same calm fill the card already
                      // used. Never a broken-image glyph or an error box: a
                      // banner that cannot load its picture should look like a
                      // plain card, not like a fault.
                      placeholder: (_, __) => Container(color: mm.softFill),
                      errorWidget: (_, __, ___) => Container(color: mm.softFill),
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (sponsored)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Container(
                          key: const Key('cms-sponsored-label'),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: mm.chipBackground,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            'Tajaan',
                            style: TextStyle(
                              color: mm.chipText,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    Text(
                      content.title,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15.5,
                        color: mm.onCard,
                      ),
                    ),
                    if (content.subtitle.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          content.subtitle,
                          style: TextStyle(
                              color: mm.onCardMuted, fontSize: 13, height: 1.3),
                        ),
                      ),
                    if (content.body.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          content.body,
                          style: TextStyle(
                              color: mm.onCardMuted, fontSize: 12.5, height: 1.35),
                        ),
                      ),
                    if (content.hasCta)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              content.ctaLabel,
                              style: TextStyle(
                                color: mm.chipText,
                                fontSize: 13.5,
                                fontWeight: FontWeight.w800,
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
            ],
          ),
        ),
      ),
    );
  }
}
