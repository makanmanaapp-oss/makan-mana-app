/// SP10.3: validasi borang daftar + kekuatan password.
/// Fungsi TULEN (tiada Flutter/Firebase) — diuji unit.
library;

enum PasswordStrength { weak, medium, strong }

/// Kekuatan password: <8 aksara = lemah; >=8 + 2 daripada
/// (huruf besar, digit, simbol) = kuat; selainnya sederhana.
PasswordStrength passwordStrength(String password) {
  if (password.length < 8) return PasswordStrength.weak;
  var variety = 0;
  if (password.contains(RegExp(r'[A-Z]'))) variety++;
  if (password.contains(RegExp(r'[0-9]'))) variety++;
  if (password.contains(RegExp(r'[^A-Za-z0-9]'))) variety++;
  return variety >= 2 ? PasswordStrength.strong : PasswordStrength.medium;
}

/// Kunci l10n label kekuatan.
String passwordStrengthKey(PasswordStrength s) => switch (s) {
      PasswordStrength.weak => 'pwStrengthWeak',
      PasswordStrength.medium => 'pwStrengthMedium',
      PasswordStrength.strong => 'pwStrengthStrong',
    };

bool looksLikeEmail(String email) =>
    RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.trim());

/// Sahkan borang daftar. Pulangkan KUNCI L10N ralat pertama, atau null
/// jika sah. Susunan semakan = susunan medan pada skrin.
String? validateRegister({
  required String displayName,
  required String email,
  required String password,
  required String confirmPassword,
  required bool termsAccepted,
}) {
  final name = displayName.trim();
  if (name.length < 2 || name.length > 40) return 'nameInvalid';
  if (!looksLikeEmail(email)) return 'authErrInvalidEmail';
  if (password.length < 8) return 'authErrWeakPassword';
  if (password != confirmPassword) return 'passwordsNoMatch';
  if (!termsAccepted) return 'agreeTermsRequired';
  return null;
}
