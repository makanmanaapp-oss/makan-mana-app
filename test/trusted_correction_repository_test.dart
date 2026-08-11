import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/place_corrections/correction_models.dart';
import 'package:makan_mana/features/place_corrections/correction_providers.dart';
import 'package:makan_mana/features/place_corrections/correction_repository.dart';
import 'package:makan_mana/features/place_corrections/place_correction_flags.dart';
import 'package:makan_mana/features/place_corrections/trusted_correction_repository.dart';
import 'package:makan_mana/features/place_migration/place_migration_flags.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// PART 1 Phase 1.14A — ujian repo pembetulan dipercayai (DILUMPUHKAN lalai).

class _FakeCallable implements CorrectionCallableClient {
  _FakeCallable(this.responder);
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) responder;
  Map<String, dynamic>? lastPayload;

  @override
  Future<Map<String, dynamic>> call(Map<String, dynamic> payload) {
    lastPayload = payload;
    return responder(payload);
  }
}

ReportOriginalSnapshot _snap() => ReportOriginalSnapshot(
      placeId: 'stable-place-123',
      title: 'Nasi Kandar Pelita',
      capturedAt: DateTime.fromMillisecondsSinceEpoch(1700000000000),
      contentHash: 'hash1',
    );

CorrectionDraft _draft() => CorrectionDraft(
      snapshot: _snap(),
      category: ReportCategory.wrongHours,
      affectedField: CorrectableField.openingHours,
      proposedValue: '9am-10pm',
      description: 'The opening hours on the card are outdated after renovation.',
    );

void main() {
  tearDown(() {
    PlaceMigrationFeatureFlags.resetToSafeDefaults();
    PlaceCorrectionFlags.resetToSafeDefault();
  });

  test('categoryWire converts Dart enum to backend snake_case', () {
    expect(TrustedPlaceCorrectionRepository.categoryWire(ReportCategory.wrongHours),
        'wrong_hours');
    expect(
        TrustedPlaceCorrectionRepository.categoryWire(ReportCategory.unsafeHalalClaim),
        'unsafe_halal_claim');
    expect(TrustedPlaceCorrectionRepository.categoryWire(ReportCategory.other), 'other');
  });

  test('submit maps payload + returns tracking ID on success', () async {
    final fake = _FakeCallable((_) async =>
        {'success': true, 'trackingId': 'MM-RPT-ABC123', 'deduplicated': false, 'status': 'submitted'});
    final repo = TrustedPlaceCorrectionRepository(client: fake);

    final outcome = await repo.submit(_draft());

    expect(outcome.accepted, isTrue);
    expect(outcome.trackingId, 'MM-RPT-ABC123');
    expect(outcome.deduplicated, isFalse);
    expect(fake.lastPayload!['placeId'], 'stable-place-123');
    expect(fake.lastPayload!['correctionType'], 'wrong_hours');
    expect(fake.lastPayload!['proposedValue'], '9am-10pm');
    expect((fake.lastPayload!['clientRequestId'] as String).startsWith('req_'), isTrue);
    expect(fake.lastPayload!['evidenceRefs'], isEmpty); // deferred to Part D
  });

  test('submit surfaces deduplicated flag', () async {
    final fake = _FakeCallable((_) async =>
        {'success': true, 'trackingId': 'MM-RPT-DUP', 'deduplicated': true});
    final repo = TrustedPlaceCorrectionRepository(client: fake);
    final outcome = await repo.submit(_draft());
    expect(outcome.deduplicated, isTrue);
  });

  test('submit never fakes success on thrown error', () async {
    final fake = _FakeCallable((_) async => throw Exception('network'));
    final repo = TrustedPlaceCorrectionRepository(client: fake);
    final outcome = await repo.submit(_draft());
    expect(outcome.accepted, isFalse);
    expect(outcome.errorKeys, contains('correctionErrInternal'));
  });

  test('error code map covers all safe callable codes', () {
    for (final code in [
      'unauthenticated',
      'app_check_required',
      'invalid_argument',
      'rate_limited',
      'description_too_short',
      'internal',
    ]) {
      expect(kCorrectionErrorKeyByCode.containsKey(code), isTrue, reason: code);
    }
  });

  test('DEFAULT provider is still LocalPlaceCorrectionRepository (trusted OFF)', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final repo = container.read(placeCorrectionRepositoryProvider);
    expect(repo, isA<LocalPlaceCorrectionRepository>());
    expect(PlaceMigrationFeatureFlags.trustedCorrectionCallableAvailable, isFalse);
  });
}
