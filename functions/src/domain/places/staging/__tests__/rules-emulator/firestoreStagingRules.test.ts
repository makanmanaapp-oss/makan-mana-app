/**
 * Phase 1.3A — ujian rules SEBENAR dari perspektif klien menggunakan
 * @firebase/rules-unit-testing terhadap Firestore Emulator (offline).
 *
 * Jalankan: npm run test:rules
 * (firebase emulators:exec --only firestore ...). GAGAL SERTA-MERTA jika
 * FIRESTORE_EMULATOR_HOST tidak ditetapkan — TIDAK PERNAH sentuh produksi.
 * Semua seeding fixture guna withSecurityRulesDisabled; SEMUA assertion guna
 * assertFails/assertSucceeds sebenar (bukan perbandingan string).
 */
import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST unset — run via `npm run test:rules` (emulator required; no live fallback).",
  );
}
const [host, portStr] = HOST.split(":");
const PROJECT_ID = "demo-mm-rules";

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
  // Seed fixture menggunakan rules DIMATIKAN (setup sahaja, bukan assertion).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "place_import_batches/b1"), {
      importBatchId: "b1",
      sourceType: "provider",
    });
    await setDoc(doc(db, "place_source_snapshots/s1"), {
      snapshotId: "s1",
      sourceType: "provider",
      sourceRecordId: "r1",
    });
    await setDoc(doc(db, "place_staging/st1"), {
      stagingRecordId: "st1",
      reviewStatus: "needs_review",
      reviewedBy: "svc",
    });
    await setDoc(doc(db, "place_staging/st1/audit/a1"), {
      auditId: "a1",
      action: "imported",
      actorUid: "svc",
    });
    // Koleksi sedia ada (regresi).
    await setDoc(doc(db, "places_cache/c1"), { places: [] });
    await setDoc(doc(db, "place_details/p1"), { rating: 4.2 });
    await setDoc(doc(db, "user_profiles/alice"), { dietType: "none" });
    await setDoc(doc(db, "user_profiles/bob"), { dietType: "none" });
    await setDoc(doc(db, "users/alice/favorites/fav1"), { placeId: "p1" });
    await setDoc(doc(db, "users/bob/favorites/fav2"), { placeId: "p1" });
  });
});

// ---- Konteks identiti ----
const unauth = () => env.unauthenticatedContext().firestore();
const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();

// ================= PART D: DENIAL =================

// 1 & 2. Unauthenticated cannot read/write place_import_batches.
test("unauth cannot read place_import_batches", async () => {
  await assertFails(getDoc(doc(unauth(), "place_import_batches/b1")));
});
test("unauth cannot write place_import_batches", async () => {
  await assertFails(setDoc(doc(unauth(), "place_import_batches/b2"), { x: 1 }));
});

// 3 & 4. Normal user cannot read/write place_import_batches.
test("user cannot read place_import_batches", async () => {
  await assertFails(getDoc(doc(alice(), "place_import_batches/b1")));
});
test("user cannot write place_import_batches", async () => {
  await assertFails(setDoc(doc(alice(), "place_import_batches/b3"), { x: 1 }));
});

// 5 & 6. Normal user cannot read/write place_source_snapshots.
test("user cannot read place_source_snapshots", async () => {
  await assertFails(getDoc(doc(alice(), "place_source_snapshots/s1")));
});
test("user cannot write place_source_snapshots", async () => {
  await assertFails(setDoc(doc(alice(), "place_source_snapshots/s2"), { x: 1 }));
});

// 7-10. Normal user cannot read/create/update/delete place_staging.
test("user cannot read place_staging", async () => {
  await assertFails(getDoc(doc(alice(), "place_staging/st1")));
});
test("user cannot create place_staging", async () => {
  await assertFails(setDoc(doc(alice(), "place_staging/st2"), { reviewStatus: "approved" }));
});
test("user cannot update place_staging", async () => {
  await assertFails(updateDoc(doc(alice(), "place_staging/st1"), { reviewStatus: "approved" }));
});
test("user cannot delete place_staging", async () => {
  await assertFails(deleteDoc(doc(alice(), "place_staging/st1")));
});

// 11-14. Normal user cannot read/create/update/delete staging audit.
test("user cannot read staging audit", async () => {
  await assertFails(getDoc(doc(alice(), "place_staging/st1/audit/a1")));
});
test("user cannot create staging audit", async () => {
  await assertFails(setDoc(doc(alice(), "place_staging/st1/audit/a2"), { action: "approved" }));
});
test("user cannot update staging audit", async () => {
  await assertFails(updateDoc(doc(alice(), "place_staging/st1/audit/a1"), { action: "edited" }));
});
test("user cannot delete staging audit", async () => {
  await assertFails(deleteDoc(doc(alice(), "place_staging/st1/audit/a1")));
});

// 15. User B cannot access staging created through fixture setup.
test("user B cannot read fixture-seeded staging", async () => {
  await assertFails(getDoc(doc(bob(), "place_staging/st1")));
});

// 16. Mobile user cannot set/alter trusted staging fields (whole write denied).
test("user cannot write trusted staging fields", async () => {
  await assertFails(
    setDoc(doc(alice(), "place_staging/st3"), {
      reviewStatus: "approved",
      reviewedBy: "alice",
      approvedBy: "alice",
      approvalDecision: "approve",
      publicationStatus: "published",
      verificationStatus: "admin_verified",
    }),
  );
  // Cubaan tulis entri audit dengan identiti pelaku dipalsukan — ditolak.
  await assertFails(
    setDoc(doc(alice(), "place_staging/st1/audit/a3"), { actorUid: "svc", action: "approved" }),
  );
});

// 17 & 18. Collection queries denied to normal users.
test("query place_staging is denied", async () => {
  await assertFails(getDocs(collection(alice(), "place_staging")));
});
test("query place_source_snapshots is denied", async () => {
  await assertFails(getDocs(collection(alice(), "place_source_snapshots")));
});

// ================= PART E: REGRESSION =================

// 1 & 2. Client cannot write places_cache / place_details.
test("client cannot write places_cache", async () => {
  await assertFails(setDoc(doc(alice(), "places_cache/c2"), { places: [] }));
});
test("client cannot write place_details", async () => {
  await assertFails(setDoc(doc(alice(), "place_details/p2"), { rating: 1 }));
});

// 3. Existing allowed read: signed-in user CAN read places_cache/place_details.
test("signed-in user can read places_cache and place_details", async () => {
  await assertSucceeds(getDoc(doc(alice(), "places_cache/c1")));
  await assertSucceeds(getDoc(doc(alice(), "place_details/p1")));
});
test("unauth cannot read places_cache (signedIn required)", async () => {
  await assertFails(getDoc(doc(unauth(), "places_cache/c1")));
});

// 4 & 5. Owner can read own profile; cannot read another user's profile.
test("user can read own profile, not another's", async () => {
  await assertSucceeds(getDoc(doc(alice(), "user_profiles/alice")));
  await assertFails(getDoc(doc(alice(), "user_profiles/bob")));
});

// 6. Favorites owner-only remains intact.
test("favorites remain owner-only", async () => {
  await assertSucceeds(getDoc(doc(alice(), "users/alice/favorites/fav1")));
  await assertFails(getDoc(doc(alice(), "users/bob/favorites/fav2")));
});
