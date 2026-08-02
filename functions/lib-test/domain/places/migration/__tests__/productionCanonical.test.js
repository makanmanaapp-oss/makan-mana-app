"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.14E — ujian keselamatan builder kanonikal PRODUKSI (TULEN).
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const legacyInventory_1 = require("../legacyInventory");
const dryRunPlanner_1 = require("../dryRunPlanner");
const productionCanonical_1 = require("../productionCanonical");
const T = 1_700_000_000_000;
const BATCH = "PMB-test";
const BACKUP = "gs://makanmana-c59f3-firestore-backups/firestore/2026-xx";
function rec(over = {}) {
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
function readyCandidate(over = {}) {
    const inv = (0, legacyInventory_1.buildLegacyInventory)([rec(over)], T);
    const { candidates } = (0, dryRunPlanner_1.buildLegacyMigrationPlan)({ batchId: "b", records: inv, createdBy: "t" }, T);
    const ready = candidates.find((c) => c.migrationDecision === "ready");
    strict_1.default.ok(ready, "expected a ready candidate for the test fixture");
    return ready;
}
// 1. Happy path → registry + publication + head + aliases.
(0, node_test_1.test)("1: builds registry/publication/head/aliases for a ready candidate", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.ok(w.registry.canonicalPlaceId.startsWith("PLC-"));
    strict_1.default.equal(w.registry.providerPlaceId, "ChIJreadyPlace0001");
    strict_1.default.ok(w.publication.publicationId.startsWith("PUB-"));
    strict_1.default.equal(w.head.activePublicationId, w.publication.publicationId);
    strict_1.default.ok(w.aliases.length >= 1);
});
// 2. Canonical id is deterministic from provider id (no drift).
(0, node_test_1.test)("2: canonical id deterministic from provider id", () => {
    const a = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    const b = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(a.registry.canonicalPlaceId, b.registry.canonicalPlaceId);
    strict_1.default.equal(a.publication.publicationId, b.publication.publicationId);
});
// 3. Coordinates carried through.
(0, node_test_1.test)("3: coordinates carried into registry + publication", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(w.registry.lat, 3.1578);
    strict_1.default.equal(w.publication.lng, 101.7123);
});
// 4. Address carried; missing address → null (never fabricated).
(0, node_test_1.test)("4: missing address becomes null", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate({ address: undefined }), BATCH, BACKUP, T);
    strict_1.default.equal(w.registry.address, null);
    strict_1.default.equal(w.publication.address, null);
});
// 5. Unknown states honest when rating/price/hours unknown.
(0, node_test_1.test)("5: unknown states stay unknown", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate({ rating: undefined }), BATCH, BACKUP, T);
    strict_1.default.equal(w.publication.ratingState, "rating_hidden");
    strict_1.default.equal(w.publication.hoursState, "hours_unknown");
    strict_1.default.equal(w.publication.halalState, "halal_unknown");
    strict_1.default.equal(w.publication.allergenState, "allergen_unknown");
    strict_1.default.equal(w.publication.businessState, "status_unknown");
});
// 6. Rating shown only when known (>0 with reviews).
(0, node_test_1.test)("6: rating shown only when known", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate({ rating: 4.5, reviewCount: 120 }), BATCH, BACKUP, T);
    strict_1.default.equal(w.publication.ratingState, "rating_shown");
});
// 7. Aliases keyed by provider/legacy id → canonical (resolver contract).
(0, node_test_1.test)("7: alias docId is the legacy/provider id, maps to canonical", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    const providerAlias = w.aliases.find((a) => a.aliasType === "provider_place_id");
    strict_1.default.ok(providerAlias);
    strict_1.default.equal(providerAlias.aliasDocId, "ChIJreadyPlace0001");
    strict_1.default.equal(providerAlias.canonicalPlaceId, w.registry.canonicalPlaceId);
    strict_1.default.equal(providerAlias.status, "active");
});
// 8. Publication is published + not blocked.
(0, node_test_1.test)("8: publication published and not blocked", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(w.publication.publicationStatus, "published");
    strict_1.default.equal(w.publication.blocked, false);
});
// 9. Registry records provenance + batch + backup + internal scope.
(0, node_test_1.test)("9: registry provenance/batch/backup/scope", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(w.registry.provenanceSource, "google_places_details");
    strict_1.default.equal(w.registry.migrationBatchId, BATCH);
    strict_1.default.equal(w.registry.backupReference, BACKUP);
    strict_1.default.equal(w.registry.publicScope, "internal_cohort_only");
});
// 10. REFUSE not-ready (held) candidate.
(0, node_test_1.test)("10: refuses a held candidate", () => {
    const held = readyCandidate();
    const tampered = { ...held, migrationDecision: "review_required", holdReasons: ["canonical_validation_failed"] };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "not_ready");
});
// 11. REFUSE missing location.
(0, node_test_1.test)("11: refuses missing location", () => {
    const c = readyCandidate();
    const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, lat: undefined, lng: undefined } };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "missing_location");
});
// 12. REFUSE invalid latitude.
(0, node_test_1.test)("12: refuses invalid latitude", () => {
    const c = readyCandidate();
    const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, lat: 999 } };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "missing_location");
});
// 13. REFUSE provider mismatch (empty provider).
(0, node_test_1.test)("13: refuses empty provider id", () => {
    const c = readyCandidate();
    const tampered = { ...c, normalizedIdentity: { ...c.normalizedIdentity, providerPlaceId: undefined }, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, providerPlaceId: undefined } };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "provider_mismatch");
});
// 14. REFUSE canonical id drift.
(0, node_test_1.test)("14: refuses canonical id drift", () => {
    const c = readyCandidate();
    const tampered = { ...c, proposedCanonicalPlaceId: "PLC-tampered000000000000" };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "canonical_id_drift");
});
// 15. REFUSE empty display name.
(0, node_test_1.test)("15: refuses empty display name", () => {
    const c = readyCandidate();
    const tampered = { ...c, proposedCanonicalSnapshot: { ...c.proposedCanonicalSnapshot, canonicalName: "" } };
    strict_1.default.throws(() => (0, productionCanonical_1.buildProductionCanonicalWrite)(tampered, BATCH, BACKUP, T), (e) => e instanceof productionCanonical_1.ProductionMigrationRefusal && e.code === "empty_display_name");
});
// 16. Write allowlist covers exactly the intended canonical collections.
(0, node_test_1.test)("16: write allowlist is the approved set", () => {
    strict_1.default.deepEqual([...productionCanonical_1.PRODUCTION_WRITE_ALLOWLIST].sort(), [
        "place_migration_aliases", "place_migration_audit", "place_migration_batches",
        "place_publication_heads", "place_publications", "place_registry",
    ].sort());
});
// 17. place_details / places_cache / user collections are on the forbidden list.
(0, node_test_1.test)("17: forbidden list protects legacy + user data", () => {
    for (const c of ["place_details", "places_cache", "users", "favorites", "meals", "suggestion_sessions"]) {
        strict_1.default.ok(productionCanonical_1.PRODUCTION_WRITE_FORBIDDEN.includes(c), `${c} must be forbidden`);
    }
});
// 18. Allowlist and forbidden lists are disjoint.
(0, node_test_1.test)("18: allowlist and forbidden are disjoint", () => {
    const allow = new Set(productionCanonical_1.PRODUCTION_WRITE_ALLOWLIST);
    for (const f of productionCanonical_1.PRODUCTION_WRITE_FORBIDDEN)
        strict_1.default.ok(!allow.has(f));
});
// 19. Batch id deterministic from manifest checksum.
(0, node_test_1.test)("19: batch id deterministic from manifest checksum", () => {
    strict_1.default.equal((0, productionCanonical_1.productionBatchId)("925c3b83df84ce70aaaa"), "PMB-925c3b83df84ce70aaaa");
});
// 20. Publication content hash stable for same input.
(0, node_test_1.test)("20: publication content hash stable", () => {
    const a = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    const b = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(a.publication.contentHash, b.publication.contentHash);
});
// 21. Head points at the built publication.
(0, node_test_1.test)("21: head activePublicationId == publicationId", () => {
    const w = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate(), BATCH, BACKUP, T);
    strict_1.default.equal(w.head.placeId, w.registry.canonicalPlaceId);
    strict_1.default.equal(w.head.activePublicationId, w.publication.publicationId);
});
// 22. Different providers → different canonical + publication ids.
(0, node_test_1.test)("22: distinct providers yield distinct canonical ids", () => {
    const a = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate({ legacyPlaceId: "ChIJplaceAAA111", providerPlaceId: "ChIJplaceAAA111" }), BATCH, BACKUP, T);
    const b = (0, productionCanonical_1.buildProductionCanonicalWrite)(readyCandidate({ legacyPlaceId: "ChIJplaceBBB222", providerPlaceId: "ChIJplaceBBB222" }), BATCH, BACKUP, T);
    strict_1.default.notEqual(a.registry.canonicalPlaceId, b.registry.canonicalPlaceId);
    strict_1.default.notEqual(a.publication.publicationId, b.publication.publicationId);
});
