import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';

/// Argumen halaman rating (dihantar via GoRouter extra).
class RatingArgs {
  const RatingArgs({
    required this.placeId,
    required this.placeName,
    required this.emoji,
    required this.cuisine,
    required this.source, // meal | checkin | delivery
    this.mealId,
  });

  final String placeId;
  final String placeName;
  final String emoji;
  final String cuisine;
  final String source;
  final String? mealId;
}

/// Borang rating: bintang 1-5, ulasan, gambar, toggle kongsi ke feed.
class RatingPage extends ConsumerStatefulWidget {
  const RatingPage({super.key, required this.args});

  final RatingArgs args;

  @override
  ConsumerState<RatingPage> createState() => _RatingPageState();
}

class _RatingPageState extends ConsumerState<RatingPage> {
  final _controller = TextEditingController();
  int _rating = 0;
  File? _image;
  bool _shareToFeed = true;
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1280,
        imageQuality: 80,
      );
      if (picked != null && mounted) {
        setState(() => _image = File(picked.path));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    if (_rating == 0) return;
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _submitting = true);
    try {
      // Laluan check-in perlukan lokasi semasa (sahkan masih di kedai).
      double? lat;
      double? lng;
      if (widget.args.source == 'checkin') {
        final pos =
            await ref.read(locationServiceProvider).getPosition();
        lat = pos?.latitude;
        lng = pos?.longitude;
      }
      final result = await ref.read(reviewServiceProvider).submitReview(
            uid: uid,
            placeId: widget.args.placeId,
            placeName: widget.args.placeName,
            emoji: widget.args.emoji,
            cuisine: widget.args.cuisine,
            rating: _rating,
            text: _controller.text.trim(),
            image: _image,
            source: widget.args.source,
            mealId: widget.args.mealId,
            lat: lat,
            lng: lng,
            shareToFeed: _shareToFeed,
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.approved
                ? l.t('reviewSent')
                : l.t('reviewPending')),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        final msg = e is Exception ? e.toString() : '$e';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              msg.contains('5 minit') || msg.contains('failed-precondition')
                  ? l.t('reviewNotEligible')
                  : l.t('postFailed'),
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final canSubmit = !_submitting && _rating > 0;

    return Scaffold(
      backgroundColor: context.mm.appBackground,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _submitting ? null : () => Navigator.pop(context),
        ),
        title: Text(l.t('rateTitle')),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Kedai yang dinilai.
            Row(
              children: [
                Text(widget.args.emoji,
                    style: const TextStyle(fontSize: 34)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.args.placeName,
                    style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: context.mm.onCard,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            // Bintang besar.
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(5, (i) {
                  final filled = i < _rating;
                  return IconButton(
                    iconSize: 44,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _rating = i + 1),
                    icon: Icon(
                      filled ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: filled
                          ? AppColors.warmYellow
                          : context.mm.iconMuted,
                    ),
                  );
                }),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              maxLines: 5,
              minLines: 3,
              maxLength: 500,
              decoration: InputDecoration(
                hintText: l.t('reviewHint'),
                filled: true,
                fillColor: context.mm.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide:
                      BorderSide(color: context.mm.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide:
                      BorderSide(color: context.mm.border),
                ),
              ),
            ),
            if (_image != null) ...[
              const SizedBox(height: 12),
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.file(
                      _image!,
                      height: 180,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: InkWell(
                      onTap: () => setState(() => _image = null),
                      child: Container(
                        padding: const EdgeInsets.all(5),
                        decoration: const BoxDecoration(
                          color: Colors.black54,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.close,
                            size: 18, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _submitting
                        ? null
                        : () => _pickImage(ImageSource.camera),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 46)),
                    icon:
                        const Icon(Icons.photo_camera_outlined, size: 20),
                    label: Text(l.t('camera')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _submitting
                        ? null
                        : () => _pickImage(ImageSource.gallery),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 46)),
                    icon:
                        const Icon(Icons.photo_library_outlined, size: 20),
                    label: Text(l.t('gallery')),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              value: _shareToFeed,
              onChanged: _submitting
                  ? null
                  : (v) => setState(() => _shareToFeed = v),
              contentPadding: EdgeInsets.zero,
              activeTrackColor: AppColors.primaryRed,
              title: Text(
                l.t('shareToFeed'),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14.5,
                ),
              ),
            ),
            if (widget.args.source == 'delivery')
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  l.t('deliveryPendingNote'),
                  style: TextStyle(
                    color: context.mm.onCardMuted,
                    fontSize: 13,
                  ),
                ),
              ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: canSubmit ? _submit : null,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(l.t('submitReview')),
            ),
          ],
        ),
      ),
    );
  }
}
