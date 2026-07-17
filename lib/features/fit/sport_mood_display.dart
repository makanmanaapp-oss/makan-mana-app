/// Penyelesai paparan Sport Mood - selamat untuk rekod legasi.
///
/// Rekod `workout_sessions` menyimpan DUA medan yang berkaitan:
///   - `sportMood`     : ID stabil (cth 'fighterCamp')
///   - `workoutName`   : petikan nama kanonik English (cth 'Fighter Camp')
///
/// Oleh sebab ID stabil sudah disimpan bersebelahan petikan teks, keutamaan
/// 1 di bawah meliputi hampir semua rekod sebenar. Pemetaan alias hanyalah
/// jaring keselamatan untuk rekod yang kehilangan ID.
///
/// Keutamaan penyelesaian (spec ISSUE 001.2 bahagian 4):
///   1. ID mood/workout stabil
///   2. kunci localization dalam model masa-jalan
///   3. pemetaan alias legasi berketentuan
///   4. teks petikan asal yang tersimpan
///   5. sandaran generik yang dilokalkan - hanya bila nilai asal null/kosong
///
/// Nilai legasi yang tidak dikenali TIDAK PERNAH dibuang.
library;

import '../../app/localization/app_localizations.dart';
import 'fit_models.dart';
import 'sport_moods_data.dart';

/// Pemetaan alias legasi: nama kanonik tersimpan -> ID mood stabil.
///
/// Diterbitkan daripada [kSportMoods] supaya ia tidak boleh terpesong
/// daripada data sebenar. Semakan `git log --follow` ke atas
/// sport_moods_data.dart mengesahkan nama-nama ini diperkenalkan dalam SATU
/// commit dan tidak pernah dinamakan semula, dan kesemuanya English - jadi
/// tiada alias Melayu bersejarah wujud untuk dipetakan. Padanan dibuat tanpa
/// mengira huruf besar/kecil dan ruang hujung.
Map<String, String> _buildLegacyAliases() {
  final map = <String, String>{};
  for (final mood in kSportMoods) {
    map[_normalise(mood.canonicalName)] = mood.id;
  }
  return map;
}

String _normalise(String value) => value.trim().toLowerCase();

final Map<String, String> kLegacySportMoodAliases = _buildLegacyAliases();

/// Selesaikan kunci kepada teks terjemahan, atau null jika kunci tidak wujud.
String? _tryKey(AppLocalizations l, String? key) {
  if (key == null || key.isEmpty) return null;
  if (!AppLocalizations.hasKey(key)) return null;
  return l.t(key);
}

/// Tajuk Sport Mood yang dilokalkan mengikut keutamaan penuh.
///
/// [moodId] ialah ID stabil tersimpan (`workout_sessions.sportMood`).
/// [legacyName] ialah petikan teks tersimpan (`workout_sessions.workoutName`).
/// Kedua-duanya boleh null untuk rekod lama.
String resolveSportMoodTitle(
  AppLocalizations l, {
  String? moodId,
  String? legacyName,
}) {
  // 1. ID stabil.
  if (moodId != null && moodId.isNotEmpty) {
    final match = kSportMoods.where((m) => m.id == moodId);
    if (match.isNotEmpty) {
      final resolved = _tryKey(l, match.first.titleKey);
      if (resolved != null) return resolved;
    }
  }

  // 3. Alias legasi berketentuan (2 dikendalikan oleh pemanggil model).
  if (legacyName != null && legacyName.trim().isNotEmpty) {
    final aliasId = kLegacySportMoodAliases[_normalise(legacyName)];
    if (aliasId != null) {
      final match = kSportMoods.where((m) => m.id == aliasId);
      if (match.isNotEmpty) {
        final resolved = _tryKey(l, match.first.titleKey);
        if (resolved != null) return resolved;
      }
    }
    // 4. Nilai legasi tidak dikenali - kekalkan teks asal apa adanya.
    return legacyName;
  }

  // 5. Sandaran generik hanya bila tiada apa-apa untuk dipaparkan.
  return l.t('fitWorkoutFallback');
}

/// Tajuk blok senaman yang dilokalkan (kunci -> sandaran teks kanonik).
String resolveWorkoutBlockName(AppLocalizations l, WorkoutBlock block) =>
    _tryKey(l, block.nameKey) ?? block.name;

/// Butiran blok senaman yang dilokalkan (kunci -> sandaran teks kanonik).
String resolveWorkoutBlockDetail(AppLocalizations l, WorkoutBlock block) =>
    _tryKey(l, block.detailKey) ?? block.detail;

/// Label kategori Sport Mood yang dilokalkan.
String resolveSportMoodCategoryLabel(AppLocalizations l, String category) =>
    _tryKey(l, SportMoodCategories.labelKey(category)) ?? category;

/// Label intensiti yang dilokalkan.
///
/// [intensity] ialah enum dalaman ('low' | 'medium' | 'high') yang kekal
/// tidak berubah dalam data dan persistence; hanya paparannya diterjemah.
/// Nilai tidak dikenali dikembalikan apa adanya.
String resolveIntensityLabel(AppLocalizations l, String intensity) =>
    switch (intensity) {
      'low' => l.t('fitIntensityLow'),
      'medium' => l.t('fitIntensityMedium'),
      'high' => l.t('fitIntensityHigh'),
      _ => intensity,
    };
