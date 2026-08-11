/// Phase 2.15A — Calorie Scan result model + edit draft + pure validation.
///
/// Honesty rules encoded here:
/// - macros are estimates with explicit provenance (model / fallback / user);
/// - a macro the model did not return is `null` ("not estimated"), never 0;
/// - edited values are distinguishable from the original estimate;
/// - bounds mirror the server (`scanMealValidation.ts`).
library;

/// Provenance for a calorie/macro figure.
enum EstimateSource { model, fallback, user, notEstimated }

extension EstimateSourceKey on EstimateSource {
  String get key {
    switch (this) {
      case EstimateSource.model:
        return 'model';
      case EstimateSource.fallback:
        return 'fallback';
      case EstimateSource.user:
        return 'user';
      case EstimateSource.notEstimated:
        return 'not_estimated';
    }
  }
}

/// A single macro amount (grams) plus where it came from.
class MacroValue {
  final int? grams; // null => not estimated (NOT zero)
  final EstimateSource source;
  const MacroValue(this.grams, this.source);

  bool get estimated => grams != null;

  static MacroValue fromModel(Object? raw) {
    if (raw is num && raw.isFinite && raw >= 0) {
      return MacroValue(raw.round(), EstimateSource.model);
    }
    return const MacroValue(null, EstimateSource.notEstimated);
  }
}

/// Reasonable single-meal upper bounds (must match the server).
class ScanBounds {
  static const int caloriesMax = 20000;
  static const int macroMaxG = 2000;
  static const int nameMaxLen = 120;
}

class CalorieScanResult {
  /// Stable id for this result; reused as the idempotency actionId on save.
  final String scanId;
  final List<String> foodNames;
  final String mealName;
  final int calories;
  final EstimateSource calorieSource;
  final MacroValue protein;
  final MacroValue carbs;
  final MacroValue fat;
  final String? note;
  final bool isHealthy;

  const CalorieScanResult({
    required this.scanId,
    required this.foodNames,
    required this.mealName,
    required this.calories,
    required this.calorieSource,
    required this.protein,
    required this.carbs,
    required this.fat,
    required this.note,
    required this.isHealthy,
  });

  bool get hasFood => calories > 0;

  /// Parse the raw `scanCalories` result. Absent macros stay `not estimated`.
  factory CalorieScanResult.fromApi(
    Map<String, dynamic> r, {
    required String scanId,
  }) {
    final foods = (r['foods'] as List? ?? [])
        .map((f) => Map<String, dynamic>.from(f as Map))
        .toList();
    final names = foods
        .map((f) => (f['name'] as String? ?? '').trim())
        .where((n) => n.isNotEmpty)
        .toList();
    final calRaw = r['totalCalories'];
    final calories = (calRaw is num && calRaw.isFinite && calRaw >= 0)
        ? calRaw.round()
        : 0;
    return CalorieScanResult(
      scanId: scanId,
      foodNames: names,
      mealName: names.isEmpty ? '' : names.take(3).join(' + '),
      calories: calories,
      calorieSource: EstimateSource.model,
      protein: MacroValue.fromModel(r['totalProtein']),
      carbs: MacroValue.fromModel(r['totalCarbs']),
      fat: MacroValue.fromModel(r['totalFat']),
      note: (r['note'] as String?)?.trim().isNotEmpty ?? false
          ? (r['note'] as String).trim()
          : null,
      isHealthy: r['isHealthy'] == true,
    );
  }
}

/// Which field failed validation (localization key suffix) + null if valid.
enum ScanEditError { none, nameRequired, caloriesInvalid, macroInvalid }

/// Editable copy of a scan result. Tracks the original estimate so corrections
/// stay distinguishable and cancel can restore.
class ScanEditDraft {
  final CalorieScanResult original;
  String mealName;
  String? servingDesc;
  String calories; // raw text (validated)
  String protein; // raw text ('' allowed => not estimated)
  String carbs;
  String fat;

  ScanEditDraft._({
    required this.original,
    required this.mealName,
    required this.servingDesc,
    required this.calories,
    required this.protein,
    required this.carbs,
    required this.fat,
  });

  factory ScanEditDraft.fromResult(CalorieScanResult r) {
    String macro(MacroValue m) => m.grams?.toString() ?? '';
    return ScanEditDraft._(
      original: r,
      mealName: r.mealName,
      servingDesc: null,
      calories: r.calories.toString(),
      protein: macro(r.protein),
      carbs: macro(r.carbs),
      fat: macro(r.fat),
    );
  }

  bool _macroChanged(MacroValue orig, String text) {
    final t = text.trim();
    final origText = orig.grams?.toString() ?? '';
    return t != origText;
  }

  /// Parse a macro text into grams; '' => null (not estimated).
  static int? _parseMacro(String text) {
    final t = text.trim();
    if (t.isEmpty) return null;
    return int.tryParse(t);
  }

  /// Validate the edited values against the same bounds as the server.
  ScanEditError validate() {
    if (mealName.trim().isEmpty ||
        mealName.trim().length > ScanBounds.nameMaxLen) {
      return ScanEditError.nameRequired;
    }
    final cal = int.tryParse(calories.trim());
    if (cal == null || cal <= 0 || cal > ScanBounds.caloriesMax) {
      return ScanEditError.caloriesInvalid;
    }
    for (final text in [protein, carbs, fat]) {
      final t = text.trim();
      if (t.isEmpty) continue; // not estimated is allowed
      final v = int.tryParse(t);
      if (v == null || v < 0 || v > ScanBounds.macroMaxG) {
        return ScanEditError.macroInvalid;
      }
    }
    return ScanEditError.none;
  }

  /// Build the save payload (assumes validate() == none). Provenance preserved.
  Map<String, dynamic> toSavePayload() {
    return {
      'actionId': original.scanId,
      'menuName': mealName.trim(),
      'servingDesc': servingDesc?.trim(),
      'calories': int.parse(calories.trim()),
      'protein': _parseMacro(protein),
      'carbs': _parseMacro(carbs),
      'fat': _parseMacro(fat),
      'isHealthy': original.isHealthy,
      'mealTime': 'lunch',
      'calorieSource':
          (int.tryParse(calories.trim()) == original.calories)
              ? original.calorieSource.key
              : EstimateSource.user.key,
      'macroSource': _dominantMacroSource(),
    };
  }

  String _dominantMacroSource() {
    if (_macroChanged(original.protein, protein) ||
        _macroChanged(original.carbs, carbs) ||
        _macroChanged(original.fat, fat)) {
      return EstimateSource.user.key;
    }
    if (!original.protein.estimated &&
        !original.carbs.estimated &&
        !original.fat.estimated) {
      return EstimateSource.notEstimated.key;
    }
    return original.protein.source.key;
  }

  bool get anyMacroEdited =>
      _macroChanged(original.protein, protein) ||
      _macroChanged(original.carbs, carbs) ||
      _macroChanged(original.fat, fat);
}
