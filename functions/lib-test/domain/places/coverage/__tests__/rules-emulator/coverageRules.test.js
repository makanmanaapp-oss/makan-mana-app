"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part Q/R (53-57) — ujian rules SEBENAR perspektif klien untuk
 * koleksi liputan (@firebase/rules-unit-testing, emulator offline).
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
const PROJECT_ID = "demo-mm-coverage-rules";
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
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "food_coverage_cells/w283b8"), {
            cellId: "w283b8",
            coverageVersion: "cv_1",
            activePlaceCount: 3,
            publishedPlaceIds: ["mm_1", "mm_2", "mm_3"],
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_coverage_memberships/mem_1"), {
            placeId: "mm_1",
            homeCellId: "w283b8",
            publicationId: "pub_1",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "coverage_metrics/w283b8"), {
            cellId: "w283b8",
            activePublishedPlaces: 3,
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_discovery_queue/dsc_1"), {
            requestId: "dsc_1",
            cellId: "w283b8",
            status: "queued",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "area_place_cache/ac_1"), {
            cacheKey: "ac_1",
            centerCellId: "w283b8",
            placeIds: ["mm_1"],
        });
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();
// 53. Pengguna biasa tidak boleh baca/tulis sel liputan.
(0, node_test_1.test)("53. user cannot read food_coverage_cells", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "food_coverage_cells/w283b8")));
});
(0, node_test_1.test)("53b. user cannot write food_coverage_cells", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "food_coverage_cells/w283b9"), { cellId: "w283b9" }));
    // Percubaan mengubah versi liputan secara langsung ditolak.
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "food_coverage_cells/w283b8"), { coverageVersion: "cv_hack" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "food_coverage_cells/w283b8")));
});
(0, node_test_1.test)("53c. query food_coverage_cells is denied", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "food_coverage_cells")));
});
// 54. Pengguna biasa tidak boleh baca/tulis keahlian.
(0, node_test_1.test)("54. user cannot read/write place_coverage_memberships", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_coverage_memberships/mem_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_coverage_memberships/mem_2"), { placeId: "mm_2" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_coverage_memberships/mem_1"), {
        homeCellId: "w000000",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_coverage_memberships/mem_1")));
});
(0, node_test_1.test)("54b. query memberships by cell is denied", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_coverage_memberships"), (0, firestore_1.where)("homeCellId", "==", "w283b8"))));
});
// 55. Pengguna biasa tidak boleh mengakses baris gilir discovery.
(0, node_test_1.test)("55. user cannot access or enqueue place_discovery_queue", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_discovery_queue/dsc_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_discovery_queue/dsc_2"), {
        cellId: "w283b8",
        reason: "user_area_request",
        status: "queued",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_discovery_queue/dsc_1"), { status: "processing" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_discovery_queue")));
});
// 56. Pengguna biasa tidak boleh mengakses metrik.
(0, node_test_1.test)("56. user cannot access coverage_metrics", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "coverage_metrics/w283b8")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "coverage_metrics/w283b8"), { activePublishedPlaces: 999 }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "coverage_metrics")));
});
// 57. Pengguna biasa tidak boleh mengakses cache kawasan.
(0, node_test_1.test)("57. user cannot access area_place_cache", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "area_place_cache/ac_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "area_place_cache/ac_2"), { centerCellId: "w283b8" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "area_place_cache/ac_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "area_place_cache")));
});
// Pengguna tanpa auth juga ditolak sepenuhnya.
(0, node_test_1.test)("unauth cannot read any coverage collection", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "food_coverage_cells/w283b8")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_coverage_memberships/mem_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "coverage_metrics/w283b8")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_discovery_queue/dsc_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "area_place_cache/ac_1")));
});
// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.7.
(0, node_test_1.test)("laluan produksi kekal: places_cache boleh dibaca bila log masuk, tidak boleh ditulis", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(ctx.firestore(), "places_cache/c1"), { name: "x" });
    });
    const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "places_cache/c1"));
    if (!snap.exists())
        throw new Error("places_cache sepatutnya boleh dibaca");
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "places_cache/c2"), { name: "y" }));
});
