import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'food_profile.dart';
import 'post_card.dart';
import 'social_providers.dart';

/// Profil makanan awam pengguna (gaya Threads/X fokus makanan).
class FoodProfileScreen extends ConsumerWidget {
  const FoodProfileScreen({super.key, required this.uid});

  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final isMe = uid == myUid;
    final profileAsync = ref.watch(publicProfileProvider(uid));
    final postsAsync = ref.watch(userPublicPostsProvider(uid));

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        title: Text(l.t('foodProfileTitle'),
            style: const TextStyle(color: AppColors.threadsText)),
        actions: [
          if (!isMe)
            IconButton(
              icon: const Icon(Icons.more_horiz),
              onPressed: () => _moreMenu(context, ref, uid),
            ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('😕 $e', style: const TextStyle(fontSize: 13))),
        data: (p) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: AppColors.softYellow,
                  backgroundImage: p.photoUrl != null
                      ? NetworkImage(p.photoUrl!)
                      : null,
                  child: p.photoUrl == null
                      ? const Text('😋', style: TextStyle(fontSize: 32))
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.displayName,
                          style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              color: AppColors.threadsText)),
                      if (p.username != null && p.username!.isNotEmpty)
                        Text('@${p.username}',
                            style: const TextStyle(
                                color: AppColors.threadsMuted, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
            if (p.bio.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(p.bio,
                  style: const TextStyle(
                      color: AppColors.threadsText, fontSize: 14, height: 1.35)),
            ],
            const SizedBox(height: 14),
            // Baris statistik.
            Row(
              children: [
                _stat(context, p.postsCount, l.t('statPosts')),
                _statTap(
                  context,
                  p.followersCount,
                  l.t('statFollowers'),
                  () => context.push('/u/$uid/followers'),
                ),
                _statTap(
                  context,
                  p.followingCount,
                  l.t('statFollowing'),
                  () => context.push('/u/$uid/following'),
                ),
                _stat(context, p.reviewsCount, l.t('statReviews')),
              ],
            ),
            const SizedBox(height: 16),
            _FollowButton(uid: uid, isMe: isMe),
            const SizedBox(height: 18),
            // Ciri rasa awam.
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (p.favouriteFood.isNotEmpty)
                  _tag('🍜 ${p.favouriteFood}'),
                if (p.favouriteCuisine.isNotEmpty)
                  _tag('🌏 ${p.favouriteCuisine}'),
                if (p.foodMood.isNotEmpty) _tag('😋 ${p.foodMood}'),
                if (p.showDiet && p.dietPreference.isNotEmpty)
                  _tag('🥗 ${p.dietPreference}'),
                if (p.showBudget && p.budgetRange.isNotEmpty)
                  _tag('💸 ${p.budgetRange}'),
              ],
            ),
            const SizedBox(height: 20),
            Text(l.t('publicPostsTitle'),
                style: const TextStyle(
                    color: AppColors.threadsText,
                    fontWeight: FontWeight.w800,
                    fontSize: 15)),
            const SizedBox(height: 4),
            postsAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text('😕 $e'),
              data: (posts) => posts.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.only(top: 30),
                      child: Center(
                        child: Text(l.t('noPublicPosts'),
                            style: const TextStyle(
                                color: AppColors.threadsMuted)),
                      ),
                    )
                  : Column(
                      children: posts
                          .map((post) => Column(children: [
                                PostCard(post: post, key: ValueKey(post.id)),
                                const Divider(
                                    height: 1,
                                    thickness: 0.6,
                                    color: AppColors.threadsBorder),
                              ]))
                          .toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(BuildContext context, int n, String label) => Expanded(
        child: Column(
          children: [
            Text('$n',
                style: const TextStyle(
                    color: AppColors.threadsText,
                    fontWeight: FontWeight.w800,
                    fontSize: 17)),
            Text(label,
                style: const TextStyle(
                    color: AppColors.threadsMuted, fontSize: 11.5)),
          ],
        ),
      );

  Widget _statTap(
          BuildContext context, int n, String label, VoidCallback onTap) =>
      Expanded(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Column(
            children: [
              Text('$n',
                  style: const TextStyle(
                      color: AppColors.threadsText,
                      fontWeight: FontWeight.w800,
                      fontSize: 17)),
              Text(label,
                  style: const TextStyle(
                      color: AppColors.threadsMuted, fontSize: 11.5)),
            ],
          ),
        ),
      );

  Widget _tag(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.threadsBorder),
        ),
        child: Text(text,
            style: const TextStyle(
                color: AppColors.threadsText,
                fontSize: 12.5,
                fontWeight: FontWeight.w600)),
      );

  Future<void> _moreMenu(
      BuildContext context, WidgetRef ref, String targetUid) async {
    final l = AppLocalizations.of(context);
    final muted = (ref.read(myMutedIdsProvider).value ?? const {})
        .contains(targetUid);
    final blocked = (ref.read(myBlockedIdsProvider).value ?? const {})
        .contains(targetUid);
    final service = ref.read(socialServiceProvider);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.cardWhite,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
                service.blockUser(targetUid, block: !blocked);
                Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(l.t('report')),
              onTap: () {
                service.reportContent(
                    targetType: 'user', targetUid: targetUid);
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(l.t('reportSent'))));
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

/// Butang Follow/Unfollow (atau Edit profil jika ini saya).
class _FollowButton extends ConsumerWidget {
  const _FollowButton({required this.uid, required this.isMe});

  final String uid;
  final bool isMe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    if (isMe) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: () => context.push('/edit-food-profile'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 46),
            foregroundColor: AppColors.threadsText,
            side: const BorderSide(color: AppColors.threadsBorder),
          ),
          icon: const Icon(Icons.edit_outlined, size: 18),
          label: Text(l.t('editFoodProfile')),
        ),
      );
    }
    final following = ref.watch(isFollowingProvider(uid)).value ?? false;
    return SizedBox(
      width: double.infinity,
      child: following
          ? OutlinedButton(
              onPressed: () =>
                  ref.read(socialServiceProvider).unfollowUser(uid),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 46),
                foregroundColor: AppColors.threadsText,
                side: const BorderSide(color: AppColors.threadsBorder),
              ),
              child: Text(l.t('following')),
            )
          : FilledButton(
              onPressed: () =>
                  ref.read(socialServiceProvider).followUser(uid),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size(0, 46),
              ),
              child: Text(l.t('follow')),
            ),
    );
  }
}
