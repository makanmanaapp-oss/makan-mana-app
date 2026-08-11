import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/makan_avatar.dart';
import '../social/social_providers.dart';

/// HOTFIX 4.6C — a MakanMana invite URL is `https://…/invite/<token>`.
/// Copy/Share must only ever act on the COMPLETE HTTPS invite URL — never a
/// linkId, SHA-256 hash, groupId, token-alone, or label.
bool isValidInviteUrl(String? u) =>
    u != null && u.isNotEmpty && u.startsWith('https://') && u.contains('/invite/');

/// HOTFIX 4.6C — copy a validated invite URL to the system clipboard.
/// Returns true ONLY if a valid URL was actually written. Never throws; never
/// reports success on failure; never logs the token.
Future<bool> copyInviteUrlToClipboard(String? url) async {
  if (!isValidInviteUrl(url)) return false;
  try {
    await Clipboard.setData(ClipboardData(text: url!));
    return true;
  } catch (_) {
    return false; // clipboard channel failure → honest false
  }
}

/// HOTFIX 4.6 — Smart Member Invite sheet.
///
/// Following-first suggestions + live server-authoritative people search +
/// one-tap Invite (existing inviteToGroup) + secure Invite-by-link. Reuses the
/// existing social graph (follows/public_profiles/blocks) and MakanAvatar — no
/// second social graph, no second image resolver.
Future<void> showInviteMembersSheet(BuildContext context, String groupId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.threadsBg,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => InviteMembersSheet(groupId: groupId),
  );
}

/// HOTFIX 4.6A — honest link management after restart. Firestore stores only
/// SHA-256(token); plaintext token is NOT recoverable. So: existing links are
/// listed by metadata (id/uses/expiry/status) and can be REVOKED by linkId; a
/// freshly Created link (this session) can be Copy/Shared because its plaintext
/// token is still in memory.
Future<void> showManageInviteLinkSheet(BuildContext context, String groupId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.threadsBg,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => ManageInviteLinkSheet(groupId: groupId),
  );
}

class ManageInviteLinkSheet extends ConsumerStatefulWidget {
  const ManageInviteLinkSheet({super.key, required this.groupId});
  final String groupId;
  @override
  ConsumerState<ManageInviteLinkSheet> createState() =>
      _ManageInviteLinkSheetState();
}

class _ManageInviteLinkSheetState extends ConsumerState<ManageInviteLinkSheet> {
  bool _loading = true;
  bool _busy = false;
  List<Map<String, dynamic>> _links = const [];
  String? _freshUrl; // plaintext link created THIS session
  String? _freshLinkId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final l = await ref
          .read(socialServiceProvider)
          .listGroupInviteLinks(widget.groupId);
      if (!mounted) return;
      setState(() {
        _links = l;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    setState(() => _busy = true);
    try {
      final res = await ref
          .read(socialServiceProvider)
          .createGroupInviteLink(widget.groupId);
      _freshUrl = res['url'] as String?;
      _freshLinkId = res['linkId'] as String?;
      await _load();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(String linkId) async {
    setState(() => _busy = true);
    try {
      await ref.read(socialServiceProvider).revokeGroupInviteLink(linkId);
      if (linkId == _freshLinkId) {
        _freshUrl = null;
        _freshLinkId = null;
      }
      await _load();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, sc) => ListView(
          controller: sc,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text(l.t('manageInviteLink'),
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 18,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(l.t('inviteLinkPrivacyNote'),
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 13)),
            const SizedBox(height: 14),
            if (_freshUrl != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.threadsSurface,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SelectableText(_freshUrl!,
                        style: TextStyle(
                            color: AppColors.threadsText, fontSize: 13)),
                    const SizedBox(height: 8),
                    Row(children: [
                      OutlinedButton.icon(
                        onPressed: () async {
                          final ok = await copyInviteUrlToClipboard(_freshUrl);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context)
                              ..hideCurrentSnackBar()
                              ..showSnackBar(SnackBar(
                                  behavior: SnackBarBehavior.floating,
                                  content: Text(l.t(ok
                                      ? 'inviteLinkCopied'
                                      : 'inviteLinkCopyFailed'))));
                          }
                        },
                        icon: const Icon(Icons.link, size: 18),
                        label: Text(l.t('copyLink')),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.icon(
                        onPressed: () => SharePlus.instance.share(ShareParams(
                            text: '${l.t('shareGroupInviteText')}\n$_freshUrl')),
                        style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primaryRed),
                        icon: const Icon(Icons.share, size: 18),
                        label: Text(l.t('shareLink')),
                      ),
                    ]),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _create,
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                icon: const Icon(Icons.add_link, size: 18),
                label: Text(l.t('createNewLink')),
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_links.isEmpty)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(l.t('noActiveLinks'),
                    style: TextStyle(color: AppColors.threadsMuted)),
              )
            else
              ..._links.map((m) => _linkRow(l, m)),
          ],
        ),
      ),
    );
  }

  Widget _linkRow(AppLocalizations l, Map<String, dynamic> m) {
    final id = (m['linkId'] as String? ?? '');
    final short = id.length > 8 ? '${id.substring(0, 8)}…' : id;
    final uses = m['usageCount'] ?? 0;
    final maxUses = m['maxUses'];
    final status = m['status'] as String? ?? 'active';
    final expired = status == 'expired';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text('#$short',
          style: TextStyle(
              color: AppColors.threadsText, fontWeight: FontWeight.w700)),
      subtitle: Text(
        '$uses${maxUses != null ? '/$maxUses' : ''} ${l.t('membersLabel').toLowerCase()} · ${expired ? l.t('inviteLinkExpired') : status}',
        style: TextStyle(color: AppColors.threadsMuted, fontSize: 12),
      ),
      trailing: TextButton(
        onPressed: _busy ? null : () => _revoke(id),
        child: Text(l.t('revokeLink'),
            style: const TextStyle(color: AppColors.primaryRed)),
      ),
    );
  }
}

class InviteMembersSheet extends ConsumerStatefulWidget {
  const InviteMembersSheet({super.key, required this.groupId});
  final String groupId;

  @override
  ConsumerState<InviteMembersSheet> createState() => _InviteMembersSheetState();
}

class _InviteMembersSheetState extends ConsumerState<InviteMembersSheet> {
  final _search = TextEditingController();
  Timer? _debounce;
  int _reqId = 0; // guards against stale async results (Part 33.12)
  bool _loading = true;
  List<Map<String, dynamic>> _people = const [];
  final Set<String> _invitedLocal = {}; // optimistic Invited state
  String _query = '';

  // invite-link state
  String? _linkUrl;
  bool _linkBusy = false;
  String? _copiedUrl; // last successfully-copied URL (visible inline fallback)

  @override
  void initState() {
    super.initState();
    _runSearch(''); // default Following suggestions
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _runSearch(q));
  }

  Future<void> _runSearch(String q) async {
    final id = ++_reqId;
    setState(() {
      _loading = true;
      _query = q;
    });
    try {
      final res =
          await ref.read(socialServiceProvider).searchPeople(widget.groupId, q);
      if (id != _reqId || !mounted) return; // stale → drop (Part 33.12)
      setState(() {
        _people = res;
        _loading = false;
      });
    } catch (_) {
      if (id != _reqId || !mounted) return;
      setState(() {
        _people = const [];
        _loading = false;
      });
    }
  }

  Future<void> _invite(String uid) async {
    setState(() => _invitedLocal.add(uid)); // optimistic
    try {
      await ref.read(socialServiceProvider).inviteToGroup(widget.groupId, uid);
    } catch (_) {
      if (mounted) {
        setState(() => _invitedLocal.remove(uid));
        final l = AppLocalizations.of(context);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('photoUploadFailed'))));
      }
    }
  }

  /// Shared resolver (Part 8): reuse the current-session valid URL, else create
  /// one. Copy AND Share go through this so they can never parse different
  /// fields. Returns null on failure (caller surfaces an honest error).
  Future<String?> _resolveCurrentInviteUrl() async {
    if (isValidInviteUrl(_linkUrl)) return _linkUrl; // reuse current session URL
    try {
      final res = await ref
          .read(socialServiceProvider)
          .createGroupInviteLink(widget.groupId);
      final u = res['url'] as String?;
      if (isValidInviteUrl(u)) _linkUrl = u;
      return _linkUrl;
    } catch (_) {
      return null; // rate-limit / network / etc → honest null (no snackbar here)
    }
  }

  void _snack(String key) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text(AppLocalizations.of(context).t(key)),
      ));
  }

  Future<void> _copyLink() async {
    if (_linkBusy) return; // double-tap guard (Part 7)
    setState(() => _linkBusy = true);
    try {
      final url = await _resolveCurrentInviteUrl();
      final ok = await copyInviteUrlToClipboard(url); // validates + awaits (Part 3/4)
      if (!mounted) return;
      if (ok) {
        setState(() => _copiedUrl = url); // visible inline confirmation (Part 6)
        _snack('inviteLinkCopied');
      } else {
        _snack('inviteLinkCopyFailed'); // no silent swallow / no false success
      }
    } finally {
      if (mounted) setState(() => _linkBusy = false);
    }
  }

  Future<void> _shareLink() async {
    if (_linkBusy) return; // double-tap guard
    setState(() => _linkBusy = true);
    try {
      final l = AppLocalizations.of(context);
      final url = await _resolveCurrentInviteUrl();
      if (!isValidInviteUrl(url)) {
        _snack('inviteLinkCopyFailed');
        return;
      }
      await SharePlus.instance
          .share(ShareParams(text: '${l.t('shareGroupInviteText')}\n$url'));
    } finally {
      if (mounted) setState(() => _linkBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final insets = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: insets),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.threadsBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(l.t('inviteMembers'),
                        style: TextStyle(
                            color: AppColors.threadsText,
                            fontSize: 18,
                            fontWeight: FontWeight.w800)),
                  ),
                  IconButton(
                    tooltip: l.t('closeAction'),
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.close, color: AppColors.threadsMuted),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextField(
                controller: _search,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                style: TextStyle(color: AppColors.threadsText),
                decoration: InputDecoration(
                  hintText: l.t('searchPeople'),
                  prefixIcon:
                      Icon(Icons.search, color: AppColors.threadsMuted),
                  filled: true,
                  fillColor: AppColors.threadsSurface,
                  contentPadding: const EdgeInsets.symmetric(vertical: 4),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.only(top: 8, bottom: 24),
                children: [
                  _sectionLabel(
                      _query.isEmpty ? l.t('following') : l.t('searchResultsLabel')),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_people.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(
                        child: Text(l.t('noPeopleResults'),
                            style:
                                TextStyle(color: AppColors.threadsMuted)),
                      ),
                    )
                  else
                    ..._people.map(_personRow),
                  Divider(height: 32, color: AppColors.threadsBorder),
                  _inviteLinkSection(l),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 6),
        child: Text(text.toUpperCase(),
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5)),
      );

  Widget _personRow(Map<String, dynamic> p) {
    final l = AppLocalizations.of(context);
    final uid = p['uid'] as String? ?? '';
    final name = p['displayName'] as String? ?? 'Foodie';
    final username = p['username'] as String?;
    final following = p['isFollowing'] as bool? ?? false;
    var state = p['state'] as String? ?? 'invite';
    if (_invitedLocal.contains(uid)) state = 'invited';

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
      leading: MakanAvatar(
        radius: 22,
        photoUrl: p['photoUrl'] as String?,
        presetId: p['avatarPreset'] as String?,
        displayName: name,
      ),
      title: Text(name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
              color: AppColors.threadsText, fontWeight: FontWeight.w700)),
      subtitle: Row(
        children: [
          if (username != null && username.isNotEmpty)
            Flexible(
              child: Text('@$username',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: AppColors.threadsMuted)),
            ),
          if (following) ...[
            const SizedBox(width: 8),
            Text('· ${l.t('following')}',
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 12)),
          ],
        ],
      ),
      trailing: _rowAction(l, uid, state),
    );
  }

  Widget _rowAction(AppLocalizations l, String uid, String state) {
    switch (state) {
      case 'member':
        return _chip(l.t('member'), Icons.check, AppColors.threadsMuted);
      case 'invited':
        return _chip(l.t('invited'), Icons.schedule, AppColors.threadsMuted);
      default:
        return SizedBox(
          height: 36,
          child: FilledButton(
            onPressed: () => _invite(uid),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryRed,
              minimumSize: const Size(72, 36),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            child: Text(l.t('invite'),
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w700)),
          ),
        );
    }
  }

  Widget _chip(String label, IconData icon, Color color) => Semantics(
        label: label,
        child: Container(
          constraints: const BoxConstraints(minHeight: 36),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    color: color, fontSize: 13, fontWeight: FontWeight.w600)),
          ]),
        ),
      );

  Widget _inviteLinkSection(AppLocalizations l) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.t('inviteByLink'),
              style: TextStyle(
                  color: AppColors.threadsText,
                  fontSize: 15,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(l.t('inviteByLinkBody'),
              style: TextStyle(color: AppColors.threadsMuted, fontSize: 13)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _linkBusy ? null : _copyLink,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    foregroundColor: AppColors.threadsText,
                    side: BorderSide(color: AppColors.threadsBorder),
                  ),
                  icon: _linkBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.link, size: 18),
                  label: Text(l.t('copyLink')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _linkBusy ? null : _shareLink,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    backgroundColor: AppColors.primaryRed,
                  ),
                  icon: const Icon(Icons.share, size: 18),
                  label: Text(l.t('shareLink')),
                ),
              ),
            ],
          ),
          // HOTFIX 4.6C: visible, selectable confirmation of the EXACT URL that
          // was copied — a robust fallback if the system clipboard/snackbar is
          // unreliable, the user can still long-press to select this URL.
          if (_copiedUrl != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.threadsSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.check_circle,
                        size: 16, color: AppColors.primaryRed),
                    const SizedBox(width: 6),
                    Text(l.t('inviteLinkCopied'),
                        style: TextStyle(
                            color: AppColors.threadsMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w700)),
                  ]),
                  const SizedBox(height: 6),
                  SelectableText(_copiedUrl!,
                      style: TextStyle(
                          color: AppColors.threadsText, fontSize: 13)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
