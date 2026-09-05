/**
 * Wave 3D entry gate 1 — PURE post-comment LIFECYCLE contract.
 *
 * Scope: `feed_posts/{postId}/comments/{commentId}` ONLY. The `menu_comments`
 * collection is a separate Wave 3C domain with its own vocabulary
 * (visible/hidden/removed) and is deliberately untouched here.
 *
 * THE BLOCKER THIS CLOSES
 * A Firestore list query fails ENTIRELY when it can return a document the rules
 * reject. The comment read rule already denied a non-author any comment with
 * `status == "deleted"`, while `commentsProvider` listed a post's comments with
 * no lifecycle constraint — so a single soft-deleted comment made the whole
 * thread permission-denied for everyone except the post author. Adding
 * `where status == "active"` alone was not safe either: legacy comments carry no
 * `status` field at all and Firestore equality excludes absent fields, so every
 * legacy comment would have vanished. The fix is the complete package: born
 * active + rules-enforced create + status-aware query + legacy normalization.
 *
 * VOCABULARY (deliberately two states — no hidden state is invented):
 *   active   — visible in the normal thread
 *   deleted  — user soft-delete (deleteUserComment)
 * Anything else, including ABSENT, is UNKNOWN and fails closed for non-authors.
 * Future states can be added to COMMENT_STATUSES without weakening this: the
 * consumer predicate is an allowlist of exactly "active", not a denylist.
 */

export const COMMENT_STATUS_ACTIVE = "active";
export const COMMENT_STATUS_DELETED = "deleted";

/** Every lifecycle value the post-comment domain currently writes. */
export const COMMENT_STATUSES = [
  COMMENT_STATUS_ACTIVE,
  COMMENT_STATUS_DELETED,
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** The lifecycle status EVERY newly created post comment must carry. */
export const NEW_COMMENT_STATUS: CommentStatus = COMMENT_STATUS_ACTIVE;

/**
 * Lifecycle fields stamped on a NEW post comment.
 *
 * Returned fresh each call so a caller can spread it into a document literal
 * without sharing a mutable reference.
 */
export function newCommentLifecycleFields(): {status: CommentStatus} {
  return {status: NEW_COMMENT_STATUS};
}

/**
 * May a NON-AUTHOR see a comment in this lifecycle state?
 *
 * Mirrors firestore.rules `commentLifecycleActive`: the status must be EXACTLY
 * "active". Absent, empty and unknown are all denied — a comment whose
 * lifecycle we cannot positively identify is never shown to a stranger.
 */
export function isConsumerVisibleCommentStatus(value: unknown): boolean {
  return value === COMMENT_STATUS_ACTIVE;
}

/** How a stored comment `status` classifies for reporting/backfill purposes. */
export type LegacyCommentStatusClass =
  | "missing"
  | "active"
  | "deleted"
  | "unknown";

/**
 * Does the stored document carry its OWN `status` property?
 *
 * `Object.prototype.hasOwnProperty.call` is used deliberately rather than
 * `"status" in stored` or `stored.status !== undefined`:
 *   - a Firestore document is a plain data object that may itself contain a
 *     field literally named `hasOwnProperty`, so the prototype method must be
 *     borrowed rather than called off the document;
 *   - `in` would also match an inherited property;
 *   - `stored.status !== undefined` cannot tell an ABSENT field from a field
 *     that is present and holds `null` — which is exactly the distinction this
 *     whole corrective exists to make.
 */
export function hasOwnStatusField(stored: Record<string, unknown> | null | undefined): boolean {
  return !!stored && Object.prototype.hasOwnProperty.call(stored, "status");
}

/**
 * Classify an existing comment DOCUMENT (not a bare value).
 *
 * TRUE-MISSING ONLY. `missing` is the ONLY class the backfill may normalize,
 * and it means the `status` FIELD IS ABSENT from the document — nothing else.
 *
 *   no own `status` property   -> "missing"   (safe to normalize to active)
 *   status === "active"        -> "active"
 *   status === "deleted"       -> "deleted"
 *   ANY OTHER PRESENT VALUE    -> "unknown"   (reported, NEVER written)
 *
 * Every present-but-invalid value is UNKNOWN: `null`, `""`, `"   "`,
 * `" active "`, `"ACTIVE"`, `"hidden"`, `0`, `false`, `{}`, `[]`. A present
 * malformed value may represent corruption, an abandoned lifecycle, or an
 * unexpected writer; the migration must never guess that it means active.
 *
 * A missing DOCUMENT (null/undefined) is `unknown`, not `missing` — there is
 * nothing to normalize and writing would create a document out of nothing.
 *
 * The comparison is byte-exact because this classifier is the backfill's only
 * detector for values the rules will reject, and the rule is byte-exact
 * (`c.get('status','') == 'active'`).
 */
export function classifyStoredCommentStatus(
  stored: Record<string, unknown> | null | undefined,
): LegacyCommentStatusClass {
  if (!stored) return "unknown";
  if (!hasOwnStatusField(stored)) return "missing";
  const value = stored.status;
  if (value === COMMENT_STATUS_ACTIVE) return "active";
  if (value === COMMENT_STATUS_DELETED) return "deleted";
  return "unknown";
}
