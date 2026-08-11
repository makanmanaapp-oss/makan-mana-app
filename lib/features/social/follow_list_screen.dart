import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import 'food_profile.dart';
import 'social_providers.dart';

/// Senarai pengikut atau yang diikuti.
class FollowListScreen extends ConsumerWidget {
  const FollowListScreen({
    super.key,
    required this.uid,
    required this.mode, // followers | following
  });

  final String uid;
  final String mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final ids = mode == 'followers'
        ? ref.watch(followersProvider(uid))
        : ref.watch(followingProvider(uid));

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        title: Text(
          mode == 'followers' ? l.t('statFollowers') : l.t('statFollowing'),
          style: TextStyle(color: AppColors.threadsText),
        ),
      ),
      body: ids.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('😕 $e')),
        data: (list) => list.isEmpty
            ? Center(
                child: Text(l.t('emptyFollowList'),
                    style: TextStyle(color: AppColors.threadsMuted)),
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: list.length,
                itemBuilder: (context, i) => FollowRow(uid: list[i]),
              ),
      ),
    );
  }
}

/// Baris ringkas seorang pengguna dengan butang ikut.
class FollowRow extends ConsumerWidget {
  const FollowRow({super.key, required this.uid});

  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final p = ref.watch(publicProfileProvider(uid)).value;
    final following = ref.watch(isFollowingProvider(uid)).value ?? false;
    if (p == null) return const SizedBox.shrink();

    return ListTile(
      onTap: () => context.push('/u/$uid'),
      leading: MakanAvatar(
        radius: 22,
        photoUrl: p.photoUrl,
        presetId: p.avatarPreset,
        displayName: p.displayName,
      ),
      title: Text(p.displayName,
          style: TextStyle(
              color: AppColors.threadsText, fontWeight: FontWeight.w700)),
      subtitle: p.username != null && p.username!.isNotEmpty
          ? Text('@${p.username}',
              style: TextStyle(color: AppColors.threadsMuted))
          : null,
      trailing: uid == myUid
          ? null
          : SizedBox(
              height: 34,
              child: following
                  ? OutlinedButton(
                      onPressed: () =>
                          ref.read(socialServiceProvider).unfollowUser(uid),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(72, 34),
                        foregroundColor: AppColors.threadsText,
                        side: BorderSide(color: AppColors.threadsBorder),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      child: Text(l.t('following'),
                          style: const TextStyle(fontSize: 12.5)),
                    )
                  : FilledButton(
                      onPressed: () =>
                          ref.read(socialServiceProvider).followUser(uid),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryRed,
                        minimumSize: const Size(72, 34),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      child: Text(l.t('follow'),
                          style: const TextStyle(fontSize: 12.5)),
                    ),
            ),
    );
  }
}
