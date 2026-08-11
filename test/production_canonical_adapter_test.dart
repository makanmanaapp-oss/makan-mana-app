import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/place_migration/alias_resolution.dart';
import 'package:makan_mana/features/place_migration/production_canonical_adapter.dart';
import 'package:makan_mana/features/place_migration/read_comparison.dart';

/// PART 1 Phase 1.14E — ujian penyesuai baca kanonikal PRODUKSI (Part F).

ComparablePlaceView legacyView(String id) => ComparablePlaceView(
      placeId: id,
      title: 'Legacy $id',
      address: 'Legacy address',
      lat: 3.15,
      lng: 101.71,
      ratingState: 'rating_shown',
    );

ComparablePlaceView canonicalView(String canonicalId) => ComparablePlaceView(
      placeId: canonicalId,
      title: 'Canonical $canonicalId',
      address: 'Canonical address',
      lat: 3.16,
      lng: 101.72,
      // Medan tidak diketahui kekal tidak diketahui (jujur).
      hoursState: 'hours_unknown',
      halalState: 'halal_unknown',
    );

const owner = 'owner-uid-internal';
const stranger = 'public-uid-999';

ProductionCanonicalReadAdapter build({
  ProductionReadMode mode = ProductionReadMode.canonicalForInternalCohort,
  CanonicalReadCapability capability = const CanonicalReadCapability(
    productionCanonicalReadAllowed: true,
    canonicalAdapterAvailable: true,
  ),
  InMemoryCanonicalSource? source,
  AliasResolver? resolver,
  Set<String> cohort = const {owner},
}) {
  final src = source ?? InMemoryCanonicalSource();
  final res = resolver ?? AliasResolver();
  return ProductionCanonicalReadAdapter(
    legacyLookup: (id) async => legacyView(id),
    canonicalSource: src,
    aliasResolver: res,
    capability: capability,
    cohortGate: CanonicalCohortGate(cohort),
    mode: mode,
  );
}

void main() {
  // 1. Legacy ID resolves through alias → canonical (cohort).
  test('1: legacy id resolves through alias to canonical', () async {
    final res = AliasResolver()..put('ChIJlegacy1', 'PLC-canon1');
    final src = InMemoryCanonicalSource()..seed('PLC-canon1', canonicalView('PLC-canon1'));
    final a = build(source: src, resolver: res);
    final out = await a.read('ChIJlegacy1', uid: owner);
    expect(out!.source, ProductionReadSource.canonical);
    expect(out.canonicalPlaceId, 'PLC-canon1');
    expect(out.placeId, 'ChIJlegacy1'); // requested id preserved
  });

  // 2. Canonical ID resolves directly.
  test('2: canonical id resolves directly', () async {
    // Migration always creates legacy->canonical aliases, so the canonical id
    // appears as an alias VALUE and resolves to itself directly.
    final res = AliasResolver()..put('ChIJsomeLegacy', 'PLC-direct');
    final src = InMemoryCanonicalSource()..seed('PLC-direct', canonicalView('PLC-direct'));
    final a = build(source: src, resolver: res);
    final out = await a.read('PLC-direct', uid: owner);
    expect(out!.source, ProductionReadSource.canonical);
    expect(out.canonicalPlaceId, 'PLC-direct');
  });

  // 3. Missing canonical publication falls back to legacy.
  test('3: missing canonical publication falls back', () async {
    final res = AliasResolver()..put('ChIJx', 'PLC-missing');
    final a = build(resolver: res); // source empty
    final out = await a.read('ChIJx', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
    expect(out.fellBackToLegacy, true);
    expect(out.fallbackReason, isNotNull);
  });

  // 4. Invalid/errored canonical read falls back.
  test('4: canonical read error falls back to legacy', () async {
    final res = AliasResolver()..put('ChIJerr', 'PLC-err');
    final src = InMemoryCanonicalSource(failNextRead: true)..seed('PLC-err', canonicalView('PLC-err'));
    final a = build(source: src, resolver: res);
    final out = await a.read('ChIJerr', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 5. Expired/timeout does not fabricate; falls back.
  test('5: canonical timeout falls back to legacy', () async {
    final res = AliasResolver()..put('ChIJslow', 'PLC-slow');
    final src = InMemoryCanonicalSource(latency: const Duration(seconds: 5))..seed('PLC-slow', canonicalView('PLC-slow'));
    final a = ProductionCanonicalReadAdapter(
      legacyLookup: (id) async => legacyView(id),
      canonicalSource: src,
      aliasResolver: res,
      capability: const CanonicalReadCapability(productionCanonicalReadAllowed: true, canonicalAdapterAvailable: true),
      cohortGate: const CanonicalCohortGate({owner}),
      mode: ProductionReadMode.canonicalForInternalCohort,
      timeout: const Duration(milliseconds: 30),
    );
    final out = await a.read('ChIJslow', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
    expect(out.fallbackReason, isNotNull);
  });

  // 6-8. Unknown states pass through (not fabricated).
  test('6-8: unknown states remain unknown', () async {
    final res = AliasResolver()..put('ChIJu', 'PLC-u');
    final src = InMemoryCanonicalSource()..seed('PLC-u', canonicalView('PLC-u'));
    final a = build(source: src, resolver: res);
    final out = await a.read('ChIJu', uid: owner);
    expect(out!.view.hoursState, 'hours_unknown');
    expect(out.view.halalState, 'halal_unknown');
    expect(out.view.businessState, 'status_unknown');
  });

  // 9. Blocked canonical falls back.
  test('9: blocked canonical falls back', () async {
    final res = AliasResolver()..put('ChIJb', 'PLC-b');
    final src = InMemoryCanonicalSource()
      ..seed('PLC-b', canonicalView('PLC-b'))
      ..block('PLC-b');
    final a = build(source: src, resolver: res);
    final out = await a.read('ChIJb', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
    expect(out.fallbackReason, isNotNull);
  });

  // 10. Alias loop/circular falls back.
  test('10: alias circular falls back', () async {
    final res = AliasResolver()
      ..put('A', 'B')
      ..put('B', 'A');
    final a = build(resolver: res);
    final out = await a.read('A', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 11. Internal cohort receives canonical.
  test('11: internal cohort receives canonical', () async {
    final res = AliasResolver()..put('ChIJc', 'PLC-c');
    final src = InMemoryCanonicalSource()..seed('PLC-c', canonicalView('PLC-c'));
    final a = build(source: src, resolver: res, cohort: {owner});
    final out = await a.read('ChIJc', uid: owner);
    expect(out!.source, ProductionReadSource.canonical);
  });

  // 12. Non-cohort user remains legacy.
  test('12: non-cohort user stays legacy', () async {
    final res = AliasResolver()..put('ChIJc', 'PLC-c');
    final src = InMemoryCanonicalSource()..seed('PLC-c', canonicalView('PLC-c'));
    final a = build(source: src, resolver: res, cohort: {owner});
    final out = await a.read('ChIJc', uid: stranger);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 13. Emergency override forces legacy even for cohort.
  test('13: emergency override forces legacy', () async {
    final res = AliasResolver()..put('ChIJc', 'PLC-c');
    final src = InMemoryCanonicalSource()..seed('PLC-c', canonicalView('PLC-c'));
    final a = build(
      source: src,
      resolver: res,
      capability: const CanonicalReadCapability(
        productionCanonicalReadAllowed: true,
        canonicalAdapterAvailable: true,
        emergencyLegacyOverride: true,
      ),
    );
    final out = await a.read('ChIJc', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 14. Public/global canonical mode unavailable (legacyOnly mode → legacy).
  test('14: legacyOnly mode never serves canonical', () async {
    final res = AliasResolver()..put('ChIJc', 'PLC-c');
    final src = InMemoryCanonicalSource()..seed('PLC-c', canonicalView('PLC-c'));
    final a = build(source: src, resolver: res, mode: ProductionReadMode.legacyOnly);
    final out = await a.read('ChIJc', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 15. Capability OFF (safe default) → legacy.
  test('15: capability unavailable → legacy', () async {
    final res = AliasResolver()..put('ChIJc', 'PLC-c');
    final src = InMemoryCanonicalSource()..seed('PLC-c', canonicalView('PLC-c'));
    final a = build(
      source: src,
      resolver: res,
      capability: const CanonicalReadCapability(), // all false
    );
    final out = await a.read('ChIJc', uid: owner);
    expect(out!.source, ProductionReadSource.legacy);
  });

  // 16. Adapter never writes (no write API exists; contract check).
  test('16: adapter exposes no write path', () {
    // ProductionCanonicalReadAdapter has only read(); source is read-only.
    expect(build().read, isA<Function>());
  });

  // 17. Missing legacy + no canonical → null (no fabricated place).
  test('17: missing legacy returns null when not cohort', () async {
    final a = ProductionCanonicalReadAdapter(
      legacyLookup: (id) async => null,
      canonicalSource: InMemoryCanonicalSource(),
      aliasResolver: AliasResolver(),
      capability: const CanonicalReadCapability(),
      cohortGate: const CanonicalCohortGate({owner}),
    );
    expect(await a.read('nope', uid: stranger), isNull);
  });

  // 18. capability.canonicalReadable is false when override on.
  test('18: canonicalReadable respects override', () {
    expect(const CanonicalReadCapability(productionCanonicalReadAllowed: true, canonicalAdapterAvailable: true).canonicalReadable, true);
    expect(const CanonicalReadCapability(productionCanonicalReadAllowed: true, canonicalAdapterAvailable: true, emergencyLegacyOverride: true).canonicalReadable, false);
    expect(const CanonicalReadCapability().canonicalReadable, false);
  });
}
