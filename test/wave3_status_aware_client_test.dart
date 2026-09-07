// WAVE 3 GATE 3G — the status-aware PRODUCTION CLIENT release candidate.
//
// The final Wave 3 lifecycle rules reject a LIST query outright if it could
// return a document the rules would deny. A client whose feed/comment queries
// are not lifecycle-constrained therefore does not degrade under those rules —
// it loses the surface entirely. This suite locks the contract that must hold
// BEFORE the final rules may be deployed.
//
// It also locks the notification mark-read payload: the previously shipped
// client wrote {isRead, readAt} only, which the LIVE rule denies for the 702
// production notifications stored with status 'unread'.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String read(String path) =>
      File(path).readAsStringSync().replaceAll('\r\n', '\n');

  /// Source with comments stripped, so prose can never satisfy an assertion.
  String code(String src) => src
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .replaceAll(RegExp(r'^[ \t]*///.*$', multiLine: true), ' ')
      .replaceAll(RegExp(r'^[ \t]*//.*$', multiLine: true), ' ');

  /// The body of a top-level `final <name> = ...;` provider declaration, up to
  /// the closing `});` that ends it.
  String provider(String src, String name) {
    final i = src.indexOf('final $name =');
    expect(i, greaterThan(-1), reason: 'provider $name not found');
    final end = src.indexOf('\n});', i);
    expect(end, greaterThan(i), reason: 'could not delimit $name');
    return src.substring(i, end);
  }

  /// The body of a method `Future<void> <name>(` up to its closing brace.
  String method(String src, String name) {
    final i = src.indexOf(name);
    expect(i, greaterThan(-1), reason: 'method $name not found');
    var depth = 0;
    var started = false;
    for (var j = src.indexOf('{', i); j < src.length; j++) {
      if (src[j] == '{') {
        depth++;
        started = true;
      } else if (src[j] == '}') {
        depth--;
        if (started && depth == 0) return src.substring(i, j + 1);
      }
    }
    fail('could not delimit method $name');
  }

  late String social;
  late String notif;

  setUp(() {
    social = code(read('lib/features/social/social_providers.dart'));
    notif = code(read('lib/features/notifications/notification_providers.dart'));
  });

  // ── A. STATUS-AWARE CONSUMER QUERIES ──────────────────────────────────────

  group('A. feed list queries are lifecycle-constrained', () {
    const statusConstraint =
        "where('status', isEqualTo: kPostStatusActive)";

    test('1. every NON-OWNER feed list constrains status', () {
      for (final name in [
        'publicFeedProvider',
        'followingFeedProvider',
        'trendingFeedProvider',
        'groupFeedProvider',
      ]) {
        expect(provider(social, name), contains(statusConstraint),
            reason: '$name returns other users\' posts and MUST constrain '
                'status, or the whole query is rejected by the final rules');
      }
    });

    test('2. another user\'s profile constrains status; own profile does not',
        () {
      final body = provider(social, 'userPublicPostsProvider');
      expect(body, contains('isOwnProfile'));
      expect(body, contains(statusConstraint));
      // The own-profile branch must NOT carry the constraint: rules let an
      // author read their own history, and filtering here would hide the
      // owner's own hidden posts from the owner.
      final ownBranch = body.substring(
          body.indexOf('isOwnProfile'), body.indexOf(statusConstraint));
      expect(ownBranch, contains("base.where('groupId', isNull: true)"));
    });

    test('3. OWN-content lists are uid-bound, which is what makes them safe',
        () {
      // myPostsProvider / myCommentsProvider are deliberately unconstrained.
      // That is only admissible because the rules allow an author to read
      // their own documents — which in turn is only true if the query is
      // bound to the CURRENT user. Losing that binding would break them.
      for (final name in ['myPostsProvider', 'myCommentsProvider']) {
        final body = provider(social, name);
        expect(body, contains('authRepositoryProvider'));
        expect(body, contains("currentUser?.uid ?? ''"));
        expect(body, contains('uid.isEmpty'));
        expect(body, contains("where('authorUid', isEqualTo: uid)"),
            reason: '$name must be bound to the signed-in uid');
      }
    });
  });

  group('B. comment queries are lifecycle-constrained', () {
    test('4. the normal thread query constrains status', () {
      final body = provider(social, 'commentsProvider');
      expect(body, contains("where('status', isEqualTo: kCommentStatusActive)"));
      expect(body, contains("collection('comments')"));
    });

    test('5. public replies are fetched by GET and skip denied items', () {
      final body = provider(social, 'userPublicRepliesProvider');
      // The list comes from the id-only index, not from a comments LIST query,
      // so there is no unconstrained collection-group list to be rejected.
      expect(body, contains("collection('public_reply_activity')"));
      expect(body, contains('.doc(commentId)'));
      expect(body, contains('catch'),
          reason: 'a GET denied by rules must be skipped, not surfaced');
    });

    test('6. the lifecycle constants are the real values', () {
      expect(social, contains("const kPostStatusActive = 'active'"));
      expect(social, contains("const kCommentStatusActive = 'active'"));
    });
  });

  // ── C. NOTIFICATION MARK-READ PAYLOAD ─────────────────────────────────────

  group('C. notification mark-read writes the truthful lifecycle state', () {
    /// The exact set of document keys a payload writes.
    Set<String> writtenKeys(String body) => RegExp(r"'(\w+)':")
        .allMatches(body)
        .map((m) => m.group(1)!)
        .toSet();

    test('7. markRead writes status = read', () {
      final body = method(notif, 'Future<void> markRead(');
      expect(body, contains("'status': kNotificationStatusRead"));
      expect(body, contains("'isRead': true"));
      expect(body, contains("'readAt': FieldValue.serverTimestamp()"));
      expect(notif, contains("const kNotificationStatusRead = 'read'"));
    });

    test('8. markAllRead writes the SAME set as markRead', () {
      final one = writtenKeys(method(notif, 'Future<void> markRead('));
      final all = writtenKeys(method(notif, 'Future<void> markAllRead('));
      expect(one, {'isRead', 'readAt', 'status'});
      expect(all, equals(one),
          reason: 'the batch path must not diverge from the single path');
    });

    test('9. the write set is NOT broadened beyond the rules allowlist', () {
      // Firestore rules allow only these keys to change on a notification.
      const allowed = {'isRead', 'readAt', 'openedAt', 'status'};
      for (final name in [
        'Future<void> markRead(',
        'Future<void> markAllRead(',
      ]) {
        final keys = writtenKeys(method(notif, name));
        expect(keys.difference(allowed), isEmpty,
            reason: '$name writes a field outside the rules allowlist');
      }
    });

    test('10. no arbitrary status value can be written', () {
      // Only the constant is ever used as the status value; no literal
      // 'unread'/'archived'/etc is written anywhere in the client.
      for (final name in [
        'Future<void> markRead(',
        'Future<void> markAllRead(',
      ]) {
        final body = method(notif, name);
        final values = RegExp(r"'status':\s*([^,\n]+)")
            .allMatches(body)
            .map((m) => m.group(1)!.trim())
            .toSet();
        expect(values, {'kNotificationStatusRead'});
      }
      expect(notif.contains("'status': 'unread'"), isFalse);
    });

    test('11. mark-read is idempotent — unconditional merge, no read-modify',
        () {
      for (final name in [
        'Future<void> markRead(',
        'Future<void> markAllRead(',
      ]) {
        final body = method(notif, name);
        // A merge write of a fixed payload is idempotent by construction:
        // re-running it on an already-read document produces the same state.
        expect(body, contains('SetOptions(merge: true)'));
        // It must not branch on the current value, which would make the
        // outcome depend on a racing read.
        expect(body.contains('.get()'), isFalse,
            reason: '$name must not read-modify-write');
      }
    });
  });

  // ── D. RELEASE INVARIANTS ─────────────────────────────────────────────────

  group('D. release invariants', () {
    test('12. versionCode is strictly newer than Play production (13)', () {
      final v = RegExp(r'^version:\s*(\d+\.\d+\.\d+)\+(\d+)', multiLine: true)
          .firstMatch(read('pubspec.yaml'));
      expect(v, isNotNull, reason: 'pubspec version must be name+code');
      final code = int.parse(v!.group(2)!);
      expect(code, greaterThan(13),
          reason: 'Play production is versionCode 13; an upload must exceed it');
      // Guard against the historical 0.1.7+9 value reappearing.
      expect(code, isNot(9));
    });

    test('13. prod and qa application identities are unchanged', () {
      final gradle = read('android/app/build.gradle.kts');
      expect(gradle, contains('applicationId = "com.makanmana.apps"'));
      final qa = gradle.substring(gradle.indexOf('create("qa")'));
      expect(qa, contains('applicationIdSuffix = ".qa"'));
      final prod = gradle.substring(
          gradle.indexOf('create("prod")'), gradle.indexOf('create("qa")'));
      expect(prod.contains('applicationIdSuffix'), isFalse,
          reason: 'prod must carry NO suffix');
      // versionCode/Name come from pubspec, so the test above governs the AAB.
      expect(gradle, contains('versionCode = flutter.versionCode'));
      expect(gradle, contains('versionName = flutter.versionName'));
    });

    test('14. the canonical Restaurant Detail default stays OFF in production',
        () {
      expect(
        read('lib/features/restaurant/canonical/restaurant_detail_flags.dart'),
        contains('canonicalRestaurantDetailEnabled = false'),
      );
      // QA activation must be gated on BOTH a debug build and the qa flavor,
      // so a production release can never switch it on.
      final qa = code(
          read('lib/features/place_migration/qa_canonical_activation.dart'));
      expect(qa, contains('isDebugBuild'));
      expect(qa, contains('appFlavor'));
      expect(qa, contains("'qa'"));
    });
  });
}
