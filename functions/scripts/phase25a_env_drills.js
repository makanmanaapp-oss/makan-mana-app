/**
 * Phase 2.5A — Env→config→resolver faithfulness for rollback drills.
 * Runs the REAL production getRolloutConfig() + resolveRollout() under each drill's
 * env, proving the deployed code maps ALGO2_* env → behavior. No Firestore, no deploy.
 */
const { resolveRollout } = require("../lib/domain/rollout/rolloutResolver");

function run(label, env) {
  // fresh config load under this env
  for (const k of Object.keys(process.env)) if (k.startsWith("ALGO2_")) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve("../lib/config/rolloutConfig")];
  const { getRolloutConfig } = require("../lib/config/rolloutConfig");
  const config = getRolloutConfig();
  const owner = resolveRollout({ uid: "blp6g37BUVPFLsDrSGuVqHrne153", isOwner: true, allowlistMember: null, now: 1000, config });
  const beta = resolveRollout({ uid: "beta_test_uid", isOwner: false,
    allowlistMember: { cohort: "beta_live", enabled: true, expiresAt: null }, now: 1000, config });
  const normal = resolveRollout({ uid: "normal_uid", isOwner: false, allowlistMember: null, now: 1000, config });
  return {
    label,
    configValid: config.valid, emergencyLegacy: config.emergencyLegacy,
    owner: { mode: owner.mode, enabled: owner.enabled, modules: owner.modules },
    beta: { mode: beta.mode, enabled: beta.enabled, unifiedScoring: beta.modules.unifiedScoring,
      expandedPool: beta.modules.expandedPool, aiBrainHydration: beta.modules.aiBrainHydration,
      explorePagination: beta.modules.explorePagination },
    normal: { mode: normal.mode, enabled: normal.enabled },
  };
}

const results = [
  run("BASELINE (prod: ALGO2_FLAGS=all)", { ALGO2_FLAGS: "all" }),
  run("DRILL1 module unifiedScoring OFF", { ALGO2_FLAGS: "all", ALGO2_MODULE_OFF: "unifiedScoring" }),
  run("DRILL2 module expandedPool+explorePagination OFF", { ALGO2_FLAGS: "all", ALGO2_MODULE_OFF: "expandedPool,explorePagination" }),
  run("DRILL3 module aiBrainHydration OFF", { ALGO2_FLAGS: "all", ALGO2_MODULE_OFF: "aiBrainHydration" }),
  run("DRILLH global emergency legacy", { ALGO2_FLAGS: "all", ALGO2_EMERGENCY_LEGACY: "true" }),
  run("INVALID cap raised (fail-closed)", { ALGO2_FLAGS: "all", ALGO2_PROVIDER_CAP_PER_REQUEST: "5" }),
];
console.log(JSON.stringify(results, null, 2));
