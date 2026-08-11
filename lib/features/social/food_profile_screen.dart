import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import 'food_profile.dart';
import 'comment_sheet.dart';
import 'post_card.dart';
import 'post_media.dart';
import 'public_profile_auto.dart';
import 'saved_posts.dart';
import 'social_providers.dart';
import 'social_time.dart';

/// ISSUE 005: Profil makanan awam gaya Threads.
///
/// Hierarki: app bar padat -> header identiti (nama kiri, avatar kanan) ->
/// ringkasan pengikut -> baris aksi -> identiti makanan padat -> 4 tab
/// utama (Posts / Balasan / Media / Repost) -> timeline rata.
/// Tema sosial kekal hitam walaupun aplikasi umum dalam Bright Mode.
class FoodProfileScreen extends ConsumerStatefulWidget {
  const FoodProfileScreen({super.key, required this.uid});

  final String uid;

  @override
  ConsumerState<FoodProfileScreen> createState() => _FoodProfileScreenState();
}

class _FoodProfileScreenState extends ConsumerState<FoodProfileScreen> {
  int _tab = 0; // 0 Posts, 1 Balasan, 2 Media, 3 Repost
  bool _checkinFilter = false; // penapis sekunder dalam tab Posts

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final myUid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      final isMe = widget.uid == myUid;
      ref.read(eventLoggerProvider).logEvent(
        EventType.publicProfileViewed,
        sourceScreen: 'public_profile',
        metadata: {'viewedUserId': widget.uid, 'isOwnProfile': isMe},
      );
      if (isMe) autoSyncMyPublicProfile(ref);
    });
  }

  Future<void> _refresh() async {
    ref.invalidate(publicProfileProvider(widget.uid));
    ref.invalidate(userPublicPostsProvider(widget.uid));
    if (_isMe) ref.invalidate(myCommentsProvider);
    ref.invalidate(userPublicRepliesProvider(widget.uid));
    await Future<void>.delayed(const Duration(milliseconds: 350));
  }

  bool get _isMe =>
      widget.uid == (ref.read(authRepositoryProvider).currentUser?.uid ?? '');

  Future<void> _shareProfile(FoodProfile p) async {
    final l = AppLocalizations.of(context);
    ref.read(eventLoggerProvider).logEvent(
      EventType.postShared,
      sourceScreen: 'public_profile',
      metadata: {'viewedUserId': widget.uid, 'kind': 'profile_share'},
    );
    final handle =
        (p.username?.isNotEmpty ?? false) ? ' (@${p.username})' : '';
    // Tiada deep link dikonfigurasi lagi - teks jenama selamat sahaja
    // (tiada e-mel/telefon/UID/keutamaan peribadi).
    final text = '${p.displayName}$handle — ${l.t('shareProfileText')}';
    try {
      await SharePlus.instance.share(ShareParams(text: text));
    } catch (_) {}
  }

  /// Pemapar avatar skrin penuh: hitam, zoom/pan, tutup. Tiada aksi edit
  /// untuk profil orang lain.
  void _openAvatarViewer(FoodProfile p) {
    final l = AppLocalizations.of(context);
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: l.t('avatarLabel'),
      barrierColor: Colors.black,
      pageBuilder: (ctx, _, __) => Semantics(
        label: '${l.t('avatarLabel')}: ${p.displayName}',
        child: Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            children: [
              Positioned.fill(
                child: (p.photoUrl?.isNotEmpty ?? false)
                    ? InteractiveViewer(
                        maxScale: 4,
                        child: Center(
                          child: Image.network(
                            p.photoUrl!,
                            fit: BoxFit.contain,
                            loadingBuilder: (c, w, prog) => prog == null
                                ? w
                                : const Center(
                                    child: CircularProgressIndicator()),
                            errorBuilder: (c, e, st) => MakanAvatar(
                              radius: 96,
                              presetId: p.avatarPreset,
                              displayName: p.displayName,
                            ),
                          ),
                        ),
                      )
                    : Center(
                        child: MakanAvatar(
                          radius: 96,
                          presetId: p.avatarPreset,
                          displayName: p.displayName,
                        ),
                      ),
              ),
              Positioned(
                top: MediaQuery.of(ctx).padding.top + 8,
                right: 12,
                child: IconButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  icon: Icon(Icons.close,
                      color: AppColors.threadsText, size: 26),
                  tooltip: l.t('cancelAction'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final isMe = widget.uid == myUid;

    if (widget.uid.isEmpty) {
      return _scaffoldMessage(l, l.t('userNotFound'));
    }

    final profileAsync = ref.watch(publicProfileProvider(widget.uid));
    final blocked = !isMe &&
        (ref.watch(myBlockedIdsProvider).value ?? const {})
            .contains(widget.uid);

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: profileAsync.valueOrNull?.username?.isNotEmpty == true
            ? Text('@${profileAsync.valueOrNull!.username}',
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 16,
                    fontWeight: FontWeight.w700))
            : null,
        actions: [
          if (isMe)
            IconButton(
              tooltip: l.t('shareProfileAction'),
              icon: const Icon(Icons.ios_share_outlined, size: 21),
              onPressed: () {
                final p = profileAsync.valueOrNull;
                if (p != null) _shareProfile(p);
              },
            ),
          if (!isMe)
            IconButton(
              tooltip: l.t('report'),
              icon: const Icon(Icons.more_horiz),
              onPressed: () => _moreMenu(context, widget.uid),
            ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _errorRetry(l),
        data: (p) {
          // Profil hilang/dipadam (bukan milik sendiri) - keadaan jujur.
          if (!p.exists && !isMe) {
            return _scaffoldBody(l, l.t('userNotFound'));
          }
          if (blocked) {
            return _blockedBody(l);
          }
          return RefreshIndicator(
            color: AppColors.primaryRed,
            backgroundColor: AppColors.threadsSurface,
            onRefresh: _refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _header(l, p, isMe)),
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _TabBarDelegate(
                    selected: _tab,
                    labels: [
                      l.t('tabPosts'),
                      l.t('tabReplies'),
                      l.t('tabMedia'),
                      l.t('tabReposts'),
                    ],
                    onTap: (i) => setState(() => _tab = i),
                  ),
                ),
                ..._tabSlivers(l, isMe),
                const SliverToBoxAdapter(child: SizedBox(height: 120)),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---------------- Header ----------------

  Widget _header(AppLocalizations l, FoodProfile p, bool isMe) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 24,
                          height: 1.15,
                          fontWeight: FontWeight.w800,
                          color: AppColors.threadsText),
                    ),
                    if (p.username?.isNotEmpty ?? false)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text('@${p.username}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: AppColors.threadsMuted,
                                fontSize: 15)),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Semantics(
                label: '${l.t('avatarLabel')}: ${p.displayName}',
                button: true,
                child: GestureDetector(
                  onTap: () => _openAvatarViewer(p),
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: AppColors.threadsBorder, width: 1),
                    ),
                    child: MakanAvatar(
                      radius: 38,
                      photoUrl: p.photoUrl,
                      presetId: p.avatarPreset,
                      displayName: p.displayName,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (p.bio.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              p.bio,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: AppColors.threadsText, fontSize: 15, height: 1.4),
            ),
          ],
          const SizedBox(height: 10),
          // Ringkasan statistik padat (data sebenar; tiada nilai negatif).
          // Wrap: pada 360dp label panjang BALUT ke baris kedua dan tidak
          // dielipsis (QA closeout - kebolehbacaan statistik).
          Wrap(
            spacing: 10,
            runSpacing: 2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _statText(l, p.postsCount, l.t('statPosts'), null),
              _statText(l, p.followersCount, l.t('statFollowers'),
                  () => context.push('/u/${widget.uid}/followers')),
              _statText(l, p.followingCount, l.t('statFollowing'),
                  () => context.push('/u/${widget.uid}/following')),
              _statText(l, p.reviewsCount, l.t('statReviews'), null),
            ],
          ),
          const SizedBox(height: 14),
          _actionRow(l, p, isMe),
          const SizedBox(height: 14),
          _foodIdentity(l, p),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _statText(
      AppLocalizations l, int n, String label, VoidCallback? onTap) {
    final safe = n < 0 ? 0 : n;
    final child = Text('$safe $label',
        style: TextStyle(
            color: AppColors.threadsMuted,
            fontSize: 13,
            fontWeight: FontWeight.w600));
    return onTap == null
        ? child
        : InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(6),
            child: child);
  }

  Widget _actionRow(AppLocalizations l, FoodProfile p, bool isMe) {
    if (isMe) {
      return Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () {
                ref.read(eventLoggerProvider).logEvent(
                  EventType.publicProfileEditOpened,
                  sourceScreen: 'public_profile',
                  metadata: const {'isOwnProfile': true},
                );
                context.push('/edit-food-profile');
              },
              style: _outlineStyle,
              child: Text(l.t('editFoodProfile'),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton(
              onPressed: () => _shareProfile(p),
              style: _outlineStyle,
              child: Text(l.t('shareProfileAction'),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
        ],
      );
    }
    return Row(
      children: [
        Expanded(child: FollowButton(uid: widget.uid, isMe: isMe)),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton(
            onPressed: () {
              final blocked =
                  ref.read(myBlockedIdsProvider).value ?? const <String>{};
              if (blocked.contains(widget.uid)) {
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l.t('dmCannotMessage'))));
                return;
              }
              ref.read(eventLoggerProvider).logEvent(
                EventType.dmStartedFromProfile,
                sourceScreen: 'public_profile',
                metadata: {'otherUserId': widget.uid},
              );
              context.push('/dm/chat/${widget.uid}');
            },
            style: _outlineStyle,
            child: Text('DM', maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
      ],
    );
  }

  ButtonStyle get _outlineStyle => OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        foregroundColor: AppColors.threadsText,
        side: BorderSide(color: AppColors.threadsBorder),
        textStyle:
            const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
      );

  /// Identiti makanan padat: teks + ikon MakanMana (tiada emoji sistem,
  /// tiada sepanduk merah). Medan awam sahaja - alahan/kesihatan/lokasi
  /// tepat TIDAK pernah dipaparkan.
  Widget _foodIdentity(AppLocalizations l, FoodProfile p) {
    final budget = validBudgetText(p.budgetRange);
    final rows = <(IconData, String)>[
      if (p.favouriteCuisine.isNotEmpty)
        (Icons.restaurant_menu, p.favouriteCuisine),
      if (p.favouriteFood.isNotEmpty) (Icons.favorite_outline, p.favouriteFood),
      if (p.foodMood.isNotEmpty) (Icons.whatshot_outlined, p.foodMood),
      if (p.showBudget && budget != null)
        (Icons.account_balance_wallet_outlined,
            '${l.t('budgetLabelShort')} $budget'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (rows.isNotEmpty)
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final (icon, text) in rows)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 15, color: AppColors.warmYellow),
                    const SizedBox(width: 5),
                    Text(text,
                        style: TextStyle(
                            color: AppColors.threadsText,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
            ],
          )
        else
          Text(l.t('foodTagsEmpty'),
              style: TextStyle(
                  color: AppColors.threadsMuted, fontSize: 12.5)),
        const SizedBox(height: 8),
        Row(
          children: [
            _smallAction(
              l.t('tabCheckins'),
              selected: _checkinFilter && _tab == 0,
              onTap: () => setState(() {
                _tab = 0;
                _checkinFilter = !_checkinFilter;
              }),
            ),
            const SizedBox(width: 8),
            _smallAction(l.t('tabAbout'),
                selected: false, onTap: () => _openAboutSheet(l, p)),
          ],
        ),
      ],
    );
  }

  Widget _smallAction(String label,
      {required bool selected, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        constraints: const BoxConstraints(minHeight: 34),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryRed : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(
              color:
                  selected ? AppColors.primaryRed : AppColors.threadsBorder),
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? Colors.white : AppColors.threadsMuted,
                fontSize: 12.5,
                fontWeight: FontWeight.w700)),
      ),
    );
  }

  /// Helaian Perihal: medan awam yang diluluskan pengguna sahaja.
  void _openAboutSheet(AppLocalizations l, FoodProfile p) {
    final budget = validBudgetText(p.budgetRange);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.threadsSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.t('foodIdentityTitle'),
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (p.bio.isNotEmpty)
                _aboutLine(Icons.notes_outlined, p.bio),
              if (p.favouriteCuisine.isNotEmpty)
                _aboutLine(Icons.restaurant_menu,
                    '${l.t('bioPickPrefix')} ${p.favouriteCuisine}'),
              if (p.favouriteFood.isNotEmpty)
                _aboutLine(Icons.favorite_outline,
                    '${l.t('bioFavPrefix')} ${p.favouriteFood}'),
              if (p.foodMood.isNotEmpty)
                _aboutLine(Icons.whatshot_outlined, p.foodMood),
              _aboutLine(
                  Icons.account_balance_wallet_outlined,
                  p.showBudget && budget != null
                      ? '${l.t('bioBudgetPrefix')} $budget'
                      : l.t('budgetHiddenLabel')),
              if (p.showDiet && p.dietPreference.isNotEmpty)
                _aboutLine(Icons.eco_outlined, p.dietPreference),
            ],
          ),
        ),
      ),
    );
  }

  Widget _aboutLine(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 17, color: AppColors.warmYellow),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text,
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontSize: 13.5,
                      height: 1.4)),
            ),
          ],
        ),
      );

  // ---------------- Kandungan tab ----------------

  List<Widget> _tabSlivers(AppLocalizations l, bool isMe) {
    switch (_tab) {
      case 1:
        return [_repliesSliver(l, isMe)];
      case 2:
        return [_mediaSliver(l)];
      case 3:
        return [_repostsSliver(l)];
      default:
        return [_postsSliver(l)];
    }
  }

  bool _isRepost(FeedPostData p) =>
      p.data['postType'] == 'repost' || p.data['postType'] == 'quote_repost';

  Widget _postsSliver(AppLocalizations l) {
    final postsAsync = ref.watch(userPublicPostsProvider(widget.uid));
    return postsAsync.when(
      loading: () => _sliverLoader(),
      error: (e, _) => _sliverMessage(l.t('profileError')),
      data: (posts) {
        var visible = posts.where((p) => !_isRepost(p)).toList();
        if (_checkinFilter) {
          visible =
              visible.where((p) => p.data['type'] == 'checkin').toList();
        }
        if (visible.isEmpty) {
          return _sliverMessage(_checkinFilter
              ? l.t('checkinEmptyProfile')
              : l.t('noPublicPosts'));
        }
        return _postListSliver(visible);
      },
    );
  }

  Widget _repostsSliver(AppLocalizations l) {
    final postsAsync = ref.watch(userPublicPostsProvider(widget.uid));
    return postsAsync.when(
      loading: () => _sliverLoader(),
      error: (e, _) => _sliverMessage(l.t('profileError')),
      data: (posts) {
        final reposts = posts.where(_isRepost).toList();
        if (reposts.isEmpty) return _sliverMessage(l.t('noRepostsYet'));
        return _postListSliver(reposts);
      },
    );
  }

  Widget _postListSliver(List<FeedPostData> posts) {
    return SliverList.builder(
      itemCount: posts.length,
      itemBuilder: (context, i) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(children: [
          PostCard(post: posts[i], key: ValueKey(posts[i].id)),
          Divider(
              height: 1, thickness: 0.6, color: AppColors.threadsBorder),
        ]),
      ),
    );
  }

  /// Media: grid 3 lajur daripada media post yang dibenarkan (keterlihatan
  /// sudah ditapis oleh userPublicPostsProvider + rules). Resit/bukti
  /// pembayaran tidak pernah menjadi media post awam.
  Widget _mediaSliver(AppLocalizations l) {
    final postsAsync = ref.watch(userPublicPostsProvider(widget.uid));
    return postsAsync.when(
      loading: () => _sliverLoader(),
      error: (e, _) => _sliverMessage(l.t('profileError')),
      data: (posts) {
        final items = <({String postId, String url, int index})>[];
        for (final p in posts.where((p) => !_isRepost(p))) {
          final urls = postMediaUrls(p.data);
          for (var i = 0; i < urls.length; i++) {
            items.add((postId: p.id, url: urls[i], index: i));
          }
        }
        if (items.isEmpty) return _sliverMessage(l.t('noMediaYet'));
        return SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 3,
              crossAxisSpacing: 3,
            ),
            itemCount: items.length,
            itemBuilder: (context, i) {
              final item = items[i];
              return Semantics(
                label: l.t('tabMedia'),
                button: true,
                child: GestureDetector(
                  onTap: () => context
                      .push('/post/${item.postId}/media?i=${item.index}'),
                  child: Image.network(
                    item.url,
                    fit: BoxFit.cover,
                    errorBuilder: (c, e, st) => Container(
                      color: AppColors.threadsSurface,
                      child: Icon(Icons.broken_image_outlined,
                          color: AppColors.threadsMuted, size: 20),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  /// Balasan: komen SENDIRI melalui collection-group (rules: baca komen
  /// sendiri sahaja). Profil orang lain -> nota privasi jujur (balasan
  /// orang lain tidak boleh diquery tanpa mendedahkan komen pada post
  /// yang pembaca tidak boleh akses).
  Widget _repliesSliver(AppLocalizations l, bool isMe) {
    // Orang lain: balasan AWAM sahaja (query terbukti selamat oleh rules;
    // induk disahkan boleh dibaca sebelum paparan dalam _ReplyTile).
    final commentsAsync = isMe
        ? ref.watch(myCommentsProvider)
        : ref.watch(userPublicRepliesProvider(widget.uid));
    return commentsAsync.when(
      loading: () => _sliverLoader(),
      error: (e, _) => _sliverMessage(l.t('profileError')),
      data: (comments) {
        if (comments.isEmpty) return _sliverMessage(l.t('noRepliesYet'));
        // Threads Fix 1.1: susun ikut instan KANONIKAL (jenis-agnostik) —
        // Timestamp/ISO/int dikendali sama; tidak diketahui → hujung.
        final sorted = [...comments]..sort((a, b) =>
            comparePostRecencyDesc(a.data['createdAt'], b.data['createdAt']));
        return SliverList.builder(
          itemCount: sorted.length,
          itemBuilder: (context, i) => _ReplyTile(
              comment: sorted[i],
              hideWhenParentGone: !isMe,
              key: ValueKey(sorted[i].id)),
        );
      },
    );
  }

  Widget _sliverLoader() => const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.all(28),
          child: Center(child: CircularProgressIndicator()),
        ),
      );

  Widget _sliverMessage(String text) => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 34, 28, 0),
          child: Center(
            child: Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AppColors.threadsMuted,
                    fontSize: 13.5,
                    height: 1.4)),
          ),
        ),
      );

  // ---------------- Keadaan khas ----------------

  Widget _scaffoldMessage(AppLocalizations l, String msg) => Scaffold(
        backgroundColor: AppColors.threadsBg,
        appBar: AppBar(
          backgroundColor: AppColors.threadsBg,
          foregroundColor: AppColors.threadsText,
        ),
        body: _scaffoldBody(l, msg),
      );

  Widget _scaffoldBody(AppLocalizations l, String msg) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Text(msg,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: AppColors.threadsMuted, fontSize: 14)),
        ),
      );

  Widget _blockedBody(AppLocalizations l) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.block,
                  color: AppColors.threadsMuted, size: 40),
              const SizedBox(height: 12),
              Text(l.t('blockedProfileNote'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.threadsText, fontSize: 14.5)),
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: () async {
                  await ref
                      .read(socialServiceProvider)
                      .blockUser(widget.uid, block: false);
                },
                style: _outlineStyle,
                child: Text(l.t('unblock')),
              ),
            ],
          ),
        ),
      );

  Widget _errorRetry(AppLocalizations l) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.t('profileError'),
                style: TextStyle(
                    color: AppColors.threadsText, fontSize: 14)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () =>
                  ref.invalidate(publicProfileProvider(widget.uid)),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(140, 44),
                foregroundColor: AppColors.threadsText,
                side: BorderSide(color: AppColors.threadsBorder),
              ),
              icon: const Icon(Icons.refresh, size: 18),
              label: Text(l.t('retry')),
            ),
          ],
        ),
      );

  Future<void> _moreMenu(BuildContext context, String targetUid) async {
    final l = AppLocalizations.of(context);
    final muted =
        (ref.read(myMutedIdsProvider).value ?? const {}).contains(targetUid);
    final blocked =
        (ref.read(myBlockedIdsProvider).value ?? const {}).contains(targetUid);
    final service = ref.read(socialServiceProvider);
    final logger = ref.read(eventLoggerProvider);
    final profile = ref.read(publicProfileProvider(targetUid)).valueOrNull;
    await showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.ios_share_outlined),
              title: Text(l.t('shareProfileAction')),
              onTap: () {
                Navigator.pop(ctx);
                if (profile != null) _shareProfile(profile);
              },
            ),
            ListTile(
              leading: const Icon(Icons.volume_off_outlined),
              title: Text(muted ? l.t('unmute') : l.t('mute')),
              onTap: () {
                service.muteUser(targetUid, mute: !muted);
                Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: const Icon(Icons.block, color: AppColors.primaryRed),
              title: Text(blocked ? l.t('unblock') : l.t('block'),
                  style: const TextStyle(color: AppColors.primaryRed)),
              onTap: () {
                logger.logEvent(
                  EventType.profileBlockTapped,
                  sourceScreen: 'public_profile',
                  metadata: {'viewedUserId': targetUid, 'block': !blocked},
                );
                service.blockUser(targetUid, block: !blocked);
                Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(l.t('report')),
              onTap: () {
                logger.logEvent(
                  EventType.profileReportTapped,
                  sourceScreen: 'public_profile',
                  metadata: {'viewedUserId': targetUid},
                );
                service.reportContent(
                    targetType: 'user', targetUid: targetUid);
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l.t('reportSent'))));
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

/// Bar tab melekat: 4 tab lebar sama, garis bawah merah untuk tab aktif.
class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  _TabBarDelegate({
    required this.selected,
    required this.labels,
    required this.onTap,
  });

  final int selected;
  final List<String> labels;
  final ValueChanged<int> onTap;

  static const _height = 46.0;

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      height: _height,
      color: AppColors.threadsBg,
      child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                for (var i = 0; i < labels.length; i++)
                  Expanded(
                    child: Semantics(
                      selected: selected == i,
                      button: true,
                      child: InkWell(
                        onTap: () => onTap(i),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 2),
                              child: Text(
                                labels[i],
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: selected == i
                                      ? AppColors.threadsText
                                      : AppColors.threadsMuted,
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              height: 2,
                              width: 44,
                              decoration: BoxDecoration(
                                color: selected == i
                                    ? AppColors.primaryRed
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(1),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Divider(
              height: 1, thickness: 0.6, color: AppColors.threadsBorder),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _TabBarDelegate old) =>
      old.selected != selected || old.labels != labels;
}

/// Item Balasan: teks balasan + pratonton post induk + buka thread asal.
class _ReplyTile extends ConsumerWidget {
  const _ReplyTile(
      {super.key, required this.comment, this.hideWhenParentGone = false});

  final FeedPostData comment;

  /// true untuk profil ORANG LAIN: induk yang tidak boleh dibaca DISKIP
  /// terus (tiada baris "tidak tersedia" yang mendedahkan kewujudan post
  /// peribadi). Profil sendiri kekal papar keadaan tidak tersedia.
  final bool hideWhenParentGone;

  String _timeAgo(AppLocalizations l, dynamic ts, {bool pending = false}) {
    // Threads Fix 1: penghurai jujur bersama (komen lama kekal lama).
    return relativePostTime(l, ts, pending: pending);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final postId = comment.data['postId'] as String? ?? '';
    final parentAsync =
        postId.isEmpty ? null : ref.watch(postByIdProvider(postId));
    final parent = parentAsync?.valueOrNull;
    final parentGone =
        parentAsync != null && !parentAsync.isLoading && parent == null;
    if (parentGone && hideWhenParentGone) return const SizedBox.shrink();

    return InkWell(
      onTap: parent == null
          ? null
          : () => showCommentsSheet(context, postId),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    parentGone
                        ? l.t('postUnavailable')
                        : '${l.t('replyToLabel')} '
                            '${parent?.data['displayName'] ?? '…'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsMuted, fontSize: 12.5),
                  ),
                ),
                Text(_timeAgo(l, comment.data['createdAt'],
                        pending: comment.pending),
                    style: TextStyle(
                        color: AppColors.threadsMuted, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              comment.data['text'] as String? ?? '',
              style: TextStyle(
                  color: AppColors.threadsText, fontSize: 14.5, height: 1.35),
            ),
            if (parent != null) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.threadsBorder),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  (parent.data['text'] as String?)?.isNotEmpty == true
                      ? parent.data['text'] as String
                      : (parent.data['placeName'] as String? ??
                          l.t('viewThread')),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.threadsMuted,
                      fontSize: 13,
                      height: 1.35),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Divider(
                height: 1, thickness: 0.6, color: AppColors.threadsBorder),
          ],
        ),
      ),
    );
  }
}

/// Butang Follow/Following dengan keadaan sibuk + rollback ralat.
/// (Diasingkan daripada baris aksi supaya boleh diuji terus.)
class FollowButton extends ConsumerStatefulWidget {
  const FollowButton({super.key, required this.uid, required this.isMe});

  final String uid;
  final bool isMe;

  @override
  ConsumerState<FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends ConsumerState<FollowButton> {
  bool _busy = false;

  Future<void> _toggle(bool currentlyFollowing) async {
    final l = AppLocalizations.of(context);
    setState(() => _busy = true);
    ref.read(eventLoggerProvider).logEvent(
      EventType.followTapped,
      sourceScreen: 'public_profile',
      metadata: {
        'viewedUserId': widget.uid,
        'relationshipStatus':
            currentlyFollowing ? 'unfollowing' : 'following',
      },
    );
    try {
      if (currentlyFollowing) {
        await ref.read(socialServiceProvider).unfollowUser(widget.uid);
      } else {
        await ref.read(socialServiceProvider).followUser(widget.uid);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('postFailed'))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    if (widget.isMe) return const SizedBox.shrink();
    final following =
        ref.watch(isFollowingProvider(widget.uid)).value ?? false;
    final child = _busy
        ? const SizedBox(
            height: 18,
            width: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(following ? l.t('following') : l.t('follow'),
            maxLines: 1, overflow: TextOverflow.ellipsis);
    return following
        ? OutlinedButton(
            onPressed: _busy ? null : () => _toggle(true),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 48),
              foregroundColor: AppColors.threadsText,
              side: BorderSide(color: AppColors.threadsBorder),
            ),
            child: child,
          )
        : FilledButton(
            onPressed: _busy ? null : () => _toggle(false),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryRed,
              minimumSize: const Size(0, 48),
            ),
            child: child,
          );
  }
}
