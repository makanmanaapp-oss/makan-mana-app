// HOTFIX 4.6A — admin-gated one-time backfill callable for public_profiles
// search fields. Dry-run by default; WRITE mode requires confirm === project id.
// Resumable via cursor. NOT run in production during 4.6A.

import {HttpsError, onCall} from "firebase-functions/v2/https";

import {ADMIN_UIDS} from "../config/constants";
import {db} from "../config/firebase";
import {backfillPage, ProfileRow} from "../domain/peopleSearch/peopleSearchBackfill";
import {LowerUpdate} from "../domain/peopleSearch/normalize";

export const backfillPeopleSearchLowerV2 = onCall(async (req) => {
  const uid = req.auth?.uid;
  const isAdmin =
    !!uid && (req.auth?.token?.admin === true || ADMIN_UIDS.includes(uid));
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin sahaja.");

  const {dryRun = true, confirm, cursor, pageSize = 200} = (req.data ?? {}) as {
    dryRun?: boolean;
    confirm?: string;
    cursor?: string;
    pageSize?: number;
  };
  const project = process.env.GCLOUD_PROJECT ?? "";
  const write = dryRun === false;
  if (write && confirm !== project) {
    throw new HttpsError(
      "failed-precondition",
      `Write mode requires confirm === project id ("${project}").`
    );
  }

  const deps = {
    listProfiles: async (size: number, cur?: string) => {
      let q = db
        .collection("public_profiles")
        .orderBy("__name__")
        .limit(size);
      if (cur) {
        q = db
          .collection("public_profiles")
          .orderBy("__name__")
          .startAfter(cur)
          .limit(size);
      }
      const snap = await q.get();
      const docs: ProfileRow[] = snap.docs.map((d) => ({id: d.id, data: d.data()}));
      const nextCursor =
        snap.size === size ? snap.docs[snap.docs.length - 1].id : null;
      return {docs, nextCursor};
    },
    writeLower: async (id: string, upd: LowerUpdate) => {
      await db.collection("public_profiles").doc(id).set(upd, {merge: true});
    },
  };

  return backfillPage(deps, {dryRun: !write, pageSize, cursor});
});
