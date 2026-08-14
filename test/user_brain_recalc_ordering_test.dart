import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AI Brain recalc waits for pending Firestore writes before callable', () {
    final source = File('lib/core/services/user_brain_service.dart')
        .readAsStringSync();

    final waitIndex = source.indexOf('.waitForPendingWrites()');
    final callableIndex = source.indexOf("'recalculateUserBrain'", waitIndex);

    expect(waitIndex, greaterThanOrEqualTo(0));
    expect(callableIndex, greaterThan(waitIndex));
  });

  test('failed recalc releases its local throttle marker for retry', () {
    final source = File('lib/core/services/user_brain_service.dart')
        .readAsStringSync();

    final catchIndex = source.indexOf('} catch (e) {');
    final guardIndex = source.indexOf('if (_lastCall == now) {', catchIndex);
    final clearIndex = source.indexOf('_lastCall = null;', guardIndex);

    expect(catchIndex, greaterThanOrEqualTo(0));
    expect(guardIndex, greaterThan(catchIndex));
    expect(clearIndex, greaterThan(guardIndex));
  });

  test('authoritative reject preserves reason event before brain recalc', () {
    final source = File(
      'lib/features/suggestions/suggestion_action_controller.dart',
    ).readAsStringSync();

    final rejectEventIndex = source.indexOf('EventType.suggestionReject');
    final reasonIndex = source.indexOf("'reason': reasonId", rejectEventIndex);
    final recalcIndex = source.indexOf(
      '_ref.read(userBrainServiceProvider).recalculate();',
      rejectEventIndex,
    );

    expect(rejectEventIndex, greaterThanOrEqualTo(0));
    expect(reasonIndex, greaterThan(rejectEventIndex));
    expect(recalcIndex, greaterThan(reasonIndex));
  });
}
