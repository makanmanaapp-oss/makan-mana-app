/**
 * Phase 2.5B — Identify the signed-in non-owner test account by matching its
 * anon cohortId (from server logs) against recent auth users, WITHOUT logging the
 * full UID. Reports masked UID + claims + allow-list membership + rollout decision.
 */
process.env.ALGO2_FLAGS = "all";
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();
const { cohortIdFor, resolveRollout } = require("../lib/domain/rollout/rolloutResolver");
const { getRolloutConfig } = require("../lib/config/rolloutConfig");

const TARGET_COHORT = process.argv[2] || "6eb4a05772";
const OWNER_UID = "blp6g37BUVPFLsDrSGuVqHrne153";
const mask = (u) => u.slice(0, 6) + "…" + u.slice(-4);

(async () => {
  const config = getRolloutConfig();
  const salt = config.salt || "nosalt";
  let match = null;
  let pageToken;
  let scanned = 0;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    for (const u of res.users) {
      scanned++;
      if (cohortIdFor(u.uid, salt) === TARGET_COHORT) { match = u; break; }
    }
    pageToken = res.pageToken;
  } while (pageToken && !match);

  if (!match) { console.log(JSON.stringify({ error: "no uid matched cohortId", scanned })); process.exit(0); }

  const claims = match.customClaims || {};
  const memSnap = await db.collection("algorithm_rollout_members").doc(match.uid).get();
  const member = memSnap.exists ? memSnap.data() : null;
  const isOwner = claims.admin === true || claims.owner === true || match.uid === OWNER_UID;
  const decision = resolveRollout({
    uid: match.uid, isOwner,
    allowlistMember: member ? { cohort: member.cohort ?? null, enabled: member.enabled === true, expiresAt: member.expiresAt ?? null } : null,
    now: Date.now(), config,
  });

  console.log(JSON.stringify({
    scanned,
    maskedUid: mask(match.uid),
    isOwnerUid: match.uid === OWNER_UID,
    email_masked: match.email ? match.email.replace(/(.).*(@.*)/, "$1***$2") : null,
    created: match.metadata.creationTime,
    lastSignIn: match.metadata.lastSignInTime,
    customClaims: { admin: claims.admin === true, owner: claims.owner === true },
    allowlistMembership: member ? { cohort: member.cohort, enabled: member.enabled } : "none",
    rolloutDecision: {
      mode: decision.mode, enabled: decision.enabled, emergencyLegacy: decision.emergencyLegacy,
      cohortId: decision.cohortId, cohortId_matches_log: decision.cohortId === TARGET_COHORT,
      rolloutVersion: decision.rolloutVersion, assignmentReason: decision.assignmentReason,
      diagnosticsAllowed: decision.diagnosticsAllowed,
    },
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
