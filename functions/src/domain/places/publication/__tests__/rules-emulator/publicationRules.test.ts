/**
 * Phase 1.6 Part N/O (38-41) — ujian rules SEBENAR perspektif klien untuk
 * koleksi penerbitan (@firebase/rules-unit-testing, emulator offline).
 * Jalankan: npm run test:rules.
 */
import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules`.");
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-publication-rules";

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "..", "firestore.rules"), "utf8"),
      host,
      port: Number(portStr),
    },
  });
});
after(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "place_publications/pub_1"), {
      publicationId: "pub_1",
      placeId: "mm_1",
      versionNumber: 1,
      publicationStatus: "published",
      contentHash: "abc",
    });
    await setDoc(doc(db, "place_publication_heads/mm_1"), {
      placeId: "mm_1",
      activePublicationId: "pub_1",
      activeVersionNumber: 1,
    });
    await setDoc(doc(db, "place_publication_rollbacks/rbk_1"), {
      rollbackId: "rbk_1",
      placeId: "mm_1",
      status: "requested",
    });
    await setDoc(doc(db, "place_status_audit/aud_1"), {
      auditId: "aud_1",
      placeId: "mm_1",
      action: "publication_created",
    });
    await setDoc(doc(db, "place_cache_invalidations/inv_1"), {
      eventId: "inv_1",
      placeId: "mm_1",
      reason: "publication_created",
    });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();

// 38. Pengguna biasa tidak boleh baca/tulis penerbitan.
test("38. user cannot read place_publications", async () => {
  await assertFails(getDoc(doc(alice(), "place_publications/pub_1")));
});
test("38b. user cannot write place_publications", async () => {
  await assertFails(
    setDoc(doc(alice(), "place_publications/pub_2"), { placeId: "mm_1", versionNumber: 2 }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_publications/pub_1"), { publicationStatus: "hidden" }),
  );
  await assertFails(deleteDoc(doc(alice(), "place_publications/pub_1")));
});
test("38c. query place_publications is denied", async () => {
  await assertFails(getDocs(collection(alice(), "place_publications")));
  await assertFails(
    getDocs(query(collection(alice(), "place_publications"), where("placeId", "==", "mm_1"))),
  );
});

// 39. Pengguna biasa tidak boleh mengubah penunjuk penerbitan aktif.
test("39. user cannot read or alter publication head", async () => {
  await assertFails(getDoc(doc(alice(), "place_publication_heads/mm_1")));
  await assertFails(
    setDoc(doc(alice(), "place_publication_heads/mm_1"), {
      activePublicationId: "pub_penyerang",
    }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_publication_heads/mm_1"), {
      activePublicationId: "pub_penyerang",
    }),
  );
  await assertFails(deleteDoc(doc(alice(), "place_publication_heads/mm_1")));
});

// 40. Pengguna biasa tidak boleh meminta rollback secara terus.
test("40. user cannot request or read rollbacks directly", async () => {
  await assertFails(getDoc(doc(alice(), "place_publication_rollbacks/rbk_1")));
  await assertFails(
    setDoc(doc(alice(), "place_publication_rollbacks/rbk_2"), {
      placeId: "mm_1",
      status: "requested",
      targetPublicationId: "pub_1",
    }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_publication_rollbacks/rbk_1"), { status: "approved" }),
  );
  await assertFails(
    setDoc(doc(alice(), "place_publication_rollbacks/rbk_1/audit/a2"), { action: "x" }),
  );
});

// 41. Pengguna biasa tidak boleh mengakses audit status.
test("41. user cannot access place_status_audit", async () => {
  await assertFails(getDoc(doc(alice(), "place_status_audit/aud_1")));
  await assertFails(getDocs(collection(alice(), "place_status_audit")));
  await assertFails(
    setDoc(doc(alice(), "place_status_audit/aud_2"), { placeId: "mm_1", action: "x" }),
  );
  await assertFails(deleteDoc(doc(alice(), "place_status_audit/aud_1")));
});

test("41b. user cannot access place_cache_invalidations", async () => {
  await assertFails(getDoc(doc(alice(), "place_cache_invalidations/inv_1")));
  await assertFails(getDocs(collection(alice(), "place_cache_invalidations")));
  await assertFails(
    setDoc(doc(alice(), "place_cache_invalidations/inv_2"), { placeId: "mm_1" }),
  );
});

// Pengguna tanpa auth juga ditolak sepenuhnya.
test("unauth cannot read any publication collection", async () => {
  await assertFails(getDoc(doc(unauth(), "place_publications/pub_1")));
  await assertFails(getDoc(doc(unauth(), "place_publication_heads/mm_1")));
  await assertFails(getDoc(doc(unauth(), "place_publication_rollbacks/rbk_1")));
  await assertFails(getDoc(doc(unauth(), "place_status_audit/aud_1")));
  await assertFails(getDoc(doc(unauth(), "place_cache_invalidations/inv_1")));
});

test("unauth cannot write any publication collection", async () => {
  await assertFails(setDoc(doc(unauth(), "place_publications/pub_3"), { placeId: "mm_1" }));
  await assertFails(
    setDoc(doc(unauth(), "place_publication_heads/mm_2"), { activePublicationId: "x" }),
  );
});

// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.6.
test("laluan produksi kekal: places_cache/place_details boleh dibaca bila log masuk", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "places_cache/c1"), { name: "x" });
  });
  // Pengguna log masuk masih boleh baca cache (tidak berubah).
  const snap = await getDoc(doc(alice(), "places_cache/c1"));
  if (!snap.exists()) throw new Error("places_cache sepatutnya boleh dibaca");
  // Tetapi tulisan masih ditolak.
  await assertFails(setDoc(doc(alice(), "places_cache/c2"), { name: "y" }));
});
