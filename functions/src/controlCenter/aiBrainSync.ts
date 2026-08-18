import {timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onRequest} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {sanitizeAiBrainProfile} from "../domain/aiBrain/controlCenterSanitizer";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_AI_BRAIN_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/ai-brain";
const BRAIN_COLLECTION = "user_brain_profiles";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGE_SIZE = 200;
const MAX_PAGES = 25;

type SyncBody = {
  pageSize?: number;
  maxPages?: number;
  cursor?: string;
};

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

async function pushProfiles(records: Record<string, unknown>[], secret: string): Promise<void> {
  if (records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_AI_BRAIN_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({dataset: "profiles", records}),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Control Center AI Brain sync rejected (${response.status}): ${detail}`);
  }
}

/**
 * Near-real-time privacy-minimised AI Brain mirror refresh.
 *
 * Every authoritative Firebase profile write projects only the Control Center
 * allow-list. Deletes are intentionally not converted into a mirror hard-delete;
 * the Universal Data Vault remains responsible for authoritative tombstones.
 */
export const syncAiBrainProfileMirrorToControlCenter = onDocumentWritten(
  {
    document: "user_brain_profiles/{uid}",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    maxInstances: 2,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    await pushProfiles([
      sanitizeAiBrainProfile(
        event.params.uid,
        after.data() as Record<string, unknown>,
      ),
    ], secret);
  },
);

/**
 * Manual, read-only production AI Brain -> Control Center reconciliation sync.
 *
 * Reads the already-computed user_brain_profiles collection and sends only a
 * strict operational allow-list. Firebase UID is replaced with a stable hash;
 * recent place history, moods, raw events, health/allergy data, GPS, receipts
 * and tokens never leave the backend through this bridge.
 */
export const syncAiBrainToControlCenter = onRequest(
  {
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({error: "POST required."});
      return;
    }

    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    const presented = bearerToken(request.header("authorization"));
    if (!secret || !presented || !safeEqual(presented, secret)) {
      response.status(401).json({error: "Unauthorized AI Brain sync trigger."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const maxPages = boundedInteger(body.maxPages, DEFAULT_MAX_PAGES, 1, MAX_PAGES);
    let cursor = typeof body.cursor === "string" && body.cursor.trim()
      ? body.cursor.trim()
      : undefined;
    let sourceRead = 0;
    let recordsSent = 0;
    let batchesSent = 0;
    let complete = false;

    try {
      for (let page = 0; page < maxPages; page++) {
        let query = db
          .collection(BRAIN_COLLECTION)
          .orderBy(FieldPath.documentId())
          .limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (snapshot.empty) {
          complete = true;
          break;
        }

        const records = snapshot.docs.map((doc) =>
          sanitizeAiBrainProfile(doc.id, doc.data() as Record<string, unknown>),
        );
        await pushProfiles(records, secret);

        sourceRead += snapshot.size;
        recordsSent += records.length;
        batchesSent++;
        cursor = snapshot.docs[snapshot.docs.length - 1].id;
        if (snapshot.size < pageSize) {
          complete = true;
          break;
        }
      }

      response.status(200).json({
        status: "OK",
        readOnly: true,
        source: BRAIN_COLLECTION,
        dataset: "profiles",
        sourceRead,
        recordsSent,
        batchesSent,
        nextCursor: complete ? null : cursor ?? null,
        complete,
      });
    } catch (error) {
      console.error("Control Center AI Brain sync failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "AI Brain sync failed."});
    }
  },
);
