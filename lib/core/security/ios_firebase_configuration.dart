import 'package:firebase_core/firebase_core.dart';

/// Values are generated solely from the owner's downloaded production plist.
/// Missing or cross-project configuration stops iOS startup.
FirebaseOptions productionIosFirebaseOptions({
  required String apiKey,
  required String appId,
  required String messagingSenderId,
  required String projectId,
  required String bundleId,
  required String storageBucket,
  required String clientId,
}) {
  if (projectId != 'makanmana-c59f3' ||
      bundleId != 'com.makanmana.apps' ||
      apiKey.isEmpty ||
      appId.isEmpty ||
      messagingSenderId.isEmpty ||
      !appId.contains(':ios:') ||
      clientId.isEmpty) {
    throw UnsupportedError(
        'iOS Firebase production configuration is missing or invalid.');
  }
  return FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: messagingSenderId,
    projectId: projectId,
    iosBundleId: bundleId,
    iosClientId: clientId,
    storageBucket: storageBucket.isEmpty ? null : storageBucket,
  );
}
