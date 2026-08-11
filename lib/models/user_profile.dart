import 'dart:convert';

/// ISSUE 003 — Model profil citarasa kanonikal.
///
/// SEMUA medan ISSUE 003 bersifat TAMBAHAN & OPSYENAL dengan lalai selamat.
/// Dokumen lama TANPA medan ini nyah-siri dengan betul (backward-safe).
/// [toMap] hanya menulis medan bukan-lalai/tak-kosong bagi medan baharu
/// supaya dokumen lama TIDAK berubah hanya kerana dibaca (Seksyen 7).
class UserProfile {
  const UserProfile({
    required this.uid,
    // --- Legasi (dikekalkan, digunakan semula) ---
    this.dietType = 'none',
    this.halalPreference = true,
    this.allergies = const [],
    this.budgetMin = 8,
    this.budgetMax = 30,
    this.favoriteCuisines = const [],
    this.spicyPreference = 2,
    this.usualMealTimes = const ['lunch', 'dinner'],
    // --- ISSUE 003 (baharu, opsyenal) ---
    this.primaryFoodGoal,
    this.secondaryFoodGoals = const [],
    this.halalPreferenceId,
    this.dietaryPatternIds = const [],
    this.allergyEntries = const [],
    this.exploreCuisineIds = const [],
    this.avoidedCuisineIds = const [],
    this.customCuisineEntries = const [],
    this.spiceToleranceId,
    this.spiceCustomNote,
    this.tastePreferenceIds = const [],
    this.specialMealContextIds = const [],
    this.customMealTimes = const [],
    this.customMealContexts = const [],
    this.mealBalancePreferences = const {},
    this.repeatToleranceId,
    this.discoveryPreferenceId,
    this.preferredDistanceKm,
    this.tasteProfileVersion = 1,
    this.tasteProfileUpdatedAt,
  });

  final String uid;

  // --- Legasi ---
  final String dietType;
  final bool halalPreference;
  final List<String> allergies;
  final int budgetMin;
  final int budgetMax;
  final List<String> favoriteCuisines;
  final int spicyPreference; // 0-3 (input cadangan sedia ada)
  final List<String> usualMealTimes;

  // --- ISSUE 003 ---
  /// Matlamat makanan utama (ID kanonikal) — BEZA dari Fit Coach goal.
  final String? primaryFoodGoal;
  final List<String> secondaryFoodGoals;

  /// Keutamaan halal berperingkat: halal_required | halal_preferred |
  /// no_halal_filter. `halalPreference` (bool) kekal sebagai input cadangan.
  final String? halalPreferenceId;

  /// Corak diet berbilang (ID kanonikal). `dietType` legasi kekal.
  final List<String> dietaryPatternIds;

  /// Alahan berstruktur: [{id, severity, note?, custom?, type?}].
  /// `allergies` (senarai ID rata) kekal untuk input cadangan.
  final List<Map<String, dynamic>> allergyEntries;

  final List<String> exploreCuisineIds;
  final List<String> avoidedCuisineIds;

  /// Cuisine tersendiri: [{id, label, normalized, createdAt?}].
  final List<Map<String, dynamic>> customCuisineEntries;

  final String? spiceToleranceId;
  final String? spiceCustomNote;
  final List<String> tastePreferenceIds;
  final List<String> specialMealContextIds;

  /// Waktu/konteks tersendiri: [{id, label, normalized, start?, end?}].
  final List<Map<String, dynamic>> customMealTimes;
  final List<Map<String, dynamic>> customMealContexts;

  /// Imbangan makan: {dimensionId: frequencyId}.
  final Map<String, String> mealBalancePreferences;

  final String? repeatToleranceId;
  final String? discoveryPreferenceId;

  /// Jarak pilihan (km) — sumber numerik; radius sedia ada kekal.
  final double? preferredDistanceKm;

  /// Versi skema keutamaan (additive; TIDAK menyekat pengguna lama).
  final int tasteProfileVersion;
  final DateTime? tasteProfileUpdatedAt;

  UserProfile copyWith({
    String? dietType,
    bool? halalPreference,
    List<String>? allergies,
    int? budgetMin,
    int? budgetMax,
    List<String>? favoriteCuisines,
    int? spicyPreference,
    List<String>? usualMealTimes,
    String? primaryFoodGoal,
    List<String>? secondaryFoodGoals,
    String? halalPreferenceId,
    List<String>? dietaryPatternIds,
    List<Map<String, dynamic>>? allergyEntries,
    List<String>? exploreCuisineIds,
    List<String>? avoidedCuisineIds,
    List<Map<String, dynamic>>? customCuisineEntries,
    String? spiceToleranceId,
    String? spiceCustomNote,
    List<String>? tastePreferenceIds,
    List<String>? specialMealContextIds,
    List<Map<String, dynamic>>? customMealTimes,
    List<Map<String, dynamic>>? customMealContexts,
    Map<String, String>? mealBalancePreferences,
    String? repeatToleranceId,
    String? discoveryPreferenceId,
    double? preferredDistanceKm,
    int? tasteProfileVersion,
    DateTime? tasteProfileUpdatedAt,
  }) =>
      UserProfile(
        uid: uid,
        dietType: dietType ?? this.dietType,
        halalPreference: halalPreference ?? this.halalPreference,
        allergies: allergies ?? this.allergies,
        budgetMin: budgetMin ?? this.budgetMin,
        budgetMax: budgetMax ?? this.budgetMax,
        favoriteCuisines: favoriteCuisines ?? this.favoriteCuisines,
        spicyPreference: spicyPreference ?? this.spicyPreference,
        usualMealTimes: usualMealTimes ?? this.usualMealTimes,
        primaryFoodGoal: primaryFoodGoal ?? this.primaryFoodGoal,
        secondaryFoodGoals: secondaryFoodGoals ?? this.secondaryFoodGoals,
        halalPreferenceId: halalPreferenceId ?? this.halalPreferenceId,
        dietaryPatternIds: dietaryPatternIds ?? this.dietaryPatternIds,
        allergyEntries: allergyEntries ?? this.allergyEntries,
        exploreCuisineIds: exploreCuisineIds ?? this.exploreCuisineIds,
        avoidedCuisineIds: avoidedCuisineIds ?? this.avoidedCuisineIds,
        customCuisineEntries:
            customCuisineEntries ?? this.customCuisineEntries,
        spiceToleranceId: spiceToleranceId ?? this.spiceToleranceId,
        spiceCustomNote: spiceCustomNote ?? this.spiceCustomNote,
        tastePreferenceIds: tastePreferenceIds ?? this.tastePreferenceIds,
        specialMealContextIds:
            specialMealContextIds ?? this.specialMealContextIds,
        customMealTimes: customMealTimes ?? this.customMealTimes,
        customMealContexts: customMealContexts ?? this.customMealContexts,
        mealBalancePreferences:
            mealBalancePreferences ?? this.mealBalancePreferences,
        repeatToleranceId: repeatToleranceId ?? this.repeatToleranceId,
        discoveryPreferenceId:
            discoveryPreferenceId ?? this.discoveryPreferenceId,
        preferredDistanceKm: preferredDistanceKm ?? this.preferredDistanceKm,
        tasteProfileVersion: tasteProfileVersion ?? this.tasteProfileVersion,
        tasteProfileUpdatedAt:
            tasteProfileUpdatedAt ?? this.tasteProfileUpdatedAt,
      );

  Map<String, dynamic> toMap() {
    final map = <String, dynamic>{
      'uid': uid,
      // Legasi — sentiasa ditulis (kekalkan keserasian penuh).
      'dietType': dietType,
      'halalPreference': halalPreference,
      'allergies': allergies,
      'budgetMin': budgetMin,
      'budgetMax': budgetMax,
      'favoriteCuisines': favoriteCuisines,
      'spicyPreference': spicyPreference,
      'usualMealTimes': usualMealTimes,
    };
    // ISSUE 003 — hanya tulis medan baharu jika ada nilai (elak menggemuk
    // dokumen lama & elak menulis lalai kosong yang tak bermakna).
    void put(String key, Object? value) {
      if (value == null) return;
      if (value is Iterable && value.isEmpty) return;
      if (value is Map && value.isEmpty) return;
      map[key] = value;
    }

    put('primaryFoodGoal', primaryFoodGoal);
    put('secondaryFoodGoals', secondaryFoodGoals);
    put('halalPreferenceId', halalPreferenceId);
    put('dietaryPatternIds', dietaryPatternIds);
    put('allergyEntries', allergyEntries);
    put('exploreCuisineIds', exploreCuisineIds);
    put('avoidedCuisineIds', avoidedCuisineIds);
    put('customCuisineEntries', customCuisineEntries);
    put('spiceToleranceId', spiceToleranceId);
    put('spiceCustomNote', spiceCustomNote);
    put('tastePreferenceIds', tastePreferenceIds);
    put('specialMealContextIds', specialMealContextIds);
    put('customMealTimes', customMealTimes);
    put('customMealContexts', customMealContexts);
    put('mealBalancePreferences', mealBalancePreferences);
    put('repeatToleranceId', repeatToleranceId);
    put('discoveryPreferenceId', discoveryPreferenceId);
    put('preferredDistanceKm', preferredDistanceKm);
    // Versi hanya ditulis apabila > 1 (profil telah ditingkatkan).
    if (tasteProfileVersion > 1) {
      map['tasteProfileVersion'] = tasteProfileVersion;
    }
    if (tasteProfileUpdatedAt != null) {
      map['tasteProfileUpdatedAt'] =
          tasteProfileUpdatedAt!.toIso8601String();
    }
    return map;
  }

  static List<String> _strList(Object? v) =>
      List<String>.from((v as List? ?? const []).map((e) => '$e'));

  static List<Map<String, dynamic>> _mapList(Object? v) =>
      List<Map<String, dynamic>>.from(
          (v as List? ?? const []).map((e) => Map<String, dynamic>.from(
              (e as Map?)?.cast<String, dynamic>() ?? const {})));

  factory UserProfile.fromMap(Map<String, dynamic> map) => UserProfile(
        uid: map['uid'] as String? ?? '',
        dietType: map['dietType'] as String? ?? 'none',
        halalPreference: map['halalPreference'] as bool? ?? true,
        allergies: _strList(map['allergies']),
        budgetMin: (map['budgetMin'] as num?)?.toInt() ?? 8,
        budgetMax: (map['budgetMax'] as num?)?.toInt() ?? 30,
        favoriteCuisines: _strList(map['favoriteCuisines']),
        spicyPreference: (map['spicyPreference'] as num?)?.toInt() ?? 2,
        usualMealTimes: map['usualMealTimes'] == null
            ? const ['lunch', 'dinner']
            : _strList(map['usualMealTimes']),
        // ISSUE 003 — lalai selamat bila medan tiada.
        primaryFoodGoal: map['primaryFoodGoal'] as String?,
        secondaryFoodGoals: _strList(map['secondaryFoodGoals']),
        halalPreferenceId: map['halalPreferenceId'] as String?,
        dietaryPatternIds: _strList(map['dietaryPatternIds']),
        allergyEntries: _mapList(map['allergyEntries']),
        exploreCuisineIds: _strList(map['exploreCuisineIds']),
        avoidedCuisineIds: _strList(map['avoidedCuisineIds']),
        customCuisineEntries: _mapList(map['customCuisineEntries']),
        spiceToleranceId: map['spiceToleranceId'] as String?,
        spiceCustomNote: map['spiceCustomNote'] as String?,
        tastePreferenceIds: _strList(map['tastePreferenceIds']),
        specialMealContextIds: _strList(map['specialMealContextIds']),
        customMealTimes: _mapList(map['customMealTimes']),
        customMealContexts: _mapList(map['customMealContexts']),
        mealBalancePreferences: Map<String, String>.from(
            (map['mealBalancePreferences'] as Map? ?? const {})
                .map((k, v) => MapEntry('$k', '$v'))),
        repeatToleranceId: map['repeatToleranceId'] as String?,
        discoveryPreferenceId: map['discoveryPreferenceId'] as String?,
        preferredDistanceKm: (map['preferredDistanceKm'] as num?)?.toDouble(),
        tasteProfileVersion:
            (map['tasteProfileVersion'] as num?)?.toInt() ?? 1,
        tasteProfileUpdatedAt: map['tasteProfileUpdatedAt'] == null
            ? null
            : DateTime.tryParse('${map['tasteProfileUpdatedAt']}'),
      );

  String toJson() => jsonEncode(toMap());

  factory UserProfile.fromJson(String source) =>
      UserProfile.fromMap(jsonDecode(source) as Map<String, dynamic>);
}
