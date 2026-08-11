// HOTFIX 4.3 — Public non-member SAFE preview + no premature member-only reads.
//
// The permission-denied red screen came from the Group Hub doing a DIRECT get
// on groups/{id}/members/{uid} (myGroupRoleProvider) before membership was
// known — denied by rules for a non-member. These guards lock the fixed access
// model: membership is derived from the SAFE collectionGroup source
// (myGroupIdsProvider), a public non-member gets a preview that watches NO
// member-only provider, and member-only providers/controls appear only in the
// member branch.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final hub =
      File('lib/features/groups/group_hub_screen.dart').readAsStringSync();
  final providers =
      File('lib/features/groups/group_providers.dart').readAsStringSync();

  // Split the build: everything up to the public-preview return is the
  // "pre-membership" region; it must not touch member-only providers.
  final previewReturn = hub.indexOf('return _PublicPreview(group: group)');
  final preMembership = hub.substring(0, previewReturn);
  final memberBranch = hub.substring(previewReturn);

  group('Access-mode gating (Parts 2-7)', () {
    test('membership derived from SAFE myGroupIdsProvider, not a member-doc get',
        () {
      expect(preMembership.contains('ref.watch(myGroupIdsProvider)'), isTrue);
      expect(
          preMembership.contains(
              '(myIdsAsync.value ?? const <String>{}).contains(groupId)'),
          isTrue);
    });

    test('NO member-only provider watched before membership is known (Part 6)',
        () {
      // The forbidden direct member-doc read + other member-gated providers
      // must NOT appear before the public-preview branch.
      expect(preMembership.contains('ref.watch(myGroupRoleProvider'), isFalse,
          reason: 'must not GET members/{uid} before membership known');
      expect(preMembership.contains('groupQuickStatsProvider'), isFalse);
      expect(preMembership.contains('groupMembersProvider'), isFalse);
      expect(preMembership.contains('groupFeedProvider'), isFalse);
    });

    test('public non-member → preview; member-only providers only after (P4)',
        () {
      expect(hub.contains('if (!isMember) return _PublicPreview(group: group)'),
          isTrue);
      // role + stats read only in the member branch (after the preview return).
      expect(memberBranch.contains('ref.watch(myGroupRoleProvider(groupId))'),
          isTrue);
      expect(memberBranch.contains('ref.watch(groupQuickStatsProvider('),
          isTrue);
    });

    test('async membership unresolved → safe wait, no assumption (Part 7)', () {
      expect(preMembership.contains('!myIdsAsync.hasValue'), isTrue);
    });
  });

  group('Public preview content = public-readable only (Parts 3/8/9/10)', () {
    final preview = hub.substring(hub.indexOf('class _PublicPreview'),
        hub.indexOf('class _GroupUnavailable'));
    test('shows name/emoji/privacy/description/memberCount + Join', () {
      expect(preview.contains('g.emoji'), isTrue);
      expect(preview.contains('g.name'), isTrue);
      expect(preview.contains('GroupPrivacyBadge(isPrivate: g.isPrivate)'),
          isTrue);
      expect(preview.contains('g.description'), isTrue);
      expect(preview.contains('g.memberCount'), isTrue);
      expect(preview.contains("l.t('joinGroup')"), isTrue);
    });
    test('does NOT read members / posts / polls / status / Tong-Tong', () {
      for (final banned in const [
        'groupMembersProvider',
        'groupFeedProvider',
        'groupPollsProvider',
        'groupStatusProvider',
        'groupBillsProvider',
        'myGroupRoleProvider',
      ]) {
        expect(preview.contains(banned), isFalse,
            reason: 'preview must not read $banned');
      }
    });
    test('does NOT show Leave / Invite / owner-admin controls (P6/7/8)', () {
      expect(preview.contains('leaveGroup'), isFalse);
      expect(preview.contains('inviteMembers'), isFalse);
      expect(preview.contains('settings'), isFalse);
      expect(preview.contains('dangerZone'), isFalse);
    });
  });

  group('Join transition + unavailable states (Parts 5/11/12)', () {
    test('Join uses authoritative joinGroupV2 + refreshes membership', () {
      expect(hub.contains('joinGroupV2(widget.group.id)'), isTrue);
      expect(hub.contains('ref.invalidate(groupProvider(widget.group.id))'),
          isTrue);
    });
    test('private-non-member / deleted → friendly unavailable (not member)', () {
      expect(hub.contains('if (group == null || group.isDeleted) return '
          '_GroupUnavailable()'), isTrue);
    });
  });

  group('Error isolation + no raw error (Parts 11/12/14)', () {
    test('myGroupRoleProvider degrades safely on denial (handleError)', () {
      final role = providers.substring(
          providers.indexOf('myGroupRoleProvider'),
          providers.indexOf('groupPollsProvider'));
      expect(role.contains('.handleError('), isTrue);
    });
    test('no raw Firebase exception rendered in group hub', () {
      expect(hub.contains(r"Text('$e"), isFalse);
      expect(hub.contains(r'😕 $e'), isFalse);
    });
  });

  group('Account-switch scoping (Part 13)', () {
    test('membership source is auth-scoped (myGroupIdsProvider)', () {
      final social =
          File('lib/features/social/social_providers.dart').readAsStringSync();
      final mine = social.substring(social.indexOf('myGroupIdsProvider'));
      expect(mine.contains('ref.watch(authRepositoryProvider)'), isTrue);
    });
  });
}
