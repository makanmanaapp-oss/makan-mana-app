/// ISSUE 003 — Keserasian legasi & logik konflik (pure, boleh diuji unit).
///
/// Semua fungsi di sini TIDAK menyentuh Firestore atau state. Ia hanya
/// pemetaan deterministik legasi → ID kanonikal, dan matriks konflik.
/// Nilai legasi yang TIDAK dikenali TIDAK PERNAH dibuang — dikembalikan
/// sebagaimana adanya (Seksyen 24: unknown legacy values are preserved).
library;

import 'taste_taxonomy.dart';

/// ---------- DIET legasi → ID kanonikal ----------
/// Peta alias legasi (Melayu + English) yang mungkin tersimpan.
const Map<String, String> kLegacyDietAliases = {
  'none': 'omnivore',
  'everything': 'omnivore',
  'makan semua': 'omnivore',
  'omnivore': 'omnivore',
  'vegetarian': 'vegetarian',
  'vegan': 'vegan',
  'pescatarian': 'pescatarian',
  'eggetarian': 'vegetarian',
  'balanced': 'balanced',
  'seimbang': 'balanced',
  'keto': 'keto',
  'low carb': 'low_carb',
  'lowcarb': 'low_carb',
  'high protein': 'high_protein',
  'highprotein': 'high_protein',
  'gluten-free': 'gluten_free',
  'glutenfree': 'gluten_free',
  'dairy-free': 'dairy_free',
  'dairyfree': 'dairy_free',
};

/// Petakan satu nilai diet legasi ke ID kanonikal.
/// Keutamaan: ID kanonikal sedia → alias legasi → nilai asal (dikekalkan).
String canonicalDietId(String? legacy) {
  if (legacy == null || legacy.trim().isEmpty) return 'omnivore';
  final v = legacy.trim();
  // Sudah ID kanonikal?
  for (final o in kDietPatterns) {
    if (o.id == v) return v;
  }
  final alias = kLegacyDietAliases[v.toLowerCase()];
  if (alias != null) return alias;
  // Tidak dikenali → KEKALKAN (jangan buang data pengguna).
  return v;
}

bool isKnownDietId(String id) => kDietPatterns.any((o) => o.id == id);

/// ---------- SPICE legasi (int 0..3) → ID kanonikal & sebaliknya ----------
/// Peta selamat skala lama 4-aras ke skala baharu (Seksyen 13).
/// 0→none, 1→mild, 2→medium, 3→spicy.
String canonicalSpiceIdFromLegacyInt(int? legacy) {
  switch (legacy) {
    case 0:
      return 'none';
    case 1:
      return 'mild';
    case 2:
      return 'medium';
    case 3:
      return 'spicy';
    default:
      return 'medium'; // lalai selamat = medium (selaras UserProfile lama)
  }
}

/// Tulis-balik BUKAN-merosakkan: ID kanonikal → int legasi 0..3 supaya
/// medan `spicyPreference` (int) lama kekal serasi dengan aliran cadangan.
int legacyIntFromCanonicalSpice(String id) {
  switch (id) {
    case 'none':
      return 0;
    case 'very_mild':
    case 'mild':
      return 1;
    case 'medium':
    case 'depends_on_dish':
      return 2;
    case 'spicy':
    case 'very_spicy':
    case 'extreme':
      return 3;
    default:
      return 2;
  }
}

/// ---------- HALAL legasi (bool) → ID kanonikal & sebaliknya ----------
/// Medan lama `halalPreference` ialah bool. true→halal_required,
/// false→no_halal_filter. `halal_preferred` ialah keadaan BAHARU.
String canonicalHalalIdFromLegacyBool(bool legacy) =>
    legacy ? 'halal_required' : 'no_halal_filter';

/// Tulis-balik: hanya `halal_required` memetakan ke bool true (tapis keras);
/// `halal_preferred` = soft (bool false supaya tidak menapis keras) —
/// keutamaan lembut disimpan berasingan dalam medan baharu.
bool legacyBoolFromCanonicalHalal(String id) => id == 'halal_required';

/// ---------- CUISINE legasi → dikekalkan ----------
/// Cuisine sudah guna ID stabil; nilai tidak dikenali DIKEKALKAN.
bool isKnownCuisineId(String id) => kAllCuisines.any((o) => o.id == id);

/// Pisahkan senarai cuisine tersimpan kepada {dikenali, legasi-tak-dikenali}.
({List<String> known, List<String> unknown}) partitionCuisines(
    List<String> stored) {
  final known = <String>[];
  final unknown = <String>[];
  for (final c in stored) {
    (isKnownCuisineId(c) ? known : unknown).add(c);
  }
  return (known: known, unknown: unknown);
}

/// ---------- MATRIKS KONFLIK DIET (Seksyen 10, berpusat) ----------
/// Pasangan yang TIDAK BOLEH wujud bersama tanpa pengesahan pengguna.
/// Simetri; digunakan oleh UI untuk minta pengguna pilih (BUKAN padam senyap).
const List<Set<String>> kDietConflictPairs = [
  {'omnivore', 'vegetarian'},
  {'omnivore', 'vegan'},
  {'vegan', 'pescatarian'},
  {'vegan', 'vegetarian'}, // vegan lebih ketat; minta pengesahan
];

/// Pulangkan ID yang bercanggah dengan [candidate] dalam [current].
List<String> dietConflictsFor(String candidate, Iterable<String> current) {
  final out = <String>[];
  for (final existing in current) {
    if (existing == candidate) continue;
    for (final pair in kDietConflictPairs) {
      if (pair.contains(candidate) && pair.contains(existing)) {
        out.add(existing);
        break;
      }
    }
  }
  return out;
}

/// ---------- KONFLIK ALAHAN "no_known_allergy" (Seksyen 11) ----------
/// `no_known_allergy` tidak boleh wujud bersama alahan lain.
bool allergyHasNoKnownConflict(Iterable<String> selected) {
  final s = selected.toSet();
  if (!s.contains('no_known_allergy')) return false;
  return s.any((a) => a != 'no_known_allergy');
}

/// ---------- KONFLIK CUISINE fav/try/avoid (Seksyen 12) ----------
/// Cuisine sama tidak boleh dalam dua kumpulan bercanggah.
List<String> cuisineGroupConflicts(
  Set<String> favourites,
  Set<String> toTry,
  Set<String> avoid,
) {
  final conflicts = <String>{};
  for (final id in favourites) {
    if (toTry.contains(id) || avoid.contains(id)) conflicts.add(id);
  }
  for (final id in toTry) {
    if (avoid.contains(id)) conflicts.add(id);
  }
  return conflicts.toList();
}

/// ---------- BAJET (Seksyen 17): validasi min ≤ max, tiada negatif ----------
bool isValidBudget(int min, int max) => min >= 0 && max >= 0 && min <= max;

/// ---------- CUSTOM ENTRY (Seksyen 30) ----------
/// Normalisasi input tersendiri: trim, buang aksara kawalan, had panjang.
/// Pulangkan null jika kosong selepas normalisasi.
String? normalizeCustomEntry(String raw, {int maxLen = 40}) {
  // Buang aksara kawalan (< 0x20 dan 0x7F) tanpa regex, kemudian trim &
  // mampatkan ruang. ASCII-only supaya sumber selamat.
  final buf = StringBuffer();
  for (final cu in raw.codeUnits) {
    if (cu < 0x20 || cu == 0x7F) continue;
    buf.writeCharCode(cu);
  }
  var v = buf.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
  if (v.isEmpty) return null;
  if (v.length > maxLen) v = v.substring(0, maxLen).trim();
  return v;
}

/// ID tempatan selamat untuk nilai tersendiri (bukan taksonomi backend,
/// bukan nama medan Firestore, bukan laluan). Prefix `custom:`.
String customLocalId(String normalizedLabel) =>
    'custom:${normalizedLabel.toLowerCase()}';

/// Tambah entri tersendiri dengan dedup case-insensitive (Seksyen 30).
List<String> addCustomDedup(List<String> current, String normalizedLabel) {
  final id = customLocalId(normalizedLabel);
  final lower = {for (final c in current) c.toLowerCase()};
  if (lower.contains(id.toLowerCase())) return current;
  return [...current, id];
}


/// QA ISSUE 003: alias paparan untuk nilai alahan LEGASI (pra-taksonomi).
/// Paparan sahaja - TIADA migrasi data. Nilai tidak dikenali dipulangkan
/// apa adanya (teks custom pengguna kekal tidak berubah).
String canonicalAllergyIdFromLegacy(String legacy) {
  const aliases = {
    'susu': 'dairy',
    'kacang': 'peanuts',
    'telur': 'eggs',
    'udang': 'shrimp',
    'ikan': 'fish',
  };
  return aliases[legacy.trim().toLowerCase()] ?? legacy;
}

/// QA ISSUE 003: alias paparan untuk nilai masakan LEGASI. Padanan ID
/// tidak sensitif huruf; token programatik lama dipetakan ke ID kanonik.
String canonicalCuisineIdFromLegacy(String legacy) {
  final lower = legacy.trim().toLowerCase();
  const aliases = {
    'melayu': 'malay',
    'jepun': 'japanese',
    'kelantanese': 'kelantan',
    'indonesianmalay': 'indonesian',
    'thaimalay': 'thai',
  };
  return aliases[lower] ?? lower;
}

/// QA ISSUE 003 (emulator): label paparan untuk SATU ID masakan.
/// Susunan: taksonomi kanonik → label custom pengguna
/// (customCuisineEntries) → ID asal tidak diubah. ID `custom:` mentah
/// tidak boleh sampai ke UI jika entri custom wujud.
String displayCuisineLabel(
  String id,
  String lang,
  List<dynamic> customEntries,
) {
  final canonical = canonicalCuisineIdFromLegacy(id);
  for (final o in kAllCuisines) {
    if (o.id == canonical) return o.label(lang);
  }
  for (final e in customEntries) {
    if (e is Map && (e['id'] as String?)?.toLowerCase() == canonical) {
      final label = e['label'] as String?;
      if (label != null && label.isNotEmpty) return label;
    }
  }
  return id;
}
