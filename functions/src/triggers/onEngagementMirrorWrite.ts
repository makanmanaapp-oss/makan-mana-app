import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {
  CONTROL_CENTER_SYNC_SECRET,
  pushMirrorBatch,
} from "../controlCenter/mirrorEventPush";
import {
  buildMenuCommentMirrorRecord,
  buildSocialPostMirrorRecord,
} from "../domain/restaurantEngagement/mirrorPayload";
import {
  isRestaurantPostDocument,
  mirrorEventId,
  tombstoneMenuCommentRecord,
  tombstoneSocialPostRecord,
} from "../domain/restaurantEngagement/mirrorEvents";

/**
 * Wave 3C corrective — EVENT-DRIVEN Firebase → Control Center engagement mirror
 * (the PRIMARY freshness path; the manual + 5-hourly reconcilers remain as
 * drift repair only).
 *
 * Firestore stays authoritative. A mirror failure NEVER mutates or rolls back
 * the source document — the function simply throws so the platform retries, and
 * delivery is at-least-once, which the deterministic event id + the migration
 * 0038 receipt contract make safe.
 *
 * NOT DEPLOYED.
 */

const TRIGGER_OPTS = {
  secrets: [CONTROL_CENTER_SYNC_SECRET],
  timeoutSeconds: 60,
  memory: "256MiB" as const,
  maxInstances: 10,
};

function snapshotData(snap: {data: () => Record<string, unknown> | undefined} | undefined) {
  return snap?.data() ?? null;
}

/**
 * Restaurant posts only. An ordinary user post is ignored entirely so this never
 * becomes a broad user-feed mirror.
 */
export const onRestaurantPostMirrorWrite = onDocumentWritten(
  {document: "feed_posts/{postId}", ...TRIGGER_OPTS},
  async (event) => {
    const before = snapshotData(event.data?.before);
    const after = snapshotData(event.data?.after);

    // Relevance gate — evaluated on the surviving document, or the previous one
    // when the document disappeared.
    const source = after ?? before;
    if (!isRestaurantPostDocument(source)) return;

    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const postId = event.params.postId;
    let record = buildSocialPostMirrorRecord(postId, (after ?? before) as Record<string, unknown>);
    if (!record) return;

    // Unexpected hard delete: restaurant posts are soft-delete by contract
    // (authorUid is null so no client can delete them). If one disappears we
    // mirror a tombstone using fields the 0038 schema already has.
    if (!after && before) {
      record = tombstoneSocialPostRecord(record, new Date().toISOString());
    }

    // Fail closed: without a usable Firebase event id we cannot guarantee
    // idempotent delivery, so we throw (and retry) rather than invent an id.
    const eventId = mirrorEventId("social_post", event.id);
    if (!eventId) throw new Error("Mirror event id could not be derived from the Firebase event.");

    await pushMirrorBatch({entityType: "social_post", records: [record], secret, eventId});
  },
);

/** Menu comments + official restaurant replies, including moderation changes. */
export const onMenuCommentMirrorWrite = onDocumentWritten(
  {document: "menu_comments/{commentId}", ...TRIGGER_OPTS},
  async (event) => {
    const before = snapshotData(event.data?.before);
    const after = snapshotData(event.data?.after);
    const source = after ?? before;
    if (!source) return;

    const secret = CONTROL_CENTER_SYNC_SECRET.value();
    if (!secret) throw new Error("CONTROL_CENTER_SYNC_SECRET is unavailable.");

    const commentId = event.params.commentId;
    let record = buildMenuCommentMirrorRecord(commentId, source as Record<string, unknown>);
    if (!record) return;

    // Menu comments are soft-delete by contract (moderation only moves status).
    // A disappearing document is mirrored fail-safely as a tombstone.
    if (!after && before) {
      record = tombstoneMenuCommentRecord(record, new Date().toISOString());
    }

    const eventId = mirrorEventId("menu_comment", event.id);
    if (!eventId) throw new Error("Mirror event id could not be derived from the Firebase event.");

    await pushMirrorBatch({entityType: "menu_comment", records: [record], secret, eventId});
  },
);
