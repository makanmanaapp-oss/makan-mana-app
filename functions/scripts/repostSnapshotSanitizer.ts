/**
 * Wave 3C — CLI pembersih `originalSnapshot` LEGASI pada repost/quote.
 * UNTUK PEMILIK/OWNER-AUTH.
 *
 * WARNING: menyasarkan Firestore PRODUKSI apabila --confirm-project=makanmana-c59f3.
 * DRY RUN ialah DEFAULT. Tanpa --mode=apply DAN --apply, ia HANYA MEMBACA.
 *
 * Apa yang ia tulis (mod apply sahaja):
 *   feed_posts (postType repost / quote_repost) yang MASIH menyimpan
 *   originalSnapshot berbentuk LEGASI YANG DIKENALI  ->  medan itu DIPADAM.
 * Apa yang ia TIDAK PERNAH sentuh:
 *   - authorUid
 *   - teks quote milik PENGGUNA yang repost (medan `text` dokumen repost)
 *   - status, visibility, createdAt
 *   - repostOfPostId, quotedPostId
 *   - sebarang kaunter (likeCount/commentCount/repostCount/quoteCount)
 *   - dokumen bukan repost
 *   - originalSnapshot berbentuk TIDAK DIKENALI (dilaporkan sahaja)
 *
 * Jalankan (DRY RUN dahulu):
 *   npx tsx functions/scripts/repostSnapshotSanitizer.ts \
 *     --mode=dry-run --max-documents=20000 --output=../reports
 *
 * Jalankan (APPLY — selepas semakan pemilik):
 *   npx tsx functions/scripts/repostSnapshotSanitizer.ts \
 *     --mode=apply --apply --confirm-project=makanmana-c59f3 \
 *     --max-documents=20000 --output=../reports
 *
 * Sambung larian terputus (resume-safe, id-ordered):
 *   ... --start-after=<resumeCursor dari laporan sebelum ini>
 *
 * Ejen automasi menjalankan ini HANYA di bawah kebenaran pemilik eksplisit.
 * TIDAK di-import oleh index.ts. TIDAK dijalankan dalam Wave 3C.
 */
import {mkdirSync, writeFileSync} from "fs";

import * as admin from "firebase-admin";

import {
  EXPECTED_PROJECT_ID,
  ScrubCounters,
  accumulateScrub,
  assertSafeScrubInvocation,
  decideRepostSnapshotScrub,
  emptyScrubCounters,
  isScrubDryRun,
  parseScrubArgs,
  recordScrubError,
  renderScrubReport,
  scrubBanner,
  scrubExitCode,
} from "../src/domain/feed/repostSnapshotSanitizer";

const C_POSTS = "feed_posts";

async function main(): Promise<number> {
  const args = parseScrubArgs(process.argv.slice(2));
  assertSafeScrubInvocation(args);
  const dryRun = isScrubDryRun(args);

  console.log(scrubBanner(EXPECTED_PROJECT_ID, dryRun));

  if (admin.apps.length === 0) {
    admin.initializeApp({projectId: EXPECTED_PROJECT_ID});
  }
  const db = admin.firestore();

  const counters: ScrubCounters = emptyScrubCounters();
  let cursor: string | null = args.startAfter ?? null;
  let resumeCursor: string | null = null;
  // TRUNCATED means the cap stopped us while documents remained. Proven by a
  // probe, never inferred from the cursor: a run that ends exactly on a page
  // boundary also has a cursor but has in fact seen everything.
  let truncated = false;

  for (;;) {
    if (counters.scanned >= args.maxDocuments) {
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

    // Scanned by document id (not filtered server-side) so the run is
    // deterministically resumable and needs no composite index. The pure
    // decision rejects anything that is not a repost.
    let q = db.collection(C_POSTS).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    // Removals are PER DOCUMENT and PRECONDITIONED on the exact version read
    // (lastUpdateTime). If anything touches the document between our read and
    // our write, the precondition fails, that ONE document is reported, and it
    // is never clobbered. A batch cannot do this: one precondition failure
    // would abort the whole page.
    const pending: Array<{id: string; postType: unknown; write: Promise<unknown>}> = [];

    for (const doc of snap.docs) {
      cursor = doc.id;
      const data = doc.data() ?? {};
      const decision = decideRepostSnapshotScrub(data);
      if (decision.action === "remove_snapshot" && decision.removeFields.length > 0 && !dryRun) {
        const update: Record<string, unknown> = {};
        for (const field of decision.removeFields) {
          update[field] = admin.firestore.FieldValue.delete();
        }
        pending.push({
          id: doc.id,
          postType: data.postType,
          write: doc.ref.update(update, {lastUpdateTime: doc.updateTime}),
        });
      } else {
        accumulateScrub(counters, doc.id, data.postType, decision, false);
      }
    }

    for (const {id, postType, write} of pending) {
      const unsafe = decideRepostSnapshotScrub({postType, originalSnapshot: {text: ""}});
      try {
        await write;
        accumulateScrub(counters, id, postType, unsafe, true);
      } catch (e) {
        console.error(`[error] ${id}: ${(e as Error).message}`);
        accumulateScrub(counters, id, postType, unsafe, false);
        recordScrubError(counters, id);
      }
    }

    console.log(`[page] scanned=${counters.scanned} wouldSanitize=${counters.wouldSanitize} sanitized=${counters.sanitized} cursor=${cursor ?? ""}`);
    if (snap.size < pageSize) break;
  }

  const report = renderScrubReport(counters, dryRun, resumeCursor, truncated);
  console.log("");
  console.log(report);

  if (args.output) {
    mkdirSync(args.output, {recursive: true});
    const name = dryRun ? "repost_snapshot_dry_run.md" : "repost_snapshot_apply.md";
    writeFileSync(`${args.output}/${name}`, report, "utf8");
    console.log(`\nReport written to ${args.output}/${name}`);
  }

  return scrubExitCode(counters, truncated);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
