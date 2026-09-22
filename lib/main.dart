import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show appFlavor;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'core/providers.dart';
import 'core/qa/qa_blocked_app.dart';
import 'core/qa/platform_configuration.dart';
import 'core/qa/qa_isolation_bootstrap.dart';
import 'core/security/app_check_bootstrap.dart';
import 'core/widgets/build_error_fallback.dart';
import 'features/place_migration/qa_canonical_activation.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Keluaran/profil: pengecualian build dilukis sebagai mesej yang boleh
  // dibaca dan diterjemah, BUKAN RenderErrorBox kelabu tanpa mesej (tab Grup
  // produksi 0.1.8). Pelaporan tidak berubah - FlutterError.onError (di bawah)
  // menerima ralat SEBELUM builder ini dipanggil. Debug kekal dengan skrin
  // merah untuk pembangun. Dipasang SEBELUM get QA supaya meliputi kedua-dua
  // laluan. Pengendalian ralat khusus domain kekal penyelesaian utama.
  if (!kDebugMode) {
    ErrorWidget.builder = releaseErrorWidgetBuilder;
  }

  // ISOLATION GATE — the QA flavour never reaches the production path below.
  //
  // `com.makanmana.apps.qa` lives in the SAME Firebase project as production, so
  // a QA build that simply starts writes real documents into the production
  // `events` collection. This branch returns in every case: either the build has
  // a verified isolated backend, or it shows why it was stopped. There is no
  // path from here into `DefaultFirebaseOptions`.
  if (appFlavor == kQaFlavorName) {
    final isolation = await bootstrapQaIsolation();
    if (!isolation.isAllowed) {
      debugPrint('MM QA ISOLATION BLOCKED: ${isolation.blockedReason}');
      runApp(QaIsolationBlockedApp(reason: isolation.blockedReason!));
      return;
    }

    // App Check is deliberately NOT activated: attestation is a production
    // service, and an isolated build must not talk to it.
    final qaPrefs = await SharedPreferences.getInstance();
    applyQaCanonicalActivation();
    runApp(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(qaPrefs),
          firebaseReadyProvider.overrideWithValue(true),
        ],
        child: const MakanManaApp(),
      ),
    );
    return;
  }

  // iOS WAVE 3A — GERBANG KONFIGURASI PLATFORM.
  //
  // `DefaultFirebaseOptions.currentPlatform` MELONTAR untuk iOS sehingga
  // `flutterfire configure` dijalankan. Tanpa gerbang ini, lontaran itu
  // ditangkap di bawah dan app BERJALAN dengan data tiruan — binaan iOS yang
  // tidak pernah dikonfigurasikan akan kelihatan seperti aplikasi sebenar.
  // Android tidak berubah: mod pembangunan tempatannya kekal.
  FirebaseOptions? platformOptions;
  try {
    platformOptions = DefaultFirebaseOptions.currentPlatform;
  } on UnsupportedError {
    platformOptions = null;
  }
  final isApplePlatform = defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;
  final platformConfig = decideProductionConfiguration(
    isApplePlatform: isApplePlatform,
    firebaseOptionsAvailable: platformOptions != null,
    flavor: appFlavor,
  );
  if (!platformConfig.isAllowed) {
    debugPrint('MM PLATFORM CONFIG BLOCKED: ${platformConfig.blockedReason}');
    runApp(
      QaIsolationBlockedApp(
        title: 'iOS build not configured',
        summary: 'This build was stopped because its platform configuration is '
            'incomplete. It was NOT started with placeholder data.',
        hint: 'Run `flutterfire configure`, add GoogleService-Info.plist for '
            'the correct bundle, and wire the Xcode flavour configurations.',
        reason: platformConfig.blockedReason!,
      ),
    );
    return;
  }

  // Cuba init Firebase. Jika `flutterfire configure` belum dijalankan,
  // app tetap boleh berjalan dalam mod dev (data tempatan + dummy).
  var firebaseReady = false;
  try {
    // Pada iOS ini tidak boleh null — gerbang di atas sudah menyekatnya.
    // Pada Android ia bermakna `flutterfire configure` belum dijalankan,
    // dan mod dev tempatan ialah tingkah laku lama yang sengaja dikekalkan.
    if (platformOptions == null) {
      throw StateError('DefaultFirebaseOptions tiada untuk platform ini');
    }
    await Firebase.initializeApp(
      options: platformOptions,
    );
    firebaseReady = true;

    // Phase 1.14B.2: aktifkan App Check SELEPAS initializeApp, SEBELUM runApp.
    // Pelancaran MONITORING: kegagalan TIDAK meranapkan app (laluan legasi kekal
    // selamat; callable dipercayai kekal dimatikan sehingga status `ready`).
    // Debug → provider debug; release/profile → Play Integrity. TIADA penguatkuasaan.
    await FirebaseAppCheckBootstrap.activate();

    // Crashlytics (M6): tangkap semua ralat Flutter & platform.
    // Dimatikan dalam debug supaya laporan hanya dari pengguna sebenar.
    if (!kDebugMode) {
      FlutterError.onError =
          FirebaseCrashlytics.instance.recordFlutterFatalError;
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    }
  } catch (e) {
    debugPrint('MakanMana: Firebase belum dikonfigurasi -> mod dev. ($e)');
  }

  final prefs = await SharedPreferences.getInstance();

  // GATE 3F-A: aktifkan Butiran Kedai kanonikal untuk binaan QA SAHAJA
  // (kDebugMode && appFlavor == "qa"). Dinilai di sini, bukan pada peristiwa log
  // masuk, kerana pelancaran dengan sesi sedia ada tidak pernah melalui skrin
  // log masuk. No-op dalam keluaran produksi.
  applyQaCanonicalActivation();

  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        firebaseReadyProvider.overrideWithValue(firebaseReady),
      ],
      child: const MakanManaApp(),
    ),
  );
}
