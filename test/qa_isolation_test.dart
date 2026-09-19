/// B5 — the QA flavour may not run unless it is provably isolated.
///
/// The failure these guard against is specific and has happened: the QA package
/// lives in the SAME Firebase project as production, so a QA build that starts
/// without an isolated backend writes real documents into production `events`.
///
/// Every case below therefore asserts a REFUSAL. A test suite for this feature
/// that only proved the happy path would be worthless, because the dangerous
/// state is the one where the app carries on regardless.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/qa/qa_isolation.dart';

String _read(String path) {
  final file = File(path);
  expect(file.existsSync(), isTrue, reason: 'missing source file: $path');
  final text = file.readAsStringSync();
  expect(text.length, greaterThan(200), reason: 'suspiciously small: $path');
  return text;
}

void main() {
  group('1. QA without isolation configuration fails closed', () {
    test('an unset host is a block, never a fallback', () {
      final decision = decideQaIsolation(
        isDebugBuild: true,
        flavor: kQaFlavorName,
        host: '',
      );
      expect(decision.isAllowed, isFalse);
      expect(decision.host, isEmpty);
      expect(decision.blockedReason, contains('MM_QA_BACKEND_HOST'));
      expect(decision.blockedReason, contains('NOT fall back'));
    });

    test('a non-loopback host is refused rather than trusted', () {
      // adb reverse makes the tunnel loopback ON THE PHONE. Anything else is
      // some other machine, and calling that "isolated" is the whole bug.
      for (final host in <String>[
        '10.0.2.2',
        '192.168.1.10',
        'staging.example.com',
        'makanmana-c59f3.firebaseio.com',
      ]) {
        final decision = decideQaIsolation(
          isDebugBuild: true,
          flavor: kQaFlavorName,
          host: host,
        );
        expect(decision.isAllowed, isFalse, reason: 'must refuse $host');
        expect(decision.blockedReason, contains('loopback'));
      }
    });

    test('loopback is accepted, so the gate is not vacuously closed', () {
      final decision = decideQaIsolation(
        isDebugBuild: true,
        flavor: kQaFlavorName,
        host: '127.0.0.1',
      );
      expect(decision.isAllowed, isTrue);
      expect(decision.host, '127.0.0.1');
    });
  });

  group('2. QA with unreachable emulators fails closed', () {
    test('one dead service blocks the build and names it', () async {
      final decision = await probeQaEmulators(
        decision: const QaIsolationDecision.allowed('127.0.0.1'),
        probe: (host, port) async => port != 8080, // firestore down
      );
      expect(decision.isAllowed, isFalse);
      expect(decision.blockedReason, contains('firestore'));
      expect(decision.blockedReason, contains('8080'));
      expect(decision.blockedReason, contains('NOT fall back'));
    });

    test('a probe that throws counts as unreachable', () async {
      final decision = await probeQaEmulators(
        decision: const QaIsolationDecision.allowed('127.0.0.1'),
        probe: (host, port) async => throw const SocketException('refused'),
      );
      expect(decision.isAllowed, isFalse);
      // Every service is named, so the operator sees the whole picture.
      for (final target in kQaEmulatorTargets) {
        expect(decision.blockedReason, contains(target.service));
      }
    });

    test('all services answering lets the build through', () async {
      final decision = await probeQaEmulators(
        decision: const QaIsolationDecision.allowed('127.0.0.1'),
        probe: (host, port) async => true,
      );
      expect(decision.isAllowed, isTrue);
    });

    test('a reply proves reachability; a transport failure does not', () {
      // The readiness read runs against the repository's REAL rules, so a
      // denial is the expected outcome and must not block the build.
      for (final code in <String>[
        'permission-denied',
        'not-found',
        'unauthenticated',
        'failed-precondition',
      ]) {
        expect(isQaFirestoreReachableError(code), isTrue, reason: code);
      }
      for (final code in <String>[
        'unavailable',
        'deadline-exceeded',
        'internal',
        'unknown',
        'aborted',
      ]) {
        expect(isQaFirestoreReachableError(code), isFalse, reason: code);
      }
    });

    test('the readiness read distinguishes a denial from silence', () {
      final source = _read('lib/core/qa/qa_isolation_bootstrap.dart');
      expect(source, contains('on FirebaseException catch'));
      expect(source, contains('isQaFirestoreReachableError(error.code)'));
      // The generic catch must still block, or an unreachable backend slips by.
      expect(source, contains('did not answer a server read: \$error'));
    });

    test('an already-blocked decision is never probed into allowed', () async {
      var probed = false;
      final decision = await probeQaEmulators(
        decision: const QaIsolationDecision.blocked('no host'),
        probe: (host, port) async {
          probed = true;
          return true;
        },
      );
      expect(decision.isAllowed, isFalse);
      expect(probed, isFalse, reason: 'a blocked build must not be probed');
    });
  });

  group('3. QA cannot silently use the production Firebase project', () {
    test('the isolated project is a demo project, and not production', () {
      expect(kQaIsolatedProjectId, startsWith('demo-'));
      expect(kQaIsolatedProjectId, isNot(kProductionProjectId));
    });

    test('the QA branch in main() returns before the production path', () {
      final main = _read('lib/main.dart');
      final gate = main.indexOf('appFlavor == kQaFlavorName');
      final productionInit = main.indexOf('DefaultFirebaseOptions.currentPlatform');
      expect(gate, greaterThan(0), reason: 'the QA gate must exist');
      expect(productionInit, greaterThan(0), reason: 'production init must exist');
      expect(gate, lessThan(productionInit),
          reason: 'the gate must come before any production initialisation');

      // The gate block must end in a return, or execution would fall through
      // into the production path below it.
      final gateBlock = main.substring(gate, productionInit);
      expect(gateBlock, contains('QaIsolationBlockedApp'));
      expect('return;'.allMatches(gateBlock).length, greaterThanOrEqualTo(2),
          reason: 'both the blocked and the isolated branch must return');
    });

    test('the bootstrap refuses an app that is not the isolated project', () {
      final source = _read('lib/core/qa/qa_isolation_bootstrap.dart');
      expect(source, contains('app.options.projectId != kQaIsolatedProjectId'));
      expect(source, contains('QaIsolationDecision.blocked'));
      // No catch may re-initialise against production.
      expect(source.contains('DefaultFirebaseOptions'), isFalse,
          reason: 'the isolated path must never reference production options');
    });

    test('the QA flavour has its own dead google-services.json', () {
      // The Gradle plugin falls back to a PARENT package when it finds no exact
      // match, which is how com.makanmana.apps.qa resolved to the production
      // client. This file removes that fallback.
      final raw = _read('android/app/src/qa/google-services.json');
      final config = jsonDecode(raw) as Map<String, dynamic>;
      final info = config['project_info'] as Map<String, dynamic>;
      expect(info['project_id'], kQaIsolatedProjectId);
      expect(raw.contains(kProductionProjectId), isFalse,
          reason: 'the QA config must not name the production project');
      expect(raw.contains('1097613804556'), isFalse,
          reason: 'the QA config must not carry the production project number');

      final clients = config['client'] as List<dynamic>;
      expect(clients, hasLength(1));
      final client = clients.single as Map<String, dynamic>;
      final clientInfo = client['client_info'] as Map<String, dynamic>;
      final androidInfo =
          clientInfo['android_client_info'] as Map<String, dynamic>;
      // An exact match is the whole point; a suffix here would re-open the
      // parent-package fallback.
      expect(androidInfo['package_name'], 'com.makanmana.apps.qa');

      // Dart and native must describe the SAME dead project, or a build could
      // be isolated at one layer and not the other.
      final bootstrap = _read('lib/core/qa/qa_isolation_bootstrap.dart');
      expect(bootstrap, contains("appId: '${clientInfo['mobilesdk_app_id']}'"));
      final apiKey = (client['api_key'] as List<dynamic>).single
          as Map<String, dynamic>;
      expect(bootstrap, contains("apiKey: '${apiKey['current_key']}'"));
      expect(bootstrap, contains("messagingSenderId: '${info['project_number']}'"));
    });

    test('native auto-initialisation is removed for the QA flavour', () {
      final manifest = _read('android/app/src/qa/AndroidManifest.xml');
      expect(manifest, contains('com.google.firebase.provider.FirebaseInitProvider'));
      expect(manifest, contains('tools:node="remove"'));
      expect(manifest, contains('firebase_analytics_collection_deactivated'));
      expect(manifest, contains('firebase_crashlytics_collection_enabled'));
      expect(manifest, contains('firebase_messaging_auto_init_enabled'));

      final networkConfig =
          _read('android/app/src/qa/res/xml/qa_network_security_config.xml');
      expect(networkConfig, contains('127.0.0.1'));
      expect(networkConfig.contains('includeSubdomains="true"'), isFalse,
          reason: 'cleartext must not be widened beyond loopback');
    });
  });

  group('4. production cannot enable emulator mode with a dart-define', () {
    test('a non-QA flavour is refused even with a valid host', () {
      for (final flavor in <String?>[null, 'prod', 'production', '']) {
        final decision = decideQaIsolation(
          isDebugBuild: true,
          flavor: flavor,
          host: '127.0.0.1',
        );
        expect(decision.isAllowed, isFalse, reason: 'flavor=$flavor');
        expect(decision.blockedReason, contains('QA flavour only'));
      }
    });

    test('a release build is refused even as the QA flavour', () {
      final decision = decideQaIsolation(
        isDebugBuild: false,
        flavor: kQaFlavorName,
        host: '127.0.0.1',
      );
      expect(decision.isAllowed, isFalse);
      expect(decision.blockedReason, contains('debug builds only'));
    });
  });

  group('5. every event-writing SDK is pointed at the isolated environment', () {
    test('the target list covers each backend-writing SDK', () {
      final services = kQaEmulatorTargets.map((t) => t.service).toSet();
      expect(services, containsAll(<String>['auth', 'firestore', 'functions', 'storage']));
      expect(qaPortFor('auth'), 9099);
      expect(qaPortFor('firestore'), 8080);
      expect(qaPortFor('functions'), 5001);
      expect(qaPortFor('storage'), 9199);
      expect(qaPortFor('not-a-service'), isNull);
    });

    test('the bootstrap wires every one of them, and disables host mapping', () {
      final source = _read('lib/core/qa/qa_isolation_bootstrap.dart');
      for (final call in <String>[
        'useAuthEmulator',
        'useFirestoreEmulator',
        'useFunctionsEmulator',
        'useStorageEmulator',
      ]) {
        expect(source, contains(call), reason: '$call must be wired');
      }
      // On a physical device FlutterFire would otherwise rewrite 127.0.0.1 to
      // the Android-emulator alias 10.0.2.2 and miss the adb tunnel entirely.
      expect('automaticHostMapping: false'.allMatches(source).length,
          greaterThanOrEqualTo(5),
          reason: 'every emulator call, including both Functions instances');
      // The regional instance must be redirected too, or callables still leave.
      expect(source, contains('instanceFor(region: AppConstants.functionsRegion)'));
      // An open port is not a working backend.
      expect(source, contains('Source.server'));
    });
  });

  group('6. existing production behaviour is unchanged', () {
    test('the production path still initialises and activates App Check', () {
      final main = _read('lib/main.dart');
      expect(main, contains('Firebase.initializeApp('));
      expect(main, contains('DefaultFirebaseOptions.currentPlatform'));
      expect(main, contains('FirebaseAppCheckBootstrap.activate()'));
      expect(main, contains('FirebaseCrashlytics.instance.recordFlutterFatalError'));
      expect(main, contains('applyQaCanonicalActivation()'));
    });

    test('the QA gate is the only thing guarding the production path', () {
      final main = _read('lib/main.dart');
      // The production branch must not be made conditional on the QA host.
      final productionInit = main.indexOf('DefaultFirebaseOptions.currentPlatform');
      final after = main.substring(productionInit);
      expect(after.contains('MM_QA_BACKEND_HOST'), isFalse);
      expect(after.contains('kQaBackendHost'), isFalse);
    });
  });
}
