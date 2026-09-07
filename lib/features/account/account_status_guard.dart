import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../home/home_palette.dart';
import '../social/social_providers.dart';

/// PHASE 1C-A1 / 1C-A1.1 — canonical client-side account-status enforcement.
///
/// `accountStatus` is a SERVER-ONLY moderation field (firestore.rules
/// protectedUserFields) written exclusively by the trusted
/// controlCenterUserAdminBridge. "A suspension is meaningless if the app ignores
/// it": this is the single authoritative session guard, applied once at the
/// AppShell level rather than scattered across screens.
///
/// Deliberate 4-state model (from the live UID-scoped [myUserDocProvider]):
/// - LOADING   → doc not yet resolved (cold first load).
/// - ACTIVE    → explicit "active" or legacy/missing status (backward-compatible).
/// - SUSPENDED → explicit "suspended" → the shell is locked.
/// - ERROR     → the doc stream errored (e.g. Firestore transiently unavailable).
///
/// Enforcement policy: **SUSPENDED locks; LOADING/ERROR/ACTIVE pass through
/// (fail-open).** Rationale: (a) never introduce a permanent loading/error trap
/// that locks a legitimate user out on a transient read; (b) the brief pre-resolve
/// window is authoritatively backstopped SERVER-SIDE by `requireActiveAuth`
/// (suspended callable mutations are rejected regardless of the UI). Because the
/// provider is a live UID-scoped listener, an UNSUSPEND propagates automatically
/// (no manual cache clear), and an account switch yields a fresh status.
enum AccountStatusState { loading, active, suspended, error }

final accountStatusStateProvider = Provider<AccountStatusState>((ref) {
  return ref.watch(myUserDocProvider).when(
        loading: () => AccountStatusState.loading,
        error: (_, __) => AccountStatusState.error,
        data: (doc) => doc?['accountStatus'] == 'suspended'
            ? AccountStatusState.suspended
            : AccountStatusState.active,
      );
});

/// Convenience for the AppShell gate: only an explicit suspended state locks.
final accountSuspendedProvider = Provider<bool>((ref) {
  return ref.watch(accountStatusStateProvider) == AccountStatusState.suspended;
});

/// Full-screen block shown to a suspended account. No app navigation is exposed;
/// the only action is to sign out.
class SuspendedAccountScreen extends ConsumerWidget {
  const SuspendedAccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline, size: 56, color: palette.subtext),
                const SizedBox(height: 16),
                Text(
                  l.t('accountSuspendedTitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: palette.text,
                      fontSize: 20,
                      fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Text(
                  l.t('accountSuspendedBody'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: palette.subtext, fontSize: 14, height: 1.4),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () => _logout(context, ref),
                  icon: const Icon(Icons.logout),
                  label: Text(l.t('logout')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final uid = ref.read(currentUidProvider);
    await ref.read(notificationServiceProvider).detach(uid);
    await ref.read(locationServiceProvider).clearPersistedLocation(uid: uid);
    await ref.read(authRepositoryProvider).signOut();
    await ref.read(appPrefsProvider).setDevLoggedIn(false);
    if (context.mounted) context.go(RoutePaths.login);
  }
}
