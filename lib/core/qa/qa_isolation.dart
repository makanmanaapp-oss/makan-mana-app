/// QA backend isolation — the decision half, kept free of Firebase so it can be
/// tested directly.
///
/// WHY THIS EXISTS. `com.makanmana.apps.qa` is a separate Android package inside
/// the SAME Firebase project as production. A different package name isolates
/// nothing: a QA build that simply starts writes real documents into the
/// production `events` collection. That has already happened once.
///
/// THE RULE THIS ENFORCES. The QA flavour may run ONLY when it has been given a
/// verified isolated backend. There is deliberately no "carry on without it"
/// branch:
///
///   production flavour ............................. unchanged, never consults this
///   QA debug + verified isolated services .......... starts
///   QA debug with no isolation configuration ....... BLOCKED
///   QA debug with unreachable/mis-set emulators .... BLOCKED
///   QA release (or any release) .................... BLOCKED, and the dart-define
///                                                    cannot switch a release build
///
/// A fallback to production on error would defeat the whole point, so every path
/// here ends in either "allowed, against the isolated project" or "blocked".
library;

import 'package:flutter/foundation.dart';

/// The flavour name passed as `--flavor qa`.
const String kQaFlavorName = 'qa';

/// Where the isolated services are reached, supplied at build time:
/// `--dart-define=MM_QA_BACKEND_HOST=127.0.0.1`.
///
/// Empty when it was not supplied, which is a BLOCK for the QA flavour rather
/// than a licence to use production.
const String kQaBackendHost = String.fromEnvironment('MM_QA_BACKEND_HOST');

/// The project the isolated build talks to.
///
/// The `demo-` prefix is not cosmetic: the Firebase emulator suite treats such a
/// project as demo-only, and the SDKs cannot reach a real backend with it. It
/// must never be a real project id.
const String kQaIsolatedProjectId = 'demo-makanmana-qa';

/// The production project, named here ONLY so the gate can refuse to run
/// against it. Nothing in this file ever connects to it.
const String kProductionProjectId = 'makanmana-c59f3';

/// One emulated service the isolated build depends on.
@immutable
class QaEmulatorTarget {
  const QaEmulatorTarget(this.service, this.port);

  final String service;
  final int port;
}

/// Every SDK that can write to a backend, and the port it must be reached on.
///
/// This is the single source of truth: the readiness probe walks it, the wiring
/// walks it, and a test asserts it covers every event-writing SDK. Adding an SDK
/// without adding it here would leave a path pointing at production.
const List<QaEmulatorTarget> kQaEmulatorTargets = <QaEmulatorTarget>[
  QaEmulatorTarget('auth', 9099),
  QaEmulatorTarget('firestore', 8080),
  QaEmulatorTarget('functions', 5001),
  QaEmulatorTarget('storage', 9199),
];

/// The port for one service, or null when it is not an isolated target.
int? qaPortFor(String service) {
  for (final target in kQaEmulatorTargets) {
    if (target.service == service) return target.port;
  }
  return null;
}

/// The outcome of the gate: either a host to use, or the reason for refusing.
@immutable
class QaIsolationDecision {
  const QaIsolationDecision._(this.host, this.blockedReason);

  const QaIsolationDecision.allowed(String host) : this._(host, null);

  const QaIsolationDecision.blocked(String reason) : this._('', reason);

  /// The verified host. Empty whenever [blockedReason] is set.
  final String host;

  /// Why the build must not start. Null only when the build may start.
  final String? blockedReason;

  bool get isAllowed => blockedReason == null;
}

/// Only a host reachable over `adb reverse` is accepted.
///
/// The phone talks to the workstation's emulators through a USB tunnel, so the
/// address is always loopback ON THE PHONE. Accepting anything else would let a
/// build point at an arbitrary machine and call it "isolated".
bool isQaLoopbackHost(String host) =>
    host == '127.0.0.1' || host == 'localhost' || host == '::1';

/// Decide whether this build may enter isolated mode. Pure.
QaIsolationDecision decideQaIsolation({
  required bool isDebugBuild,
  required String? flavor,
  required String host,
}) {
  if (flavor != kQaFlavorName) {
    // Defence in depth: production never calls this, and if it somehow did, a
    // dart-define must not be able to put it into emulator mode.
    return const QaIsolationDecision.blocked(
      'Isolated mode is available to the QA flavour only. This build is not the '
      'QA flavour, so it may not be redirected to an emulator.',
    );
  }
  if (!isDebugBuild) {
    return const QaIsolationDecision.blocked(
      'Isolated mode is available to debug builds only. A release build cannot '
      'be verified as isolated, so the QA flavour will not start.',
    );
  }
  if (host.isEmpty) {
    return const QaIsolationDecision.blocked(
      'No isolated backend was configured. Build with '
      '--dart-define=MM_QA_BACKEND_HOST=127.0.0.1 and run the emulators. The QA '
      'flavour will NOT fall back to the production project.',
    );
  }
  if (!isQaLoopbackHost(host)) {
    return QaIsolationDecision.blocked(
      'The isolated backend host must be reached over adb reverse on loopback; '
      'got "$host". Refusing to treat a remote host as isolated.',
    );
  }
  return QaIsolationDecision.allowed(host);
}

/// Does this Firestore error code PROVE the isolated backend answered?
///
/// The readiness read is a reachability check, not an access check. The emulator
/// loads the repository's real rules, so an unauthenticated read of
/// `qa_isolation/readiness` is normally DENIED — and a denial is a reply, which
/// is exactly what we are trying to establish. Only a transport-level failure
/// means "nothing is there".
///
/// Treating a denial as unreachable would block every correctly isolated build;
/// treating `unavailable` as reachable would let an unisolated one start. Both
/// directions matter, so the set is explicit rather than a catch-all.
bool isQaFirestoreReachableError(String code) {
  switch (code) {
    case 'permission-denied':
    case 'not-found':
    case 'unauthenticated':
    case 'failed-precondition':
      // The rules engine or the API replied. Something is listening, and it is
      // speaking Firestore.
      return true;
    default:
      // unavailable, deadline-exceeded, internal, unknown, ... - no reply.
      return false;
  }
}

/// Answers whether one emulated service is actually listening.
typedef QaPortProbe = Future<bool> Function(String host, int port);

/// Confirm every isolated service answers BEFORE any SDK is pointed at it.
///
/// Run from the phone, not the workstation: a port open on the developer's
/// machine says nothing about whether the USB tunnel is in place. A service that
/// does not answer is a block, never a downgrade.
Future<QaIsolationDecision> probeQaEmulators({
  required QaIsolationDecision decision,
  required QaPortProbe probe,
  List<QaEmulatorTarget> targets = kQaEmulatorTargets,
}) async {
  if (!decision.isAllowed) return decision;

  final unreachable = <String>[];
  for (final target in targets) {
    var reachable = false;
    try {
      reachable = await probe(decision.host, target.port);
    } catch (_) {
      reachable = false;
    }
    if (!reachable) {
      unreachable.add('${target.service} (${decision.host}:${target.port})');
    }
  }

  if (unreachable.isNotEmpty) {
    return QaIsolationDecision.blocked(
      'These isolated services did not answer from the device: '
      '${unreachable.join(', ')}. Start the emulators and map them with '
      '`adb reverse`. The QA flavour will NOT fall back to the production '
      'project.',
    );
  }
  return decision;
}
