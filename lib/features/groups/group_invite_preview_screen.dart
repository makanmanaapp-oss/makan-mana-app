import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';
import '../social/social_ui.dart';
import 'group_providers.dart';

/// HOTFIX 4.6 — GROUP INVITE deep-link preview (/invite/{token}).
///
/// Link-scoped: a valid token authorizes previewing + joining the target group
/// (member role), even a PRIVATE group — WITHOUT exposing member-only content
/// before join and WITHOUT changing private search behavior. Server is
/// authoritative for every state (valid/expired/revoked/already-member).
class GroupInvitePreviewScreen extends ConsumerStatefulWidget {
  const GroupInvitePreviewScreen({super.key, required this.token});
  final String token;

  @override
  ConsumerState<GroupInvitePreviewScreen> createState() =>
      _GroupInvitePreviewScreenState();
}

class _GroupInvitePreviewScreenState
    extends ConsumerState<GroupInvitePreviewScreen> {
  bool _loading = true;
  bool _joining = false;
  String? _errorKey; // localized friendly error key
  bool _needAuth = false;
  Map<String, dynamic>? _info;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty) {
      // Preserve intent, prompt sign-in (Part 14).
      ref.read(pendingInviteTokenProvider.notifier).state = widget.token;
      setState(() {
        _needAuth = true;
        _loading = false;
      });
      return;
    }
    try {
      final info =
          await ref.read(socialServiceProvider).getGroupInviteLinkInfo(widget.token);
      if (!mounted) return;
      setState(() {
        _info = info;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      // Part 6: token invalid/expired/revoked → clear pending intent.
      ref.read(pendingInviteTokenProvider.notifier).state = null;
      setState(() {
        _errorKey = _friendlyError(e);
        _loading = false;
      });
    }
  }

  String _friendlyError(Object e) {
    final s = e.toString().toLowerCase();
    if (s.contains('tamat tempoh') || s.contains('expire')) {
      return 'inviteLinkExpired';
    }
    return 'inviteLinkInvalid'; // revoked / not-found / limit
  }

  Future<void> _join() async {
    final info = _info;
    if (info == null) return;
    setState(() => _joining = true);
    try {
      await ref.read(socialServiceProvider).joinGroupByInviteLink(widget.token);
      if (!mounted) return;
      ref.read(pendingInviteTokenProvider.notifier).state = null;
      context.go('/groups/${info['groupId']}');
    } catch (e) {
      if (!mounted) return;
      // Join failed on a terminal link state → clear pending intent (Part 6).
      ref.read(pendingInviteTokenProvider.notifier).state = null;
      setState(() {
        _joining = false;
        _errorKey = _friendlyError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        title: Text(l.t('groupInvite'),
            style: TextStyle(color: AppColors.threadsText)),
      ),
      body: Center(
        child: _loading
            ? const CircularProgressIndicator()
            : _needAuth
                ? _authPrompt(l)
                : _errorKey != null
                    ? _errorState(l, _errorKey!)
                    : _preview(l),
      ),
    );
  }

  Widget _authPrompt(AppLocalizations l) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 48, color: AppColors.threadsMuted),
            const SizedBox(height: 16),
            Text(l.t('signInToJoin'),
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => context.go(RoutePaths.login),
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(200, 48)),
              child: Text(l.t('login')),
            ),
          ],
        ),
      );

  Widget _errorState(AppLocalizations l, String key) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.link_off, size: 48, color: AppColors.threadsMuted),
            const SizedBox(height: 16),
            Text(l.t(key),
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: () => context.go(RoutePaths.home),
              style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.threadsText,
                  side: BorderSide(color: AppColors.threadsBorder),
                  minimumSize: const Size(160, 48)),
              child: Text(l.t('backToHome')),
            ),
          ],
        ),
      );

  Widget _preview(AppLocalizations l) {
    final info = _info!;
    final already = info['alreadyMember'] as bool? ?? false;
    final isPrivate = (info['privacy'] as String?) == 'private';
    final desc = info['description'] as String? ?? '';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GroupAvatar(
              emoji: '🍜', imageUrl: info['imageUrl'] as String?, size: 96),
          const SizedBox(height: 18),
          Text(info['name'] as String? ?? '',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: AppColors.threadsText,
                  fontSize: 22,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          GroupPrivacyBadge(isPrivate: isPrivate),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(desc,
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.threadsMuted)),
          ],
          const SizedBox(height: 8),
          Text('${info['memberCount'] ?? 0} ${l.t('membersLabel')}',
              style: TextStyle(color: AppColors.threadsMuted)),
          const SizedBox(height: 6),
          Text(l.t('invitedViaLink'),
              style: TextStyle(
                  color: AppColors.threadsMuted,
                  fontStyle: FontStyle.italic,
                  fontSize: 13)),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _joining ? null : _join,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(0, 52)),
              child: _joining
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(already ? l.t('openGroup') : l.t('joinGroup'),
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
