"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.12 Part S — ujian rules SEBENAR perspektif klien untuk koleksi asas
 * migrasi (@firebase/rules-unit-testing).
 * Jalankan: npm run test:rules.
 *
 * Ini membuktikan Part T item 50-52: pengguna biasa tidak boleh mengakses
 * koleksi migrasi, tidak boleh mengubah penanda penyiapan, dan tidak boleh
 * menulis alias — mana-mana daripadanya akan membenarkan klien memalsukan
 * "migrasi selesai" dan mencetuskan bacaan canonical.
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
const PROJECT_ID = "demo-mm-migration-rules";
/** Setiap koleksi migrasi + satu dokumen benih setiap satu. */
const MIGRATION_DOCS = [
    {
        path: "place_migration_inventory/LEG-seed",
        data: { legacyRecordId: "LEG-seed", legacyPlaceId: "ChIJ_seed" },
    },
    {
        path: "place_migration_candidates/MCD-seed",
        data: { candidateId: "MCD-seed", migrationDecision: "ready" },
    },
    {
        path: "place_migration_plans/MPL-seed",
        data: { migrationPlanId: "MPL-seed", status: "dry_run_completed" },
    },
    {
        path: "place_migration_checkpoints/CKP-seed",
        data: { checkpointId: "CKP-seed", processedCount: 0, status: "pending" },
    },
    {
        path: "place_migration_aliases/ALS-seed",
        data: { aliasId: "ALS-seed", legacyValue: "ChIJ_seed", canonicalPlaceId: "PLC-seed" },
    },
    {
        path: "place_migration_audit/MAU-seed",
        data: { auditId: "MAU-seed", action: "plan_built", migrationPlanId: "MPL-seed" },
    },
    {
        path: "place_read_comparisons/CMP-seed",
        data: { placeId: "ChIJ_seed", identityMatch: true },
    },
    {
        path: "migration_completion_markers/MCM-seed",
        data: { markerId: "MCM-seed", environment: "emulator", status: "emulator_complete" },
    },
    {
        path: "place_migration_emulator_canonical/PLC-seed",
        data: { canonicalPlaceId: "PLC-seed", active: true },
    },
    {
        path: "place_migration_rollback_plans/RBK-seed",
        data: { rollbackPlanId: "RBK-seed", status: "prepared" },
    },
];
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
        for (const seed of MIGRATION_DOCS) {
            await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, seed.path), seed.data);
        }
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const anon = () => env.unauthenticatedContext().firestore();
// --- 50. Pengguna biasa tidak boleh mengakses koleksi migrasi ---------------
for (const seed of MIGRATION_DOCS) {
    const collectionPath = seed.path.split("/")[0];
    const docId = seed.path.split("/")[1];
    (0, node_test_1.test)(`pengguna log masuk tidak boleh membaca ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), collectionPath, docId)));
    });
    (0, node_test_1.test)(`pengguna log masuk tidak boleh query ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), collectionPath)));
    });
    (0, node_test_1.test)(`pengguna log masuk tidak boleh cipta dalam ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), collectionPath, "attacker_doc"), { injected: true }));
    });
    (0, node_test_1.test)(`pengguna log masuk tidak boleh kemas kini ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), collectionPath, docId), { hacked: true }));
    });
    (0, node_test_1.test)(`pengguna log masuk tidak boleh padam ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), collectionPath, docId)));
    });
    (0, node_test_1.test)(`pengguna tanpa auth tidak boleh membaca ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(anon(), collectionPath, docId)));
    });
    (0, node_test_1.test)(`pengguna tanpa auth tidak boleh menulis ${collectionPath}`, async () => {
        await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(anon(), collectionPath, "anon_doc"), { x: 1 }));
    });
}
// --- 51. Penanda penyiapan tidak boleh diubah oleh klien --------------------
(0, node_test_1.test)("51. pengguna tidak boleh menaikkan penanda kepada production_complete", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "migration_completion_markers", "MCM-seed"), {
        status: "production_complete",
        environment: "production",
    }));
});
(0, node_test_1.test)("51b. pengguna tidak boleh mencipta penanda penyiapan produksi baharu", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "migration_completion_markers", "MCM-forged"), {
        markerId: "MCM-forged",
        environment: "production",
        status: "production_complete",
    }));
});
// --- 52. Alias tidak boleh ditulis oleh klien ------------------------------
(0, node_test_1.test)("52. pengguna tidak boleh menulis alias migrasi", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_migration_aliases", "ALS-forged"), {
        aliasId: "ALS-forged",
        legacyValue: "ChIJ_victim",
        canonicalPlaceId: "PLC-attacker",
        status: "active",
    }));
});
(0, node_test_1.test)("52b. pengguna tidak boleh mengubah hala alias sedia ada", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_migration_aliases", "ALS-seed"), {
        canonicalPlaceId: "PLC-attacker",
    }));
});
// --- Checkpoint tidak boleh diusik ----------------------------------------
(0, node_test_1.test)("pengguna tidak boleh mengubah checkpoint migrasi", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_migration_checkpoints", "CKP-seed"), {
        status: "completed",
        processedCount: 999,
    }));
});
// --- Query bertapis juga ditolak ------------------------------------------
(0, node_test_1.test)("query bertapis ke atas pelan migrasi juga ditolak", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_migration_plans"), (0, firestore_1.where)("status", "==", "dry_run_completed"))));
});
(0, node_test_1.test)("query bertapis ke atas calon migrasi juga ditolak", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_migration_candidates"), (0, firestore_1.where)("migrationDecision", "==", "ready"))));
});
