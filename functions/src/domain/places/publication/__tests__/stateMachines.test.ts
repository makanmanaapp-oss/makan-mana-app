/**
 * Phase 1.6 Part O — ujian mesin keadaan (15-24).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidPlaceStatusTransition,
  assertValidPublicationTransition,
  canTransitionPlaceStatus,
  canTransitionPublicationStatus,
  canTransitionVerificationStatus,
  checkPlaceStatusTransition,
  checkPublicationTransition,
  checkVerificationTransition,
} from "../index";

// ---------------- Part D: status perniagaan ----------------

// 15. pending_validation → active dibenarkan.
test("15. pending_validation → active dibenarkan", () => {
  assert.equal(canTransitionPlaceStatus("pending_validation", "active"), true);
});

// 16. active → temporarily_closed dibenarkan.
test("16. active → temporarily_closed dibenarkan", () => {
  assert.equal(canTransitionPlaceStatus("active", "temporarily_closed"), true);
});

// 17. temporarily_closed → active dibenarkan.
test("17. temporarily_closed → active dibenarkan", () => {
  assert.equal(canTransitionPlaceStatus("temporarily_closed", "active"), true);
});

test("active → permanently_closed / moved / hidden_by_admin dibenarkan", () => {
  assert.equal(canTransitionPlaceStatus("active", "permanently_closed"), true);
  assert.equal(canTransitionPlaceStatus("active", "moved"), true);
  assert.equal(canTransitionPlaceStatus("active", "hidden_by_admin"), true);
});

// 18. permanently_closed → active DILARANG tanpa reopen terkawal.
test("18. permanently_closed → active dilarang tanpa bukti reopen", () => {
  const r = checkPlaceStatusTransition("permanently_closed", "active");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "reopen_requires_controlled_evidence");
  assert.deepEqual(r.requiredEvidence, ["reopenEvidence", "trustedActor"]);
  assert.throws(() => assertValidPlaceStatusTransition("permanently_closed", "active"));
});

test("18b. permanently_closed → active DIBENARKAN dengan bukti reopen penuh", () => {
  assert.equal(
    canTransitionPlaceStatus("permanently_closed", "active", {
      reopenEvidence: true,
      trustedActor: true,
    }),
    true,
  );
  // Bukti separa masih ditolak.
  assert.equal(
    canTransitionPlaceStatus("permanently_closed", "active", { reopenEvidence: true }),
    false,
  );
});

test("moved → active memerlukan semakan lokasi", () => {
  assert.equal(canTransitionPlaceStatus("moved", "active"), false);
  assert.equal(
    canTransitionPlaceStatus("moved", "active", { locationReviewed: true }),
    true,
  );
});

test("hidden_by_admin → active memerlukan restore dipercayai", () => {
  assert.equal(canTransitionPlaceStatus("hidden_by_admin", "active"), false);
  assert.equal(
    canTransitionPlaceStatus("hidden_by_admin", "active", { trustedRestore: true }),
    true,
  );
});

test("stale_critical → active selepas revalidasi", () => {
  assert.equal(canTransitionPlaceStatus("stale_critical", "active"), false);
  assert.equal(
    canTransitionPlaceStatus("stale_critical", "active", { revalidated: true }),
    true,
  );
});

test("peralihan no-op ditolak", () => {
  assert.equal(canTransitionPlaceStatus("active", "active"), false);
});

// ---------------- Part E: verification ----------------

test("verification: community_reported TIDAK boleh senyap menjadi admin_verified", () => {
  const r = checkVerificationTransition("community_reported", "admin_verified");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "admin_verification_requires_trusted_actor");
  assert.equal(
    canTransitionVerificationStatus("community_reported", "admin_verified", {
      trustedActor: true,
    }),
    true,
  );
});

test("verification: merchant_verified memerlukan bukti merchant", () => {
  assert.equal(canTransitionVerificationStatus("unverified", "merchant_verified"), false);
  assert.equal(
    canTransitionVerificationStatus("unverified", "merchant_verified", {
      merchantEvidence: true,
    }),
    true,
  );
});

test("verification: rejected tidak boleh menjadi verified tanpa revalidasi", () => {
  assert.equal(canTransitionVerificationStatus("rejected", "source_verified"), false);
  assert.equal(
    canTransitionVerificationStatus("rejected", "admin_verified", { trustedActor: true }),
    false,
    "trustedActor sahaja tidak memadai untuk keluar dari rejected",
  );
  assert.equal(
    canTransitionVerificationStatus("rejected", "source_verified", { revalidated: true }),
    true,
  );
});

test("verification: unverified → source_verified dibenarkan", () => {
  assert.equal(canTransitionVerificationStatus("unverified", "source_verified"), true);
});

// ---------------- Part F: publication ----------------

// 19. draft → needs_review dibenarkan.
test("19. draft → needs_review dibenarkan", () => {
  assert.equal(canTransitionPublicationStatus("draft", "needs_review"), true);
});

// 20. needs_review → approved dibenarkan.
test("20. needs_review → approved dibenarkan", () => {
  assert.equal(canTransitionPublicationStatus("needs_review", "approved"), true);
});

// 21. approved → published dibenarkan.
test("21. approved → published dibenarkan", () => {
  assert.equal(canTransitionPublicationStatus("approved", "published"), true);
});

// 22. draft → published DILARANG.
test("22. draft → published dilarang (tiada bukti boleh membukanya)", () => {
  const r = checkPublicationTransition("draft", "published");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "draft_cannot_publish_directly");
  assert.equal(
    canTransitionPublicationStatus("draft", "published", {
      trustedActor: true,
      revalidated: true,
      newVersionCreated: true,
      trustedRestore: true,
    }),
    false,
  );
  assert.throws(() => assertValidPublicationTransition("draft", "published"));
});

test("22b. needs_review → published dilarang (approve dahulu)", () => {
  const r = checkPublicationTransition("needs_review", "published");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "needs_review_cannot_publish_directly");
});

// 23. rejected → published DILARANG.
test("23. rejected → published dilarang", () => {
  const r = checkPublicationTransition("rejected", "published");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "rejected_cannot_publish");
});

// 24. superseded tidak boleh diterbitkan semula sebagai versi yang SAMA.
test("24. superseded → published dilarang (versi baharu diperlukan)", () => {
  const r = checkPublicationTransition("superseded", "published");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "superseded_version_cannot_republish");
});

test("published → stale/hidden/superseded dibenarkan", () => {
  assert.equal(canTransitionPublicationStatus("published", "stale"), true);
  assert.equal(canTransitionPublicationStatus("published", "hidden"), true);
  assert.equal(canTransitionPublicationStatus("published", "superseded"), true);
});

test("stale → published memerlukan revalidasi DAN versi baharu", () => {
  assert.equal(canTransitionPublicationStatus("stale", "published"), false);
  assert.equal(
    canTransitionPublicationStatus("stale", "published", { revalidated: true }),
    false,
  );
  assert.equal(
    canTransitionPublicationStatus("stale", "published", {
      revalidated: true,
      newVersionCreated: true,
    }),
    true,
  );
});

test("hidden → published memerlukan restore terkawal DAN versi baharu", () => {
  assert.equal(canTransitionPublicationStatus("hidden", "published"), false);
  assert.equal(
    canTransitionPublicationStatus("hidden", "published", {
      trustedRestore: true,
      newVersionCreated: true,
    }),
    true,
  );
});
