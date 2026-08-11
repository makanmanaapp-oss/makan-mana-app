// HOTFIX 4.6 — Smart invite + secure invite links (client + wiring).
// Server ranking/security is emulator/unit-tested in functions/; here we cover
// l10n completeness, deep-link route wiring, client service surface, and the
// Invite Members sheet rendering (following section + one-tap Invite state).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/constants/app_constants.dart';
import 'package:makan_mana/core/services/social_service.dart';
import 'package:makan_mana/features/groups/group_providers.dart';
import 'package:makan_mana/features/groups/invite_members_sheet.dart';
import 'package:makan_mana/features/social/social_providers.dart';

class _FakeSocial extends SocialService {
  _FakeSocial() : super(firebaseReady: false);
  final List<String> invited = [];
  @override
  Future<List<Map<String, dynamic>>> searchPeople(String g, String q) async => [
        {'uid': 'a', 'displayName': 'Ahmad', 'username': 'ahmad', 'state': 'invite', 'isFollowing': true},
        {'uid': 'm', 'displayName': 'Mimi', 'username': 'mimi', 'state': 'member', 'isFollowing': false},
        {'uid': 'p', 'displayName': 'Pendik', 'username': 'pendik', 'state': 'invited', 'isFollowing': false},
      ];
  @override
  Future<void> inviteToGroup(String g, String uid) async => invited.add(uid);
  int linkCalls = 0;
  @override
  Future<Map<String, dynamic>> createGroupInviteLink(String g, {int expiresInDays = 7, int? maxUses}) async {
    linkCalls++;
    return {'url': 'https://makanmana-c59f3.web.app/invite/TOK', 'linkId': 'lid', 'token': 'TOK'};
  }
}

/// createGroupInviteLink always fails (rate-limit/network) → Copy must show an
/// honest error, never a false "copied".
class _FailSocial extends SocialService {
  _FailSocial() : super(firebaseReady: false);
  @override
  Future<Map<String, dynamic>> createGroupInviteLink(String g, {int expiresInDays = 7, int? maxUses}) async =>
      throw Exception('resource-exhausted');
}

Widget _wrap(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: child),
      ),
    );

void main() {
  group('localization (Part 30) — all 4 languages', () {
    const keys = [
      'inviteMembers', 'searchPeople', 'following', 'invite', 'invited', 'member',
      'inviteByLink', 'copyLink', 'shareLink', 'manageInviteLink', 'createNewLink',
      'revokeLink', 'inviteLinkCopied', 'inviteLinkExpired', 'inviteLinkInvalid',
      'joinGroup', 'openGroup', 'groupInvite', 'invitedViaLink', 'signInToJoin',
      'invitePeople', 'noPeopleResults', 'shareGroupInviteText', 'backToHome',
      'closeAction',
    ];
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      test('$lang has all invite keys', () {
        final m = AppLocalizations.valuesForTesting(Locale(lang));
        for (final k in keys) {
          expect(m[k]?.isNotEmpty ?? false, isTrue, reason: '$lang missing $k');
        }
      });
    }
  });

  group('deep-link route + client surface (source guards)', () {
    final router = File('lib/app/router.dart').readAsStringSync();
    final svc = File('lib/core/services/social_service.dart').readAsStringSync();
    final preview =
        File('lib/features/groups/group_invite_preview_screen.dart').readAsStringSync();

    test('router registers /invite/:token → GroupInvitePreviewScreen (Part 13/35)', () {
      expect(router.contains("path: '/invite/:token'"), isTrue);
      expect(router.contains('GroupInvitePreviewScreen('), isTrue);
    });
    test('service exposes invite-link + people-search callables', () {
      for (final f in const [
        'searchPeopleV2',
        'createGroupInviteLinkV2',
        'getGroupInviteLinkInfoV2',
        'joinGroupByInviteLinkV2',
        'revokeGroupInviteLinkV2',
      ]) {
        expect(svc.contains("'$f'"), isTrue, reason: f);
      }
    });
    test('preview preserves pending token when logged out (Part 14)', () {
      expect(preview.contains('pendingInviteTokenProvider'), isTrue);
    });
    test('join goes through server callable, not direct membership (Part 8/15)', () {
      expect(preview.contains('joinGroupByInviteLink('), isTrue);
    });
  });

  group('backend security guards (source)', () {
    final core = File('functions/src/domain/groupInviteLink/inviteLinkV2.ts').readAsStringSync();
    final ctl = File('functions/src/callable/groupInviteLinkControl.ts').readAsStringSync();
    test('token stored as hash, never plaintext (Part 11)', () {
      expect(core.contains('hashToken(token)'), isTrue);
      expect(ctl.contains('createHash("sha256")'), isTrue);
    });
    test('join forces role member, never owner/admin (Part 15)', () {
      expect(core.contains('role: "member"'), isTrue);
    });
    test('default expiry present, permanent not silent (Part 18)', () {
      expect(core.contains('DEFAULT_EXPIRY_DAYS = 7'), isTrue);
    });
  });

  group('Invite Members sheet (Part 2/3/7/8)', () {
    testWidgets('following section + rows + state actions render', (tester) async {
      await tester.pumpWidget(_wrap(
        const InviteMembersSheet(groupId: 'g1'),
        overrides: [socialServiceProvider.overrideWithValue(_FakeSocial())],
      ));
      await tester.pump(); // resolve searchPeople future
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('Ahmad'), findsOneWidget);
      expect(find.text('@ahmad'), findsOneWidget);
      // state chips
      expect(find.text('Member'), findsOneWidget); // member row
      expect(find.text('Invited'), findsOneWidget); // pending row
      expect(find.widgetWithText(FilledButton, 'Invite'), findsWidgets); // invite action
    });

    testWidgets('tapping Invite sends server invite + row → Invited (Part 8)', (tester) async {
      final fake = _FakeSocial();
      await tester.pumpWidget(_wrap(
        const InviteMembersSheet(groupId: 'g1'),
        overrides: [socialServiceProvider.overrideWithValue(fake)],
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.widgetWithText(FilledButton, 'Invite').first);
      await tester.pump();
      expect(fake.invited, contains('a'));
    });
  });

  group('4.6A — login resume (Part 5/18)', () {
    testWidgets('postAuthRoute resumes pending invite; else home', (tester) async {
      late WidgetRef ref;
      await tester.pumpWidget(ProviderScope(
        child: Consumer(builder: (c, r, _) {
          ref = r;
          return const SizedBox();
        }),
      ));
      ref.read(pendingInviteTokenProvider.notifier).state = 'TOKZ';
      expect(postAuthRoute(ref, onboardingDone: true), '/invite/TOKZ');
      ref.read(pendingInviteTokenProvider.notifier).state = null;
      expect(postAuthRoute(ref, onboardingDone: true), RoutePaths.home);
      expect(postAuthRoute(ref, onboardingDone: false), RoutePaths.onboarding);
    });

    test('auth screens wire postAuthRoute; preview clears pending on terminal', () {
      for (final f in const ['login_screen', 'phone_login_screen', 'register_screen']) {
        final src = File('lib/features/auth/$f.dart').readAsStringSync();
        expect(src.contains('postAuthRoute(ref'), isTrue, reason: f);
      }
      final preview =
          File('lib/features/groups/group_invite_preview_screen.dart').readAsStringSync();
      // Part 6: no auto-join; pending cleared on terminal error + on join.
      expect(preview.contains('pendingInviteTokenProvider.notifier).state = null'), isTrue);
    });
  });

  group('4.6A — App Links config (Part 1-4/17)', () {
    final manifest =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    final assetlinks = File('public/.well-known/assetlinks.json').readAsStringSync();
    final firebaseJson = File('firebase.json').readAsStringSync();

    test('manifest has scoped autoVerify App Link (Part 2)', () {
      expect(manifest.contains('android:autoVerify="true"'), isTrue);
      expect(manifest.contains('android:host="makanmana-c59f3.web.app"'), isTrue);
      expect(manifest.contains('android:pathPrefix="/invite/"'), isTrue);
    });
    test('assetlinks.json declares package + fingerprints (Part 3)', () {
      expect(assetlinks.contains('com.makanmana.apps'), isTrue);
      expect(assetlinks.contains('delegate_permission/common.handle_all_urls'), isTrue);
      expect(assetlinks.contains('sha256_cert_fingerprints'), isTrue);
      // debug + upload fingerprints present
      expect(assetlinks.contains('ED:9A:AF:48'), isTrue);
      expect(assetlinks.contains('B9:64:7B:AA'), isTrue);
    });
    test('hosting serves assetlinks + /invite fallback (Part 4)', () {
      expect(firebaseJson.contains('/.well-known/assetlinks.json'), isTrue);
      expect(firebaseJson.contains('/invite/**'), isTrue);
      expect(firebaseJson.contains('/invite.html'), isTrue);
      // .well-known no longer blanket-ignored
      expect(firebaseJson.contains('"**/.*"'), isFalse);
    });
  });

  group('4.6A — backfill + rate-limit + link mgmt guards', () {
    final backfillCtl =
        File('functions/src/callable/peopleSearchBackfillControl.ts').readAsStringSync();
    final core = File('functions/src/domain/groupInviteLink/inviteLinkV2.ts').readAsStringSync();
    final sheet =
        File('lib/features/groups/invite_members_sheet.dart').readAsStringSync();

    test('backfill callable is admin-gated + write needs project confirm (Part 8)', () {
      expect(backfillCtl.contains('permission-denied'), isTrue);
      expect(backfillCtl.contains('confirm !== project'), isTrue);
      expect(backfillCtl.contains('dryRun = true'), isTrue);
    });
    test('rate limit: authz before rate + fixed window constants (Part 11)', () {
      expect(core.contains('RATE_MAX = 5'), isTrue);
      expect(core.contains('await loadManager(deps.db, groupId, uid);\n  await enforceCreateRate'),
          isTrue);
      expect(core.contains('resource-exhausted'), isTrue);
    });
    test('manage sheet: list + revoke; Copy/Share only for fresh session link (Part 12/13)', () {
      expect(sheet.contains('listGroupInviteLinks'), isTrue);
      expect(sheet.contains('_revoke('), isTrue);
      // Copy/Share are gated behind a freshly created (in-memory) token.
      expect(sheet.contains('if (_freshUrl != null)'), isTrue);
    });
  });

  group('4.6C — Copy Invite Link clipboard fix', () {
    late List<MethodCall> clip;
    bool failClipboard = false;
    setUp(() {
      clip = [];
      failClipboard = false;
      TestWidgetsFlutterBinding.ensureInitialized();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          if (failClipboard) throw PlatformException(code: 'fail');
          clip.add(call);
          return null;
        }
        if (call.method == 'Clipboard.getData') return <String, dynamic>{'text': ''};
        return null;
      });
    });
    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    test('isValidInviteUrl accepts full HTTPS invite URL, rejects non-URLs', () {
      expect(isValidInviteUrl('https://makanmana-c59f3.web.app/invite/TOK'), isTrue);
      expect(isValidInviteUrl(null), isFalse);
      expect(isValidInviteUrl(''), isFalse);
      expect(isValidInviteUrl('TOK'), isFalse); // token alone
      expect(isValidInviteUrl('5b5149ce23f1'), isFalse); // linkId/hash
      expect(isValidInviteUrl('groupId123'), isFalse);
      expect(isValidInviteUrl('http://makanmana-c59f3.web.app/invite/x'), isFalse); // not https
    });

    test('copyInviteUrlToClipboard writes the EXACT URL (Part 3/12.1)', () async {
      const url = 'https://makanmana-c59f3.web.app/invite/TOK';
      final ok = await copyInviteUrlToClipboard(url);
      expect(ok, isTrue);
      expect(clip.single.arguments['text'], url); // exact, complete URL
    });

    test('null/empty/hash URL NOT copied (Part 12.2/12.3/12.8)', () async {
      expect(await copyInviteUrlToClipboard(null), isFalse);
      expect(await copyInviteUrlToClipboard(''), isFalse);
      expect(await copyInviteUrlToClipboard('lid_hash_only'), isFalse);
      expect(clip, isEmpty); // never touched the clipboard
    });

    test('clipboard channel failure → returns false (Part 12.5)', () async {
      failClipboard = true;
      expect(await copyInviteUrlToClipboard('https://makanmana-c59f3.web.app/invite/TOK'), isFalse);
    });

    testWidgets('Copy tap copies exact URL + shows copied confirmation (Part 3/6)',
        (tester) async {
      final fake = _FakeSocial();
      await tester.pumpWidget(_wrap(
        const InviteMembersSheet(groupId: 'g1'),
        overrides: [socialServiceProvider.overrideWithValue(fake)],
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Copy link'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      // exact URL written to clipboard
      expect(clip.single.arguments['text'], 'https://makanmana-c59f3.web.app/invite/TOK');
      // visible inline confirmation URL rendered (robust fallback)
      expect(find.text('https://makanmana-c59f3.web.app/invite/TOK'), findsOneWidget);
    });

    testWidgets('create-link failure → error snackbar, no false success (Part 6)',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const InviteMembersSheet(groupId: 'g1'),
        overrides: [socialServiceProvider.overrideWithValue(_FailSocial())],
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Copy link'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(clip, isEmpty); // nothing copied on failure
      expect(find.text("Couldn't copy invite link. Try again."), findsOneWidget);
      // no false "copied" confirmation
      expect(find.byIcon(Icons.check_circle), findsNothing);
    });

    testWidgets('double-tap does not create multiple links (Part 7)', (tester) async {
      final fake = _FakeSocial();
      await tester.pumpWidget(_wrap(
        const InviteMembersSheet(groupId: 'g1'),
        overrides: [socialServiceProvider.overrideWithValue(fake)],
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      final btn = find.widgetWithText(OutlinedButton, 'Copy link');
      await tester.tap(btn);
      await tester.tap(btn); // rapid second tap while busy
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 60));
      // first tap created 1 link; second reuses cached URL → not >1 create
      expect(fake.linkCalls, lessThanOrEqualTo(1));
    });
  });
}
