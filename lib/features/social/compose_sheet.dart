import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/utils/time_slot_utils.dart';
import '../groups/group_polls.dart';
import 'checkin_utils.dart';
import 'repost.dart';
import 'social_providers.dart';
import 'visibility.dart';

/// Social Prompt 4: Unified Composer — satu pintu untuk Post, Check-in,
/// Poll (pintasan grup), Bill (pintasan Tong-Tong) dan Status.
/// Halaman penuh melalui route GoRouter (Navigator.push mentah tidak
/// render dengan betul pada setup ini). [groupId] null = siaran awam.
Future<void> showComposeSheet(
  BuildContext context, {
  String? groupId,
  String? type,
}) async {
  final params = <String>[
    if (groupId != null) 'groupId=$groupId',
    if (type != null) 'type=$type',
  ];
  final query = params.isEmpty ? '' : '?${params.join('&')}';
  await GoRouter.of(context).push('/compose$query');
}

/// Jenis kandungan dalam composer bersatu.
enum ComposerType { post, checkin, poll, bill, status }

class ComposePage extends ConsumerStatefulWidget {
  const ComposePage({
    super.key,
    this.groupId,
    this.initialType,
    this.quoteOfPostId,
    this.quoteSource,
  });

  final String? groupId;

  /// Jenis mula ('checkin'/'status'/...) — dari quick action grup (SP5).
  final String? initialType;

  /// SP8: mod quote repost — ID post asal yang dipetik.
  final String? quoteOfPostId;

  /// Data post asal dibawa dari feed (pratonton pantas; live tetap
  /// disahkan oleh EmbeddedOriginalCard + pelayan).
  final Map<String, dynamic>? quoteSource;

  @override
  ConsumerState<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends ConsumerState<ComposePage> {
  ComposerType _type = ComposerType.post;

  // Dikongsi Post/Check-in/Status.
  final _captionCtrl = TextEditingController();
  // SP8: multi-gambar (maks 6).
  final List<File> _images = [];
  int _uploadDone = 0;
  int _uploadTotal = 0;
  bool _posting = false;
  PostVisibility _vis = PostVisibility.public;

  static const _maxImages = 6;

  bool get _isQuote => widget.quoteOfPostId != null;

  // Medan check-in.
  final _placeCtrl = TextEditingController();
  final _areaCtrl = TextEditingController();
  final _menuCtrl = TextEditingController();
  final _spendCtrl = TextEditingController();
  int _rating = 0; // 0 = tiada rating
  final Set<String> _moodTags = {};
  bool _saveToHistory = false;
  String? _inlineError;

  bool get _inGroup => widget.groupId != null;

  // Ditangkap awal supaya dispose/log tidak sentuh ref selepas dilupus.
  late final _logger = ref.read(eventLoggerProvider);

  /// SP8: pilihan keterlihatan quote — dikekang privasi post asal
  /// (pelayan kuatkuasa juga; ini untuk UX yang jujur).
  List<PostVisibility> _quoteVisOptions() {
    if (_inGroup) return const [PostVisibility.groupOnly];
    final src = widget.quoteSource;
    if (src == null) {
      // Sumber tak diketahui → pilihan paling selamat (SP9.2B).
      return const [PostVisibility.private];
    }
    final check = checkRepostability(src, isGroupMember: true);
    return [
      for (final w in check.allowedVisibilities)
        PostVisibility.values.firstWhere((v) => v.wire == w,
            orElse: () => PostVisibility.private),
    ];
  }

  @override
  void initState() {
    super.initState();
    // SP5: quick action grup boleh buka terus jenis tertentu.
    _type = switch (widget.initialType) {
      'checkin' => ComposerType.checkin,
      'status' => ComposerType.status,
      'poll' => ComposerType.poll,
      'bill' => ComposerType.bill,
      _ => ComposerType.post,
    };
    // SP9.2B: check-in default PERIBADI (followers_only dimatikan; spend
    // agak sensitif — pengguna boleh tukar ke Awam jika mahu kongsi).
    if (!_inGroup && _type == ComposerType.checkin) {
      _vis = PostVisibility.private;
    }
    if (_isQuote) {
      _type = ComposerType.post;
      final opts = _quoteVisOptions();
      if (!opts.contains(_vis)) _vis = opts.first;
    }
    _logger.logEvent(
      EventType.composerOpened,
      sourceScreen: 'composer',
      metadata: {'hasGroup': _inGroup, 'postType': _postTypeWire()},
    );
  }

  @override
  void dispose() {
    _logger.logEvent(EventType.composerClosed, sourceScreen: 'composer');
    _captionCtrl.dispose();
    _placeCtrl.dispose();
    _areaCtrl.dispose();
    _menuCtrl.dispose();
    _spendCtrl.dispose();
    super.dispose();
  }

  bool get _hasContent =>
      _captionCtrl.text.trim().isNotEmpty ||
      _images.isNotEmpty ||
      _placeCtrl.text.trim().isNotEmpty ||
      _menuCtrl.text.trim().isNotEmpty ||
      _spendCtrl.text.trim().isNotEmpty;

  /// Metadata event tanpa teks mentah / lokasi tepat.
  Map<String, dynamic> _eventMeta() => {
        'postType': _postTypeWire(),
        'visibility': _effectiveVis().wire,
        'hasGroup': _inGroup,
        'hasImage': _images.isNotEmpty,
        'imageCount': _images.length,
        if (_isQuote) 'originalPostId': widget.quoteOfPostId,
        'hasPlace': _placeCtrl.text.trim().isNotEmpty,
        'hasSpend': _spendCtrl.text.trim().isNotEmpty,
        'hasRating': _rating > 0,
        'saveToHistory': _saveToHistory,
      };

  String _postTypeWire() {
    if (_isQuote) return 'quote_repost';
    return switch (_type) {
      ComposerType.checkin => 'checkin',
      ComposerType.status => 'status',
      _ => 'food_post',
    };
  }

  PostVisibility _effectiveVis() =>
      _inGroup ? PostVisibility.groupOnly : _vis;

  void _selectType(ComposerType t) {
    if (_type == t) return;
    setState(() {
      _type = t;
      _inlineError = null;
      // SP9.2B: check-in default Peribadi (followers_only dimatikan),
      // post/status default Awam.
      if (!_inGroup) {
        _vis = t == ComposerType.checkin
            ? PostVisibility.private
            : PostVisibility.public;
      }
    });
    _logger.logEvent(
      EventType.composerTypeSelected,
      sourceScreen: 'composer',
      metadata: {'postType': _postTypeWire()},
    );
  }

  /// SP8: tambah gambar (kamera 1, galeri berbilang) — had 6, boleh buang.
  Future<void> _pickImage(ImageSource source) async {
    final l = AppLocalizations.of(context);
    if (_images.length >= _maxImages) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.t('multiImageLimit'))));
      return;
    }
    try {
      final picker = ImagePicker();
      final picked = <XFile>[];
      if (source == ImageSource.gallery) {
        picked.addAll(await picker.pickMultiImage(
          maxWidth: 1280,
          imageQuality: 80,
          limit: _maxImages - _images.length,
        ));
      } else {
        final one = await picker.pickImage(
          source: source,
          maxWidth: 1280,
          imageQuality: 80,
        );
        if (one != null) picked.add(one);
      }
      if (picked.isEmpty || !mounted) return;
      final room = _maxImages - _images.length;
      if (picked.length > room) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('multiImageLimit'))));
      }
      setState(() {
        _images.addAll(picked.take(room).map((x) => File(x.path)));
      });
      _logger.logEvent(
        EventType.multiImageSelected,
        sourceScreen: 'composer',
        metadata: {
          'postType': _postTypeWire(),
          'imageCount': _images.length,
        },
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('😕 $e')));
      }
    }
  }

  void _removeImage(int index) {
    setState(() => _images.removeAt(index));
    _logger.logEvent(
      EventType.multiImageRemoved,
      sourceScreen: 'composer',
      metadata: {'imageCount': _images.length},
    );
  }

  /// Sahkan borang mengikut jenis; pulangkan mesej ralat atau null.
  String? _validate(AppLocalizations l) {
    final caption = _captionCtrl.text.trim();
    switch (_type) {
      case ComposerType.checkin:
        if (_placeCtrl.text.trim().isEmpty && caption.isEmpty) {
          return l.t('checkinNeedPlace');
        }
        if (_spendCtrl.text.trim().isNotEmpty &&
            parseSpendInput(_spendCtrl.text) == null) {
          return l.t('spendInvalid');
        }
        return null;
      case ComposerType.post:
        // Quote: kapsyen pilihan (quote tanpa kapsyen dibenarkan).
        if (_isQuote) return null;
        if (caption.isEmpty && _images.isEmpty) return l.t('composeHint');
        return null;
      case ComposerType.status:
        if (caption.isEmpty) return l.t('statusHint');
        return null;
      default:
        return null;
    }
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final err = _validate(l);
    if (err != null) {
      setState(() => _inlineError = err);
      return;
    }
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final isCheckin = _type == ComposerType.checkin;
    setState(() {
      _posting = true;
      _inlineError = null;
      _uploadDone = 0;
      _uploadTotal = 0;
    });
    try {
      // SP8: quote repost melalui repostFeedPost (privasi di pelayan).
      if (_isQuote) {
        await ref.read(socialServiceProvider).repostPost(
              originalPostId: widget.quoteOfPostId!,
              mode: 'quote',
              text: _captionCtrl.text.trim(),
              visibility: _effectiveVis().wire,
              groupId: widget.groupId,
            );
        _logger.logEvent(
          EventType.quoteRepostCreated,
          sourceScreen: 'composer',
          metadata: _eventMeta(),
        );
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(l.t('postSent'))));
        }
        return;
      }
      final postId = await ref.read(socialServiceProvider).createPost(
            uid: uid,
            text: _captionCtrl.text.trim(),
            images: _type == ComposerType.status
                ? const []
                : List.of(_images),
            onUploadProgress: (done, total) {
              if (mounted) {
                setState(() {
                  _uploadDone = done;
                  _uploadTotal = total;
                });
              }
            },
            groupId: widget.groupId,
            visibility: _effectiveVis().wire,
            postType: _postTypeWire(),
            placeName: isCheckin && _placeCtrl.text.trim().isNotEmpty
                ? _placeCtrl.text.trim()
                : null,
            areaLabel: isCheckin && _areaCtrl.text.trim().isNotEmpty
                ? _areaCtrl.text.trim()
                : null,
            menuName: isCheckin && _menuCtrl.text.trim().isNotEmpty
                ? _menuCtrl.text.trim()
                : null,
            totalSpend:
                isCheckin ? parseSpendInput(_spendCtrl.text) : null,
            userRating: isCheckin && _rating >= 1 ? _rating : null,
            moodTags: isCheckin ? _moodTags.toList() : null,
          );
      _logger.logEvent(
        isCheckin ? EventType.checkinCreated : EventType.postCreated,
        sourceScreen: 'composer',
        metadata: _eventMeta(),
      );
      if (isCheckin) {
        _logger.logEvent(
          EventType.checkinSharedToFeed,
          sourceScreen: 'composer',
          metadata: _eventMeta(),
        );
        // Meal history PERIBADI — hanya dengan persetujuan eksplisit.
        if (_saveToHistory && uid.isNotEmpty) {
          await _saveCheckinMeal(uid, postId);
        }
      }
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
                isCheckin ? l.t('checkinPosted') : l.t('postSent'))));
      }
    } catch (e) {
      _logger.logEvent(
        EventType.composerPostFailed,
        sourceScreen: 'composer',
        metadata: _eventMeta(),
      );
      if (mounted) {
        // Gagal semasa upload gambar vs gagal cipta post — mesej jujur.
        final uploadFailed =
            _images.isNotEmpty && _uploadDone < _images.length && !_isQuote;
        setState(() => _posting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(uploadFailed
                ? l.t('imageUploadFailed')
                : '📡 ${l.t('postFailed')}')));
      }
    }
  }

  /// Rekod meal PERIBADI dari check-in (users/{uid}/meals — rules
  /// owner-only). Gagal senyap: post feed sudah berjaya, jangan sekat UI.
  Future<void> _saveCheckinMeal(String uid, String? postId) async {
    try {
      final spend = parseSpendInput(_spendCtrl.text);
      final now = DateTime.now();
      await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('meals')
          .add({
        // Medan serasi model Meal sedia ada (History screen).
        'placeId': '',
        'placeNameSnapshot': _placeCtrl.text.trim(),
        'cuisineTags': <String>[],
        'emoji': '📍',
        'timeSlot': TimeSlotUtils.now(),
        'mealTime': now.toIso8601String(),
        'source': 'social_checkin',
        'priceLevel': 1,
        'priceEstimate': spend != null ? formatSpend(spend) : '',
        if (_rating >= 1) 'satisfactionRating': _rating,
        // Medan check-in tambahan (peribadi).
        'linkedPostId': postId,
        'menuName': _menuCtrl.text.trim(),
        'totalSpend': spend,
        'tags': _moodTags.toList(),
        'visibility': 'private',
        'createdAt': FieldValue.serverTimestamp(),
      }).timeout(const Duration(seconds: 10));
      _logger.logEvent(
        EventType.checkinSavedToHistory,
        sourceScreen: 'composer',
        metadata: _eventMeta(),
      );
    } catch (_) {
      // Post feed tetap berjaya — rekod meal boleh dicuba lain kali.
    }
  }

  Future<bool> _confirmDiscard() async {
    if (!_hasContent || _posting) return true;
    final l = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l.t('discardDraftTitle')),
        content: Text(l.t('discardDraftBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l.t('keepEditing')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(l.t('discardAction'),
                style: const TextStyle(color: AppColors.primaryRed)),
          ),
        ],
      ),
    );
    if (ok == true) {
      _logger.logEvent(
        EventType.composerCancelled,
        sourceScreen: 'composer',
        metadata: {'postType': _postTypeWire()},
      );
    }
    return ok ?? false;
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final showSubmit =
        _type != ComposerType.poll && _type != ComposerType.bill;

    return PopScope(
      canPop: !_hasContent || _posting,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final ok = await _confirmDiscard();
        if (ok && mounted) Navigator.pop(this.context);
      },
      child: Scaffold(
        backgroundColor: AppColors.threadsBg,
        appBar: AppBar(
          backgroundColor: AppColors.threadsBg,
          foregroundColor: AppColors.threadsText,
          surfaceTintColor: Colors.transparent,
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: _posting
                ? null
                : () async {
                    final ok = await _confirmDiscard();
                    if (ok && mounted) Navigator.pop(this.context);
                  },
          ),
          title: Text(
            l.t('composerTitle'),
            style: TextStyle(color: AppColors.threadsText),
          ),
          actions: [
            if (showSubmit)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Center(
                  child: ElevatedButton(
                    onPressed: _posting ? null : _submit,
                    // PENTING: tema global set minimumSize lebar infiniti
                    // (Size.fromHeight) — mesti di-override dalam
                    // AppBar/Row, jika tidak seluruh halaman gagal layout.
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
                                strokeWidth: 2, color: Colors.white),
                          )
                        : Text(_type == ComposerType.checkin
                            ? l.t('typeCheckin')
                            : l.t('postAction')),
                  ),
                ),
              ),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Mod quote: jenis dikunci — tiada chips.
              if (!_isQuote) ...[
                _typeChips(l),
                const SizedBox(height: 14),
              ],
              if (_inlineError != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primaryRed.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color:
                            AppColors.primaryRed.withValues(alpha: 0.5)),
                  ),
                  child: Text(
                    '⚠️ $_inlineError',
                    style: TextStyle(
                        color: AppColors.threadsText,
                        fontSize: 13,
                        fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              if (_isQuote)
                _quoteBody(l)
              else
                switch (_type) {
                  ComposerType.post => _postBody(l),
                  ComposerType.checkin => _checkinBody(l),
                  ComposerType.poll => _pollBody(l),
                  ComposerType.bill => _billBody(l),
                  ComposerType.status => _statusBody(l),
                },
            ],
          ),
        ),
      ),
    );
  }

  Widget _typeChips(AppLocalizations l) {
    final entries = [
      (ComposerType.post, '📝', l.t('typePost')),
      (ComposerType.checkin, '📍', l.t('typeCheckin')),
      (ComposerType.poll, '🗳️', l.t('typePoll')),
      (ComposerType.bill, '🧾', l.t('typeBill')),
      (ComposerType.status, '💬', l.t('typeStatus')),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (t, emoji, label) in entries) ...[
            InkWell(
              onTap: _posting ? null : () => _selectType(t),
              borderRadius: BorderRadius.circular(20),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: _type == t
                      ? AppColors.primaryRed
                      : AppColors.threadsSurface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: _type == t
                          ? AppColors.primaryRed
                          : AppColors.threadsBorder),
                ),
                child: Text(
                  '$emoji $label',
                  style: TextStyle(
                    color: _type == t
                        ? Colors.white
                        : AppColors.threadsText,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }

  InputDecoration _fieldDeco(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.threadsMuted),
        counterStyle: TextStyle(color: AppColors.threadsMuted),
        filled: true,
        fillColor: AppColors.threadsSurface,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.threadsBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.threadsBorder),
        ),
      );

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, top: 12),
        child: Text(text,
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontSize: 12.5,
                fontWeight: FontWeight.w800)),
      );

  Widget _captionField(AppLocalizations l, String hint,
      {int minLines = 3, int maxLines = 6}) {
    return TextField(
      controller: _captionCtrl,
      maxLines: maxLines,
      minLines: minLines,
      maxLength: 500,
      onChanged: (v) => setState(() {}),
      style: TextStyle(color: AppColors.threadsText),
      decoration: _fieldDeco(hint),
    );
  }

  Widget _imagePreviewAndButtons(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // SP8: thumbnail mendatar 1-6 gambar; setiap satu boleh dibuang.
        if (_images.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _images.length,
              separatorBuilder: (context, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(
                      _images[i],
                      height: 96,
                      width: 96,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: InkWell(
                      onTap: _posting ? null : () => _removeImage(i),
                      child: Tooltip(
                        message: l.t('removeImage'),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.close,
                              size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${_images.length}/$_maxImages ${l.t('imagesSelected')}',
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontSize: 12,
                fontWeight: FontWeight.w600),
          ),
        ],
        // Kemajuan upload semasa hantar (contoh: "Memuat naik gambar 2/3").
        if (_posting && _uploadTotal > 0 && _uploadDone < _uploadTotal) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const SizedBox(
                height: 14,
                width: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 10),
              Text(
                '${l.t('uploadingImages')} ${_uploadDone + 1}/$_uploadTotal',
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 12.5),
              ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed:
                    _posting ? null : () => _pickImage(ImageSource.camera),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                icon: const Icon(Icons.photo_camera_outlined, size: 20),
                label: Text(l.t('camera')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _posting
                    ? null
                    : () => _pickImage(ImageSource.gallery),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                icon: const Icon(Icons.photo_library_outlined, size: 20),
                label: Text(l.t('gallery')),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _visibilityRow() {
    if (_inGroup) {
      return Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.threadsBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.groups_outlined,
                size: 15, color: AppColors.primaryRed),
            const SizedBox(width: 6),
            Text(
              PostVisibility.groupOnly.label(AppLocalizations.of(context)),
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.threadsText),
            ),
          ],
        ),
      );
    }
    return VisibilityChip(
      value: _vis,
      onChanged: (v) {
        setState(() => _vis = v);
        _logger.logEvent(
          EventType.composerVisibilityChanged,
          sourceScreen: 'composer',
          metadata: {'postType': _postTypeWire(), 'visibility': v.wire},
        );
      },
    );
  }

  // ---------------- Badan setiap jenis ----------------

  /// SP8: badan mod quote — kapsyen + pratonton post asal + keterlihatan
  /// terkekang privasi asal. Tiada gambar dalam quote V1 (jujur & ringkas).
  Widget _quoteBody(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _captionField(l, l.t('addCaptionHint'), minLines: 2, maxLines: 5),
        _label(l.t('originalPostLabel')),
        EmbeddedOriginalCard(
          originalPostId: widget.quoteOfPostId!,
          snapshot: widget.quoteSource,
          interactive: false,
        ),
        const SizedBox(height: 14),
        if (_inGroup)
          _visibilityRow()
        else
          VisibilityChip(
            value: _vis,
            options: _quoteVisOptions(),
            onChanged: (v) {
              setState(() => _vis = v);
              _logger.logEvent(
                EventType.composerVisibilityChanged,
                sourceScreen: 'composer',
                metadata: {
                  'postType': _postTypeWire(),
                  'visibility': v.wire,
                },
              );
            },
          ),
      ],
    );
  }

  Widget _postBody(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _captionField(l, l.t('composeHint')),
        _imagePreviewAndButtons(l),
        const SizedBox(height: 14),
        _visibilityRow(),
      ],
    );
  }

  Widget _statusBody(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _captionField(l, l.t('statusHint'), minLines: 2, maxLines: 4),
        const SizedBox(height: 14),
        _visibilityRow(),
      ],
    );
  }

  Widget _checkinBody(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(l.t('checkinPlaceLabel')),
        TextField(
          controller: _placeCtrl,
          maxLength: 60,
          onChanged: (v) => setState(() {}),
          style: TextStyle(color: AppColors.threadsText),
          decoration: _fieldDeco(l.t('checkinPlaceHint')),
        ),
        _label(l.t('checkinAreaLabel')),
        TextField(
          controller: _areaCtrl,
          maxLength: 60,
          style: TextStyle(color: AppColors.threadsText),
          decoration: _fieldDeco(l.t('checkinAreaHint')),
        ),
        _label(l.t('checkinMenuLabel')),
        TextField(
          controller: _menuCtrl,
          maxLength: 80,
          onChanged: (v) => setState(() {}),
          style: TextStyle(color: AppColors.threadsText),
          decoration: _fieldDeco('Nasi lemak ayam goreng...'),
        ),
        _label(l.t('checkinSpendLabel')),
        TextField(
          controller: _spendCtrl,
          keyboardType:
              const TextInputType.numberWithOptions(decimal: true),
          onChanged: (v) => setState(() {}),
          style: TextStyle(color: AppColors.threadsText),
          decoration: _fieldDeco('12.50'),
        ),
        _label(l.t('checkinRatingLabel')),
        Row(
          children: [
            for (var i = 1; i <= 5; i++)
              InkWell(
                onTap: _posting
                    ? null
                    : () => setState(
                        () => _rating = _rating == i ? 0 : i),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 3, vertical: 4),
                  child: Icon(
                    i <= _rating ? Icons.star : Icons.star_border,
                    size: 30,
                    color: i <= _rating
                        ? AppColors.warmYellow
                        : AppColors.threadsMuted,
                  ),
                ),
              ),
          ],
        ),
        _label(l.t('checkinMoodLabel')),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final tag in checkinMoodPresets)
              InkWell(
                onTap: _posting
                    ? null
                    : () => setState(() {
                          if (!_moodTags.remove(tag)) {
                            _moodTags.add(tag);
                          }
                        }),
                borderRadius: BorderRadius.circular(18),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: _moodTags.contains(tag)
                        ? AppColors.warmYellow
                        : AppColors.threadsSurface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                        color: _moodTags.contains(tag)
                            ? AppColors.warmYellow
                            : AppColors.threadsBorder),
                  ),
                  child: Text(
                    tag,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: _moodTags.contains(tag)
                          ? AppColors.darkText
                          : AppColors.threadsText,
                    ),
                  ),
                ),
              ),
          ],
        ),
        _label(l.t('captionLabel')),
        _captionField(l, l.t('checkinCaptionHint'),
            minLines: 2, maxLines: 4),
        _imagePreviewAndButtons(l),
        const SizedBox(height: 14),
        _visibilityRow(),
        const SizedBox(height: 8),
        // Persetujuan eksplisit: rekod meal PERIBADI (bukan awam).
        SwitchListTile(
          value: _saveToHistory,
          onChanged: _posting
              ? null
              : (v) => setState(() => _saveToHistory = v),
          contentPadding: EdgeInsets.zero,
          activeTrackColor: AppColors.primaryRed,
          title: Text(l.t('saveToHistoryLabel'),
              style: TextStyle(
                  color: AppColors.threadsText,
                  fontSize: 14,
                  fontWeight: FontWeight.w700)),
          subtitle: Text(l.t('saveToHistoryNote'),
              style: TextStyle(
                  color: AppColors.threadsMuted, fontSize: 12)),
        ),
      ],
    );
  }

  Widget _pollBody(AppLocalizations l) {
    return _shortcutCard(
      emoji: '🗳️',
      text: _inGroup ? l.t('pollGroupShortcut') : l.t('pollPublicSoon'),
      buttonLabel: _inGroup ? l.t('pollGroupShortcut') : null,
      onTap: _inGroup
          ? () => showCreatePollSheet(context, widget.groupId!)
          : null,
    );
  }

  Widget _billBody(AppLocalizations l) {
    return _shortcutCard(
      emoji: '🧾',
      text: l.t('billGroupNote'),
      buttonLabel: l.t('billShortcut'),
      onTap: () => context.push(RoutePaths.tongTongCreate),
    );
  }

  /// Kad pintasan (Poll/Bill) — TIADA ciptaan palsu; hanya navigasi ke
  /// aliran sedia ada atau mesej "akan datang" yang jujur.
  Widget _shortcutCard({
    required String emoji,
    required String text,
    String? buttonLabel,
    VoidCallback? onTap,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 40)),
          const SizedBox(height: 10),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(
                color: AppColors.threadsText,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                height: 1.4),
          ),
          if (buttonLabel != null && onTap != null) ...[
            const SizedBox(height: 14),
            ElevatedButton(
              onPressed: _posting ? null : onTap,
              style: ElevatedButton.styleFrom(
                  minimumSize: const Size(200, 44)),
              child: Text(buttonLabel),
            ),
          ],
        ],
      ),
    );
  }
}
