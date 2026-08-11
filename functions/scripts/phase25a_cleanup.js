/** Phase 2.5A cleanup: remove synthetic test audit docs + confirm no test membership. */
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();
const TEST_MASK = "phase25a".slice(0, 8) + "…";
(async () => {
  const memSnap = await db.collection("algorithm_rollout_members").doc("phase25a_test_beta_uid_DELETEME").get();
  if (memSnap.exists) { await memSnap.ref.delete(); }
  const aud = await db.collection("algorithm_rollout_audit").where("uid_masked", "==", TEST_MASK).get();
  let removed = 0;
  for (const d of aud.docs) { await d.ref.delete(); removed++; }
  console.log(JSON.stringify({ test_member_exists: memSnap.exists, audit_docs_removed: removed }));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
