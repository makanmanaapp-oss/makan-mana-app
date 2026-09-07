import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/utils/time_slot_utils.dart';
import '../../core/widgets/makan_avatar.dart';
import '../groups/group_polls.dart';
import 'checkin_utils.dart';
import 'checkin_place.dart';
import 'checkin_place_service.dart';
import 'food_profile.dart';
import 'poll_form.dart';
import 'repost.dart';
import 'social_providers.dart';
import 'visibility.dart';

/// Social Prompt 4: Unified Composer — satu pintu untuk Post, Check-in,
/// Poll (pintasan grup) dan Status. QA-DEV16: Bil/Tong-Tong dibuang dari
/// composer posting (sistem Tong-Tong kekal utuh di luar composer).
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
enum ComposerType { post, checkin, poll, status }

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

  // QA-DEV17: editor poll INLINE untuk feed poll (non-grup). Poll ialah post
  // feed biasa (postType:"poll"); grup kekal guna showCreatePollSheet. Had
  // dikongsi dengan pelayan melalui poll_form.dart (kPollOption*).
  final _pollQuestionCtrl = TextEditingController();
  final List<TextEditingController> _pollOptionCtrls = [
    TextEditingController(),
    TextEditingController(),
  ];

  bool get _isQuote => widget.quoteOfPostId != null;

  /// Poll feed dalam composer HANYA untuk non-grup (grup guna aliran sedia
  /// ada). true bila jenis=poll dan bukan dalam grup.
  bool get _isFeedPoll => _type == ComposerType.poll && !_inGroup;

  /// Soalan 2-120 aksara + sekurang-kurangnya 2 pilihan berbeza (bukan kosong).
  /// Pelayan tetap authoritative; ini untuk dayakan/matikan butang Post.
  bool get _pollValid => isFeedPollFormValid(
      _pollQuestionCtrl.text, _pollOptionCtrls.map((c) => c.text).toList());

  List<String> get _pollOptionsTrimmed =>
      cleanPollOptions(_pollOptionCtrls.map((c) => c.text).toList());

  // Medan check-in.
  final _placeCtrl = TextEditingController();
  final _areaCtrl = TextEditingController();
  final _menuCtrl = TextEditingController();
  final _spendCtrl = TextEditingController();
  int _rating = 0; // 0 = tiada rating
  final Set<String> _moodTags = {};
  bool _saveToHistory = false;
  String? _inlineError;
  Timer? _placeDebounce;
  int _placeRequestToken = 0;
  bool _placeSearching = false;
  List<CheckinPlace> _placeResults = const [];
  CheckinPlace? _selectedPlace;

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
    _placeDebounce?.cancel();
    _areaCtrl.dispose();
    _menuCtrl.dispose();
    _spendCtrl.dispose();
    _pollQuestionCtrl.dispose();
    for (final c in _pollOptionCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _hasContent =>
      _captionCtrl.text.trim().isNotEmpty ||
      _images.isNotEmpty ||
      _placeCtrl.text.trim().isNotEmpty ||
      _menuCtrl.text.trim().isNotEmpty ||
      _spendCtrl.text.trim().isNotEmpty ||
      _pollQuestionCtrl.text.trim().isNotEmpty ||
      _pollOptionCtrls.any((c) => c.text.trim().isNotEmpty);

  /// Metadata event tanpa teks mentah / lokasi tepat.
  Map<String, dynamic> _eventMeta() => {
        'postType': _postTypeWire(),
        'visibility': _effectiveVis().wire,
        'hasGroup': _inGroup,
        'hasImage': _images.isNotEmpty,
        'imageCount': _images.length,
        if (_isQuote) 'originalPostId': widget.quoteOfPostId,
        'hasPlace': _placeCtrl.text.trim().isNotEmpty,
        if (_selectedPlace != null) 'placeSource': _selectedPlace!.source,
        'hasSpend': _spendCtrl.text.trim().isNotEmpty,
        'hasRating': _rating > 0,
        'saveToHistory': _saveToHistory,
      };

  String _postTypeWire() {
    if (_isQuote) return 'quote_repost';
    return switch (_type) {
      ComposerType.checkin => 'checkin',
      ComposerType.status => 'status',
      ComposerType.poll => 'poll',
      _ => 'food_post',
    };
  }

  PostVisibility _effectiveVis() => _inGroup ? PostVisibility.groupOnly : _vis;

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
      case ComposerType.poll:
        // Grup: dikendali oleh shortcut (tiada butang Post); feed poll perlu
        // soalan + >=2 pilihan sah.
        if (!_isFeedPoll) return null;
        return _pollValid ? null : l.t('pollNeedQuestionOptions');
    }
  }

  void _onPlaceChanged(String value) {
    if (_selectedPlace != null && value.trim() != _selectedPlace!.name) {
      _selectedPlace = null;
    }
    _placeDebounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        _placeResults = const [];
        _placeSearching = false;
      });
      return;
    }
    final token = ++_placeRequestToken;
    setState(() => _placeSearching = true);
    _placeDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final places = await CheckinPlaceService().search(
          query,
          languageCode: ref.read(languageProvider).languageCode,
        );
        if (!mounted || token != _placeRequestToken) return;
        setState(() {
          _placeResults = places;
          _placeSearching = false;
        });
      } catch (_) {
        if (!mounted || token != _placeRequestToken) return;
        setState(() => _placeSearching = false);
      }
    });
  }

  void _selectPlace(CheckinPlace place) {
    _placeDebounce?.cancel();
    _placeRequestToken++;
    setState(() {
      _selectedPlace = place;
      _placeCtrl.text = place.name;
      _areaCtrl.text = place.areaLabel;
      _placeResults = const [];
      _placeSearching = false;
    });
  }

  void _useManualPlace() {
    final name = _placeCtrl.text.trim();
    if (name.isEmpty) return;
    _selectPlace(CheckinPlace.manual(name, areaLabel: _areaCtrl.text));
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final err = _validate(l);
    if (err != null) {
      setState(() => _inlineError = err);
      return;
    }
    // QA-DEV17: feed poll → callable createFeedPoll (server-authoritative).
    if (_isFeedPoll) {
      setState(() {
        _posting = true;
        _inlineError = null;
      });
      try {
        await ref.read(socialServiceProvider).createFeedPoll(
              question: _pollQuestionCtrl.text.trim(),
              options: _pollOptionsTrimmed,
              visibility: _effectiveVis().wire,
            );
        _logger.logEvent(
          EventType.postCreated,
          sourceScreen: 'composer',
          metadata: _eventMeta(),
        );
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(l.t('postSent'))));
        }
      } catch (_) {
        _logger.logEvent(
          EventType.composerPostFailed,
          sourceScreen: 'composer',
          metadata: _eventMeta(),
        );
        if (mounted) {
          setState(() => _posting = false);
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('📡 ${l.t('postFailed')}')));
        }
      }
      return;
    }
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final isCheckin = _type == ComposerType.checkin;
    final checkinPlace = isCheckin
        ? (_selectedPlace ??
            (_placeCtrl.text.trim().isEmpty
                ? null
                : CheckinPlace.manual(_placeCtrl.text,
                    areaLabel: _areaCtrl.text)))
        : null;
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
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(l.t('postSent'))));
        }
        return;
      }
      final postId = await ref.read(socialServiceProvider).createPost(
            uid: uid,
            text: _captionCtrl.text.trim(),
            images: _type == ComposerType.status ? const [] : List.of(_images),
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
            placeId: checkinPlace?.placeId,
            placeName: checkinPlace?.name,
            areaLabel: checkinPlace?.areaLabel.isNotEmpty == true
                ? checkinPlace!.areaLabel
                : null,
            checkinPlace: checkinPlace?.toWire(),
            menuName: isCheckin && _menuCtrl.text.trim().isNotEmpty
                ? _menuCtrl.text.trim()
                : null,
            totalSpend: isCheckin ? parseSpendInput(_spendCtrl.text) : null,
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
            content: Text(isCheckin ? l.t('checkinPosted') : l.t('postSent'))));
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
        'placeId': _selectedPlace?.placeId ?? '',
        'placeNameSnapshot': _selectedPlace?.name ?? _placeCtrl.text.trim(),
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
    // Feed poll (non-grup) hantar melalui butang Post; poll grup guna shortcut.
    final showSubmit = _type != ComposerType.poll || _isFeedPoll;
    // Post DIMATIKAN bila kandungan tidak sah/kosong; DIHIDUPKAN bila sah.
    final canPost = showSubmit && !_posting && _validate(l) == null;

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
          elevation: 0,
          scrolledUnderElevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: l.t('discardAction'),
            onPressed: _posting
                ? null
                : () async {
                    final ok = await _confirmDiscard();
                    if (ok && mounted) Navigator.pop(this.context);
                  },
          ),
          title: Text(
            l.t('composerTitle'),
            style: TextStyle(
                color: AppColors.threadsText, fontWeight: FontWeight.w800),
          ),
          actions: [
            if (showSubmit)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Center(child: _postButton(l, canPost)),
              ),
          ],
        ),
        body: SafeArea(
          bottom: true,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Baris identiti pengguna SEMASA (avatar + nama) — komposer
                // terasa seperti feed sosial, bukan borang berkotak.
                _identityRow(l),
                if (_inlineError != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.primaryRed.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: AppColors.primaryRed.withValues(alpha: 0.5)),
                    ),
                    child: Text(
                      '⚠️ $_inlineError',
                      style: TextStyle(
                          color: AppColors.threadsText,
                          fontSize: 13,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
                const SizedBox(height: 4),
                if (_isQuote)
                  _quoteBody(l)
                else ...[
                  switch (_type) {
                    ComposerType.post => _postBody(l),
                    ComposerType.checkin => _checkinBody(l),
                    ComposerType.poll => _pollBody(l),
                    ComposerType.status => _statusBody(l),
                  },
                  // Toolbar ikon INLINE terus di bawah ruang teks (rujukan
                  // Threads) — sentiasa kelihatan atas keyboard; elak
                  // pertindihan dengan overlay avatar global di sudut bawah.
                  const SizedBox(height: 6),
                  _iconToolbar(l),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _postButton(AppLocalizations l, bool canPost) {
    // PENTING: tema global set minimumSize lebar infiniti (Size.fromHeight)
    // — mesti di-override dalam AppBar, jika tidak seluruh halaman gagal
    // layout. Post = satu-satunya CTA butang dominan (merah MakanMana).
    return ElevatedButton(
      onPressed: canPost ? _submit : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primaryRed,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.primaryRed.withValues(alpha: 0.38),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.85),
        elevation: 0,
        minimumSize: const Size(72, 38),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
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
    );
  }

  /// Baris identiti: avatar + nama pengguna SEMASA (live), pemilih privasi
  /// ringan di kanan. Sumber identiti reaktif → tukar akaun menyegar sendiri.
  Widget _identityRow(AppLocalizations l) {
    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final profile =
        uid.isEmpty ? null : ref.watch(publicProfileProvider(uid)).valueOrNull;
    final hasProfile = profile != null && profile.exists;
    final name = hasProfile
        ? profile.displayName
        : (ref.watch(myDisplayNameProvider).valueOrNull ?? 'Foodie');
    final username = profile?.username;
    final showVis =
        !_isQuote && (_type != ComposerType.poll || _isFeedPoll);
    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 6),
      child: Row(
        children: [
          MakanAvatar(
            radius: 21,
            photoUrl: profile?.photoUrl,
            presetId: profile?.avatarPreset,
            displayName: name,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontSize: 15,
                      fontWeight: FontWeight.w800),
                ),
                if (username != null && username.isNotEmpty)
                  Text(
                    '@$username',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsMuted, fontSize: 12.5),
                  ),
              ],
            ),
          ),
          if (showVis) ...[
            const SizedBox(width: 8),
            _visibilityRow(),
          ],
        ],
      ),
    );
  }

  /// Toolbar ikon ringkas (tanpa kotak besar): Galeri, Kamera, Check-in,
  /// Undian, Lagi. Ikon aktif = merah MakanMana; media dimatikan bila jenis
  /// semasa tidak menyokong gambar. Kiraan aksara ringan di hujung kanan.
  Widget _iconToolbar(AppLocalizations l) {
    final canImage = !_posting &&
        (_type == ComposerType.post || _type == ComposerType.checkin);
    final len = _captionCtrl.text.characters.length;
    final showCount = (_type == ComposerType.post ||
            _type == ComposerType.status ||
            _type == ComposerType.checkin) &&
        len >= 400;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Divider(height: 1, thickness: 0.6, color: AppColors.threadsBorder),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              _toolIcon(
                icon: Icons.image_outlined,
                tooltip: l.t('gallery'),
                enabled: canImage,
                onTap: () => _pickImage(ImageSource.gallery),
              ),
              _toolIcon(
                icon: Icons.photo_camera_outlined,
                tooltip: l.t('camera'),
                enabled: canImage,
                onTap: () => _pickImage(ImageSource.camera),
              ),
              _toolIcon(
                icon: Icons.location_on_outlined,
                tooltip: l.t('typeCheckin'),
                active: _type == ComposerType.checkin,
                enabled: !_posting,
                onTap: () => _selectType(_type == ComposerType.checkin
                    ? ComposerType.post
                    : ComposerType.checkin),
              ),
              _toolIcon(
                icon: Icons.how_to_vote_outlined,
                tooltip: l.t('typePoll'),
                active: _type == ComposerType.poll,
                enabled: !_posting,
                onTap: () => _selectType(_type == ComposerType.poll
                    ? ComposerType.post
                    : ComposerType.poll),
              ),
              _toolIcon(
                icon: Icons.more_horiz,
                tooltip: l.t('seeMore'),
                active: _type == ComposerType.status,
                enabled: !_posting,
                onTap: _showMoreSheet,
              ),
              const Spacer(),
              if (showCount)
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: Text(
                    '$len/500',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: len >= 500
                            ? AppColors.primaryRed
                            : AppColors.threadsMuted),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _toolIcon({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
    bool active = false,
    bool enabled = true,
  }) {
    final color = !enabled
        ? AppColors.threadsMuted.withValues(alpha: 0.4)
        : active
            ? AppColors.primaryRed
            : AppColors.threadsMuted;
    // Tap target 44×44 (akses) walaupun ikon nampak minimal.
    return IconButton(
      onPressed: enabled ? onTap : null,
      tooltip: tooltip,
      iconSize: 22,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
      icon: Icon(icon, color: color),
    );
  }

  /// "Lagi": jenis komposer sekunder (Post/Status/Bil) — kekalkan fungsi
  /// sedia ada tanpa segmented chips besar.
  void _showMoreSheet() {
    final l = AppLocalizations.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.threadsSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (t, icon, label) in <(ComposerType, IconData, String)>[
              (ComposerType.post, Icons.edit_outlined, l.t('typePost')),
              (
                ComposerType.status,
                Icons.chat_bubble_outline,
                l.t('typeStatus')
              ),
            ])
              ListTile(
                leading: Icon(icon,
                    color: _type == t
                        ? AppColors.primaryRed
                        : AppColors.threadsText),
                title: Text(label,
                    style: TextStyle(
                        color: AppColors.threadsText,
                        fontWeight: FontWeight.w700)),
                trailing: _type == t
                    ? const Icon(Icons.check_circle,
                        color: AppColors.primaryRed)
                    : null,
                onTap: () {
                  Navigator.pop(ctx);
                  _selectType(t);
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
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
      {int minLines = 3, int maxLines = 8, bool autofocus = false}) {
    // Komposer teks TANPA border (gaya sosial terbuka). Kiraan 0/500 lalai
    // disembunyikan (counterText '') — kiraan ringan dipapar di toolbar bila
    // menghampiri had. Had 500 aksara kekal DIKUATKUASAKAN oleh maxLength.
    return TextField(
      controller: _captionCtrl,
      maxLines: maxLines,
      minLines: minLines,
      maxLength: 500,
      autofocus: autofocus,
      textCapitalization: TextCapitalization.sentences,
      cursorColor: AppColors.primaryRed,
      onChanged: (v) => setState(() {}),
      style: TextStyle(
          color: AppColors.threadsText, fontSize: 17, height: 1.35),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.threadsMuted, fontSize: 17),
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(vertical: 4),
        counterText: '',
      ),
    );
  }

  /// Pratonton media INLINE sahaja (thumbnail 1-6, boleh buang). Butang
  /// Kamera/Galeri besar DIBUANG — tindakan media kini di toolbar ikon.
  Widget _imagePreview(AppLocalizations l) {
    final uploading =
        _posting && _uploadTotal > 0 && _uploadDone < _uploadTotal;
    if (_images.isEmpty && !uploading) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // SP8: thumbnail mendatar 1-6 gambar; setiap satu boleh dibuang.
        if (_images.isNotEmpty) ...[
          const SizedBox(height: 14),
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
        if (uploading) ...[
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
                style: TextStyle(color: AppColors.threadsMuted, fontSize: 12.5),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _visibilityRow() {
    if (_inGroup) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
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
          // WAVE 3C: pratonton pun membaca asal LIVE (tiada kandungan basi).
          originalPostId: widget.quoteOfPostId!,
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
        // Privasi kini di baris identiti; media di toolbar ikon.
        _captionField(l, l.t('composeHint'), autofocus: true),
        _imagePreview(l),
      ],
    );
  }

  Widget _statusBody(AppLocalizations l) {
    return _captionField(l, l.t('statusHint'),
        minLines: 2, maxLines: 6, autofocus: true);
  }

  Widget _checkinBody(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(l.t('checkinPlaceLabel')),
        TextField(
          controller: _placeCtrl,
          maxLength: 60,
          onChanged: _onPlaceChanged,
          style: TextStyle(color: AppColors.threadsText),
          decoration: _fieldDeco(l.t('checkinPlaceHint')).copyWith(
            suffixIcon: _placeSearching
                ? const Padding(
                    padding: EdgeInsets.all(14),
                    child: SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : const Icon(Icons.search_outlined),
          ),
        ),
        if (_selectedPlace != null) _selectedPlaceCard(l),
        if (_placeResults.isNotEmpty) _placeResultsList(l),
        if (_placeCtrl.text.trim().length >= 2 &&
            _selectedPlace == null &&
            !_placeSearching)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _posting ? null : _useManualPlace,
              icon: const Icon(Icons.edit_location_alt_outlined, size: 18),
              label: Text(l.t('checkinUseManual')),
            ),
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
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
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
                    : () => setState(() => _rating = _rating == i ? 0 : i),
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
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
        _captionField(l, l.t('checkinCaptionHint'), minLines: 2, maxLines: 4),
        _imagePreview(l),
        const SizedBox(height: 8),
        // Persetujuan eksplisit: rekod meal PERIBADI (bukan awam).
        SwitchListTile(
          value: _saveToHistory,
          onChanged:
              _posting ? null : (v) => setState(() => _saveToHistory = v),
          contentPadding: EdgeInsets.zero,
          activeTrackColor: AppColors.primaryRed,
          title: Text(l.t('saveToHistoryLabel'),
              style: TextStyle(
                  color: AppColors.threadsText,
                  fontSize: 14,
                  fontWeight: FontWeight.w700)),
          subtitle: Text(l.t('saveToHistoryNote'),
              style: TextStyle(color: AppColors.threadsMuted, fontSize: 12)),
        ),
      ],
    );
  }

  Widget _selectedPlaceCard(AppLocalizations l) {
    final place = _selectedPlace!;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Row(children: [
        Icon(
            place.verified
                ? Icons.verified_outlined
                : Icons.edit_location_alt_outlined,
            size: 18,
            color:
                place.verified ? AppColors.warmYellow : AppColors.threadsMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            place.verified
                ? l.t('checkinPlaceVerified')
                : l.t('checkinPlaceManual'),
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700),
          ),
        ),
        IconButton(
          tooltip: l.t('checkinRemovePlace'),
          onPressed:
              _posting ? null : () => setState(() => _selectedPlace = null),
          icon: const Icon(Icons.close, size: 18),
        ),
      ]),
    );
  }

  Widget _placeResultsList(AppLocalizations l) => Container(
        margin: const EdgeInsets.only(top: 4),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.threadsBorder),
        ),
        child: Column(
          children: [
            for (final place in _placeResults.take(6))
              ListTile(
                dense: true,
                leading: Icon(place.source == 'makanmana_shared'
                    ? Icons.storefront_outlined
                    : Icons.location_on_outlined),
                title: Text(place.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsText,
                        fontWeight: FontWeight.w700)),
                subtitle: Text(
                  place.areaLabel.isNotEmpty ? place.areaLabel : place.address,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.threadsMuted),
                ),
                trailing: place.source == 'makanmana_shared'
                    ? Icon(Icons.verified_outlined,
                        color: AppColors.warmYellow, size: 18)
                    : null,
                onTap: _posting ? null : () => _selectPlace(place),
              ),
          ],
        ),
      );

  Widget _pollBody(AppLocalizations l) {
    // Grup: kekal shortcut ke aliran poll grup sedia ada (Group Poll freeze).
    if (_inGroup) {
      return _shortcutCard(
        emoji: '🗳️',
        text: l.t('pollGroupShortcut'),
        buttonLabel: l.t('pollGroupShortcut'),
        onTap: () => showCreatePollSheet(context, widget.groupId!),
      );
    }
    // QA-DEV17: editor poll feed INLINE (Status/awam). "Poll awam akan datang"
    // DIBUANG — poll kini post feed sebenar melalui createFeedPoll.
    return _feedPollEditor(l);
  }

  Widget _feedPollEditor(AppLocalizations l) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _pollField(
          controller: _pollQuestionCtrl,
          hint: l.t('pollQuestionHint'),
          maxLength: 120,
          autofocus: true,
        ),
        const SizedBox(height: 10),
        Text(l.t('pollOptions'),
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontSize: 12.5,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        for (var i = 0; i < _pollOptionCtrls.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: _pollField(
                    controller: _pollOptionCtrls[i],
                    hint: '${l.t('pollOption')} ${i + 1}',
                    maxLength: 60,
                  ),
                ),
                if (_pollOptionCtrls.length > kPollOptionMin)
                  IconButton(
                    onPressed: _posting ? null : () => _removePollOption(i),
                    tooltip: l.t('discardAction'),
                    icon: Icon(Icons.close,
                        size: 18, color: AppColors.threadsMuted),
                  ),
              ],
            ),
          ),
        if (_pollOptionCtrls.length < kPollOptionMax)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _posting ? null : _addPollOption,
              icon: const Icon(Icons.add, size: 18),
              label: Text(l.t('addOption')),
            ),
          ),
      ],
    );
  }

  void _addPollOption() {
    if (_pollOptionCtrls.length >= kPollOptionMax) return;
    setState(() => _pollOptionCtrls.add(TextEditingController()));
  }

  void _removePollOption(int i) {
    if (_pollOptionCtrls.length <= kPollOptionMin) return;
    setState(() {
      final ctrl = _pollOptionCtrls.removeAt(i);
      ctrl.dispose();
    });
  }

  Widget _pollField({
    required TextEditingController controller,
    required String hint,
    required int maxLength,
    bool autofocus = false,
  }) {
    return TextField(
      controller: controller,
      maxLength: maxLength,
      autofocus: autofocus,
      onChanged: (_) => setState(() {}),
      textCapitalization: TextCapitalization.sentences,
      cursorColor: AppColors.primaryRed,
      style: TextStyle(color: AppColors.threadsText),
      decoration: InputDecoration(
        counterText: '',
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.threadsMuted),
        filled: true,
        fillColor: AppColors.threadsSurface,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.threadsBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.threadsBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primaryRed, width: 1.2),
        ),
      ),
    );
  }

  /// Kad pintasan (Poll) — TIADA ciptaan palsu; hanya navigasi ke aliran
  /// sedia ada atau mesej "akan datang" yang jujur.
  /// QA-DEV16: Bil/Tong-Tong DIBUANG dari composer posting (owner req). Sistem
  /// Tong-Tong (route/skrin/servis/data) kekal utuh di tempat lain.
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
              style: ElevatedButton.styleFrom(minimumSize: const Size(200, 44)),
              child: Text(buttonLabel),
            ),
          ],
        ],
      ),
    );
  }
}
