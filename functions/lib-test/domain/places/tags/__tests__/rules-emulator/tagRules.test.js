"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.5 — ujian rules SEBENAR perspektif klien untuk koleksi tag
 * (@firebase/rules-unit-testing, emulator offline). Jalankan: npm run test:rules.
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
const PROJECT_ID = "demo-mm-tag-rules";
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
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_tag_definitions/restaurant"), { tagId: "restaurant", familyId: "place_type" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_tag_sets/mm_1/evidence/malay"), { tagId: "malay", status: "approved" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_tag_sets/mm_1/audit/a1"), { auditId: "a1", action: "tag_proposed" });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_tag_sets/mm_1"), { placeId: "mm_1" });
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();
// 32. Normal user cannot read/write trusted tag definitions.
(0, node_test_1.test)("user cannot read place_tag_definitions", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_tag_definitions/restaurant")));
});
(0, node_test_1.test)("user cannot write place_tag_definitions", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_tag_definitions/cafe"), { familyId: "place_type" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_tag_definitions/restaurant")));
});
(0, node_test_1.test)("query place_tag_definitions is denied", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_tag_definitions")));
});
// 33. Normal user cannot write tag sets (incl. evidence).
(0, node_test_1.test)("user cannot write place_tag_sets and evidence", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_2"), { placeId: "mm_2" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/evidence/vegan_options"), { tagId: "vegan_options" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/evidence/malay")));
});
// 34. Normal user cannot approve/reject tag evidence (any write denied).
(0, node_test_1.test)("user cannot approve/reject tag evidence", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/evidence/malay"), { status: "approved" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/evidence/malay"), { status: "rejected" }));
});
// 35. Normal user cannot read tag audit.
(0, node_test_1.test)("user cannot read tag audit", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/audit/a1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_tag_sets/mm_1/audit/a2"), { action: "x" }));
});
// Unauthenticated denied too.
(0, node_test_1.test)("unauth cannot read tag collections", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_tag_definitions/restaurant")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_tag_sets/mm_1")));
});
