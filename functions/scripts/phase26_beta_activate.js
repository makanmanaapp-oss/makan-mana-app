/**
 * Phase 2.6 — Activate controlled beta_allowlist (wave_1) for owner-approved test
 * accounts ONLY, with full metadata, then verify resolution. Real Firestore + real
 * resolver. Full UID never printed. ADC creds.
 */
process.env.ALGO2_FLAGS = "all";
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ projectId: "makanmana-c59f3" });
const db = admin.firestore();
const { cohortIdFor, resolveRollout } = require("../lib/domain/rollout/rolloutResolver");
const { getRolloutConfig } = require("../lib/config/rolloutConfig");

const OWNER = "blp6g37BUVPFLsDrSGuVqHrne153";
// Owner-approved test accounts (owner-controlled; NOT unrelated public users).
const TARGETS = [
  { cohortId: "6eb4a05772", label: "beta_free_sparse" },   // Lust Specter, Free
  { cohortId: "4e5a9f33bd", label: "beta_pro_established" }, // Ruff 2nd acct, Pro
];
const mask = (u) => u.slice(0, 6) + "…" + u.slice(-4);

async function findUid(cohortId, salt) {
  let pt;
  do {
    const r = await admin.auth().listUsers(1000, pt);
    for (const u of r.users) if (cohortIdFor(u.uid, salt) === cohortId) return u;
    pt = r.pageToken;
  } while (pt);
  return null;
}

(async () => {
  const cfg = getRolloutConfig();
  const salt = cfg.salt || "nosalt";
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 3600 * 1000; // 7-day fail-safe expiry
  const cohort = [];

  for (const t of TARGETS) {
    const u = await findUid(t.cohortId, salt);
    if (!u) { cohort.push({ label: t.label, error: "uid_not_found" }); continue; }
    const user = (await db.collection("users").doc(u.uid).get()).data() || {};
    const brain = (await db.collection("user_brain_profiles").doc(u.uid).get()).data() || {};
    const mealsSnap = await db.collection("users").doc(u.uid).collection("meals").limit(6).get();
    const plan = user.plan || "free";
    const brainVersion = brain.brainVersion || 0;
    const mealCount = mealsSnap.size;
    const maturity = brainVersion > 0 || mealCount >= 3 ? "established" : "sparse";

    // Activate beta_allowlist (wave_1) with full metadata.
    await db.collection("algorithm_rollout_members").doc(u.uid).set({
      cohort: "beta_allowlist", enabled: true, reason: "phase_2_6_controlled_beta",
      rolloutVersion: cfg.rolloutVersion, createdAt: now, createdBy: OWNER,
      expiresAt, betaWave: "wave_1",
    });
    await db.collection("algorithm_rollout_audit").add({
      action: "beta_activate", betaWave: "wave_1", cohortId: t.cohortId,
      reason: "phase_2_6_controlled_beta", by: OWNER, at: now,
    });

    const member = { cohort: "beta_allowlist", enabled: true, expiresAt };
    const d = resolveRollout({ uid: u.uid, isOwner: false, allowlistMember: member, now, config: cfg });
    cohort.push({
      label: t.label, maskedUid: mask(u.uid), cohortId: t.cohortId, plan,
      profileMaturity: maturity, brainVersion, mealCount,
      approvedBy: mask(OWNER), approvedAt: now, expiresAt,
      decision: { mode: d.mode, enabled: d.enabled, shadowEnabled: d.shadowEnabled,
        emergencyLegacy: d.emergencyLegacy, diagnosticsAllowed: d.diagnosticsAllowed,
        reason: d.assignmentReason },
    });
  }

  // Owner control + non-member control.
  const ownerD = resolveRollout({ uid: OWNER, isOwner: true, allowlistMember: null, now, config: cfg });
  const nonMemberD = resolveRollout({ uid: "some_public_user_x", isOwner: false, allowlistMember: null, now, config: cfg });

  console.log(JSON.stringify({
    betaWave: "wave_1", activatedAt: now, expiresAt,
    config: { valid: cfg.valid, livePercent: cfg.livePercent, shadowPercent: cfg.shadowPercent, rolloutVersion: cfg.rolloutVersion },
    cohort,
    owner_control: { mode: ownerD.mode, enabled: ownerD.enabled },
    nonmember_control: { mode: nonMemberD.mode, enabled: nonMemberD.enabled, reason: nonMemberD.assignmentReason },
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
