"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.4 — ujian rules SEBENAR perspektif klien untuk koleksi dedup
 * (@firebase/rules-unit-testing, emulator offline). Jalankan: npm run test:rules.
 * Gagal serta-merta jika FIRESTORE_EMULATOR_HOST tiada — tiada fallback produksi.
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
const PROJECT_ID = "demo-mm-dedup-rules";
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
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_merge_queue/dq1"), { duplicateCandidateId: "dq1", reviewStatus: "open" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_aliases/al1"), { aliasId: "al1", canonicalPlaceId: "mm_1" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_merge_plans/mp1"), { mergePlanId: "mp1", status: "draft" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_merge_plans/mp1/audit/a1"), { auditId: "a1", action: "merge_plan_created" });
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();
// 31 & 32. Normal user cannot read/write merge queue.
(0, node_test_1.test)("user cannot read place_merge_queue", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_merge_queue/dq1")));
});
(0, node_test_1.test)("user cannot write place_merge_queue", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_merge_queue/dq2"), { x: 1 }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_merge_queue/dq1"), { reviewStatus: "merged" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_merge_queue/dq1")));
});
(0, node_test_1.test)("query place_merge_queue is denied", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_merge_queue")));
});
// 33 & 34. Normal user cannot read/write aliases.
(0, node_test_1.test)("user cannot read place_aliases", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_aliases/al1")));
});
(0, node_test_1.test)("user cannot write place_aliases", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_aliases/al2"), { canonicalPlaceId: "mm_9" }));
});
// 35. Normal user cannot access merge plans (+ audit).
(0, node_test_1.test)("user cannot access place_merge_plans", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_merge_plans/mp1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_merge_plans/mp2"), { status: "approved" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_merge_plans/mp1/audit/a1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_merge_plans/mp1/audit/a2"), { action: "x" }));
});
// Unauthenticated juga dinafikan.
(0, node_test_1.test)("unauth cannot read dedup collections", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_merge_queue/dq1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_aliases/al1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_merge_plans/mp1")));
});
