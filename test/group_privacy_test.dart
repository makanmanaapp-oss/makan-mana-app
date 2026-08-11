// FIX 3 — Group privacy + invite + delete (client structural regression).
//
// Security enforcement itself is proven server-side (rules_test/groups_test.mjs
// + groupInvites.ts). These tests cover the client model/compat + wiring: the
// visibility/status model, invite model, discovery filtering, and that the
// UI/service route through the server-authoritative callables.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/groups/group_providers.dart';

void main() {
  group('GroupData — visibility/status model + legacy compat', () {
    test('legacy group (no privacy/status) → public + active (no lockout)', () {
      const g = GroupData(id: 'g', data: {'name': 'Legacy'});
      expect(g.privacy, 'public');
      expect(g.isPrivate, isFalse);
      expect(g.status, 'active');
      expect(g.isDeleted, isFalse);
    });

    test('private + deleted flags', () {
      const g = GroupData(
          id: 'g', data: {'privacy': 'private', 'status': 'deleted'});
      expect(g.isPrivate, isTrue);
      expect(g.isDeleted, isTrue);
    });

    test('public active group', () {
      const g = GroupData(id: 'g', data: {'privacy': 'public'});
      expect(g.isPrivate, isFalse);
      expect(g.isDeleted, isFalse);
    });
  });

  group('GroupInvite model', () {
    test('getters', () {
      const inv = GroupInvite(id: 'i', data: {
        'groupId': 'g1',
        'groupName': 'Foodies',
        'groupEmoji': '🍜',
        'inviterUid': 'alice',
        'status': 'pending',
      });
      expect(inv.groupId, 'g1');
      expect(inv.groupName, 'Foodies');
      expect(inv.inviterUid, 'alice');
      expect(inv.status, 'pending');
    });
  });

  group('source guards — client wired to server-authoritative paths', () {
    final providers =
        File('lib/features/groups/group_providers.dart').readAsStringSync();
    final service =
        File('lib/core/services/social_service.dart').readAsStringSync();
    final feed = File('lib/features/social/feed_screen.dart').readAsStringSync();
    final settings = File('lib/features/groups/group_settings_screen.dart')
        .readAsStringSync();

    test('discovery lists only PUBLIC, filters deleted', () {
      expect(providers.contains("where('privacy', isEqualTo: 'public')"),
          isTrue);
      expect(providers.contains("g.data['status'] != 'deleted'"), isTrue);
    });

    test('FIX 3.1R: discovery re-subscribes on account switch + degrades safely',
        () {
      // Root-cause of the cached permission-denied on logout→login: the
      // provider must WATCH the reactive uid so it rebuilds on auth change
      // (fresh listen with a valid token), and must NOT collapse the whole
      // Groups tab on a transient error during auth propagation.
      final discover = providers.substring(
          providers.indexOf('discoverGroupsProvider'),
          providers.indexOf('myGroupInvitesProvider'));
      expect(discover.contains('ref.watch(currentUidProvider)'), isTrue,
          reason: 'discovery must watch reactive uid to re-subscribe on switch');
      expect(discover.contains('uid.isEmpty'), isTrue,
          reason: 'must not query while signed out');
      expect(discover.contains('.handleError('), isTrue,
          reason: 'transient auth-switch deny must not collapse the tab');
    });

    test('FIX 3.1R: My Groups built from real membership (incl PRIVATE), '
        'not the public-only discovery', () {
      // Regression: private groups you own/belong to must appear in My Groups.
      // Hub must resolve My Groups from myGroupIds + per-id group doc
      // (member-readable even when private), and filter soft-deleted.
      expect(feed.contains('ref.watch(groupProvider(id)).value'), isTrue,
          reason: 'My Groups must load each membership group doc by id');
      expect(feed.contains('if (g != null && !g.isDeleted) mine.add(g)'),
          isTrue,
          reason: 'deleted/unreadable groups filtered from My Groups');
      // HOTFIX 4.2: My Groups derived from membership, NOT from the public
      // discovery list (discovery is now search-only). See groups_ux_test.
      expect(feed.contains('ref.watch(myGroupIdsProvider)'), isTrue);
    });

    test('my invites query = inviteeUid==me AND pending', () {
      expect(providers.contains("where('inviteeUid', isEqualTo: uid)"), isTrue);
      expect(providers.contains("where('status', isEqualTo: 'pending')"),
          isTrue);
    });

    test('service routes through server callables', () {
      for (final fn in const [
        "'inviteToGroup'",
        "'respondGroupInvite'",
        "'cancelGroupInvite'",
        "'deleteGroupV2'",
      ]) {
        expect(service.contains(fn), isTrue, reason: 'service missing $fn');
      }
    });

    test('create dialog offers public/private', () {
      expect(
          feed.contains(
              'createGroupV2(name: result.name, privacy: result.privacy)'),
          isTrue);
      expect(feed.contains('_privacyOption('), isTrue);
    });

    test('pending invites accept/decline via respondGroupInvite', () {
      expect(feed.contains('respondGroupInvite(inv.id, accept: true)'), isTrue);
      expect(feed.contains('respondGroupInvite(inv.id, accept: false)'),
          isTrue);
    });

    test('delete group is OWNER-ONLY (hidden, not disabled) + confirm', () {
      // Danger zone rendered only under `if (isOwner)`.
      expect(settings.contains('if (isOwner) ...['), isTrue);
      expect(settings.contains('_confirmDelete('), isTrue);
      expect(settings.contains('deleteGroupV2(widget.groupId)'), isTrue);
      expect(settings.contains("l.t('dangerZone')"), isTrue);
    });

    test('deleted group shows unavailable state', () {
      expect(settings.contains('group.isDeleted'), isTrue);
      expect(settings.contains("l.t('groupDeletedBody')"), isTrue);
    });
  });

  group('source guards — backend + rules enforce security', () {
    final fn = File('functions/src/callable/groupInvites.ts').readAsStringSync();
    final rules = File('firestore.rules').readAsStringSync();

    test('invite accept checks recipient == auth (no UID forgery)', () {
      expect(fn.contains('inv.inviteeUid !== uid'), isTrue);
    });
    test('invite respond is idempotent (pending guard)', () {
      expect(fn.contains('inv.status !== "pending"'), isTrue);
    });
    test('delete group is owner-only', () {
      expect(fn.contains('!== "owner"'), isTrue);
      expect(fn.contains('status: "deleted"'), isTrue); // soft delete
    });
    test('deleted group rejects new members/invites', () {
      expect(fn.contains('status === "deleted"'), isTrue);
    });
    test('rules: group_invites read = recipient/inviter; write server-only', () {
      expect(rules.contains('match /group_invites/{inviteId}'), isTrue);
      expect(
          rules.contains(
              'resource.data.inviteeUid == request.auth.uid'),
          isTrue);
      expect(
          rules.contains('allow create, update, delete: if false;'), isTrue);
    });
    test('rules: private group doc read = member-only (legacy=public)', () {
      expect(
          rules.contains(
              "resource.data.get('privacy', 'public') != 'private'"),
          isTrue);
    });
  });
}
