/**
 * Wave 3C — CLI normalisasi `feed_posts.status` LEGASI. UNTUK PEMILIK/OWNER-AUTH.
 *
 * WARNING: menyasarkan Firestore PRODUKSI apabila --confirm-project=makanmana-c59f3.
 * DRY RUN ialah DEFAULT. Tanpa --mode=apply DAN --apply, ia HANYA MEMBACA.
 *
 * Apa yang ia tulis (mod apply sahaja):
 *   feed_posts yang TIADA medan `status`  ->  {status: "active"}  (merge)
 * Apa yang ia TIDAK PERNAH sentuh:
 *   - dokumen dengan status active/hidden/deleted (kandungan dimoderasi kekal)
 *   - status tidak dikenali (dilaporkan sahaja, TIDAK ditukar)
 *   - visibility, authorUid, createdAt, teks, atau apa-apa medan lain
 *
 * Jalankan (DRY RUN dahulu — Fasa 3 runbook):
 *   npx tsx functions/scripts/feedPostStatusBackfill.ts \
 *     --mode=dry-run --max-documents=20000 --output=../reports
 *
 * Jalankan (APPLY — Fasa 4, selepas semakan pemilik):
 *   npx tsx functions/scripts/feedPostStatusBackfill.ts \
 *     --mode=apply --apply --confirm-project=makanmana-c59f3 \
 *     --max-documents=20000 --output=../reports
 *
 * Sambung larian terputus (resume-safe, id-ordered):
 *   ... --start-after=<id terakhir dari laporan sebelum ini>
 *
 * Ejen automasi menjalankan ini HANYA di bawah kebenaran pemilik eksplisit.
 * TIDAK di-import oleh index.ts. TIDAK dijalankan dalam Wave 3C.
 */
import {mkdirSync, writeFileSync} from "fs";

import * as admin from "firebase-admin";

import {
  BackfillCounters,
  EXPECTED_PROJECT_ID,
  accumulateBackfill,
  assertSafeBackfillInvocation,
  backfillBanner,
  backfillExitCode,
  decideLegacyStatusBackfill,
  emptyBackfillCounters,
  isDryRun,
  parseBackfillArgs,
  recordBackfillError,
  renderBackfillReport,
} from "../src/domain/feed/legacyStatusBackfill";

const C_POSTS = "feed_posts";

async function main(): Promise<number> {
  const args = parseBackfillArgs(process.argv.slice(2));
  assertSafeBackfillInvocation(args);
  const dryRun = isDryRun(args);

  console.log(backfillBanner(EXPECTED_PROJECT_ID, dryRun));

  if (admin.apps.length === 0) {
    admin.initializeApp({projectId: EXPECTED_PROJECT_ID});
  }
  const db = admin.firestore();

  const counters: BackfillCounters = emptyBackfillCounters();
  let cursor: string | null = args.startAfter ?? null;
  let resumeCursor: string | null = null;
  // TRUNCATED means the cap stopped us while documents remained. It is proven
  // by a probe, never inferred from the cursor: a run that ends exactly on a
  // page boundary also has a cursor but has in fact seen everything.
  let truncated = false;

  for (;;) {
    if (counters.scanned >= args.maxDocuments) {
      // Cap reached. Probe one document past the cursor to distinguish
      // "stopped early" from "finished on a page boundary".
      const probe = await db
        .collection(C_POSTS)
        .orderBy(admin.firestore.FieldPath.documentId())
        .startAfter(cursor)
        .limit(1)
        .get();
      truncated = !probe.empty;
      resumeCursor = truncated ? cursor : null;
      console.log(
        truncated ?
          `[cap] --max-documents=${args.maxDocuments} reached with documents REMAINING; resume with --start-after=${cursor ?? ""}` :
          `[cap] --max-documents=${args.maxDocuments} reached exactly at the end of the collection`,
      );
      break;
    }

    const remaining = args.maxDocuments - counters.scanned;
    const pageSize = Math.min(args.pageSize, remaining);

    let q = db.collection(C_POSTS).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    // Writes are PER DOCUMENT and PRECONDITIONED on the exact version we read
    // (lastUpdateTime). If a moderator hides or removes a post, or the author
    // self-deletes it, between our read and our write, the precondition fails
    // and that ONE document is skipped and reported — it is never clobbered
    // back to "active". A batch could not do this: a batch precondition failure
    // aborts all 300 documents, turning one concurrent moderation into a whole
    // failed page.
    const pending: Array<{id: string; write: Promise<unknown>}> = [];

    for (const doc of snap.docs) {
      cursor = doc.id;
      const decision = decideLegacyStatusBackfill(doc.data() ?? {});
      if (decision.action === "set_active" && decision.update && !dryRun) {
        pending.push({
          id: doc.id,
          write: doc.ref.update(decision.update, {lastUpdateTime: doc.updateTime}),
        });
      } else {
        // Dry runs and every skip decision are folded immediately; real writes
        // are folded below once we know whether they landed.
        accumulateBackfill(counters, doc.id, decision, false);
      }
    }

    for (const {id, write} of pending) {
      const missing = {action: "set_active" as const, reason: "missing" as const, update: {status: "active"}};
      try {
        await write;
        accumulateBackfill(counters, id, missing, true);
      } catch (e) {
        // Includes FAILED_PRECONDITION: the document changed under us, which is
        // exactly the case we must NOT overwrite.
        console.error(`[error] ${id}: ${(e as Error).message}`);
        accumulateBackfill(counters, id, missing, false);
        recordBackfillError(counters, id);
      }
    }

    console.log(`[page] scanned=${counters.scanned} missing=${counters.missingStatus} updated=${counters.updated} cursor=${cursor ?? ""}`);
    if (snap.size < pageSize) break;
  }

  const report = renderBackfillReport(counters, dryRun, resumeCursor, truncated);
  console.log("");
  console.log(report);

  if (args.output) {
    mkdirSync(args.output, {recursive: true});
    const name = dryRun ? "feed_post_status_dry_run.md" : "feed_post_status_apply.md";
    writeFileSync(`${args.output}/${name}`, report, "utf8");
    console.log(`\nReport written to ${args.output}/${name}`);
  }

  return backfillExitCode(counters, truncated);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
