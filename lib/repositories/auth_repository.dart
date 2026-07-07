import 'package:firebase_auth/firebase_auth.dart';

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
    if (firebaseReady) await _auth.signOut();
  }
}
