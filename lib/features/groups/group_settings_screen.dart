import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';
import 'group_providers.dart';

/// Tetapan grup: maklumat, pin, urus ahli & peranan.
class GroupSettingsScreen extends ConsumerStatefulWidget {
  const GroupSettingsScreen({super.key, required this.groupId});
  final String groupId;

  @override
  ConsumerState<GroupSettingsScreen> createState() =>
      _GroupSettingsScreenState();
}

class _GroupSettingsScreenState extends ConsumerState<GroupSettingsScreen> {
  final _name = TextEditingController();
  final _desc = TextEditingController();
  final _announce = TextEditingController();
  bool _seeded = false;

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    _announce.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final group = ref.watch(groupProvider(widget.groupId)).value;
    final role = ref.watch(myGroupRoleProvider(widget.groupId)).value;
    final members =
        ref.watch(groupMembersProvider(widget.groupId)).value ?? const [];
    final isOwner = role == 'owner';
    final isManager = role == 'owner' || role == 'admin';
    final service = ref.read(socialServiceProvider);

    if (!_seeded && group != null) {
      _seeded = true;
      _name.text = group.name;
      _desc.text = group.description;
      _announce.text = group.pinnedAnnouncement ?? '';
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.t('groupSettings'))),
      body: group == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
              children: [
                if (isManager) ...[
                  Text(l.t('groupInfo'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 10),
                  _input(l.t('groupName'), _name),
                  const SizedBox(height: 10),
                  _input(l.t('groupDesc'), _desc, maxLines: 3),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      onPressed: () async {
                        await service.updateGroupSettings(widget.groupId,
                            name: _name.text.trim(),
                            description: _desc.text.trim());
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(l.t('savedOk'))));
                        }
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryRed,
                        minimumSize: const Size(0, 44),
                      ),
                      child: Text(l.t('saveAction')),
                    ),
                  ),
                  const Divider(height: 28),
                  Text(l.t('pinnedAnnouncement'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 10),
                  _input(l.t('announcementHint'), _announce, maxLines: 2),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton(
                      onPressed: () async {
                        await service.pinGroupItem(widget.groupId,
                            announcement: _announce.text.trim());
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(l.t('savedOk'))));
                        }
                      },
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 44)),
                      child: Text(l.t('pinAnnouncement')),
                    ),
                  ),
                  const Divider(height: 28),
                ],
                Text('${l.t('membersLabel')} (${members.length})',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 8),
                ...members.map((m) => _memberTile(context, ref, m, isOwner,
                    isManager, service)),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () async {
                    final uid = ref
                            .read(authRepositoryProvider)
                            .currentUser
                            ?.uid ??
                        '';
                    if (isOwner) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(l.t('ownerCantLeave'))));
                      return;
                    }
                    await service.leaveGroupV2(widget.groupId, uid);
                    if (context.mounted) {
                      context.go('/social');
                    }
                  },
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    foregroundColor: AppColors.primaryRed,
                    side: const BorderSide(color: AppColors.primaryRed),
                  ),
                  icon: const Icon(Icons.logout),
                  label: Text(l.t('leaveGroup')),
                ),
              ],
            ),
    );
  }

  Widget _input(String label, TextEditingController c, {int maxLines = 1}) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: AppColors.cardWhite,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.softBorder),
          ),
        ),
      );

  Widget _memberTile(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> m,
    bool isOwner,
    bool isManager,
    dynamic service,
  ) {
    final l = AppLocalizations.of(context);
    final uid = m['uid'] as String;
    final name = (m['displayName'] as String?) ?? 'Foodie';
    final role = (m['role'] as String?) ?? 'member';
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        radius: 20,
        backgroundColor: AppColors.softYellow,
        backgroundImage:
            m['photoUrl'] != null ? NetworkImage(m['photoUrl'] as String) : null,
        child: m['photoUrl'] == null
            ? const Text('😋', style: TextStyle(fontSize: 18))
            : null,
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(_roleLabel(l, role),
          style: const TextStyle(fontSize: 12, color: AppColors.mutedText)),
      trailing: (isManager && uid != myUid && role != 'owner')
          ? PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'remove') {
                  service.removeGroupMember(widget.groupId, uid);
                } else {
                  service.changeGroupRole(widget.groupId, uid, v);
                }
              },
              itemBuilder: (_) => [
                if (isOwner)
                  PopupMenuItem(value: 'admin', child: Text(l.t('roleAdmin'))),
                if (isOwner)
                  PopupMenuItem(
                      value: 'member', child: Text(l.t('roleMember'))),
                if (isOwner)
                  PopupMenuItem(
                      value: 'viewer', child: Text(l.t('roleViewer'))),
                PopupMenuItem(
                    value: 'remove',
                    child: Text(l.t('removeMember'),
                        style:
                            const TextStyle(color: AppColors.primaryRed))),
              ],
            )
          : null,
    );
  }

  String _roleLabel(AppLocalizations l, String role) => switch (role) {
        'owner' => l.t('roleOwner'),
        'admin' => l.t('roleAdmin'),
        'viewer' => l.t('roleViewer'),
        _ => l.t('roleMember'),
      };
}
