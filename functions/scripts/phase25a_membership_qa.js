/**
 * Phase 2.5A — Allow-list add/remove lifecycle + expired membership + normal-account
 * verification using the REAL production resolver code against REAL Firestore data.
 * Uses a synthetic TEST uid only (never a real user). ADC credentials.
 *
 * Mirrors production env: ALGO2_FLAGS=all, no rollout envs => livePercent=0, salt="".
 */
process.env.ALGO2_FLAGS = process.env.ALGO2_FLAGS || "all";
delete process.env.ALGO2_ROLLOUT_LIVE_PERCENT;
delete process.env.ALGO2_ROLLOUT_SHADOW_PERCENT;
delete process.env.ALGO2_EMERGENCY_LEGACY;
delete process.env.ALGO2_MODULE_OFF;

const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();

const { resolveRollout } = require("../lib/domain/rollout/rolloutResolver");
const { getRolloutConfig } = require("../lib/config/rolloutConfig");

const TEST_UID = "phase25a_test_beta_uid_DELETEME"; // synthetic, not a real account
const OWNER_UID = "blp6g37BUVPFLsDrSGuVqHrne153";
const MEMBERS = "algorithm_rollout_members";
const AUDIT = "algorithm_rollout_audit";

async function readMember(uid) {
  const s = await db.collection(MEMBERS).doc(uid).get();
  if (!s.exists) return null;
  const d = s.data() || {};
  return { cohort: d.cohort ?? null, enabled: d.enabled === true, expiresAt: d.expiresAt ?? null };
}

function decideFor(uid, isOwner, member, config, now) {
  const d = resolveRollout({ uid, isOwner, allowlistMember: member, now, config });
  return {
    mode: d.mode, enabled: d.enabled, emergencyLegacy: d.emergencyLegacy,
    shadowEnabled: d.shadowEnabled, diagnosticsAllowed: d.diagnosticsAllowed,
    cohortId: d.cohortId, cohortId_is_uid: d.cohortId === uid,
    rolloutVersion: d.rolloutVersion, assignmentReason: d.assignmentReason,
    decisionHash: d.decisionHash,
  };
}

(async () => {
  const now = Date.now();
  const config = getRolloutConfig();
  const out = { fixedNow: now, config: {
    valid: config.valid, emergencyLegacy: config.emergencyLegacy,
    livePercent: config.livePercent, shadowPercent: config.shadowPercent,
    salt_len: config.salt.length, rolloutVersion: config.rolloutVersion,
  }, steps: {} };

  // --- Part B (resolver side): normal non-owner account, NO membership -> legacy
  await db.collection(MEMBERS).doc(TEST_UID).delete().catch(() => {});
  out.steps.B_normal_no_membership = decideFor(TEST_UID, false, await readMember(TEST_UID), config, now);

  // --- owner control -> owner_internal
  out.steps.owner_control = decideFor(OWNER_UID, true, null, config, now);

  // --- Part C: ADD allow-list membership (server-side) cohort=beta_allowlist(beta_live)
  const addDoc = {
    cohort: "beta_live", enabled: true, reason: "phase_2_5a_device_qa",
    expiresAt: now + 7 * 24 * 3600 * 1000, createdAt: now,
    createdBy: OWNER_UID, rolloutVersion: config.rolloutVersion,
  };
  await db.collection(MEMBERS).doc(TEST_UID).set(addDoc);
  await db.collection(AUDIT).add({ action: "add", uid_masked: TEST_UID.slice(0, 8) + "…",
    cohort: "beta_live", reason: "phase_2_5a_device_qa", by: OWNER_UID, at: now });
  out.steps.C_after_add = decideFor(TEST_UID, false, await readMember(TEST_UID), config, now);

  // --- Part C: REMOVE / disable membership -> legacy on next resolve
  await db.collection(MEMBERS).doc(TEST_UID).delete();
  await db.collection(AUDIT).add({ action: "remove", uid_masked: TEST_UID.slice(0, 8) + "…",
    reason: "phase_2_5a_cleanup", by: OWNER_UID, at: now });
  out.steps.C_after_remove = decideFor(TEST_UID, false, await readMember(TEST_UID), config, now);

  // --- Part D: EXPIRED membership -> legacy (server time authoritative)
  const expiredDoc = { cohort: "beta_live", enabled: true, reason: "phase_2_5a_expired",
    expiresAt: now - 60 * 1000, createdAt: now - 3600 * 1000, createdBy: OWNER_UID };
  await db.collection(MEMBERS).doc(TEST_UID).set(expiredDoc);
  out.steps.D_expired = decideFor(TEST_UID, false, await readMember(TEST_UID), config, now);

  // --- beta_shadow cohort -> percentage_shadow (legacy output + shadow on)
  await db.collection(MEMBERS).doc(TEST_UID).set({ cohort: "beta_shadow", enabled: true,
    expiresAt: now + 3600 * 1000, createdAt: now, createdBy: OWNER_UID });
  out.steps.E_shadow_member = decideFor(TEST_UID, false, await readMember(TEST_UID), config, now);

  // --- CLEANUP: remove synthetic test doc
  await db.collection(MEMBERS).doc(TEST_UID).delete();
  out.steps.cleanup_member_exists = (await readMember(TEST_UID)) !== null;

  // audit read count (server-only) for evidence
  const auditSnap = await db.collection(AUDIT).where("uid_masked", "==", TEST_UID.slice(0, 8) + "…").get();
  out.audit_entries_written = auditSnap.size;

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => { console.error("HARNESS_ERROR", e); process.exit(1); });
