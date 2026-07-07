import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'social_providers.dart';
import 'visibility.dart';

/// Karang siaran gaya Threads: halaman penuh melalui route GoRouter
/// (Navigator.push mentah tidak render dengan betul pada setup ini).
/// [groupId] null = siaran awam.
Future<void> showComposeSheet(BuildContext context, {String? groupId}) async {
  final query = groupId != null ? '?groupId=$groupId' : '';
  await GoRouter.of(context).push('/compose$query');
}

class ComposePage extends ConsumerStatefulWidget {
  const ComposePage({super.key, this.groupId});

  final String? groupId;

  @override
  ConsumerState<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends ConsumerState<ComposePage> {
  final _controller = TextEditingController();
  File? _image;
  bool _posting = false;
  PostVisibility _vis = PostVisibility.public;

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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('😕 $e')),
        );
      }
    }
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final text = _controller.text.trim();
    if (text.isEmpty && _image == null) return;
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _posting = true);
    try {
      await ref.read(socialServiceProvider).createPost(
            uid: uid,
            text: text,
            image: _image,
            groupId: widget.groupId,
            visibility: widget.groupId != null
                ? PostVisibility.groupOnly.wire
                : _vis.wire,
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('postSent'))),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _posting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final canPost =
        !_posting && (_controller.text.trim().isNotEmpty || _image != null);

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _posting ? null : () => Navigator.pop(context),
        ),
        title: Text(
          l.t('feedTitle'),
          style: const TextStyle(color: AppColors.threadsText),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: ElevatedButton(
                onPressed: canPost ? _submit : null,
                // PENTING: tema global set minimumSize lebar infiniti
                // (Size.fromHeight) — mesti di-override dalam AppBar/Row,
                // jika tidak seluruh halaman gagal layout.
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(88, 40),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 8),
                ),
                child: _posting
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l.t('postAction')),
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _controller,
              maxLines: 6,
              minLines: 3,
              maxLength: 500,
              autofocus: true,
              onChanged: (v) => setState(() {}),
              style: const TextStyle(color: AppColors.threadsText),
              decoration: InputDecoration(
                hintText: l.t('composeHint'),
                hintStyle:
                    const TextStyle(color: AppColors.threadsMuted),
                counterStyle:
                    const TextStyle(color: AppColors.threadsMuted),
                filled: true,
                fillColor: AppColors.threadsSurface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide:
                      const BorderSide(color: AppColors.threadsBorder),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide:
                      const BorderSide(color: AppColors.threadsBorder),
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
                      height: 220,
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
            const SizedBox(height: 14),
            if (widget.groupId == null)
              Align(
                alignment: Alignment.centerLeft,
                child: VisibilityChip(
                  value: _vis,
                  onChanged: (v) => setState(() => _vis = v),
                ),
              ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _posting
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
                    onPressed: _posting
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
          ],
        ),
      ),
    );
  }
}
