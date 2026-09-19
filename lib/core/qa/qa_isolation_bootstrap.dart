/// QA backend isolation — the wiring half.
///
/// Everything here runs BEFORE any application service, repository or provider
/// exists, so no event-writing code can be constructed against the wrong
/// backend. The order is deliberate:
///
///   1. decide          (pure, see qa_isolation.dart)
///   2. probe           from the DEVICE, over the adb-reverse tunnel
///   3. initialise      an explicitly non-production `demo-` project
///   4. assert          the app that came back really is that project — this is
///                      what catches native auto-initialisation having already
///                      created a production app before Dart started
///   5. point every     event-writing SDK at the emulators
///   6. prove           the SDK actually reaches the emulator with a server read
///
/// Any failure returns a block. There is no catch that continues, and none that
/// re-initialises against production.
library;

import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show appFlavor;

import '../constants/app_constants.dart';
import 'qa_isolation.dart';

/// Options for the isolated project.
///
/// These are byte-for-byte the values in `android/app/src/qa/google-services.json`,
/// so the Dart layer and the native layer describe the SAME dead project and a
/// mismatch between them is a bug rather than a silent second configuration.
///
/// None of it is a credential. The key is well-formed but meaningless — the
/// native SDK checks the SHAPE of an API key and the emulators never check its
/// value — and it grants nothing, because `demo-` projects do not exist upstream.
const FirebaseOptions kQaIsolatedOptions = FirebaseOptions(
  apiKey: 'AIzaQaIsolatedEmulatorOnly0000000000000',
  appId: '1:000000000000:android:0000000000000000000000',
  messagingSenderId: '000000000000',
  projectId: kQaIsolatedProjectId,
  storageBucket: '$kQaIsolatedProjectId.appspot.com',
);

/// A plain HTTP HEAD-ish probe, executed on the phone.
Future<bool> _probeFromDevice(String host, int port) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
  try {
    final request = await client.getUrl(Uri.parse('http://$host:$port/'));
    final response = await request.close().timeout(const Duration(seconds: 5));
    await response.drain<void>();
    return true;
  } catch (_) {
    return false;
  } finally {
    client.close(force: true);
  }
}

/// Bring up the isolated backend, or explain why the build must not start.
Future<QaIsolationDecision> bootstrapQaIsolation({
  QaPortProbe probe = _probeFromDevice,
}) async {
  var decision = decideQaIsolation(
    isDebugBuild: kDebugMode,
    flavor: appFlavor,
    host: kQaBackendHost,
  );
  decision = await probeQaEmulators(decision: decision, probe: probe);
  if (!decision.isAllowed) return decision;

  final FirebaseApp app;
  try {
    app = await Firebase.initializeApp(options: kQaIsolatedOptions);
  } catch (error) {
    return QaIsolationDecision.blocked(
      'The isolated Firebase app could not be created: $error. This usually '
      'means a production app was already initialised natively.',
    );
  }

  // THE GUARD THAT MATTERS. `FirebaseInitProvider` is a ContentProvider merged
  // in from the Firebase AAR; it builds the default app from
  // google-services.json before Dart runs. The QA manifest removes it, and this
  // asserts that the removal actually took effect in the installed binary.
  if (app.options.projectId != kQaIsolatedProjectId) {
    return QaIsolationDecision.blocked(
      'The default Firebase app is "${app.options.projectId}", not the isolated '
      'project. Native auto-initialisation was not removed, so this build is '
      'NOT isolated and will not start.',
    );
  }

  try {
    final host = decision.host;
    await FirebaseAuth.instance.useAuthEmulator(
      host,
      qaPortFor('auth')!,
      automaticHostMapping: false,
    );
    FirebaseFirestore.instance.useFirestoreEmulator(
      host,
      qaPortFor('firestore')!,
      automaticHostMapping: false,
    );
    // Both the default instance and the app's real region: a callable resolved
    // through the regional instance would otherwise still leave the device.
    FirebaseFunctions.instance.useFunctionsEmulator(
      host,
      qaPortFor('functions')!,
      automaticHostMapping: false,
    );
    FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion)
        .useFunctionsEmulator(
      host,
      qaPortFor('functions')!,
      automaticHostMapping: false,
    );
    await FirebaseStorage.instance.useStorageEmulator(
      host,
      qaPortFor('storage')!,
      automaticHostMapping: false,
    );
  } catch (error) {
    return QaIsolationDecision.blocked(
      'The isolated services could not be wired: $error',
    );
  }

  // An open port is not a working backend. Force a SERVER read, so a failure
  // surfaces here at the gate instead of later as a silent write somewhere.
  //
  // A DENIAL counts as success: the emulator loads the repository's real rules,
  // so this read is normally refused, and a refusal proves something answered
  // and is speaking Firestore. Only a transport failure is a block.
  try {
    await FirebaseFirestore.instance
        .doc('qa_isolation/readiness')
        .get(const GetOptions(source: Source.server))
        .timeout(const Duration(seconds: 15));
  } on FirebaseException catch (error) {
    if (!isQaFirestoreReachableError(error.code)) {
      return QaIsolationDecision.blocked(
        'The isolated Firestore did not answer a server read '
        '(${error.code}): ${error.message}',
      );
    }
  } catch (error) {
    return QaIsolationDecision.blocked(
      'The isolated Firestore did not answer a server read: $error',
    );
  }

  debugPrint(
    'MM QA ISOLATION READY project=${app.options.projectId} host=${decision.host}',
  );
  return decision;
}
