import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../groups/group_providers.dart';
import 'social_providers.dart';

/// Keterlihatan siaran seragam untuk seluruh app.
enum PostVisibility { public, followersOnly, groupOnly, private, unlisted }

extension PostVisibilityX on PostVisibility {
  String get wire => switch (this) {
        PostVisibility.public => 'public',
        PostVisibility.followersOnly => 'followers_only',
        PostVisibility.groupOnly => 'group_only',
        PostVisibility.private => 'private',
        PostVisibility.unlisted => 'unlisted',
      };

  String label(AppLocalizations l) => switch (this) {
        PostVisibility.public => l.t('visPublic'),
        PostVisibility.followersOnly => l.t('visFollowers'),
        PostVisibility.groupOnly => l.t('visGroup'),
        PostVisibility.private => l.t('visPrivate'),
        PostVisibility.unlisted => l.t('visUnlisted'),
      };

  IconData get icon => switch (this) {
        PostVisibility.public => Icons.public,
        PostVisibility.followersOnly => Icons.group_outlined,
        PostVisibility.groupOnly => Icons.groups_outlined,
        PostVisibility.private => Icons.lock_outline,
        PostVisibility.unlisted => Icons.link_off,
      };
}

/// Chip kecil pemilih keterlihatan (untuk compose / share).
class VisibilityChip extends StatelessWidget {
  const VisibilityChip({
    super.key,
    required this.value,
    required this.onChanged,
    this.dark = true,
  });

  final PostVisibility value;
  final ValueChanged<PostVisibility> onChanged;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final fg = dark ? AppColors.threadsText : AppColors.darkText;
    return InkWell(
      onTap: () async {
        final picked = await showVisibilityPicker(context, value);
        if (picked != null) onChanged(picked);
      },
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: dark ? AppColors.threadsSurface : AppColors.cardWhite,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: dark ? AppColors.threadsBorder : AppColors.softBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(value.icon, size: 15, color: AppColors.primaryRed),
            const SizedBox(width: 6),
            Text(value.label(l),
                style: TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700, color: fg)),
            const SizedBox(width: 2),
            Icon(Icons.expand_more, size: 16, color: fg),
          ],
        ),
      ),
    );
  }
}

/// Sheet pilih keterlihatan.
Future<PostVisibility?> showVisibilityPicker(
  BuildContext context,
  PostVisibility current, {
  List<PostVisibility> options = const [
    PostVisibility.public,
    PostVisibility.followersOnly,
    PostVisibility.private,
    PostVisibility.unlisted,
  ],
}) {
  final l = AppLocalizations.of(context);
  return showModalBottomSheet<PostVisibility>(
    context: context,
    backgroundColor: AppColors.cardWhite,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Row(
              children: [
                Text(l.t('chooseVisibility'),
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          for (final v in options)
            ListTile(
              leading: Icon(v.icon, color: AppColors.primaryRed),
              title: Text(v.label(l),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(_visDesc(l, v),
                  style: const TextStyle(fontSize: 12)),
              trailing: v == current
                  ? const Icon(Icons.check_circle, color: AppColors.primaryRed)
                  : null,
              onTap: () => Navigator.pop(ctx, v),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

String _visDesc(AppLocalizations l, PostVisibility v) => switch (v) {
      PostVisibility.public => l.t('visPublicDesc'),
      PostVisibility.followersOnly => l.t('visFollowersDesc'),
      PostVisibility.groupOnly => l.t('visGroupDesc'),
      PostVisibility.private => l.t('visPrivateDesc'),
      PostVisibility.unlisted => l.t('visUnlistedDesc'),
    };

/// Sheet kongsi hasil (cadangan AI / insight bajet / hasil undian) ke feed
/// dengan pemilih keterlihatan + pilihan grup.
Future<void> showShareResultSheet(
  BuildContext context, {
  required String title,
  required String postType,
  String text = '',
  Map<String, dynamic>? payload,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.cardWhite,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => _ShareResultSheet(
      title: title,
      postType: postType,
      text: text,
      payload: payload,
    ),
  );
}

class _ShareResultSheet extends ConsumerStatefulWidget {
  const _ShareResultSheet({
    required this.title,
    required this.postType,
    required this.text,
    required this.payload,
  });

  final String title;
  final String postType;
  final String text;
  final Map<String, dynamic>? payload;

  @override
  ConsumerState<_ShareResultSheet> createState() => _ShareResultSheetState();
}

class _ShareResultSheetState extends ConsumerState<_ShareResultSheet> {
  PostVisibility _vis = PostVisibility.public;
  String? _groupId;
  bool _sending = false;

  Future<void> _share() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _sending = true);
    try {
      await ref.read(socialServiceProvider).createPost(
            uid: uid,
            text: widget.text,
            postType: widget.postType,
            payload: widget.payload,
            groupId: _vis == PostVisibility.groupOnly ? _groupId : null,
            visibility: _vis.wire,
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('sharedOk'))));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final myGroupIds = ref.watch(myGroupIdsProvider).value ?? const {};
    final groups = (ref.watch(discoverGroupsProvider).value ?? const [])
        .where((g) => myGroupIds.contains(g.id))
        .toList();
    final visOptions = [
      PostVisibility.public,
      PostVisibility.followersOnly,
      if (groups.isNotEmpty) PostVisibility.groupOnly,
      PostVisibility.private,
    ];

    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 18, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.title,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(l.t('chooseVisibility'),
              style: const TextStyle(
                  fontSize: 12.5, color: AppColors.mutedText)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final v in visOptions)
                ChoiceChip(
                  selected: _vis == v,
                  label: Text(v.label(l)),
                  avatar: Icon(v.icon,
                      size: 16,
                      color: _vis == v ? Colors.white : AppColors.primaryRed),
                  selectedColor: AppColors.primaryRed,
                  labelStyle: TextStyle(
                      color: _vis == v ? Colors.white : AppColors.darkText,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5),
                  onSelected: (_) => setState(() => _vis = v),
                ),
            ],
          ),
          if (_vis == PostVisibility.groupOnly) ...[
            const SizedBox(height: 12),
            Text(l.t('shareToGroup'),
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final g in groups)
                  ChoiceChip(
                    selected: _groupId == g.id,
                    label: Text('${g.emoji} ${g.name}'),
                    selectedColor: AppColors.softYellow,
                    onSelected: (_) => setState(() => _groupId = g.id),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _sending ||
                      (_vis == PostVisibility.groupOnly && _groupId == null)
                  ? null
                  : _share,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size(0, 50),
              ),
              child: _sending
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(l.t('shareAction'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
            ),
          ),
        ],
      ),
    );
  }
}
