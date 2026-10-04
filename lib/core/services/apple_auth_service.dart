import 'package:firebase_auth/firebase_auth.dart';

/// Native iOS provider: Firebase handles the nonce and Apple authorization.
/// No web Service ID or invented client ID is required for this native flow.
class AppleAuthService {
  static Future<UserCredential> signIn() {
    final provider = AppleAuthProvider()
      ..addScope('email')
      ..addScope('name');
    return FirebaseAuth.instance.signInWithProvider(provider);
  }
}
