// PHASE 1C-A1 — client account-status enforcement (guard) tests.
//
// Proves the single authoritative session guard: a server-suspended account
// (accountStatus=='suspended') is blocked and shown the suspended screen; an
// active/loading account passes through (fail-open).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/account/account_status_guard.dart';
import 'package:makan_mana/features/social/social_providers.dart';

Widget _harness(Map<String, dynamic>? userDoc) {
  return ProviderScope(
    overrides: [
      myUserDocProvider.overrideWith((ref) => Stream.value(userDoc)),
    ],
    child: const MaterialApp(
      locale: Locale('en'),
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: [Locale('en')],
      home: _Gated(),
    ),
  );
}

class _Gated extends ConsumerWidget {
  const _Gated();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(accountSuspendedProvider)) return const SuspendedAccountScreen();
    return const Scaffold(body: Center(child: Text('APP_CONTENT')));
  }
}

void main() {
  testWidgets('suspended account is blocked and sees the suspended screen',
      (tester) async {
    await tester.pumpWidget(_harness({'accountStatus': 'suspended'}));
    await tester.pumpAndSettle();
    expect(find.text('Account suspended'), findsOneWidget);
    expect(find.text('Log Out'), findsOneWidget);
    expect(find.text('APP_CONTENT'), findsNothing);
  });

  testWidgets('active account passes through the guard', (tester) async {
    await tester.pumpWidget(_harness({'accountStatus': 'active', 'displayName': 'X'}));
    await tester.pumpAndSettle();
    expect(find.text('APP_CONTENT'), findsOneWidget);
    expect(find.text('Account suspended'), findsNothing);
  });

  testWidgets('missing status fails open (not locked out)', (tester) async {
    await tester.pumpWidget(_harness({'displayName': 'X'}));
    await tester.pumpAndSettle();
    expect(find.text('APP_CONTENT'), findsOneWidget);
  });
}
