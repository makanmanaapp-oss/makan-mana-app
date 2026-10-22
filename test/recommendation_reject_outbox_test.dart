import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:makan_mana/core/services/recommendation_reject_outbox.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a pending reject survives reconstructing the outbox', () async {
    final prefs = await SharedPreferences.getInstance();
    await RecommendationRejectOutbox(prefs, 'a').save({'actionId': 'retry-1', 'placeId': 'shop', 'reason': 'not_mood'});
    expect(RecommendationRejectOutbox(prefs, 'a').pending?['actionId'], 'retry-1');
  });
  test('account switching does not expose or clear another user reject', () async {
    final prefs = await SharedPreferences.getInstance();
    final a = RecommendationRejectOutbox(prefs, 'a');
    final b = RecommendationRejectOutbox(prefs, 'b');
    await a.save({'actionId': 'reject-a', 'placeId': 'shop'});
    expect(b.pending, isNull);
    expect(await b.clearIfAction('reject-a'), isFalse);
    expect(a.pending, isNotNull);
  });
  test('a different reject cannot overwrite an unresolved intent', () async {
    final outbox = RecommendationRejectOutbox(await SharedPreferences.getInstance(), 'a');
    expect(await outbox.save({'actionId': 'first', 'placeId': 'a'}), isTrue);
    expect(await outbox.save({'actionId': 'second', 'placeId': 'b'}), isFalse);
    expect(outbox.pending?['placeId'], 'a');
  });
  test('late acknowledgement cannot erase a newer intent', () async {
    final outbox = RecommendationRejectOutbox(await SharedPreferences.getInstance(), 'a');
    await outbox.save({'actionId': 'first', 'placeId': 'a'});
    expect(await outbox.clearIfAction('first'), isTrue);
    await outbox.save({'actionId': 'second', 'placeId': 'b'});
    expect(await outbox.clearIfAction('first'), isFalse);
    expect(outbox.pending?['actionId'], 'second');
  });
}
