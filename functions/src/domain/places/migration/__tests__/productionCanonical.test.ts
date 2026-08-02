/**
 * Phase 1.14E — ujian keselamatan builder kanonikal PRODUKSI (TULEN).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLegacyInventory, LegacyRecordInput } from "../legacyInventory";
import { buildLegacyMigrationPlan } from "../dryRunPlanner";
import { LegacyPlaceMigrationCandidate } from "../migrationCandidate";
import {
  PRODUCTION_WRITE_ALLOWLIST,
  PRODUCTION_WRITE_FORBIDDEN,
  ProductionMigrationRefusal,
  buildProductionCanonicalWrite,
  productionBatchId,
} from "../productionCanonical";

const T = 1_700_000_000_000;
const BATCH = "PMB-test";
const BACKUP = "gs://makanmana-c59f3-firestore-backups/firestore/2026-xx";

function rec(over: Partial<LegacyRecordInput> = {}): LegacyRecordInput {
  return {
    legacyCollection: "place_details",
    legacyDocumentPath: `place_details/${over.legacyPlaceId ?? "ChIJreadyPlace0001"}`,
    legacyPlaceId: over.legacyPlaceId ?? "ChIJreadyPlace0001",
    providerPlaceId: over.providerPlaceId ?? over.legacyPlaceId ?? "ChIJreadyPlace0001",
    displayName: over.displayName ?? "Nasi Kandar Pelita",
    address: over.address ?? "1 Jalan Ampang, KL",
    lat: over.lat ?? 3.1578,
    lng: over.lng ?? 101.7123,
    rating: over.rating,
    reviewCount: over.reviewCount,
    source: "google_places",
    referencedBy: [],
    ...over,
  };
}

function readyCandidate(over: Partial<LegacyRecordInput> = {}): LegacyPlaceMigrationCandidate {
  const inv = buildLegacyInventory([rec(over)], T);
  const { candidates } = buildLegacyMigrationPlan({ batchId: "b", records: inv, createdBy: "t" }, T);
  const ready = candidates.find((c) => c.migrationDecision === "ready");
  assert.ok(ready, "expected a ready candidate for the test fixture");
  return ready!;
}

// 1. Happy path → registry + publication + head + aliases.
test("1: builds registry/publication/head/aliases for a ready candidate", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.ok(w.registry.canonicalPlaceId.startsWith("PLC-"));
  assert.equal(w.registry.providerPlaceId, "ChIJreadyPlace0001");
  assert.ok(w.publication.publicationId.startsWith("PUB-"));
  assert.equal(w.head.activePublicationId, w.publication.publicationId);
  assert.ok(w.aliases.length >= 1);
});

// 2. Canonical id is deterministic from provider id (no drift).
test("2: canonical id deterministic from provider id", () => {
  const a = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  const b = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(a.registry.canonicalPlaceId, b.registry.canonicalPlaceId);
  assert.equal(a.publication.publicationId, b.publication.publicationId);
});

// 3. Coordinates carried through.
test("3: coordinates carried into registry + publication", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(w.registry.lat, 3.1578);
  assert.equal(w.publication.lng, 101.7123);
});

// 4. Address carried; missing address → null (never fabricated).
test("4: missing address becomes null", () => {
  const w = buildProductionCanonicalWrite(readyCandidate({ address: undefined }), BATCH, BACKUP, T);
  assert.equal(w.registry.address, null);
  assert.equal(w.publication.address, null);
});

// 5. Unknown states honest when rating/price/hours unknown.
test("5: unknown states stay unknown", () => {
  const w = buildProductionCanonicalWrite(readyCandidate({ rating: undefined }), BATCH, BACKUP, T);
  assert.equal(w.publication.ratingState, "rating_hidden");
  assert.equal(w.publication.hoursState, "hours_unknown");
  assert.equal(w.publication.halalState, "halal_unknown");
  assert.equal(w.publication.allergenState, "allergen_unknown");
  assert.equal(w.publication.businessState, "status_unknown");
});

// 6. Rating shown only when known (>0 with reviews).
test("6: rating shown only when known", () => {
  const w = buildProductionCanonicalWrite(readyCandidate({ rating: 4.5, reviewCount: 120 }), BATCH, BACKUP, T);
  assert.equal(w.publication.ratingState, "rating_shown");
});

// 7. Aliases keyed by provider/legacy id → canonical (resolver contract).
test("7: alias docId is the legacy/provider id, maps to canonical", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  const providerAlias = w.aliases.find((a) => a.aliasType === "provider_place_id");
  assert.ok(providerAlias);
  assert.equal(providerAlias!.aliasDocId, "ChIJreadyPlace0001");
  assert.equal(providerAlias!.canonicalPlaceId, w.registry.canonicalPlaceId);
  assert.equal(providerAlias!.status, "active");
});

// 8. Publication is published + not blocked.
test("8: publication published and not blocked", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(w.publication.publicationStatus, "published");
  assert.equal(w.publication.blocked, false);
});

// 9. Registry records provenance + batch + backup + internal scope.
test("9: registry provenance/batch/backup/scope", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(w.registry.provenanceSource, "google_places_details");
  assert.equal(w.registry.migrationBatchId, BATCH);
  assert.equal(w.registry.backupReference, BACKUP);
  assert.equal(w.registry.publicScope, "internal_cohort_only");
});

// 10. REFUSE not-ready (held) candidate.
test("10: refuses a held candidate", () => {
  const held = readyCandidate();
  const tampered = { ...held, migrationDecision: "review_required", holdReasons: ["canonical_validation_failed"] } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "not_ready");
});

// 11. REFUSE missing location.
test("11: refuses missing location", () => {
  const c = readyCandidate();
  const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, lat: undefined, lng: undefined } } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "missing_location");
});

// 12. REFUSE invalid latitude.
test("12: refuses invalid latitude", () => {
  const c = readyCandidate();
  const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, lat: 999 } } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "missing_location");
});

// 13. REFUSE provider mismatch (empty provider).
test("13: refuses empty provider id", () => {
  const c = readyCandidate();
  const tampered = { ...c, normalizedIdentity: { ...c.normalizedIdentity, providerPlaceId: undefined }, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, providerPlaceId: undefined } } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "provider_mismatch");
});

// 14. REFUSE canonical id drift.
test("14: refuses canonical id drift", () => {
  const c = readyCandidate();
  const tampered = { ...c, proposedCanonicalPlaceId: "PLC-tampered000000000000" } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "canonical_id_drift");
});

// 15. REFUSE empty display name.
test("15: refuses empty display name", () => {
  const c = readyCandidate();
  const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, canonicalName: "" } } as unknown as LegacyPlaceMigrationCandidate;
  assert.throws(() => buildProductionCanonicalWrite(tampered, BATCH, BACKUP, T), (e: unknown) => e instanceof ProductionMigrationRefusal && e.code === "empty_display_name");
});

// 16. Write allowlist covers exactly the intended canonical collections.
test("16: write allowlist is the approved set", () => {
  assert.deepEqual([...PRODUCTION_WRITE_ALLOWLIST].sort(), [
    "place_migration_aliases", "place_migration_audit", "place_migration_batches",
    "place_publication_heads", "place_publications", "place_registry",
  ].sort());
});

// 17. place_details / places_cache / user collections are on the forbidden list.
test("17: forbidden list protects legacy + user data", () => {
  for (const c of ["place_details", "places_cache", "users", "favorites", "meals", "suggestion_sessions"]) {
    assert.ok((PRODUCTION_WRITE_FORBIDDEN as readonly string[]).includes(c), `${c} must be forbidden`);
  }
});

// 18. Allowlist and forbidden lists are disjoint.
test("18: allowlist and forbidden are disjoint", () => {
  const allow = new Set<string>(PRODUCTION_WRITE_ALLOWLIST);
  for (const f of PRODUCTION_WRITE_FORBIDDEN) assert.ok(!allow.has(f));
});

// 19. Batch id deterministic from manifest checksum.
test("19: batch id deterministic from manifest checksum", () => {
  assert.equal(productionBatchId("925c3b83df84ce70aaaa"), "PMB-925c3b83df84ce70aaaa");
});

// 20. Publication content hash stable for same input.
test("20: publication content hash stable", () => {
  const a = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  const b = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(a.publication.contentHash, b.publication.contentHash);
});

// 21. Head points at the built publication.
test("21: head activePublicationId == publicationId", () => {
  const w = buildProductionCanonicalWrite(readyCandidate(), BATCH, BACKUP, T);
  assert.equal(w.head.placeId, w.registry.canonicalPlaceId);
  assert.equal(w.head.activePublicationId, w.publication.publicationId);
});

// 22. Different providers → different canonical + publication ids.
test("22: distinct providers yield distinct canonical ids", () => {
  const a = buildProductionCanonicalWrite(readyCandidate({ legacyPlaceId: "ChIJplaceAAA111", providerPlaceId: "ChIJplaceAAA111" }), BATCH, BACKUP, T);
  const b = buildProductionCanonicalWrite(readyCandidate({ legacyPlaceId: "ChIJplaceBBB222", providerPlaceId: "ChIJplaceBBB222" }), BATCH, BACKUP, T);
  assert.notEqual(a.registry.canonicalPlaceId, b.registry.canonicalPlaceId);
  assert.notEqual(a.publication.publicationId, b.publication.publicationId);
});
