/**
 * Wave 3D — CLI normalisasi `status` LEGASI bagi KOMEN POST.
 * UNTUK PEMILIK/OWNER-AUTH.
 *
 * WARNING: menyasarkan Firestore PRODUKSI apabila --confirm-project=makanmana-c59f3.
 * DRY RUN ialah DEFAULT. Tanpa --mode=apply DAN --apply, ia HANYA MEMBACA.
 *
 * Skop: feed_posts/{postId}/comments/{commentId} SAHAJA.
 * Imbasan menggunakan collectionGroup("comments") untuk capaian, tetapi SETIAP
 * dokumen disemak semula terhadap bentuk laluan sebenar sebelum apa-apa
 * ditulis — subkoleksi `comments` di bawah induk LAIN dilangkau, dan koleksi
 * aras atas `menu_comments` (domain Wave 3C) tidak boleh padan langsung.
 *
 * Apa yang ia tulis (mod apply sahaja):
 *   komen yang TIADA medan `status`  ->  {status: "active"}  (merge)
 * Apa yang ia TIDAK PERNAH sentuh:
 *   - komen dengan status active/deleted (komen dipadam kekal dipadam)
 *   - status tidak dikenali (dilaporkan sahaja, TIDAK ditukar)
 *   - authorUid, text, parentCommentId, postId, parentVisibility,
 *     createdAt, updatedAt, atau apa-apa medan identiti
 *
 * Jalankan (DRY RUN dahulu — Fasa C3 runbook):
 *   npx tsx functions/scripts/feedPostCommentStatusBackfill.ts \
 *     --mode=dry-run --max-documents=20000 --output=../reports
 *
 * Jalankan (APPLY — Fasa C5, selepas semakan pemilik):
 *   npx tsx functions/scripts/feedPostCommentStatusBackfill.ts \
 *     --mode=apply --apply --confirm-project=makanmana-c59f3 \
 *     --max-documents=20000 --output=../reports
 *
 * Sambung larian terputus (resume-safe):
 *   ... --start-after=<resumeCursor dari laporan sebelum ini>
 *
 * Ejen automasi menjalankan ini HANYA di bawah kebenaran pemilik eksplisit.
 * TIDAK di-import oleh index.ts. TIDAK dijalankan dalam Wave 3D entry gate 1.
 */
import {mkdirSync, writeFileSync} from "fs";

import * as admin from "firebase-admin";

import {
  COMMENTS_COLLECTION,
  CommentBackfillCounters,
  EXPECTED_PROJECT_ID,
  accumulateCommentBackfill,
  assertSafeCommentBackfillInvocation,
  commentBackfillBanner,
  commentBackfillExitCode,
  decideLegacyCommentStatusBackfill,
  emptyCommentBackfillCounters,
  isCommentBackfillDryRun,
  parseCommentBackfillArgs,
  recordCommentBackfillError,
  renderCommentBackfillReport,
} from "../src/domain/feed/legacyCommentStatusBackfill";

async function main(): Promise<number> {
  const args = parseCommentBackfillArgs(process.argv.slice(2));
  assertSafeCommentBackfillInvocation(args);
  const dryRun = isCommentBackfillDryRun(args);

  console.log(commentBackfillBanner(EXPECTED_PROJECT_ID, dryRun));

  if (admin.apps.length === 0) {
    admin.initializeApp({projectId: EXPECTED_PROJECT_ID});
  }
  const db = admin.firestore();

  const counters: CommentBackfillCounters = emptyCommentBackfillCounters();
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  let cursorPath: string | null = args.startAfter ?? null;
  let resumeCursor: string | null = null;
  // TRUNCATED means the cap stopped us while documents remained. Proven by a
  // probe, never inferred from the cursor: a run that ends exactly on a page
  // boundary also has a cursor but has in fact seen everything.
  let truncated = false;

  /** Resume by document PATH: re-read the cursor document to seed startAfter. */
  async function seedCursor(path: string) {
    const snap = await db.doc(path).get();
    if (!snap.exists) {
      throw new Error(`refused: --start-after=${path} does not exist; cannot resume safely`);
    }
    return snap;
  }

  let startAfterSnap: admin.firestore.DocumentSnapshot | null =
    cursorPath ? await seedCursor(cursorPath) : null;

  for (;;) {
    if (counters.scanned >= args.maxDocuments) {
      let probe = db.collectionGroup(COMMENTS_COLLECTION)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(1);
      if (cursor) probe = probe.startAfter(cursor);
      const probeSnap = await probe.get();
      truncated = !probeSnap.empty;
      resumeCursor = truncated ? cursorPath : null;
      console.log(
        truncated ?
          `[cap] --max-documents=${args.maxDocuments} reached with documents REMAINING; resume with --start-after=${cursorPath ?? ""}` :
          `[cap] --max-documents=${args.maxDocuments} reached exactly at the end of the collection group`,
      );
      break;
    }

    const remaining = args.maxDocuments - counters.scanned;
    const pageSize = Math.min(args.pageSize, remaining);

    let q = db.collectionGroup(COMMENTS_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    else if (startAfterSnap) q = q.startAfter(startAfterSnap);
    const snap = await q.get();
    if (snap.empty) break;

    // Writes are PER DOCUMENT and PRECONDITIONED on the exact version read
    // (lastUpdateTime). If the author soft-deletes or edits a comment between
    // our scan and our write, the precondition fails, that ONE document is
    // reported, and it is never clobbered back to "active".
    const pending: Array<{path: string; write: Promise<unknown>}> = [];

    for (const doc of snap.docs) {
      cursor = doc;
      cursorPath = doc.ref.path;
      const decision = decideLegacyCommentStatusBackfill(doc.ref.path, doc.data() ?? {});
      if (decision.action === "set_active" && decision.update && !dryRun) {
        pending.push({
          path: doc.ref.path,
          write: doc.ref.update(decision.update, {lastUpdateTime: doc.updateTime}),
        });
      } else {
        accumulateCommentBackfill(counters, doc.ref.path, decision, false);
      }
    }

    for (const {path, write} of pending) {
      const missing = {action: "set_active" as const, reason: "missing" as const, update: {status: "active"}};
      try {
        await write;
        accumulateCommentBackfill(counters, path, missing, true);
      } catch (e) {
        console.error(`[error] ${path}: ${(e as Error).message}`);
        accumulateCommentBackfill(counters, path, missing, false);
        recordCommentBackfillError(counters, path);
      }
    }

    console.log(`[page] scanned=${counters.scanned} missing=${counters.missingStatus} updated=${counters.updated} cursor=${cursorPath ?? ""}`);
    if (snap.size < pageSize) break;
  }

  const report = renderCommentBackfillReport(counters, dryRun, resumeCursor, truncated);
  console.log("");
  console.log(report);

  if (args.output) {
    mkdirSync(args.output, {recursive: true});
    const name = dryRun ? "comment_status_dry_run.md" : "comment_status_apply.md";
    writeFileSync(`${args.output}/${name}`, report, "utf8");
    console.log(`\nReport written to ${args.output}/${name}`);
  }

  return commentBackfillExitCode(counters, truncated);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
