/**
 * Phase A2 Part 2 — CLI penutupan pilot (owner-authorized, dry-run lalai).
 *
 * Menutup SATU batch pilot yang telah disahkan dengan mengalihkan
 * `verificationResult` daripada `pending_post_write` kepada `verified` dan
 * menambah SATU peristiwa audit. Ia TIDAK mengubah globalCompletion atau
 * rollbackStatus, TIDAK menyentuh registry/publication/head/alias/legasi, dan
 * TIDAK memadam apa-apa.
 *
 * Mod:
 *   (lalai)      : dry-run — sahkan bukti, kira mutasi dirancang, SIFAR tulisan.
 *   --execute    : jalankan satu transaksi (verificationResult + 1 audit).
 *
 * Guard wajib:
 *   --confirm-project=makanmana-c59f3
 *   --batch=PMB-925c3b83df84ce7016e99f1f
 *   --confirm-batch=PMB-925c3b83df84ce7016e99f1f
 *   (execute juga: --source-commit=<sha>)
 *
 * Larian ini TIDAK dijalankan dalam sesi A2 terhadap produksi. Ia disediakan
 * untuk prosedur penempatan terkawal yang berasingan dan diluluskan pemilik.
 */
import { writeFileSync, mkdirSync } from "fs";

import * as admin from "firebase-admin";

import {
  banner,
  parseClosureArgs,
  assertSafeClosureInvocation,
  toClosureRequest,
  renderRedactedReport,
} from "../src/domain/places/migration/pilotClosure";
import {
  gatherClosureEvidence,
  applyPilotClosure,
} from "../src/domain/places/migration/firestorePilotClosure";

const NEUTRAL_TS = 1_700_000_000_000;

async function main() {
  const args = parseClosureArgs(process.argv.slice(2));
  assertSafeClosureInvocation(args);
  const req = toClosureRequest(args, "owner:makanmana.app");

  // eslint-disable-next-line no-console
  console.log(banner(req.projectId, req.execute));

  admin.initializeApp({ projectId: req.projectId });
  const db = admin.firestore();

  // Evidence gathering is read-only. legacySourceUnchanged is asserted by the
  // migration contract (this tool never touches place_details/places_cache).
  const evidence = await gatherClosureEvidence(db, req.batchId, {
    projectId: req.projectId,
    legacySourceUnchanged: true,
  });

  const applied = await applyPilotClosure(db, req, evidence, NEUTRAL_TS);
  const report = renderRedactedReport(req, applied.decision, {
    wrote: applied.wrote,
    writeCount: applied.writeCount,
    resultingBatch: applied.resultingBatch,
  });

  try {
    mkdirSync("out", { recursive: true });
    writeFileSync(
      `out/place_data_a2_pilot_closure_${req.execute ? "execute" : "dryrun"}.json`,
      JSON.stringify(report, null, 2),
    );
  } catch {
    // Report file is a convenience; failure to write it must not mask the run.
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  // A dry run that is ineligible is a non-zero signal; an eligible dry run or a
  // successful/idempotent execute is zero.
  const ok = report.alreadyVerified || report.eligible;
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
