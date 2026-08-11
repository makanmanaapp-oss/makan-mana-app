/// SP7.2: pemetaan kod FirebaseAuthException -> kunci l10n mesra pengguna.
/// Fungsi tulen (diuji unit). Jangan papar mesej mentah Firebase sahaja.
String authErrorKey(String code) {
  switch (code) {
    // Firebase kini pulangkan 'invalid-credential' untuk password salah
    // ATAU akaun yang daftar guna provider lain (cth. Google) — mesej
    // mesti pandu pengguna cuba butang Google.
    case 'wrong-password':
    case 'invalid-credential':
    case 'INVALID_LOGIN_CREDENTIALS':
      return 'authErrWrongPassword';
    case 'user-not-found':
      return 'authErrUserNotFound';
    case 'invalid-email':
      return 'authErrInvalidEmail';
    case 'user-disabled':
      return 'authErrUserDisabled';
    case 'network-request-failed':
      return 'authErrNetwork';
    case 'email-already-in-use':
      return 'authErrEmailInUse';
    case 'weak-password':
      return 'authErrWeakPassword';
    case 'too-many-requests':
      return 'authErrTooMany';
    // SP10.1B: Phone OTP + credential silang provider.
    case 'invalid-phone-number':
    case 'missing-phone-number':
      return 'authErrPhoneInvalid';
    case 'invalid-verification-code':
    case 'invalid-verification-id':
      return 'authErrOtpInvalid';
    case 'session-expired':
    case 'code-expired':
      return 'authErrOtpExpired';
    case 'account-exists-with-different-credential':
      return 'authErrDiffCredential';
    case 'quota-exceeded':
      return 'authErrTooMany';
    // Play Integrity / konfigurasi app tak sah — bukan salah pengguna.
    case 'missing-client-identifier':
    case 'app-not-authorized':
      return 'authErrGoogleConfig';
    // 10.1B-PHONE-CLOSE: SMS Region Policy belum benarkan rantau
    // (Firebase 17006 -> 'operation-not-allowed'). Mesej jujur, bukan
    // "semak password".
    case 'operation-not-allowed':
      return 'authErrPhoneRegion';
    default:
      return 'authError';
  }
}

/// SP10.1B: pemetaan kod GoogleSignInException (v7: e.code.name) ->
/// kunci l10n. Tulen (diuji unit) — jangan papar ralat mentah plugin.
String googleErrorKey(String codeName) {
  switch (codeName) {
    case 'canceled':
    case 'interrupted':
      return 'authErrCancelled';
    case 'clientConfigurationError':
    case 'providerConfigurationError':
    case 'uiUnavailable':
      return 'authErrGoogleConfig';
    default:
      return 'authError';
  }
}

/// SP10: mesej hasil reset password. PRIVASI: 'user-not-found' TETAP
/// pulangkan mesej berjaya neutral — jangan dedahkan sama ada emel
/// wujud (elak account enumeration). null = berjaya.
String resetPasswordMessageKey(String? errorCode) {
  switch (errorCode) {
    case null:
    case 'user-not-found':
      return 'resetLinkSent';
    case 'invalid-email':
      return 'authErrInvalidEmail';
    case 'network-request-failed':
      return 'authErrNetwork';
    case 'too-many-requests':
      return 'authErrTooMany';
    default:
      return 'authError';
  }
}
