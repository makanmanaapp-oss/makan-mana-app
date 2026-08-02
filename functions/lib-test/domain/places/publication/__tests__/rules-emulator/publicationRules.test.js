"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part N/O (38-41) — ujian rules SEBENAR perspektif klien untuk
 * koleksi penerbitan (@firebase/rules-unit-testing, emulator offline).
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
const PROJECT_ID = "demo-mm-publication-rules";
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
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_publications/pub_1"), {
            publicationId: "pub_1",
            placeId: "mm_1",
            versionNumber: 1,
            publicationStatus: "published",
            contentHash: "abc",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_publication_heads/mm_1"), {
            placeId: "mm_1",
            activePublicationId: "pub_1",
            activeVersionNumber: 1,
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_publication_rollbacks/rbk_1"), {
            rollbackId: "rbk_1",
            placeId: "mm_1",
            status: "requested",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_status_audit/aud_1"), {
            auditId: "aud_1",
            placeId: "mm_1",
            action: "publication_created",
        });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(db, "place_cache_invalidations/inv_1"), {
            eventId: "inv_1",
            placeId: "mm_1",
            reason: "publication_created",
        });
    });
});
const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();
// 38. Pengguna biasa tidak boleh baca/tulis penerbitan.
(0, node_test_1.test)("38. user cannot read place_publications", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_publications/pub_1")));
});
(0, node_test_1.test)("38b. user cannot write place_publications", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_publications/pub_2"), { placeId: "mm_1", versionNumber: 2 }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_publications/pub_1"), { publicationStatus: "hidden" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_publications/pub_1")));
});
(0, node_test_1.test)("38c. query place_publications is denied", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_publications")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(alice(), "place_publications"), (0, firestore_1.where)("placeId", "==", "mm_1"))));
});
// 39. Pengguna biasa tidak boleh mengubah penunjuk penerbitan aktif.
(0, node_test_1.test)("39. user cannot read or alter publication head", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_publication_heads/mm_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_publication_heads/mm_1"), {
        activePublicationId: "pub_penyerang",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_publication_heads/mm_1"), {
        activePublicationId: "pub_penyerang",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_publication_heads/mm_1")));
});
// 40. Pengguna biasa tidak boleh meminta rollback secara terus.
(0, node_test_1.test)("40. user cannot request or read rollbacks directly", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_publication_rollbacks/rbk_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_publication_rollbacks/rbk_2"), {
        placeId: "mm_1",
        status: "requested",
        targetPublicationId: "pub_1",
    }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.updateDoc)((0, firestore_1.doc)(alice(), "place_publication_rollbacks/rbk_1"), { status: "approved" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_publication_rollbacks/rbk_1/audit/a2"), { action: "x" }));
});
// 41. Pengguna biasa tidak boleh mengakses audit status.
(0, node_test_1.test)("41. user cannot access place_status_audit", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_status_audit/aud_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_status_audit")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_status_audit/aud_2"), { placeId: "mm_1", action: "x" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.deleteDoc)((0, firestore_1.doc)(alice(), "place_status_audit/aud_1")));
});
(0, node_test_1.test)("41b. user cannot access place_cache_invalidations", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "place_cache_invalidations/inv_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDocs)((0, firestore_1.collection)(alice(), "place_cache_invalidations")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "place_cache_invalidations/inv_2"), { placeId: "mm_1" }));
});
// Pengguna tanpa auth juga ditolak sepenuhnya.
(0, node_test_1.test)("unauth cannot read any publication collection", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_publications/pub_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_publication_heads/mm_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_publication_rollbacks/rbk_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_status_audit/aud_1")));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.getDoc)((0, firestore_1.doc)(unauth(), "place_cache_invalidations/inv_1")));
});
(0, node_test_1.test)("unauth cannot write any publication collection", async () => {
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(unauth(), "place_publications/pub_3"), { placeId: "mm_1" }));
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(unauth(), "place_publication_heads/mm_2"), { activePublicationId: "x" }));
});
// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.6.
(0, node_test_1.test)("laluan produksi kekal: places_cache/place_details boleh dibaca bila log masuk", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(ctx.firestore(), "places_cache/c1"), { name: "x" });
    });
    // Pengguna log masuk masih boleh baca cache (tidak berubah).
    const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(alice(), "places_cache/c1"));
    if (!snap.exists())
        throw new Error("places_cache sepatutnya boleh dibaca");
    // Tetapi tulisan masih ditolak.
    await (0, rules_unit_testing_1.assertFails)((0, firestore_1.setDoc)((0, firestore_1.doc)(alice(), "places_cache/c2"), { name: "y" }));
});
