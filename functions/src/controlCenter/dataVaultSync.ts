import {createHash} from "node:crypto";

import {DocumentSnapshot, FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {db} from "../config/firebase";

const CONTROL_CENTER_SYNC_SECRET = defineSecret("CONTROL_CENTER_SYNC_SECRET");
const DATA_VAULT_URL = "https://makanmana-control-center.vercel.app/api/internal/sync/data-vault";
const MAX_BATCH = 100;
const RECONCILE_MAX_RECORDS_PER_DATASET = 5000;

const forbiddenKeyPattern = /(^|_)(password|password_hash|id_token|refresh_token|access_token|private_key|service_account|api_key|secret|purchase_token|raw_purchase_token)$/i;

type DatasetDefinition = {
  datasetKey: "users" | "social_posts" | "ai_brain_profiles";
  collection: "users" | "feed_posts" | "user_brain_profiles";
  userRef: (documentId: string, snapshot: Record<string, unknown>) => string | null;
};

const DATASETS: readonly DatasetDefinition[] = [
  {
    datasetKey: "users",
    collection: "users",
    userRef: (documentId) => documentId,
  },
  {
    datasetKey: "social_posts",
    collection: "feed_posts",
    userRef: (_documentId, snapshot) =>
      typeof snapshot.authorUid === "string" && snapshot.authorUid.trim() ? snapshot.authorUid.trim() : null,
  },
  {
    datasetKey: "ai_brain_profiles",
    collection: "user_brain_profiles",
    userRef: (documentId) => documentId,
  },
] as const;

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as {toDate?: unknown}).toDate;
    if (typeof toDate === "function") {
      try {
        const result = (toDate as () => Date)();
        return result instanceof Date && !Number.isNaN(result.getTime()) ? result.toISOString() : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return {type: "bytes", sha256: createHash("sha256").update(value).digest("hex")};
  if (Array.isArray(value)) return value.map(sanitizeValue);

  if (typeof value === "object") {
    const timestamp = dateValue(value);
    if (timestamp) return timestamp;

    const record = value as Record<string, unknown>;
    if (typeof record.latitude === "number" && typeof record.longitude === "number") {
      return {latitude: record.latitude, longitude: record.longitude};
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (forbiddenKeyPattern.test(key)) continue;
      output[key] = sanitizeValue(child);
    }
    return output;
  }

  return String(value);
}

function sanitizedSnapshot(snapshot: DocumentSnapshot | undefined): Record<string, unknown> {
  if (!snapshot?.exists) return {};
  const value = sanitizeValue(snapshot.data() ?? {});
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceTimestamp(snapshot: DocumentSnapshot | undefined, field: "createTime" | "updateTime") {
  const value = snapshot?.[field];
  return value ? value.toDate().toISOString() : null;
}

function buildRecord(definition: DatasetDefinition, documentId: string, snapshot: DocumentSnapshot | undefined) {
  const data = sanitizedSnapshot(snapshot);
  const exists = snapshot?.exists === true;
  return {
    sourcePath: `${definition.collection}/${documentId}`,
    sourceDocumentId: documentId,
    entityId: documentId,
    userRef: definition.userRef(documentId, data),
    snapshot: exists ? data : {},
    recordStatus: exists ? "active" : "deleted",
    providerOrigin: null,
    provenance: {
      sourceSystem: "firebase",
      sourceCollection: definition.collection,
      syncVersion: "data-vault-v1",
    },
    sourceCreatedAt: sourceTimestamp(snapshot, "createTime"),
    sourceUpdatedAt: sourceTimestamp(snapshot, "updateTime"),
    schemaVersion: 1,
  };
}

async function pushBatch(
  definition: DatasetDefinition,
  eventId: string,
  records: Record<string, unknown>[],
) {
  if (records.length === 0) return;
  const secret = CONTROL_CENTER_SYNC_SECRET.value();
  if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

  const response = await fetch(DATA_VAULT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceSystem: "firebase",
      eventId,
      datasetKey: definition.datasetKey,
      records,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`Data Vault rejected ${definition.datasetKey} sync (${response.status}): ${detail}`);
  }
}

function definition(datasetKey: DatasetDefinition["datasetKey"]) {
  const found = DATASETS.find((item) => item.datasetKey === datasetKey);
  if (!found) throw new Error(`Unknown Data Vault dataset ${datasetKey}.`);
  return found;
}

async function handleWrite(
  datasetKey: DatasetDefinition["datasetKey"],
  eventId: string,
  documentId: string,
  after: DocumentSnapshot | undefined,
  before: DocumentSnapshot | undefined,
) {
  const dataset = definition(datasetKey);
  const source = after?.exists ? after : before;
  const record = buildRecord(dataset, documentId, after?.exists ? after : source && !after?.exists ? undefined : source);
  if (!after?.exists) {
    record.sourceCreatedAt = sourceTimestamp(source, "createTime");
    record.sourceUpdatedAt = sourceTimestamp(source, "updateTime");
  }
  await pushBatch(dataset, `firestore:${eventId}`, [record]);
}

export const syncUserToDataVault = onDocumentWritten(
  {document: "users/{uid}", secrets: [CONTROL_CENTER_SYNC_SECRET]},
  async (event) => {
    await handleWrite(
      "users",
      event.id,
      event.params.uid,
      event.data?.after,
      event.data?.before,
    );
  },
);

export const syncSocialPostToDataVault = onDocumentWritten(
  {document: "feed_posts/{postId}", secrets: [CONTROL_CENTER_SYNC_SECRET]},
  async (event) => {
    await handleWrite(
      "social_posts",
      event.id,
      event.params.postId,
      event.data?.after,
      event.data?.before,
    );
  },
);

export const syncAiBrainProfileToDataVault = onDocumentWritten(
  {document: "user_brain_profiles/{uid}", secrets: [CONTROL_CENTER_SYNC_SECRET]},
  async (event) => {
    await handleWrite(
      "ai_brain_profiles",
      event.id,
      event.params.uid,
      event.data?.after,
      event.data?.before,
    );
  },
);

async function reconcileDataset(definition: DatasetDefinition, runKey: string) {
  let cursor: string | undefined;
  let total = 0;
  let batchNumber = 0;

  while (total < RECONCILE_MAX_RECORDS_PER_DATASET) {
    let query = db
      .collection(definition.collection)
      .orderBy(FieldPath.documentId())
      .limit(Math.min(MAX_BATCH, RECONCILE_MAX_RECORDS_PER_DATASET - total));
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const records = snapshot.docs.map((doc) => buildRecord(definition, doc.id, doc));
    await pushBatch(definition, `reconcile:${runKey}:${definition.datasetKey}:${batchNumber}`, records);
    total += snapshot.size;
    batchNumber++;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < MAX_BATCH) break;
  }

  return {dataset: definition.datasetKey, recordsRead: total, batches: batchNumber};
}

/**
 * Safety net for missed Firestore delivery. At current MakanMana scale a full
 * reconciliation every six hours is cheap; the hash/version logic in Supabase
 * means unchanged records only refresh last_seen_at and do not create versions.
 */
export const reconcileUniversalDataVault = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Asia/Kuala_Lumpur",
    secrets: [CONTROL_CENTER_SYNC_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const runKey = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
    const results = [];
    for (const dataset of DATASETS) {
      results.push(await reconcileDataset(dataset, runKey));
    }
    console.log("Universal Data Vault reconciliation completed", {runKey, results});
  },
);
