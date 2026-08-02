"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part O — ujian mesin keadaan (15-24).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
// ---------------- Part D: status perniagaan ----------------
// 15. pending_validation → active dibenarkan.
(0, node_test_1.default)("15. pending_validation → active dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("pending_validation", "active"), true);
});
// 16. active → temporarily_closed dibenarkan.
(0, node_test_1.default)("16. active → temporarily_closed dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("active", "temporarily_closed"), true);
});
// 17. temporarily_closed → active dibenarkan.
(0, node_test_1.default)("17. temporarily_closed → active dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("temporarily_closed", "active"), true);
});
(0, node_test_1.default)("active → permanently_closed / moved / hidden_by_admin dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("active", "permanently_closed"), true);
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("active", "moved"), true);
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("active", "hidden_by_admin"), true);
});
// 18. permanently_closed → active DILARANG tanpa reopen terkawal.
(0, node_test_1.default)("18. permanently_closed → active dilarang tanpa bukti reopen", () => {
    const r = (0, index_1.checkPlaceStatusTransition)("permanently_closed", "active");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "reopen_requires_controlled_evidence");
    strict_1.default.deepEqual(r.requiredEvidence, ["reopenEvidence", "trustedActor"]);
    strict_1.default.throws(() => (0, index_1.assertValidPlaceStatusTransition)("permanently_closed", "active"));
});
(0, node_test_1.default)("18b. permanently_closed → active DIBENARKAN dengan bukti reopen penuh", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("permanently_closed", "active", {
        reopenEvidence: true,
        trustedActor: true,
    }), true);
    // Bukti separa masih ditolak.
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("permanently_closed", "active", { reopenEvidence: true }), false);
});
(0, node_test_1.default)("moved → active memerlukan semakan lokasi", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("moved", "active"), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("moved", "active", { locationReviewed: true }), true);
});
(0, node_test_1.default)("hidden_by_admin → active memerlukan restore dipercayai", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("hidden_by_admin", "active"), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("hidden_by_admin", "active", { trustedRestore: true }), true);
});
(0, node_test_1.default)("stale_critical → active selepas revalidasi", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("stale_critical", "active"), false);
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("stale_critical", "active", { revalidated: true }), true);
});
(0, node_test_1.default)("peralihan no-op ditolak", () => {
    strict_1.default.equal((0, index_1.canTransitionPlaceStatus)("active", "active"), false);
});
// ---------------- Part E: verification ----------------
(0, node_test_1.default)("verification: community_reported TIDAK boleh senyap menjadi admin_verified", () => {
    const r = (0, index_1.checkVerificationTransition)("community_reported", "admin_verified");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "admin_verification_requires_trusted_actor");
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("community_reported", "admin_verified", {
        trustedActor: true,
    }), true);
});
(0, node_test_1.default)("verification: merchant_verified memerlukan bukti merchant", () => {
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("unverified", "merchant_verified"), false);
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("unverified", "merchant_verified", {
        merchantEvidence: true,
    }), true);
});
(0, node_test_1.default)("verification: rejected tidak boleh menjadi verified tanpa revalidasi", () => {
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("rejected", "source_verified"), false);
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("rejected", "admin_verified", { trustedActor: true }), false, "trustedActor sahaja tidak memadai untuk keluar dari rejected");
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("rejected", "source_verified", { revalidated: true }), true);
});
(0, node_test_1.default)("verification: unverified → source_verified dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionVerificationStatus)("unverified", "source_verified"), true);
});
// ---------------- Part F: publication ----------------
// 19. draft → needs_review dibenarkan.
(0, node_test_1.default)("19. draft → needs_review dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("draft", "needs_review"), true);
});
// 20. needs_review → approved dibenarkan.
(0, node_test_1.default)("20. needs_review → approved dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("needs_review", "approved"), true);
});
// 21. approved → published dibenarkan.
(0, node_test_1.default)("21. approved → published dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("approved", "published"), true);
});
// 22. draft → published DILARANG.
(0, node_test_1.default)("22. draft → published dilarang (tiada bukti boleh membukanya)", () => {
    const r = (0, index_1.checkPublicationTransition)("draft", "published");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "draft_cannot_publish_directly");
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("draft", "published", {
        trustedActor: true,
        revalidated: true,
        newVersionCreated: true,
        trustedRestore: true,
    }), false);
    strict_1.default.throws(() => (0, index_1.assertValidPublicationTransition)("draft", "published"));
});
(0, node_test_1.default)("22b. needs_review → published dilarang (approve dahulu)", () => {
    const r = (0, index_1.checkPublicationTransition)("needs_review", "published");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "needs_review_cannot_publish_directly");
});
// 23. rejected → published DILARANG.
(0, node_test_1.default)("23. rejected → published dilarang", () => {
    const r = (0, index_1.checkPublicationTransition)("rejected", "published");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "rejected_cannot_publish");
});
// 24. superseded tidak boleh diterbitkan semula sebagai versi yang SAMA.
(0, node_test_1.default)("24. superseded → published dilarang (versi baharu diperlukan)", () => {
    const r = (0, index_1.checkPublicationTransition)("superseded", "published");
    strict_1.default.equal(r.allowed, false);
    strict_1.default.equal(r.reason, "superseded_version_cannot_republish");
});
(0, node_test_1.default)("published → stale/hidden/superseded dibenarkan", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("published", "stale"), true);
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("published", "hidden"), true);
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("published", "superseded"), true);
});
(0, node_test_1.default)("stale → published memerlukan revalidasi DAN versi baharu", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("stale", "published"), false);
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("stale", "published", { revalidated: true }), false);
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("stale", "published", {
        revalidated: true,
        newVersionCreated: true,
    }), true);
});
(0, node_test_1.default)("hidden → published memerlukan restore terkawal DAN versi baharu", () => {
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("hidden", "published"), false);
    strict_1.default.equal((0, index_1.canTransitionPublicationStatus)("hidden", "published", {
        trustedRestore: true,
        newVersionCreated: true,
    }), true);
});
