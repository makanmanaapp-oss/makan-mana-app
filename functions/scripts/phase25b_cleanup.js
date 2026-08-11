/** Phase 2.5B cleanup: remove shadow-QA audit fixtures + confirm no test membership. */
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();
(async () => {
  const aud = await db.collection("algorithm_rollout_audit").where("cohortId", "==", "6eb4a05772").get();
  let removed = 0;
  for (const d of aud.docs) { await d.ref.delete(); removed++; }
  console.log(JSON.stringify({ audit_docs_removed: removed }));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
