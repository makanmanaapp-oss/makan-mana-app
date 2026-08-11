import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {currentTimeSlot} from "../utils/timeSlot";

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

/** Snapshot kompak post asal untuk paparan pantas kad embed.
 * Client tetap sahkan LIVE (post asal dipadam/private -> kad
 * "tidak tersedia"); snapshot hanya untuk paparan awal. */
function buildOriginalSnapshot(
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> {
  const text = typeof data.text === "string" ? data.text : "";
  const urls = Array.isArray(data.imageUrls) ?
    data.imageUrls.filter((u: unknown) => typeof u === "string") :
    [];
  const firstImage =
    (urls[0] as string | undefined) ??
    (typeof data.imageUrl === "string" ? data.imageUrl : null);
  return {
    authorUid: data.authorUid ?? null,
    displayName: data.displayName ?? null,
    username: data.username ?? null,
    photoUrl: data.photoUrl ?? null,
    emoji: data.emoji ?? null,
    text: text.slice(0, 200),
    imageUrl: firstImage,
    mediaCount: urls.length > 0 ? urls.length : firstImage ? 1 : 0,
    placeName: data.placeName ?? null,
    postType: data.postType ?? null,
    type: data.type ?? null,
    menuName: data.menuName ?? null,
    totalSpend: data.totalSpend ?? null,
    userRating: data.userRating ?? null,
  };
}

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
    authorUid: uid,
    displayName,
    username,
    photoUrl,
    text,
    imageUrl: null,
    groupId,
    visibility,
    // Pautan + snapshot post asal (client sahkan live sebelum papar).
    repostOfPostId: isQuote ? null : originalPostId,
    quotedPostId: isQuote ? originalPostId : null,
    originalAuthorId: origAuthor || null,
    originalVisibilitySnapshot: origVisibility,
    originalSnapshot: buildOriginalSnapshot(orig),
    emoji: (userSnap.data()?.emoji as string | undefined) ?? "😋",
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    timeSlot: currentTimeSlot(),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Kiraan sebenar pada post asal (atomik; tiada kiraan palsu).
  await db
    .collection("feed_posts")
    .doc(originalPostId)
    .update({
      [isQuote ? "quoteCount" : "repostCount"]: FieldValue.increment(1),
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

  return {status: "OK", postId: ref.id, visibility};
});
