/**
 * Phase 1.7 Part Q/R (53-57) — ujian rules SEBENAR perspektif klien untuk
 * koleksi liputan (@firebase/rules-unit-testing, emulator offline).
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
const PROJECT_ID = "demo-mm-coverage-rules";

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
    await setDoc(doc(db, "food_coverage_cells/w283b8"), {
      cellId: "w283b8",
      coverageVersion: "cv_1",
      activePlaceCount: 3,
      publishedPlaceIds: ["mm_1", "mm_2", "mm_3"],
    });
    await setDoc(doc(db, "place_coverage_memberships/mem_1"), {
      placeId: "mm_1",
      homeCellId: "w283b8",
      publicationId: "pub_1",
    });
    await setDoc(doc(db, "coverage_metrics/w283b8"), {
      cellId: "w283b8",
      activePublishedPlaces: 3,
    });
    await setDoc(doc(db, "place_discovery_queue/dsc_1"), {
      requestId: "dsc_1",
      cellId: "w283b8",
      status: "queued",
    });
    await setDoc(doc(db, "area_place_cache/ac_1"), {
      cacheKey: "ac_1",
      centerCellId: "w283b8",
      placeIds: ["mm_1"],
    });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const unauth = () => env.unauthenticatedContext().firestore();

// 53. Pengguna biasa tidak boleh baca/tulis sel liputan.
test("53. user cannot read food_coverage_cells", async () => {
  await assertFails(getDoc(doc(alice(), "food_coverage_cells/w283b8")));
});
test("53b. user cannot write food_coverage_cells", async () => {
  await assertFails(
    setDoc(doc(alice(), "food_coverage_cells/w283b9"), { cellId: "w283b9" }),
  );
  // Percubaan mengubah versi liputan secara langsung ditolak.
  await assertFails(
    updateDoc(doc(alice(), "food_coverage_cells/w283b8"), { coverageVersion: "cv_hack" }),
  );
  await assertFails(deleteDoc(doc(alice(), "food_coverage_cells/w283b8")));
});
test("53c. query food_coverage_cells is denied", async () => {
  await assertFails(getDocs(collection(alice(), "food_coverage_cells")));
});

// 54. Pengguna biasa tidak boleh baca/tulis keahlian.
test("54. user cannot read/write place_coverage_memberships", async () => {
  await assertFails(getDoc(doc(alice(), "place_coverage_memberships/mem_1")));
  await assertFails(
    setDoc(doc(alice(), "place_coverage_memberships/mem_2"), { placeId: "mm_2" }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_coverage_memberships/mem_1"), {
      homeCellId: "w000000",
    }),
  );
  await assertFails(deleteDoc(doc(alice(), "place_coverage_memberships/mem_1")));
});
test("54b. query memberships by cell is denied", async () => {
  await assertFails(
    getDocs(
      query(
        collection(alice(), "place_coverage_memberships"),
        where("homeCellId", "==", "w283b8"),
      ),
    ),
  );
});

// 55. Pengguna biasa tidak boleh mengakses baris gilir discovery.
test("55. user cannot access or enqueue place_discovery_queue", async () => {
  await assertFails(getDoc(doc(alice(), "place_discovery_queue/dsc_1")));
  await assertFails(
    setDoc(doc(alice(), "place_discovery_queue/dsc_2"), {
      cellId: "w283b8",
      reason: "user_area_request",
      status: "queued",
    }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_discovery_queue/dsc_1"), { status: "processing" }),
  );
  await assertFails(getDocs(collection(alice(), "place_discovery_queue")));
});

// 56. Pengguna biasa tidak boleh mengakses metrik.
test("56. user cannot access coverage_metrics", async () => {
  await assertFails(getDoc(doc(alice(), "coverage_metrics/w283b8")));
  await assertFails(
    setDoc(doc(alice(), "coverage_metrics/w283b8"), { activePublishedPlaces: 999 }),
  );
  await assertFails(getDocs(collection(alice(), "coverage_metrics")));
});

// 57. Pengguna biasa tidak boleh mengakses cache kawasan.
test("57. user cannot access area_place_cache", async () => {
  await assertFails(getDoc(doc(alice(), "area_place_cache/ac_1")));
  await assertFails(
    setDoc(doc(alice(), "area_place_cache/ac_2"), { centerCellId: "w283b8" }),
  );
  await assertFails(deleteDoc(doc(alice(), "area_place_cache/ac_1")));
  await assertFails(getDocs(collection(alice(), "area_place_cache")));
});

// Pengguna tanpa auth juga ditolak sepenuhnya.
test("unauth cannot read any coverage collection", async () => {
  await assertFails(getDoc(doc(unauth(), "food_coverage_cells/w283b8")));
  await assertFails(getDoc(doc(unauth(), "place_coverage_memberships/mem_1")));
  await assertFails(getDoc(doc(unauth(), "coverage_metrics/w283b8")));
  await assertFails(getDoc(doc(unauth(), "place_discovery_queue/dsc_1")));
  await assertFails(getDoc(doc(unauth(), "area_place_cache/ac_1")));
});

// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.7.
test("laluan produksi kekal: places_cache boleh dibaca bila log masuk, tidak boleh ditulis", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "places_cache/c1"), { name: "x" });
  });
  const snap = await getDoc(doc(alice(), "places_cache/c1"));
  if (!snap.exists()) throw new Error("places_cache sepatutnya boleh dibaca");
  await assertFails(setDoc(doc(alice(), "places_cache/c2"), { name: "y" }));
});
