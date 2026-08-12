type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "object") {
    const candidate = value as {toDate?: () => Date; toMillis?: () => number};
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (typeof candidate.toMillis === "function") {
      const date = new Date(candidate.toMillis());
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
  }

  return null;
}

export function maskEmail(value: unknown): string | null {
  const email = text(value)?.toLowerCase();
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function maskPhone(value: unknown): string | null {
  const phone = text(value);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function sanitizeUserMirror(
  firebaseUid: string,
  value: unknown,
): JsonRecord {
  const data = asRecord(value);
  return {
    firebase_uid: firebaseUid,
    display_name: text(data.displayName),
    username: text(data.username),
    email_masked: maskEmail(data.email),
    phone_masked: maskPhone(data.phone),
    plan: text(data.plan),
    plan_status: text(data.planStatus),
    account_status: text(data.accountStatus) ?? "active",
    created_at: toIsoTimestamp(data.createdAt),
    last_active_at: toIsoTimestamp(data.lastActiveAt),
    firebase_updated_at:
      toIsoTimestamp(data.updatedAt) ?? toIsoTimestamp(data.lastActiveAt),
  };
}

const MIRRORED_SOCIAL_VISIBILITIES = new Set([
  "public",
  "followers_only",
  "followers",
  "unlisted",
]);

export function shouldMirrorSocialPost(value: unknown): boolean {
  const data = asRecord(value);
  return MIRRORED_SOCIAL_VISIBILITIES.has(text(data.visibility) ?? "public");
}

export function sanitizeSocialPostMirror(
  firebasePostId: string,
  value: unknown,
): JsonRecord {
  const data = asRecord(value);
  const deleted = text(data.status) === "deleted" || data.deletedAt != null;
  const body = text(data.text);
  const explicitModeration = text(data.moderationStatus);

  return {
    firebase_post_id: firebasePostId,
    author_uid: text(data.authorUid),
    visibility: text(data.visibility) ?? "public",
    moderation_status: explicitModeration ?? (deleted ? "removed" : "visible"),
    content_excerpt: body ? body.slice(0, 500) : null,
    created_at: toIsoTimestamp(data.createdAt),
    firebase_updated_at:
      toIsoTimestamp(data.editedAt) ??
      toIsoTimestamp(data.updatedAt) ??
      toIsoTimestamp(data.createdAt),
    removed_at: deleted ? toIsoTimestamp(data.deletedAt) : null,
  };
}

export function sanitizePlacePublicationMirror(
  canonicalPlaceId: string,
  headValue: unknown,
  publicationId: string,
  publicationValue: unknown,
): JsonRecord | null {
  const head = asRecord(headValue);
  const publication = asRecord(publicationValue);
  const snapshot = asRecord(publication.snapshot);
  const place = asRecord(snapshot.place);
  const identity = asRecord(place.identity);
  const location = asRecord(place.location);
  const displaySnapshot = asRecord(place.displaySnapshot);

  // Production 1.14E publications are intentionally flat (`title`, `lat`, `lng`).
  // Newer canonical publications may use `snapshot.place`. Support both shapes so
  // the Control Center mirror remains backward-compatible with the approved
  // production cohort rather than silently dropping valid records.
  const name =
    text(publication.title) ??
    text(displaySnapshot.name) ??
    text(identity.canonicalName);
  if (!name) return null;

  const lifecycleStatus =
    text(publication.lifecycleStatus) ?? text(place.status) ?? "active";
  const latitude = finiteNumber(publication.lat) ?? finiteNumber(location.lat);
  const longitude = finiteNumber(publication.lng) ?? finiteNumber(location.lng);
  const updatedAt =
    toIsoTimestamp(head.updatedAt) ??
    toIsoTimestamp(publication.publishedAt) ??
    toIsoTimestamp(place.updatedAt) ??
    toIsoTimestamp(publication.createdAt);

  return {
    firebase_id: canonicalPlaceId,
    canonical_place_id:
      text(publication.placeId) ?? canonicalPlaceId,
    name,
    publication_status:
      text(publication.publicationStatus) ?? text(place.publicationStatus),
    lifecycle_status: lifecycleStatus,
    latitude,
    longitude,
    source_summary: {
      publication_id: publicationId,
      publication_version: finiteNumber(publication.versionNumber),
      verification_status: text(place.verificationStatus),
      locality: text(location.locality),
      state: text(location.state),
      country_code: text(location.countryCode),
      source_canonical_version: text(publication.sourceCanonicalVersion),
    },
    firebase_updated_at: updatedAt,
    archived_at: lifecycleStatus === "archived" ? updatedAt : null,
  };
}
