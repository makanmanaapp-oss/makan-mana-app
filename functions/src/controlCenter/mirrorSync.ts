import {createHash, timingSafeEqual} from "node:crypto";

import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {
  sanitizePlacePublicationMirror,
  sanitizeSocialPostMirror,
  sanitizeUserMirror,
  shouldMirrorSocialPost,
} from "./mirrorSanitizers";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const CONTROL_CENTER_MIRROR_URL =
  "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGE_SIZE = 500;
const MAX_PAGES = 25;

type MirrorEntity = "user" | "place" | "social_post";
type MirrorRecord = Record<string, unknown>;

type SyncRequestBody = {
  entity?: MirrorEntity | "all";
  pageSize?: number;
  maxPages?: number;
  cursor?: string;
};

type EntitySyncResult = {
  entity: MirrorEntity;
  sourceRead: number;
  recordsSent: number;
  batchesSent: number;
  nextCursor: string | null;
  complete: boolean;
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
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

function batchEventId(entity: MirrorEntity, records: readonly MirrorRecord[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(records))
    .digest("hex")
    .slice(0, 40);
  return `firebase:${entity}:${digest}`;
}

async function pushBatch(
  entity: MirrorEntity,
  records: MirrorRecord[],
  secret: string,
): Promise<void> {
  if (records.length === 0) return;
  const response = await fetch(CONTROL_CENTER_MIRROR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "firebase",
      eventId: batchEventId(entity, records),
      entityType: entity,
      records,
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 800);
    throw new Error(
      `Control Center mirror rejected ${entity} batch (${response.status}): ${body}`,
    );
  }
}

async function syncUsers(
  pageSize: number,
  maxPages: number,
  startCursor: string | undefined,
  secret: string,
): Promise<EntitySyncResult> {
  let cursor = startCursor;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    let query = db
      .collection("users")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) {
      complete = true;
      break;
    }

    const records = snapshot.docs.map((doc) =>
      sanitizeUserMirror(doc.id, doc.data()),
    );
    await pushBatch("user", records, secret);

    sourceRead += snapshot.size;
    recordsSent += records.length;
    batchesSent++;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;

    if (snapshot.size < pageSize) {
      complete = true;
      break;
    }
  }

  return {
    entity: "user",
    sourceRead,
    recordsSent,
    batchesSent,
    nextCursor: complete ? null : cursor ?? null,
    complete,
  };
}

async function syncSocialPosts(
  pageSize: number,
  maxPages: number,
  startCursor: string | undefined,
  secret: string,
): Promise<EntitySyncResult> {
  let cursor = startCursor;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    let query = db
      .collection("feed_posts")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) {
      complete = true;
      break;
    }

    const records = snapshot.docs
      .filter((doc) => shouldMirrorSocialPost(doc.data()))
      .map((doc) => sanitizeSocialPostMirror(doc.id, doc.data()));
    await pushBatch("social_post", records, secret);

    sourceRead += snapshot.size;
    recordsSent += records.length;
    if (records.length > 0) batchesSent++;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;

    if (snapshot.size < pageSize) {
      complete = true;
      break;
    }
  }

  return {
    entity: "social_post",
    sourceRead,
    recordsSent,
    batchesSent,
    nextCursor: complete ? null : cursor ?? null,
    complete,
  };
}

async function syncPlaces(
  pageSize: number,
  maxPages: number,
  startCursor: string | undefined,
  secret: string,
): Promise<EntitySyncResult> {
  let cursor = startCursor;
  let sourceRead = 0;
  let recordsSent = 0;
  let batchesSent = 0;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    let query = db
      .collection("place_publication_heads")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const heads = await query.get();
    if (heads.empty) {
      complete = true;
      break;
    }

    const resolved = await Promise.all(
      heads.docs.map(async (headDoc) => {
        const head = headDoc.data();
        const publicationId =
          typeof head.activePublicationId === "string"
            ? head.activePublicationId.trim()
            : "";
        if (!publicationId) return null;
        const publication = await db
          .collection("place_publications")
          .doc(publicationId)
          .get();
        if (!publication.exists) return null;
        return sanitizePlacePublicationMirror(
          headDoc.id,
          head,
          publicationId,
          publication.data(),
        );
      }),
    );
    const records = resolved.filter(
      (record): record is MirrorRecord => record !== null,
    );
    await pushBatch("place", records, secret);

    sourceRead += heads.size;
    recordsSent += records.length;
    if (records.length > 0) batchesSent++;
    cursor = heads.docs[heads.docs.length - 1].id;

    if (heads.size < pageSize) {
      complete = true;
      break;
    }
  }

  return {
    entity: "place",
    sourceRead,
    recordsSent,
    batchesSent,
    nextCursor: complete ? null : cursor ?? null,
    complete,
  };
}

async function runEntity(
  entity: MirrorEntity,
  pageSize: number,
  maxPages: number,
  cursor: string | undefined,
  secret: string,
): Promise<EntitySyncResult> {
  if (entity === "user") return syncUsers(pageSize, maxPages, cursor, secret);
  if (entity === "place") return syncPlaces(pageSize, maxPages, cursor, secret);
  return syncSocialPosts(pageSize, maxPages, cursor, secret);
}

/**
 * Manual, read-only Firebase → Control Center mirror bridge.
 *
 * The function never mutates Firebase. It only reads authoritative Firestore
 * collections, strips sensitive fields, and pushes normalized batches to the
 * fixed Control Center mirror endpoint. Production admin writes remain a
 * separate, disabled concern.
 */
export const syncControlCenterMirrors = onRequest(
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
      response.status(401).json({error: "Unauthorized mirror sync trigger."});
      return;
    }

    const body = (request.body ?? {}) as SyncRequestBody;
    const entity = body.entity ?? "all";
    if (!["all", "user", "place", "social_post"].includes(entity)) {
      response.status(400).json({error: "Unsupported entity."});
      return;
    }
    if (entity === "all" && body.cursor) {
      response.status(400).json({error: "cursor requires a single entity."});
      return;
    }

    const pageSize = boundedInteger(
      body.pageSize,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const maxPages = boundedInteger(
      body.maxPages,
      DEFAULT_MAX_PAGES,
      1,
      MAX_PAGES,
    );
    const cursor =
      typeof body.cursor === "string" && body.cursor.trim()
        ? body.cursor.trim()
        : undefined;
    const entities: MirrorEntity[] =
      entity === "all" ? ["user", "place", "social_post"] : [entity];

    try {
      const results: EntitySyncResult[] = [];
      for (const current of entities) {
        results.push(
          await runEntity(current, pageSize, maxPages, cursor, secret),
        );
      }
      response.status(200).json({
        status: "OK",
        readOnly: true,
        destination: "MakanMana Control Center",
        pageSize,
        maxPages,
        results,
      });
    } catch (error) {
      console.error("Control Center mirror sync failed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
      response.status(500).json({
        error: "Mirror sync failed.",
        detail: error instanceof Error ? error.message.slice(0, 800) : "unknown",
      });
    }
  },
);
