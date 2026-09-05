import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";
import {actorDisplaySnapshot, notifySafely} from "../domain/notifications/notificationProducers";
import {newPostLifecycleFields} from "../domain/feed/postLifecycle";

/**
 * Social Prompt 8: Repost + Quote Repost.
 *
 * SEMUA repost melalui pelayan (rules feed_posts: create client = false),
 * jadi privasi dikuatkuasa DI SINI, bukan bergantung pada UI:
 * - private        -> TIDAK boleh direpost oleh sesiapa.
 * - group_only     -> hanya ke DALAM grup yang sama & mesti ahli.
 * - followers_only -> hasil dipaksa followers_only/private (tak boleh
 *                     dinaikkan ke public).
 * - unlisted       -> layanan sama seperti followers_only (selamat).
 * - public         -> bebas (public/followers_only/private).
 * - deleted/hidden -> ditolak.
 * - blok dua arah  -> ditolak.
 * Kiraan repostCount/quoteCount dikemas kini atomik pada post asal —
 * TIADA kiraan palsu.
 */

interface RepostInput {
  originalPostId?: string;
  mode?: string; // 'repost' | 'quote'
  text?: string;
  visibility?: string;
  groupId?: string;
}

const MAX_TEXT_LENGTH = 500;

/** Keterlihatan hasil yang dibenarkan mengikut keterlihatan post asal.
 * SP9.2B: followers_only DIMATIKAN untuk beta — post asal followers_only
 * TIDAK boleh direpost langsung; hasil tidak pernah followers_only. */
function allowedResultVisibilities(
  originalVisibility: string,
  originalGroupId: string | null,
): string[] {
  if (originalGroupId) return ["group_only"];
  switch (originalVisibility) {
    case "public":
    case "unlisted":
      return ["public", "private"];
    default: // followers_only, private, dll → disekat
      return [];
  }
}

/**
 * WAVE 3C FINAL SECURITY CLOSURE — `originalSnapshot` REMOVED.
 *
 * A repost used to embed a compact COPY of the original post (text, first
 * image, place/menu/spend/rating, author presentation). That copy lived inside
 * the repost document, which is itself `status: "active"` and public, and
 * firestore.rules only ever evaluates a document's OWN lifecycle — it never
 * dereferences `repostOfPostId` / `quotedPostId`. So once the original was
 * moderator-hidden, moderator-removed or self-deleted, a raw read of the repost
 * still returned the original's content. The UI hid it; the data did not.
 *
 * The fix is architectural, not a moderation cascade: a repost now stores ONLY
 * the reposter's own content plus stable LINKAGE, and the original is resolved
 * LIVE from `repostOfPostId` / `quotedPostId`, where the read boundary applies.
 *
 * Fields deliberately retained (linkage/metadata, NOT reproduced content):
 *   repostOfPostId / quotedPostId — the linkage the client must follow to read
 *       the authoritative original. Ids only; they reveal no content.
 *   originalAuthorId — the original author's UID. Server-side linkage used for
 *       block/notification decisions. An opaque id, not user-generated content.
 *   originalVisibilitySnapshot — the original's visibility ENUM at repost time
 *       ("public"/"unlisted"/...). A closed vocabulary written by the server to
 *       bound what this repost was allowed to become; it reproduces nothing the
 *       author wrote.
 * Everything else the embed card needs now comes from the live original.
 */

export const repostFeedPost = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  const input = (request.data ?? {}) as RepostInput;
  const mode = input.mode === "quote" ? "quote" : "repost";
  const text = mode === "quote" ? (input.text ?? "").trim() : "";
  let originalPostId = (input.originalPostId ?? "").trim();
  if (originalPostId.length === 0) {
    throw new HttpsError("invalid-argument", "originalPostId perlu.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new HttpsError("invalid-argument", "Teks terlalu panjang.");
  }

  let origSnap = await db.collection("feed_posts").doc(originalPostId).get();
  if (!origSnap.exists) {
    throw new HttpsError("not-found", "Post asal tidak tersedia.");
  }
  let orig = origSnap.data()!;

  // Repost kepada repost biasa -> halakan ke post AKAR (elak rantaian).
  // Quote kepada quote_repost dibenarkan (embed satu aras sahaja di UI).
  const rootId = orig.repostOfPostId;
  if (orig.postType === "repost" && typeof rootId === "string" && rootId) {
    origSnap = await db.collection("feed_posts").doc(rootId).get();
    if (!origSnap.exists) {
      throw new HttpsError("not-found", "Post asal tidak tersedia.");
    }
    originalPostId = rootId;
    orig = origSnap.data()!;
  }

  if (orig.status === "deleted" || orig.status === "hidden") {
    throw new HttpsError("failed-precondition", "Post asal tidak tersedia.");
  }

  const origAuthor = (orig.authorUid as string | undefined) ?? "";
  const origVisibility =
    (orig.visibility as string | undefined) ?? "public";
  const origGroupId = (orig.groupId as string | undefined) || null;

  // Blok dua arah: penyalahgunaan repost disekat di pelayan.
  if (origAuthor && origAuthor !== uid) {
    const [blockA, blockB] = await Promise.all([
      db.collection("blocks").doc(`${uid}_${origAuthor}`).get(),
      db.collection("blocks").doc(`${origAuthor}_${uid}`).get(),
    ]);
    if (blockA.exists || blockB.exists) {
      throw new HttpsError("permission-denied", "Tidak dibenarkan.");
    }
  }

  const allowed = allowedResultVisibilities(origVisibility, origGroupId);
  if (allowed.length === 0) {
    await logEvent({
      userId: uid,
      eventType: "repost_blocked_privacy",
      metadata: {
        originalPostId,
        reason: origGroupId ? "group_only" : origVisibility,
      },
    });
    throw new HttpsError(
      "permission-denied",
      "Post ini tak boleh direpost kerana privasi.",
    );
  }

  // Post grup: repost mesti kekal DALAM grup sama + mesti ahli.
  let groupId: string | null = null;
  if (origGroupId) {
    const requestedGroup = (input.groupId ?? "").trim();
    if (requestedGroup !== origGroupId) {
      throw new HttpsError(
        "permission-denied",
        "Post grup hanya boleh direpost dalam grup yang sama.",
      );
    }
    const member = await db
      .collection("groups")
      .doc(origGroupId)
      .collection("members")
      .doc(uid)
      .get();
    if (!member.exists) {
      throw new HttpsError("permission-denied", "Sertai grup dahulu.");
    }
    groupId = origGroupId;
  }

  // SP9.2B: followers_only asal sudah disekat oleh allowedResultVisibilities
  // (return []) → tidak sampai ke sini. unlisted dilayan seperti public
  // (pautan) — tiada semakan follow lagi.

  // Keterlihatan hasil: dipaksa dalam senarai dibenarkan (fallback pertama).
  const requestedVis = (input.visibility ?? "").trim();
  const visibility = allowed.includes(requestedVis) ?
    requestedVis :
    allowed[0];

  const userSnap = await db.collection("users").doc(uid).get();
  const email = (userSnap.data()?.email as string | undefined) ?? "";
  const displayName =
    (userSnap.data()?.displayName as string | undefined) ||
    (email.includes("@") ? email.split("@")[0] : "Foodie");
  const photoUrl =
    (userSnap.data()?.photoUrl as string | undefined) ?? null;
  const username =
    (userSnap.data()?.username as string | undefined) ?? null;
  // SP10: avatar preset bertema (fallback bila tiada photoUrl).
  const avatarPreset =
    (userSnap.data()?.avatarPreset as string | undefined) ?? null;

  const isQuote = mode === "quote";
  const postType = isQuote ? "quote_repost" : "repost";

  const ref = await db.collection("feed_posts").add({
    avatarPreset,
    type: postType,
    postType,
    // Wave 3C read boundary: a repost is a NEW publication and is born active.
    ...newPostLifecycleFields(),
    authorUid: uid,
    displayName,
    username,
    photoUrl,
    text,
    imageUrl: null,
    groupId,
    visibility,
    // LINKAGE ONLY — no copy of the original's content. The client resolves
    // the original live so the read boundary (firestore.rules) applies to it.
    repostOfPostId: isQuote ? null : originalPostId,
    quotedPostId: isQuote ? originalPostId : null,
    originalAuthorId: origAuthor || null,
    originalVisibilitySnapshot: origVisibility,
    emoji: (userSnap.data()?.emoji as string | undefined) ?? "😋",
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    timeSlot: currentTimeSlot(),
    // Immutable publication instant for this new repost document.
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Kiraan sebenar pada post asal (atomik; tiada kiraan palsu).
  await db
    .collection("feed_posts")
    .doc(originalPostId)
    .update({
      [isQuote ? "quoteCount" : "repostCount"]: FieldValue.increment(1),
      // Counter activity is a document update, never a new publication.
      updatedAt: FieldValue.serverTimestamp(),
    });

  if (
    !groupId &&
    (visibility === "public" || visibility === "followers_only")
  ) {
    await db
      .collection("public_profiles")
      .doc(uid)
      .set({postsCount: FieldValue.increment(1)}, {merge: true});
  }

  await logEvent({
    userId: uid,
    eventType: isQuote ? "quote_repost_created" : "post_reposted",
    metadata: {
      postId: ref.id,
      originalPostId,
      postType,
      visibility,
      groupId,
    },
  });

  if (origAuthor && origAuthor !== uid) {
    await notifySafely({
      recipientUid: origAuthor,
      type: isQuote ? "social_quote" : "social_repost",
      sourceEventId: `${isQuote ? "quote" : "repost"}:${ref.id}`,
      actorUid: uid,
      actorDisplaySnapshot: await actorDisplaySnapshot(uid),
      entityType: "post",
      entityId: originalPostId,
      parentEntityId: ref.id,
      titleKey: isQuote ? "notificationSocialQuoteTitle" : "notificationSocialRepostTitle",
      bodyKey: isQuote ? "notificationSocialQuoteBody" : "notificationSocialRepostBody",
      deepLink: "/social",
    });
  }

  return {status: "OK", postId: ref.id, visibility};
});
