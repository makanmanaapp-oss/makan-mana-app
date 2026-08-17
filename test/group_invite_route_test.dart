// PROMPT 2.2A — group_invite notification destination fix.
//
// Verifies the exact routing contract that fixes "content unavailable": a
// group_invite notification routes to the EXISTING Groups-tab invite inbox
// (invitee-only), never into the private group, and never null. Source-guards
// the producer identity + router wiring so the contract cannot silently break.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/notifications/notification_destination.dart';
import 'package:makan_mana/features/social/feed_screen.dart';

void main() {
  group('group_invite destination resolver (Part 4/5/6)', () {
    String? r(String type, {String? id}) =>
        NotificationDestinationResolver.resolve(type: type, destinationId: id);

    test('group_invite routes to the Groups-tab invite inbox (not null)', () {
      expect(r('group_invite', id: 'invite1'), '/social?tab=groups');
      expect(r('groupInvite', id: 'invite1'), '/social?tab=groups');
    });

    test('invitee is NEVER routed into the private group (/groups/{id})', () {
      final route = r('group_invite', id: 'grp1');
      expect(route, isNotNull);
      expect(route!.startsWith('/groups/'), isFalse);
    });

    test('regression: group_invite_accepted still opens the group', () {
      expect(r('group_invite_accepted', id: 'g1'), '/groups/g1');
      expect(r('groupInviteAccepted', id: 'g1'), '/groups/g1');
    });

    test('regression: social reaction/comment/follow destinations unchanged', () {
      expect(r('social_reaction', id: 'p1'), '/social/post/p1');
      expect(r('social_comment', id: 'p2'), '/social/post/p2');
      expect(r('social_follow', id: 'u1'), '/u/u1');
    });
  });

  group('FeedScreen deep-link tab mapping', () {
    test('groups tab index = 4, unknown → 0 (safe default)', () {
      expect(FeedScreen.tabIndexFor('groups'), 4);
      expect(FeedScreen.tabIndexFor('group'), 4);
      expect(FeedScreen.tabIndexFor(null), 0);
      expect(FeedScreen.tabIndexFor('whatever'), 0);
    });
  });

  group('source-guards (contract cannot silently regress)', () {
    test('resolver routes group_invite to the invite inbox (not null)', () {
      final src =
          File('lib/core/notifications/notification_destination.dart').readAsStringSync();
      // the corrected route is present and precedes the accepted/group cases
      expect(src.contains('/social?tab=groups'), isTrue);
      final invIdx = src.indexOf('group_invite');
      final acceptedIdx = src.indexOf('group_invite_accepted');
      final routeIdx = src.indexOf('/social?tab=groups');
      expect(invIdx >= 0 && routeIdx > invIdx && routeIdx < acceptedIdx, isTrue,
          reason: 'group_invite case returns the inbox route');
    });

    test('router forwards the ?tab= param to FeedScreen.initialTab', () {
      final src = File('lib/app/router.dart').readAsStringSync();
      expect(src.contains("FeedScreen.tabIndexFor(state.uri.queryParameters['tab'])"),
          isTrue);
    });

    test('producer writes invite id as entityId + groupId as parentEntityId', () {
      final src =
          File('functions/src/callable/groupInvites.ts').readAsStringSync();
      // entityId must be the invite doc id (authoritative invite identifier)
      expect(src.contains('entityId: inviteRef.id'), isTrue);
      expect(src.contains('parentEntityId: groupId'), isTrue);
      expect(src.contains('type: "group_invite"'), isTrue);
    });
  });
}
