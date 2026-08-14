import {timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {
  referencesFromAreaCachePage,
  RuntimeAreaCacheDoc,
} from "../domain/places/coverage/controlCenterReferenceSanitizer";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_PLACE_OPERATIONS_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/place-operations";
const AREA_CACHE_COLLECTION = "area_place_cache";
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

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

async function pushReferences(records: Record<string, unknown>[], secret: string): Promise<void> {
  if (records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_PLACE_OPERATIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({dataset: "reference_records", records}),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Control Center reference sync rejected (${response.status}): ${detail}`);
  }
}

/**
 * Manual, read-only runtime place inventory -> Control Center sync.
 *
 * area_place_cache is the production database-first supply used by the live
 * recommendation path. Each candidate is projected into the reference store
 * and idempotently deduplicated by reference_key/provider placeId.
 *
 * Historical raw provider scan counts are intentionally not inferred here:
 * the runtime cache does not persist a reliable cumulative scan counter.
 */
export const syncPlaceReferencesToControlCenter = onRequest(
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
      response.status(401).json({error: "Unauthorized place reference sync trigger."});
      return;
    }

    const body = (request.body ?? {}) as SyncBody;
    const pageSize = boundedInteger(body.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const maxPages = boundedInteger(body.maxPages, DEFAULT_MAX_PAGES, 1, MAX_PAGES);
    let cursor = typeof body.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : undefined;
    let sourceCellsRead = 0;
    let candidateRowsSeen = 0;
    let recordsSent = 0;
    let batchesSent = 0;
    let complete = false;

    try {
      for (let page = 0; page < maxPages; page++) {
        let query = db.collection(AREA_CACHE_COLLECTION).orderBy(FieldPath.documentId()).limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (snapshot.empty) {
          complete = true;
          break;
        }

        const pageDocs = snapshot.docs.map((doc) => ({
          id: doc.id,
          data: doc.data() as RuntimeAreaCacheDoc,
        }));
        candidateRowsSeen += pageDocs.reduce(
          (total, doc) => total + (Array.isArray(doc.data.candidates) ? doc.data.candidates.length : 0),
          0,
        );
        const records = referencesFromAreaCachePage(pageDocs);
        await pushReferences(records, secret);

        sourceCellsRead += snapshot.size;
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
        source: AREA_CACHE_COLLECTION,
        dataset: "reference_records",
        sourceCellsRead,
        candidateRowsSeen,
        recordsSent,
        batchesSent,
        nextCursor: complete ? null : cursor ?? null,
        complete,
        historicalRawScanTotalAvailable: false,
      });
    } catch (error) {
      console.error("Control Center place reference sync failed", {
        message: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      });
      response.status(500).json({error: "Place reference sync failed."});
    }
  },
);
