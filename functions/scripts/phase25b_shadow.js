/**
 * Phase 2.5B — Add/remove beta_shadow membership for the signed-in test account,
 * identified by anon cohortId (full UID never printed). ADC creds.
 * Usage: node phase25b_shadow.js <cohortId> <add|remove>
 */
process.env.ALGO2_FLAGS = "all";
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();
const { cohortIdFor, resolveRollout } = require("../lib/domain/rollout/rolloutResolver");
const { getRolloutConfig } = require("../lib/config/rolloutConfig");

const TARGET = process.argv[2];
const OP = process.argv[3];
const OWNER_UID = "blp6g37BUVPFLsDrSGuVqHrne153";

(async () => {
  const config = getRolloutConfig();
  const salt = config.salt || "nosalt";
  let match = null, pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    for (const u of res.users) if (cohortIdFor(u.uid, salt) === TARGET) { match = u; break; }
    pageToken = res.pageToken;
  } while (pageToken && !match);
  if (!match) { console.log(JSON.stringify({ error: "no match" })); process.exit(1); }

  const ref = db.collection("algorithm_rollout_members").doc(match.uid);
  const now = Date.now();
  if (OP === "add") {
    await ref.set({ cohort: "beta_shadow", enabled: true, reason: "phase_2_5b_shadow_qa",
      expiresAt: now + 2 * 3600 * 1000, createdAt: now, createdBy: OWNER_UID, rolloutVersion: config.rolloutVersion });
    await db.collection("algorithm_rollout_audit").add({ action: "add_shadow",
      cohortId: TARGET, reason: "phase_2_5b_shadow_qa", by: OWNER_UID, at: now });
  } else if (OP === "remove") {
    await ref.delete();
    await db.collection("algorithm_rollout_audit").add({ action: "remove_shadow",
      cohortId: TARGET, reason: "phase_2_5b_cleanup", by: OWNER_UID, at: now });
  }
  // Recompute the REAL decision after the op.
  const snap = await ref.get();
  const m = snap.exists ? snap.data() : null;
  const decision = resolveRollout({ uid: match.uid, isOwner: false,
    allowlistMember: m ? { cohort: m.cohort, enabled: m.enabled === true, expiresAt: m.expiresAt } : null,
    now, config });
  console.log(JSON.stringify({
    op: OP, cohortId: TARGET, membershipExists: snap.exists,
    membershipCohort: m ? m.cohort : null,
    decision: { mode: decision.mode, enabled: decision.enabled, shadowEnabled: decision.shadowEnabled,
      emergencyLegacy: decision.emergencyLegacy, reason: decision.assignmentReason },
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
