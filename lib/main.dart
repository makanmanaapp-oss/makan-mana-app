import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'core/providers.dart';
import 'core/security/app_check_bootstrap.dart';
import 'features/place_migration/qa_canonical_activation.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Cuba init Firebase. Jika `flutterfire configure` belum dijalankan,
  // app tetap boleh berjalan dalam mod dev (data tempatan + dummy).
  var firebaseReady = false;
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
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
