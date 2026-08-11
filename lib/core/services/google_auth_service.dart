import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// SP10.1B: Google Sign-In sebenar (google_sign_in v7 + Firebase Auth).
///
/// Web client ID (client_type 3 dalam google-services.json) — ini
/// PENGECAM AWAM, bukan rahsia. Diperlukan sebagai serverClientId
/// supaya Credential Manager Android pulangkan idToken untuk Firebase.
class GoogleAuthService {
  static const String kWebServerClientId =
      '1097613804556-o49jf5n2ccqjktt1t4e2e9vvvan5qdap'
      '.apps.googleusercontent.com';

  static bool _initialized = false;

  static Future<void> _ensureInitialized() async {
    if (_initialized) return;
    await GoogleSignIn.instance
        .initialize(serverClientId: kWebServerClientId);
    _initialized = true;
  }

  /// Buka pemilih akaun Google & log masuk ke Firebase.
  /// Throw GoogleSignInException (batal/config — petakan dgn
  /// googleErrorKey) atau FirebaseAuthException (petakan authErrorKey).
  static Future<UserCredential> signInWithGoogle() async {
    await _ensureInitialized();
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) {
      // Tiada idToken = config OAuth tak lengkap (bukan salah pengguna).
      throw FirebaseAuthException(code: 'missing-client-identifier');
    }
    final credential = GoogleAuthProvider.credential(idToken: idToken);
    return FirebaseAuth.instance.signInWithCredential(credential);
  }

  /// Logout sesi Google supaya pemilih akaun dipapar semula lain kali.
  /// Tak kritikal — kegagalan di sini tidak menghalang logout Firebase.
  static Future<void> signOutGoogle() async {
    if (!_initialized) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // abaikan — logout Firebase tetap diteruskan.
    }
  }
}
