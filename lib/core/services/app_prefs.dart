import 'package:shared_preferences/shared_preferences.dart';

/// Simpanan tempatan ringkas (bahasa, status dev login, onboarding, profil offline).
class AppPrefs {
  AppPrefs(this._prefs);

  final SharedPreferences _prefs;

  static const _kLanguage = 'language';
  static const _kDevLoggedIn = 'devLoggedIn';
  static const _kOnboardingDone = 'onboardingDone';
  static const _kProfileJson = 'profileJson';
  static const _kSpinTheme = 'spinTheme';

  String? get language => _prefs.getString(_kLanguage);
  Future<void> setLanguage(String code) => _prefs.setString(_kLanguage, code);

  bool get devLoggedIn => _prefs.getBool(_kDevLoggedIn) ?? false;
  Future<void> setDevLoggedIn(bool value) =>
      _prefs.setBool(_kDevLoggedIn, value);

  bool get onboardingDone => _prefs.getBool(_kOnboardingDone) ?? false;
  Future<void> setOnboardingDone(bool value) =>
      _prefs.setBool(_kOnboardingDone, value);

  String? get profileJson => _prefs.getString(_kProfileJson);
  Future<void> setProfileJson(String json) =>
      _prefs.setString(_kProfileJson, json);

  String get spinTheme => _prefs.getString(_kSpinTheme) ?? 'magicPlate';
  Future<void> setSpinTheme(String value) =>
      _prefs.setString(_kSpinTheme, value);

  // SP10: Appearance (system | light | dark) — keutamaan PERANTI supaya
  // skrin pra-login pun ikut pilihan; dicermin ke users doc untuk sync.
  static const _kAppearance = 'appearance';

  // BRIGHT MODE spec: lalai = Bright; 'system'/'dark' hanya jika pengguna
  // pilih sendiri (pilihan tersimpan dihormati sepenuhnya).
  String get appearance => _prefs.getString(_kAppearance) ?? 'light';
  Future<void> setAppearance(String value) =>
      _prefs.setString(_kAppearance, value);

  // Fallback mod dev (tanpa Firebase): rekod makan & kiraan spin tempatan.
  static const _kMealsJson = 'devMealsJson';

  String? get mealsJson => _prefs.getString(_kMealsJson);
  Future<void> setMealsJson(String json) =>
      _prefs.setString(_kMealsJson, json);

  int devSpinUsedFor(String dateKey) =>
      _prefs.getInt('devSpinUsed_$dateKey') ?? 0;
  Future<void> setDevSpinUsedFor(String dateKey, int value) =>
      _prefs.setInt('devSpinUsed_$dateKey', value);

  // Check-in kedai (bukti dine-in untuk rating walk-in).
  Future<void> setCheckin(String placeId, DateTime time) =>
      _prefs.setString('checkin_$placeId', time.toIso8601String());

  DateTime? checkinTime(String placeId) {
    final raw = _prefs.getString('checkin_$placeId');
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }
}
