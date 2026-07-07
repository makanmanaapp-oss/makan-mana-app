import 'dart:convert';

class UserProfile {
  const UserProfile({
    required this.uid,
    this.dietType = 'none',
    this.halalPreference = true,
    this.allergies = const [],
    this.budgetMin = 8,
    this.budgetMax = 30,
    this.favoriteCuisines = const [],
    this.spicyPreference = 2,
    this.usualMealTimes = const ['lunch', 'dinner'],
  });

  final String uid;
  final String dietType; // none | vegetarian | vegan | pescatarian
  final bool halalPreference;
  final List<String> allergies;
  final int budgetMin;
  final int budgetMax;
  final List<String> favoriteCuisines;
  final int spicyPreference; // 0-3
  final List<String> usualMealTimes;

  UserProfile copyWith({
    String? dietType,
    bool? halalPreference,
    List<String>? allergies,
    int? budgetMin,
    int? budgetMax,
    List<String>? favoriteCuisines,
    int? spicyPreference,
    List<String>? usualMealTimes,
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
      );

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'dietType': dietType,
        'halalPreference': halalPreference,
        'allergies': allergies,
        'budgetMin': budgetMin,
        'budgetMax': budgetMax,
        'favoriteCuisines': favoriteCuisines,
        'spicyPreference': spicyPreference,
        'usualMealTimes': usualMealTimes,
      };

  factory UserProfile.fromMap(Map<String, dynamic> map) => UserProfile(
        uid: map['uid'] as String? ?? '',
        dietType: map['dietType'] as String? ?? 'none',
        halalPreference: map['halalPreference'] as bool? ?? true,
        allergies: List<String>.from(map['allergies'] as List? ?? const []),
        budgetMin: (map['budgetMin'] as num?)?.toInt() ?? 8,
        budgetMax: (map['budgetMax'] as num?)?.toInt() ?? 30,
        favoriteCuisines:
            List<String>.from(map['favoriteCuisines'] as List? ?? const []),
        spicyPreference: (map['spicyPreference'] as num?)?.toInt() ?? 2,
        usualMealTimes: List<String>.from(
            map['usualMealTimes'] as List? ?? const ['lunch', 'dinner']),
      );

  String toJson() => jsonEncode(toMap());

  factory UserProfile.fromJson(String source) =>
      UserProfile.fromMap(jsonDecode(source) as Map<String, dynamic>);
}
