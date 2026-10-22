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

  test('authoritative reject commits its reason on the server before recalc', () {
    final next = File('functions/src/callable/nextSuggestion.ts').readAsStringSync();
    final delivery = File('functions/src/services/recommendationDeliveryService.ts').readAsStringSync();
    final controller = File('lib/features/suggestions/suggestion_action_controller.dart').readAsStringSync();
    final reject = next.indexOf('await recordRecommendationReject(');
    final consume = next.indexOf('await consumeRecommendationQueue(', reject);
    expect(reject, greaterThanOrEqualTo(0));
    expect(consume, greaterThan(reject));
    expect(delivery, contains('eventType: "suggestion_reject"'));
    expect(delivery, contains('metadata: {reason, policyVersion:'));
    // The callable response now acknowledges a durable, idempotent event.
    // The client must not log a second reject event for the same action.
    expect(controller, isNot(contains('EventType.suggestionReject')));
    final call = controller.indexOf('.nextSuggestion(');
    final recalc = controller.indexOf('_ref.read(userBrainServiceProvider).recalculate();', call);
    expect(recalc, greaterThan(call));
  });
}
