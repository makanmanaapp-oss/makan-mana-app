import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';
import '../social/social_ui.dart';
import 'group_providers.dart';
import 'invite_members_sheet.dart';

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
  bool _uploadingPhoto = false; // HOTFIX 4.5: elak upload berganda

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

    // FIX 3: grup dipadam → keadaan tidak tersedia (bukan tetapan).
    if (group != null && group.isDeleted) {
      return Scaffold(
        appBar: AppBar(title: Text(l.t('groupDeleted'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('🗑️', style: TextStyle(fontSize: 52)),
                const SizedBox(height: 14),
                Text(l.t('groupDeletedBody'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: context.mm.onCardMuted,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.t('groupSettings'))),
      body: group == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
              children: [
                // HOTFIX 4.5: FOTO GRUP (owner/admin sahaja). Ahli biasa tidak
                // nampak kawalan ini; kuasa sebenar dikuatkuasa Storage rules +
                // updateGroupSettings (owner/admin).
                if (isManager) ...[
                  Text(l.t('groupPhoto'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      GroupAvatarResolved(
                          groupId: group.id,
                          emoji: group.emoji,
                          size: 64),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: _uploadingPhoto
                                  ? null
                                  : () => _pickGroupPhoto(context, service),
                              style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(0, 44)),
                              icon: _uploadingPhoto
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))
                                  : const Icon(Icons.photo_camera_outlined),
                              label: Text(group.hasImage
                                  ? l.t('changePhoto')
                                  : l.t('uploadPhoto')),
                            ),
                            if (group.hasImage)
                              TextButton.icon(
                                onPressed: _uploadingPhoto
                                    ? null
                                    : () =>
                                        _removeGroupPhoto(context, service),
                                icon: const Icon(Icons.delete_outline,
                                    color: AppColors.primaryRed),
                                label: Text(l.t('removePhoto'),
                                    style: const TextStyle(
                                        color: AppColors.primaryRed)),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 28),
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
                // FIX 3: keterlihatan grup (manager tukar public/private).
                if (isManager) ...[
                  Row(
                    children: [
                      Icon(group.isPrivate ? Icons.lock_outline : Icons.public,
                          size: 18, color: context.mm.onCardMuted),
                      const SizedBox(width: 8),
                      Text(
                        group.isPrivate
                            ? l.t('groupPrivate')
                            : l.t('groupPublic'),
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15),
                      ),
                      const Spacer(),
                      Switch(
                        value: group.isPrivate,
                        activeThumbColor: AppColors.primaryRed,
                        onChanged: (v) async {
                          await service.updateGroupSettings(widget.groupId,
                              privacy: v ? 'private' : 'public');
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(l.t('savedOk'))));
                          }
                        },
                      ),
                    ],
                  ),
                  Text(
                    group.isPrivate
                        ? l.t('groupPrivateDesc')
                        : l.t('groupPublicDesc'),
                    style: TextStyle(
                        fontSize: 12, color: context.mm.onCardMuted),
                  ),
                  const SizedBox(height: 14),
                  // HOTFIX 4.6: seksyen jemput yang disengajakan.
                  Text(l.t('inviteMembers').toUpperCase(),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                          letterSpacing: 0.4)),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          showInviteMembersSheet(context, widget.groupId),
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 46)),
                      icon: const Icon(Icons.person_add_alt_1),
                      label: Text(l.t('invitePeople')),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(l.t('invitePeopleBody'),
                        style: TextStyle(
                            fontSize: 12, color: context.mm.onCardMuted)),
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => _manageLinkDialog(context),
                      icon: const Icon(Icons.link, size: 18),
                      label: Text(l.t('manageInviteLink')),
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
                // FIX 3: Zon Bahaya — Padam Grup (OWNER SAHAJA; disembunyikan
                // sepenuhnya utk bukan-owner, bukan sekadar dilumpuhkan).
                if (isOwner) ...[
                  const Divider(height: 8),
                  Text(l.t('dangerZone'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: AppColors.primaryRed)),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => _confirmDelete(context, ref, service),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      foregroundColor: AppColors.primaryRed,
                      side: const BorderSide(color: AppColors.primaryRed),
                    ),
                    icon: const Icon(Icons.delete_outline),
                    label: Text(l.t('deleteGroup')),
                  ),
                  const SizedBox(height: 24),
                ],
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
                  // FIX 4 Part 13: Leave = aksi keahlian PERIBADI (neutral),
                  // JANGAN sama macam Delete (destructive merah). Distinction
                  // kuat: Delete merah dalam Danger Zone, Leave neutral.
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    foregroundColor: context.mm.onCardMuted,
                    side: BorderSide(
                        color: context.mm.onCardMuted.withValues(alpha: 0.4)),
                  ),
                  icon: const Icon(Icons.logout),
                  label: Text(l.t('leaveGroup')),
                ),
              ],
            ),
    );
  }

  /// HOTFIX 4.6: urus pautan jemputan selamat (owner/admin). Cipta pautan,
  /// HOTFIX 4.6A: buka helaian urus pautan (senarai + revoke + cipta baru).
  /// Firestore hanya simpan SHA-256(token) → UX jujur (lihat ManageInviteLinkSheet).
  Future<void> _manageLinkDialog(BuildContext context) =>
      showManageInviteLinkSheet(context, widget.groupId);

  /// FIX 3: sahkan + padam grup (owner). Soft delete di pelayan.
  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, dynamic service) async {
    final l = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(l.t('deleteGroupConfirm')),
        content: Text(l.t('deleteGroupWarn')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dctx, false),
              child: Text(l.t('cancelAction'))),
          FilledButton(
            onPressed: () => Navigator.pop(dctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.primaryRed),
            child: Text(l.t('deleteGroup')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await service.deleteGroupV2(widget.groupId);
      if (context.mounted) context.go('/social');
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  /// HOTFIX 4.5: pilih + muat naik foto grup (owner/admin). Picker mengecil
  /// (maxWidth 1024, quality 85) — tiada muat naik foto kamera penuh. Upload
  /// HOTFIX 4.5C Part 19 (ganti): server-mediated prepare→PUT→finalize ke assetId
  /// BARU. Imej lama kekal sehingga imej baru di-commit. Selepas berjaya, batal
  /// cache resolver supaya avatar segar. Ralat → snackbar mesra, fallback kekal.
  Future<void> _pickGroupPhoto(BuildContext context, dynamic service) async {
    final l = AppLocalizations.of(context);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _uploadingPhoto = true);
      await service.uploadGroupImageV2(widget.groupId, File(picked.path));
      ref.invalidate(groupImageUrlProvider(widget.groupId));
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('savedOk'))));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('photoUploadFailed'))));
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  /// HOTFIX 4.5C Part 15: keluarkan foto grup (server kosongkan metadata + padam
  /// objek) → fallback emoji serta-merta.
  Future<void> _removeGroupPhoto(BuildContext context, dynamic service) async {
    final l = AppLocalizations.of(context);
    setState(() => _uploadingPhoto = true);
    try {
      await service.removeGroupImageV2(widget.groupId);
      ref.invalidate(groupImageUrlProvider(widget.groupId));
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('photoUploadFailed'))));
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Widget _input(String label, TextEditingController c, {int maxLines = 1}) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: context.mm.card,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.mm.border),
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
            ? const Icon(Icons.person_outline,
                    size: 18, color: AppColors.darkText)
            : null,
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(_roleLabel(l, role),
          style: TextStyle(fontSize: 12, color: context.mm.onCardMuted)),
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
