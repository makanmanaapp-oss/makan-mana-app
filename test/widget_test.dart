import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/services/dummy_suggestion_service.dart';
import 'package:makan_mana/core/utils/time_slot_utils.dart';
import 'package:makan_mana/models/daily_usage.dart';

void main() {
  test('dummy suggestion service memberi cadangan', () {
    final service = DummySuggestionService();
    expect(DummySuggestionService.places, isNotEmpty);
    expect(service.heroPick().isOpen, isTrue);
    expect(service.nearby(), isNotEmpty);
    expect(service.randomPick().matchScore, greaterThan(0));
  });

  test('time slot mengikut jam', () {
    expect(TimeSlotUtils.forHour(7), 'breakfast');
    expect(TimeSlotUtils.forHour(12), 'lunch');
    expect(TimeSlotUtils.forHour(16), 'tea');
    expect(TimeSlotUtils.forHour(20), 'dinner');
    expect(TimeSlotUtils.forHour(23), 'supper');
    expect(TimeSlotUtils.forHour(2), 'supper');
    expect(TimeSlotUtils.dateKey(DateTime(2026, 7, 5)), '20260705');
  });

  test('had spin percuma 3 sehari', () {
    const fresh = DailyUsage(userId: 'u1', date: '20260705', plan: 'free');
    expect(fresh.canSpin, isTrue);
    expect(fresh.spinLeft, 3);

    const habis = DailyUsage(
        userId: 'u1', date: '20260705', plan: 'free', spinUsed: 3);
    expect(habis.canSpin, isFalse);
    expect(habis.spinLeft, 0);

    const plus = DailyUsage(
        userId: 'u1', date: '20260705', plan: 'plus', spinLimit: -1, spinUsed: 99);
    expect(plus.canSpin, isTrue);
    expect(plus.unlimited, isTrue);
  });
}
