"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.11 Part Q/V (33-37) — ujian rules SEBENAR perspektif klien untuk
 * koleksi pembetulan/laporan (@firebase/rules-unit-testing).
 * Jalankan: npm run test:rules.
 */
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const rules_unit_testing_1 = require("@firebase/rules-unit-testing");
const firestore_1 = require("firebase/firestore");
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-correction-rules";
let env;
(0, node_test_1.before)(async () => {
    env = await (0, rules_unit_testing_1.initializeTestEnvironment)({
        projectId: PROJECT_ID,
        firestore: {
            rules: (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), "..", "firestore.rules"), "utf8"),
            host,
            port: Number(portStr),
        },
    });
});
(0, node_test_1.after)(async () => {
    if (env)
        await env.cleanup();
});
(0, node_test_1.beforeEach)(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        // Laporan milik "alice".
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_submissions/sub_alice"), {
            submissionId: "sub_alice",
            placeId: "PLACE-MOCK-0001",
            submittedBy: "alice",
            status: "queued",
            originalSnapshot: { title: "Warung Mock", contentHash: "h1" },
        });
        // Laporan milik "bob" — alice tidak boleh membacanya.
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_submissions/sub_bob"), {
            submissionId: "sub_bob",
            placeId: "PLACE-MOCK-0002",
            submittedBy: "bob",
            status: "queued",
            originalSnapshot: { title: "Kedai Mock", contentHash: "h2" },
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_submissions/sub_alice/evidence/ev_1"), {
            evidenceId: "ev_1",
            status: "submitted",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_submissions/sub_alice/audit/aud_1"), {
            auditId: "aud_1",
            action: "submitted",
            trustedActorId: "server_reviewer_1",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_decisions/dec_1"), {
            decisionId: "dec_1",
            submissionId: "sub_alice",
            decision: "accept_for_staging",
            decidedBy: "server_reviewer_1",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_correction_rate_limits/rl_1"), {
            key: "rl_1",
            lastSubmittedAt: 1,
        });
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const unauth = () => env.unauthenticatedContext().firestore();
// 34. Pengguna biasa tidak boleh membaca laporan pengguna LAIN.
(0, node_test_1.test)("34. alice cannot read bob's report", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_bob")));
});
(0, node_test_1.test)("34b. alice cannot read even her own report directly (server-only phase)", async () => {
    // Fasa ini menyimpan koleksi sebagai server-only; klien menggunakan
    // penyesuai tempatan. Bacaan terus tetap ditolak.
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice")));
});
// 33. Pengguna biasa tidak boleh query semua laporan.
(0, node_test_1.test)("33. user cannot query all reports", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_correction_submissions")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_correction_submissions"), (0, firestore_1.where)("submittedBy", "==", "alice"))));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_correction_submissions"), (0, firestore_1.where)("status", "==", "queued"))));
});
// 37. Pengguna tidak boleh mengubah medan penyemak/status/identiti.
(0, node_test_1.test)("37. user cannot alter submittedBy, placeId, snapshot, reviewer or status", async () => {
    const ref = (0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice");
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { submittedBy: "bob" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { placeId: "PLACE-OTHER" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { originalSnapshot: { title: "DIUBAH", contentHash: "x" } }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { assignedReviewer: "alice" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { reviewedBy: "alice" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { status: "accepted_for_staging" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { status: "withdrawn" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)(ref, { stagingProposalId: "stg_1" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)(ref));
});
(0, node_test_1.test)("37b. user cannot create a submission directly", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_new"), {
        submissionId: "sub_new",
        placeId: "PLACE-MOCK-0001",
        submittedBy: "alice",
        status: "submitted",
    }));
});
// 36. Pengguna tidak boleh menulis audit.
(0, node_test_1.test)("36. user cannot read or write audit", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/audit/aud_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/audit/aud_2"), {
        action: "accepted_for_staging",
        trustedActorId: "alice",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/audit/aud_1"), {
        action: "resolved",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/audit/aud_1")));
});
// 35. Pengguna tidak boleh menulis keputusan.
(0, node_test_1.test)("35. user cannot read or write decisions", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_decisions/dec_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_correction_decisions/dec_2"), {
        submissionId: "sub_alice",
        decision: "accept_for_staging",
        decidedBy: "alice",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_correction_decisions")));
});
(0, node_test_1.test)("user cannot write trusted evidence status", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/evidence/ev_1"), {
        status: "accepted",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_submissions/sub_alice/evidence/ev_1")));
});
(0, node_test_1.test)("user cannot access rate-limit records", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_correction_rate_limits/rl_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_correction_rate_limits/rl_2"), { lastSubmittedAt: 0 }));
});
(0, node_test_1.test)("bob is denied the same way (no per-user escape hatch)", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(bob(), "place_correction_submissions/sub_bob")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(bob(), "place_correction_submissions/sub_bob"), { status: "withdrawn" }));
});
(0, node_test_1.test)("unauthenticated users are denied everywhere", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_correction_submissions/sub_alice")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_correction_decisions/dec_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_correction_rate_limits/rl_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(unauth(), "place_correction_submissions/sub_x"), { placeId: "p" }));
});
// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.11.
(0, node_test_1.test)("existing production path unchanged: places_cache readable signed-in, not writable", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(ctx.firestore(), "places_cache/c1"), { name: "x" });
    });
    const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "places_cache/c1"));
    if (!snap.exists())
        throw new Error("places_cache sepatutnya boleh dibaca");
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "places_cache/c2"), { name: "y" }));
});
