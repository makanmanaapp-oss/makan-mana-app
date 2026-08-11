import 'package:firebase_auth/firebase_auth.dart';

import '../core/services/google_auth_service.dart';

/// Lapisan auth. Guna Firebase Auth bila tersedia;
/// splash/login akan fallback ke mod dev jika Firebase belum dikonfigurasi.
class AuthRepository {
  AuthRepository({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseAuth get _auth => FirebaseAuth.instance;

  User? get currentUser => firebaseReady ? _auth.currentUser : null;

  Future<UserCredential> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  Future<UserCredential> signUp(String email, String password) =>
      _auth.createUserWithEmailAndPassword(email: email, password: password);

  Future<void> signOut() async {
    if (firebaseReady) {
      // SP10.1B: tutup sesi Google juga supaya pemilih akaun keluar
      // semula pada login seterusnya (tak kritikal jika gagal).
      await GoogleAuthService.signOutGoogle();
      await _auth.signOut();
    }
  }

  /// SP10: hantar emel reset password (akaun email/password).
  Future<void> sendPasswordReset(String email) =>
      _auth.sendPasswordResetEmail(email: email);
}
