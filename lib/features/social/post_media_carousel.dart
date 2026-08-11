import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'post_media.dart';

/// Social Prompt 8: carousel media dalam feed.
///
/// - 1 gambar: paparan penuh seperti sedia ada (Hero indeks 0).
/// - 2-6 gambar: PageView nisbah tetap 4:3 + titik halaman + cip "1/4".
/// - Tap gambar → media viewer pada INDEKS yang ditap.
/// - Ringan: CachedNetworkImage lazy per halaman, tiada muat semula feed.
class PostMediaCarousel extends ConsumerStatefulWidget {
  const PostMediaCarousel({
    super.key,
    required this.postId,
    required this.urls,
    required this.onOpen,
    this.heroFirst = true,
  });

  final String postId;
  final List<String> urls;

  /// Dipanggil dengan indeks gambar yang ditap (buka viewer di situ).
  final void Function(int index) onOpen;

  /// Hero pada gambar pertama (padan dengan viewer).
  final bool heroFirst;

  @override
  ConsumerState<PostMediaCarousel> createState() =>
      _PostMediaCarouselState();
}

class _PostMediaCarouselState extends ConsumerState<PostMediaCarousel> {
  int _page = 0;
  bool _swipeLogged = false;

  /// [placeholderHeight] perlu bila widget ini berada dalam Column tanpa
  /// had tinggi (mod satu gambar); dalam AspectRatio ia dibiar null.
  ///
  /// FIX 2 (Part 5): [memWidth] hadkan saiz NYAHKOD memori kepada lebar
  /// paparan × dpr (bukan resolusi penuh) — kurangkan kos memori/nyahkod imej
  /// feed semasa skrol laju. CachedNetworkImage kekal cache cakera (tiada
  /// muat semula). Kualiti kekal (nyahkod ~ saiz sebenar dipaparkan).
  Widget _image(String url, {double? placeholderHeight, int? memWidth}) =>
      CachedNetworkImage(
        imageUrl: url,
        width: double.infinity,
        fit: BoxFit.cover,
        memCacheWidth: memWidth,
        placeholder: (context, u) => Container(
          height: placeholderHeight,
          color: AppColors.threadsSurface,
          child: const Center(
              child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        errorWidget: (context, u, error) => Container(
          height: placeholderHeight != null ? 120 : null,
          color: AppColors.threadsSurface,
          child: const Center(child: Text('🖼️')),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final urls = widget.urls;
    if (urls.isEmpty) return const SizedBox.shrink();

    // Lebar nyahkod ~ lebar skrin × dpr (dihadkan) — cukup tajam, jimat memori.
    final mq = MediaQuery.maybeOf(context);
    final memWidth = mq == null
        ? 1080
        : (mq.size.width * mq.devicePixelRatio).round().clamp(480, 1440);

    // Satu gambar: kekalkan paparan sedia ada (tiada indikator).
    if (urls.length == 1) {
      final single = GestureDetector(
        onTap: () => widget.onOpen(0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Stack(
            children: [
              SizedBox(
                  width: double.infinity,
                  child: _image(urls.first,
                      placeholderHeight: 200, memWidth: memWidth)),
              const _ExpandBadge(),
            ],
          ),
        ),
      );
      return widget.heroFirst
          ? Hero(tag: postMediaHeroTag(widget.postId, 0), child: single)
          : single;
    }

    // 2-6 gambar: carousel nisbah tetap (mesra 360dp, tiada overflow).
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: Stack(
          children: [
            Positioned.fill(
              child: PageView.builder(
                itemCount: urls.length,
                onPageChanged: (i) {
                  setState(() => _page = i);
                  // Log sekali sahaja per kad — elak banjir event.
                  if (!_swipeLogged) {
                    _swipeLogged = true;
                    ref.read(eventLoggerProvider).logEvent(
                          EventType.mediaCarouselViewed,
                          sourceScreen: 'feed',
                          metadata: {
                            'postId': widget.postId,
                            'imageCount': urls.length,
                          },
                        );
                  }
                },
                itemBuilder: (context, i) {
                  final img = GestureDetector(
                    onTap: () => widget.onOpen(i),
                    child: _image(urls[i], memWidth: memWidth),
                  );
                  return widget.heroFirst && i == 0
                      ? Hero(
                          tag: postMediaHeroTag(widget.postId, 0),
                          child: img)
                      : img;
                },
              ),
            ),
            // Cip kaunter "1/4".
            Positioned(
              top: 8,
              right: 8,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${_page + 1}/${urls.length}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800),
                ),
              ),
            ),
            // Titik halaman.
            Positioned(
              left: 0,
              right: 0,
              bottom: 8,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < urls.length; i++)
                    Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.symmetric(horizontal: 2.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i == _page ? Colors.white : Colors.white38,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExpandBadge extends StatelessWidget {
  const _ExpandBadge();

  @override
  Widget build(BuildContext context) {
    return const Positioned(
      right: 8,
      bottom: 8,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.black54,
          shape: BoxShape.circle,
        ),
        child: Padding(
          padding: EdgeInsets.all(6),
          child: Icon(Icons.open_in_full, size: 13, color: Colors.white),
        ),
      ),
    );
  }
}
