/**
 * WAVE 5 — PURE CMS media upload governance.
 *
 * The browser never chooses where a file lands. It states what it wants to
 * upload; the SERVER decides the object path, and the signed URL it gets back
 * is bound to that exact path and content type — so a client cannot rewrite the
 * destination, cannot overwrite another feature's object, and cannot change the
 * type after the fact.
 *
 * Reuses the proven groupImageV2 shape (validate → server path → short-lived
 * signed PUT) rather than shipping binaries through an admin server.
 */
import {
  ALLOWED_MEDIA_CONTENT_TYPES,
  MEDIA_MAX_BYTES,
  MEDIA_STORAGE_PREFIX,
} from "./cmsTypes";

/** How long an upload URL stays valid. Short: it is a one-shot handoff. */
export const UPLOAD_URL_TTL_MS = 10 * 60 * 1000;

/** Extensions that may accompany each accepted type. */
const EXTENSION_BY_TYPE: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export interface Validated<T> {
  ok: boolean;
  value: T | null;
  error: string;
}

function fail<T>(error: string): Validated<T> {
  return {ok: false, value: null, error};
}

/**
 * Reduce a caller-supplied filename to something safe.
 *
 * Only the basename survives, and only a conservative character set. This is
 * belt-and-braces: the path is server-composed anyway, so a hostile name can at
 * worst produce an ugly (but harmless) object name.
 */
export function sanitizeFilename(value: unknown): string {
  if (typeof value !== "string") return "";
  // Take the basename regardless of separator style, then strip anything else.
  const base = value.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+/, "");
  return cleaned.slice(0, 80);
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export interface UploadRequest {
  contentType: string;
  byteSize: number;
  filename: string;
  /** Draft/staging id chosen by the console; namespaces the object. */
  stagingId: string;
}

export interface ApprovedUpload {
  storagePath: string;
  contentType: string;
  byteSize: number;
  filename: string;
}

function safeSegment(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return clean.slice(0, 60);
}

/**
 * Decide whether an upload may proceed and where it must go.
 *
 * Every rejection is specific so an operator can fix the file rather than guess.
 */
export function approveUpload(input: {
  contentType?: unknown;
  byteSize?: unknown;
  filename?: unknown;
  stagingId?: unknown;
}): Validated<ApprovedUpload> {
  const contentType = typeof input.contentType === "string"
    ? input.contentType.trim().toLowerCase() : "";
  if (!(ALLOWED_MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return fail("media_type_not_allowed");
  }

  const byteSize = typeof input.byteSize === "number" ? input.byteSize : NaN;
  if (!Number.isInteger(byteSize) || byteSize <= 0) return fail("media_size_invalid");
  if (byteSize > MEDIA_MAX_BYTES) return fail("media_too_large");

  const filename = sanitizeFilename(input.filename);
  if (!filename) return fail("media_filename_invalid");

  // The extension must agree with the declared type. A .png announced as
  // image/webp is either a mistake or an attempt to confuse a downstream
  // consumer; either way it does not get stored.
  const extension = extensionOf(filename);
  const allowedExtensions = EXTENSION_BY_TYPE[contentType] ?? [];
  if (!extension || !allowedExtensions.includes(extension)) {
    return fail("media_extension_mismatch");
  }

  const stagingId = safeSegment(input.stagingId);
  if (!stagingId) return fail("media_staging_id_invalid");

  // SERVER-COMPOSED path. Every segment is sanitised, so traversal and prefix
  // escape are impossible by construction rather than by inspection.
  const storagePath = `${MEDIA_STORAGE_PREFIX}${stagingId}/${filename}`;
  if (storagePath.includes("..") || storagePath.includes("//")) {
    return fail("media_path_not_allowed");
  }

  return {ok: true, value: {storagePath, contentType, byteSize, filename}, error: ""};
}

/**
 * The bytes a valid file of each accepted type must begin with.
 *
 * A declared content type is a claim; these are the file itself. Checking both
 * is what stops an executable or an HTML document being stored as "image/png".
 */
export const MAGIC_BYTES: Record<string, readonly number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // RIFF....WEBP — the middle four bytes are the length, so they are skipped.
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};

/** True when the leading bytes match the declared type. */
export function magicBytesMatch(contentType: string, head: readonly number[]): boolean {
  const signatures = MAGIC_BYTES[contentType];
  if (!signatures) return false;
  const matchesPrefix = signatures.some((signature) =>
    signature.every((byte, index) => head[index] === byte));
  if (!matchesPrefix) return false;
  if (contentType === "image/webp") {
    // RIFF alone is a container; the WEBP tag at offset 8 is what makes it one.
    return head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  }
  return true;
}
