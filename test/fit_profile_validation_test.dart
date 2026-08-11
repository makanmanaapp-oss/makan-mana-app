import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/fit_profile_validation.dart';

/// Phase 2.16A — Fit profile validation (pure).
void main() {
  FitProfileInput input({
    String height = '170',
    String weight = '70',
    String age = '25',
    String? targetWeight,
    int days = 3,
    int duration = 45,
    String steps = '8000',
  }) =>
      FitProfileInput(
        heightText: height,
        weightText: weight,
        ageText: age,
        targetWeightText: targetWeight,
        trainingDays: days,
        sessionDurationMinutes: duration,
        stepTargetText: steps,
      );

  test('valid profile passes', () {
    expect(validateFitProfileInput(input()).ok, isTrue);
  });

  test('height=0 rejected', () {
    final r = validateFitProfileInput(input(height: '0'));
    expect(r.ok, isFalse);
    expect(r.errors[FitProfileField.height], 'fitInvalidHeight');
  });

  test('negative height rejected', () {
    expect(validateFitProfileInput(input(height: '-170')).ok, isFalse);
  });

  test('extreme height rejected', () {
    expect(validateFitProfileInput(input(height: '999')).ok, isFalse);
  });

  test('zero/negative weight rejected', () {
    expect(validateFitProfileInput(input(weight: '0')).ok, isFalse);
    expect(validateFitProfileInput(input(weight: '-5')).ok, isFalse);
  });

  test('impossible age rejected', () {
    expect(validateFitProfileInput(input(age: '0')).ok, isFalse);
    expect(validateFitProfileInput(input(age: '200')).ok, isFalse);
  });

  test('malformed / empty rejected', () {
    expect(validateFitProfileInput(input(height: 'abc')).ok, isFalse);
    expect(validateFitProfileInput(input(weight: '')).ok, isFalse);
    expect(validateFitProfileInput(input(steps: '')).ok, isFalse);
  });

  test('invalid training days rejected', () {
    expect(validateFitProfileInput(input(days: 0)).ok, isFalse);
    expect(validateFitProfileInput(input(days: 8)).ok, isFalse);
  });

  test('invalid session duration rejected', () {
    expect(validateFitProfileInput(input(duration: 0)).ok, isFalse);
    expect(validateFitProfileInput(input(duration: 1000)).ok, isFalse);
  });

  test('invalid step target rejected', () {
    expect(validateFitProfileInput(input(steps: '-1')).ok, isFalse);
    expect(validateFitProfileInput(input(steps: '999999')).ok, isFalse);
  });

  test('optional target weight only checked when provided', () {
    expect(validateFitProfileInput(input(targetWeight: null)).ok, isTrue);
    expect(validateFitProfileInput(input(targetWeight: '65')).ok, isTrue);
    expect(validateFitProfileInput(input(targetWeight: '0')).ok, isFalse);
  });

  test('stored profile validity: height=0 => invalid (PROFILE_INCOMPLETE)', () {
    const bad = FitnessProfile(
      heightCm: 0, weightKg: 70, age: 25, gender: 'male',
      mainGoal: 'healthy', fitnessLevel: 'beginner',
    );
    const good = FitnessProfile(
      heightCm: 170, weightKg: 70, age: 25, gender: 'male',
      mainGoal: 'healthy', fitnessLevel: 'beginner',
    );
    expect(isStoredProfileValid(bad), isFalse);
    expect(isStoredProfileValid(good), isTrue);
  });
}
