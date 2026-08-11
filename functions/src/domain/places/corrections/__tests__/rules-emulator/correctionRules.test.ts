/**
 * Phase 1.11 Part Q/V (33-37) — ujian rules SEBENAR perspektif klien untuk
 * koleksi pembetulan/laporan (@firebase/rules-unit-testing).
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
const PROJECT_ID = "demo-mm-correction-rules";

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
    // Laporan milik "alice".
    await setDoc(doc(db, "place_correction_submissions/sub_alice"), {
      submissionId: "sub_alice",
      placeId: "PLACE-MOCK-0001",
      submittedBy: "alice",
      status: "queued",
      originalSnapshot: { title: "Warung Mock", contentHash: "h1" },
    });
    // Laporan milik "bob" — alice tidak boleh membacanya.
    await setDoc(doc(db, "place_correction_submissions/sub_bob"), {
      submissionId: "sub_bob",
      placeId: "PLACE-MOCK-0002",
      submittedBy: "bob",
      status: "queued",
      originalSnapshot: { title: "Kedai Mock", contentHash: "h2" },
    });
    await setDoc(doc(db, "place_correction_submissions/sub_alice/evidence/ev_1"), {
      evidenceId: "ev_1",
      status: "submitted",
    });
    await setDoc(doc(db, "place_correction_submissions/sub_alice/audit/aud_1"), {
      auditId: "aud_1",
      action: "submitted",
      trustedActorId: "server_reviewer_1",
    });
    await setDoc(doc(db, "place_correction_decisions/dec_1"), {
      decisionId: "dec_1",
      submissionId: "sub_alice",
      decision: "accept_for_staging",
      decidedBy: "server_reviewer_1",
    });
    await setDoc(doc(db, "place_correction_rate_limits/rl_1"), {
      key: "rl_1",
      lastSubmittedAt: 1,
    });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const unauth = () => env.unauthenticatedContext().firestore();

// 34. Pengguna biasa tidak boleh membaca laporan pengguna LAIN.
test("34. alice cannot read bob's report", async () => {
  await assertFails(getDoc(doc(alice(), "place_correction_submissions/sub_bob")));
});

test("34b. alice cannot read even her own report directly (server-only phase)", async () => {
  // Fasa ini menyimpan koleksi sebagai server-only; klien menggunakan
  // penyesuai tempatan. Bacaan terus tetap ditolak.
  await assertFails(getDoc(doc(alice(), "place_correction_submissions/sub_alice")));
});

// 33. Pengguna biasa tidak boleh query semua laporan.
test("33. user cannot query all reports", async () => {
  await assertFails(getDocs(collection(alice(), "place_correction_submissions")));
  await assertFails(
    getDocs(
      query(
        collection(alice(), "place_correction_submissions"),
        where("submittedBy", "==", "alice"),
      ),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collection(alice(), "place_correction_submissions"),
        where("status", "==", "queued"),
      ),
    ),
  );
});

// 37. Pengguna tidak boleh mengubah medan penyemak/status/identiti.
test("37. user cannot alter submittedBy, placeId, snapshot, reviewer or status", async () => {
  const ref = doc(alice(), "place_correction_submissions/sub_alice");
  await assertFails(updateDoc(ref, { submittedBy: "bob" }));
  await assertFails(updateDoc(ref, { placeId: "PLACE-OTHER" }));
  await assertFails(updateDoc(ref, { originalSnapshot: { title: "DIUBAH", contentHash: "x" } }));
  await assertFails(updateDoc(ref, { assignedReviewer: "alice" }));
  await assertFails(updateDoc(ref, { reviewedBy: "alice" }));
  await assertFails(updateDoc(ref, { status: "accepted_for_staging" }));
  await assertFails(updateDoc(ref, { status: "withdrawn" }));
  await assertFails(updateDoc(ref, { stagingProposalId: "stg_1" }));
  await assertFails(deleteDoc(ref));
});

test("37b. user cannot create a submission directly", async () => {
  await assertFails(
    setDoc(doc(alice(), "place_correction_submissions/sub_new"), {
      submissionId: "sub_new",
      placeId: "PLACE-MOCK-0001",
      submittedBy: "alice",
      status: "submitted",
    }),
  );
});

// 36. Pengguna tidak boleh menulis audit.
test("36. user cannot read or write audit", async () => {
  await assertFails(getDoc(doc(alice(), "place_correction_submissions/sub_alice/audit/aud_1")));
  await assertFails(
    setDoc(doc(alice(), "place_correction_submissions/sub_alice/audit/aud_2"), {
      action: "accepted_for_staging",
      trustedActorId: "alice",
    }),
  );
  await assertFails(
    updateDoc(doc(alice(), "place_correction_submissions/sub_alice/audit/aud_1"), {
      action: "resolved",
    }),
  );
  await assertFails(
    deleteDoc(doc(alice(), "place_correction_submissions/sub_alice/audit/aud_1")),
  );
});

// 35. Pengguna tidak boleh menulis keputusan.
test("35. user cannot read or write decisions", async () => {
  await assertFails(getDoc(doc(alice(), "place_correction_decisions/dec_1")));
  await assertFails(
    setDoc(doc(alice(), "place_correction_decisions/dec_2"), {
      submissionId: "sub_alice",
      decision: "accept_for_staging",
      decidedBy: "alice",
    }),
  );
  await assertFails(getDocs(collection(alice(), "place_correction_decisions")));
});

test("user cannot write trusted evidence status", async () => {
  await assertFails(
    updateDoc(doc(alice(), "place_correction_submissions/sub_alice/evidence/ev_1"), {
      status: "accepted",
    }),
  );
  await assertFails(getDoc(doc(alice(), "place_correction_submissions/sub_alice/evidence/ev_1")));
});

test("user cannot access rate-limit records", async () => {
  await assertFails(getDoc(doc(alice(), "place_correction_rate_limits/rl_1")));
  await assertFails(
    setDoc(doc(alice(), "place_correction_rate_limits/rl_2"), { lastSubmittedAt: 0 }),
  );
});

test("bob is denied the same way (no per-user escape hatch)", async () => {
  await assertFails(getDoc(doc(bob(), "place_correction_submissions/sub_bob")));
  await assertFails(
    updateDoc(doc(bob(), "place_correction_submissions/sub_bob"), { status: "withdrawn" }),
  );
});

test("unauthenticated users are denied everywhere", async () => {
  await assertFails(getDoc(doc(unauth(), "place_correction_submissions/sub_alice")));
  await assertFails(getDoc(doc(unauth(), "place_correction_decisions/dec_1")));
  await assertFails(getDoc(doc(unauth(), "place_correction_rate_limits/rl_1")));
  await assertFails(
    setDoc(doc(unauth(), "place_correction_submissions/sub_x"), { placeId: "p" }),
  );
});

// Laluan produksi sedia ada TIDAK dilonggarkan oleh Phase 1.11.
test("existing production path unchanged: places_cache readable signed-in, not writable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "places_cache/c1"), { name: "x" });
  });
  const snap = await getDoc(doc(alice(), "places_cache/c1"));
  if (!snap.exists()) throw new Error("places_cache sepatutnya boleh dibaca");
  await assertFails(setDoc(doc(alice(), "places_cache/c2"), { name: "y" }));
});
