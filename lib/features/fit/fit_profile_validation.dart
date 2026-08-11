/// Phase 2.16A — Fit profile bounded validation (pure, testable).
///
/// Rejects impossible values BEFORE persistence (fixes the 2.16 defect where
/// height=0 was accepted). Ranges are product-safe human bounds, documented
/// here and mirrored in firestore.rules for defense beyond the UI.
library;

import 'fit_models.dart';

/// Documented product-safe ranges. Values outside these are rejected, never
/// silently clamped.
class FitProfileBounds {
  static const double heightMinCm = 100;
  static const double heightMaxCm = 250;
  static const double weightMinKg = 25;
  static const double weightMaxKg = 400;
  static const int ageMin = 10;
  static const int ageMax = 120;
  static const int trainingDaysMin = 1;
  static const int trainingDaysMax = 7;
  static const int sessionDurationMinMin = 5;
  static const int sessionDurationMaxMin = 240;
  static const int stepTargetMin = 0;
  static const int stepTargetMax = 100000;
}

/// Fields that can fail validation (map to localized error keys).
enum FitProfileField {
  height,
  weight,
  age,
  targetWeight,
  trainingDays,
  sessionDuration,
  stepTarget,
}

class FitProfileValidation {
  final Map<FitProfileField, String> errors; // field -> l10n key
  const FitProfileValidation(this.errors);
  bool get ok => errors.isEmpty;
}

/// Raw text/number inputs from the onboarding form.
class FitProfileInput {
  final String heightText;
  final String weightText;
  final String ageText;
  final String? targetWeightText;
  final int trainingDays;
  final int sessionDurationMinutes;
  final String stepTargetText;
  const FitProfileInput({
    required this.heightText,
    required this.weightText,
    required this.ageText,
    this.targetWeightText,
    required this.trainingDays,
    required this.sessionDurationMinutes,
    required this.stepTargetText,
  });
}

double? _num(String s) {
  final t = s.trim();
  if (t.isEmpty) return null;
  final v = double.tryParse(t);
  if (v == null || !v.isFinite) return null; // rejects NaN/Infinity/malformed
  return v;
}

/// Validate onboarding input. Missing required fields, non-positive, out-of-range,
/// NaN/Infinity and malformed text all fail. Optional targetWeight only checked
/// when provided.
FitProfileValidation validateFitProfileInput(FitProfileInput i) {
  final e = <FitProfileField, String>{};

  final h = _num(i.heightText);
  if (h == null || h < FitProfileBounds.heightMinCm || h > FitProfileBounds.heightMaxCm) {
    e[FitProfileField.height] = 'fitInvalidHeight';
  }
  final w = _num(i.weightText);
  if (w == null || w < FitProfileBounds.weightMinKg || w > FitProfileBounds.weightMaxKg) {
    e[FitProfileField.weight] = 'fitInvalidWeight';
  }
  final a = _num(i.ageText);
  if (a == null || a != a.roundToDouble() || a < FitProfileBounds.ageMin || a > FitProfileBounds.ageMax) {
    e[FitProfileField.age] = 'fitInvalidAge';
  }
  final tw = i.targetWeightText;
  if (tw != null && tw.trim().isNotEmpty) {
    final t = _num(tw);
    if (t == null || t < FitProfileBounds.weightMinKg || t > FitProfileBounds.weightMaxKg) {
      e[FitProfileField.targetWeight] = 'fitInvalidTargetWeight';
    }
  }
  if (i.trainingDays < FitProfileBounds.trainingDaysMin ||
      i.trainingDays > FitProfileBounds.trainingDaysMax) {
    e[FitProfileField.trainingDays] = 'fitInvalidTrainingDays';
  }
  if (i.sessionDurationMinutes < FitProfileBounds.sessionDurationMinMin ||
      i.sessionDurationMinutes > FitProfileBounds.sessionDurationMaxMin) {
    e[FitProfileField.sessionDuration] = 'fitInvalidSessionDuration';
  }
  final st = _num(i.stepTargetText);
  if (st == null || st < FitProfileBounds.stepTargetMin || st > FitProfileBounds.stepTargetMax) {
    e[FitProfileField.stepTarget] = 'fitInvalidStepTarget';
  }

  return FitProfileValidation(e);
}

/// Whether an already-STORED profile is structurally valid. Used to surface a
/// PROFILE_INCOMPLETE state for legacy invalid data (e.g. height=0) without a
/// bulk migration or silently rewriting the user's data.
bool isStoredProfileValid(FitnessProfile p) {
  if (!(p.heightCm.isFinite &&
      p.heightCm >= FitProfileBounds.heightMinCm &&
      p.heightCm <= FitProfileBounds.heightMaxCm)) {
    return false;
  }
  if (!(p.weightKg.isFinite &&
      p.weightKg >= FitProfileBounds.weightMinKg &&
      p.weightKg <= FitProfileBounds.weightMaxKg)) {
    return false;
  }
  if (p.age < FitProfileBounds.ageMin || p.age > FitProfileBounds.ageMax) {
    return false;
  }
  return true;
}
