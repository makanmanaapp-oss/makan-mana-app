/**
 * Wave 3C read-boundary closure — PURE feed-post LIFECYCLE contract.
 *
 * This module owns the two halves of the lifecycle that are NOT moderation:
 *
 *   1. CREATION — every new `feed_posts` document is born `status: "active"`.
 *      Before this closure, creators omitted `status` entirely and every reader
 *      inferred "absent means active". That inference is exactly what made a
 *      moderator-hidden post indistinguishable from a legacy post at the rules
 *      layer, so the read boundary could not be enforced.
 *
 *   2. CONSUMER VISIBILITY — a non-author may only ever see `status == "active"`.
 *      Absent and unknown both FAIL CLOSED. This mirrors `canReadPostData` in
 *      firestore.rules exactly; the rules remain the real enforcement.
 *
 * DELIBERATE ASYMMETRY (do not "fix" it):
 *   `postModeration.currentPostStatus()` still treats an ABSENT status as
 *   active, because a moderator must be able to hide a legacy document that has
 *   not been normalized yet. Moderation is an admin surface and fails OPEN so
 *   the moderator keeps control; consumer reads are a security surface and fail
 *   CLOSED. The legacy backfill (see legacyStatusBackfill.ts) is what collapses
 *   the two views back together in production.
 *
 * The status vocabulary itself is defined once, in postModeration.ts.
 */
import {
  POST_STATUS_ACTIVE,
  POST_STATUS_DELETED,
  POST_STATUS_HIDDEN,
  PostStatus,
} from "./postModeration";

export {POST_STATUS_ACTIVE, POST_STATUS_DELETED, POST_STATUS_HIDDEN};
export type {PostStatus};

/**
 * The lifecycle status EVERY newly created feed post must carry.
 *
 * Every `feed_posts` creation path spreads `newPostLifecycleFields()` (or writes
 * this constant) so there is a single definition of "born active".
 */
export const NEW_POST_STATUS: PostStatus = POST_STATUS_ACTIVE;

/**
 * Lifecycle fields stamped on a NEW feed post.
 *
 * Kept as a function returning a fresh object so a caller can spread it into a
 * document literal without sharing a mutable reference.
 */
export function newPostLifecycleFields(): {status: PostStatus} {
  return {status: NEW_POST_STATUS};
}

/**
 * May a NON-AUTHOR see a post in this lifecycle state?
 *
 * Mirrors firestore.rules `canReadPostData`: the status must be EXACTLY
 * "active". Absent, empty and unknown values are all denied — a document whose
 * lifecycle we cannot positively identify is never shown to a stranger.
 */
export function isConsumerVisibleStatus(value: unknown): boolean {
  return value === POST_STATUS_ACTIVE;
}

/** How a stored `status` value classifies for reporting/backfill purposes. */
export type LegacyStatusClass =
  | "missing"
  | "active"
  | "hidden"
  | "deleted"
  | "unknown";

/**
 * Classify the raw stored `status` of an existing document.
 *
 * `missing` is the ONLY class the backfill is allowed to normalize. An
 * `unknown` non-empty value is reported and left untouched — guessing that it
 * means "active" would silently republish content nobody approved.
 */
export function classifyLegacyPostStatus(value: unknown): LegacyStatusClass {
  if (value === undefined || value === null) return "missing";
  if (typeof value !== "string") return "unknown";
  // Whitespace is trimmed ONLY to decide emptiness. The comparison itself is
  // byte-exact, because this classifier is the backfill's only detector for
  // "values firestore.rules will reject" — and the rule is byte-exact
  // (p.get('status','') == 'active'). A padded " active " must therefore land
  // in `unknown` and be reported, not be silently counted as already-active
  // and then be permanently unreadable after the rules deploy.
  if (value.trim().length === 0) return "missing";
  if (value === POST_STATUS_ACTIVE) return "active";
  if (value === POST_STATUS_HIDDEN) return "hidden";
  if (value === POST_STATUS_DELETED) return "deleted";
  return "unknown";
}
