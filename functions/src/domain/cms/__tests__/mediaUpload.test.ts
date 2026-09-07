/**
 * WAVE 5 — CMS media upload governance.
 *
 * The load-bearing claim: the browser states what it wants to upload, the
 * SERVER decides where it goes. Every test below is an attempt to make the
 * server accept a destination or a file it should not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  MAGIC_BYTES,
  UPLOAD_URL_TTL_MS,
  approveUpload,
  extensionOf,
  magicBytesMatch,
  sanitizeFilename,
} from "../mediaUpload";

const bridge = readFileSync(
  resolve(process.cwd(), "src/controlCenter/cmsMediaBridge.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

function req(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "image/webp",
    byteSize: 240_000,
    filename: "raya-banner.webp",
    stagingId: "draft-123",
    ...overrides,
  };
}

// ── ACCEPTED ───────────────────────────────────────────────────────────────

test("1. a valid JPEG is accepted", () => {
  const v = approveUpload(req({contentType: "image/jpeg", filename: "a.jpg"}));
  assert.equal(v.ok, true, v.error);
  assert.equal(v.value!.storagePath, "cms/draft-123/a.jpg");
});

test("2. a valid PNG is accepted", () => {
  const v = approveUpload(req({contentType: "image/png", filename: "a.png"}));
  assert.equal(v.ok, true, v.error);
});

test("3. a valid WebP is accepted, and .jpeg is accepted for JPEG", () => {
  assert.equal(approveUpload(req()).ok, true);
  assert.equal(approveUpload(req({contentType: "image/jpeg", filename: "a.jpeg"})).ok, true);
});

// ── REJECTED ───────────────────────────────────────────────────────────────

test("4. anything over 2 MB is rejected", () => {
  assert.equal(approveUpload(req({byteSize: 2 * 1024 * 1024 + 1})).error, "media_too_large");
  assert.equal(approveUpload(req({byteSize: 0})).error, "media_size_invalid");
  assert.equal(approveUpload(req({byteSize: 1.5})).error, "media_size_invalid");
  assert.equal(approveUpload(req({byteSize: "240000"})).error, "media_size_invalid");
});

test("5. a MIME type outside the allowlist is rejected", () => {
  for (const type of ["image/svg+xml", "text/html", "application/javascript",
    "application/octet-stream", "image/gif", ""]) {
    assert.equal(approveUpload(req({contentType: type})).error, "media_type_not_allowed",
      `${type} must be refused`);
  }
});

test("6. an extension that disagrees with the type is rejected", () => {
  assert.equal(approveUpload(req({contentType: "image/png", filename: "a.webp"})).error,
    "media_extension_mismatch");
  assert.equal(approveUpload(req({filename: "a.exe"})).error, "media_extension_mismatch");
  assert.equal(approveUpload(req({filename: "a.php"})).error, "media_extension_mismatch");
  assert.equal(approveUpload(req({filename: "noextension"})).error, "media_extension_mismatch");
  assert.equal(approveUpload(req({filename: "a.webp.html"})).error, "media_extension_mismatch");
});

test("7. path traversal cannot survive filename sanitisation", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("..\\..\\windows\\system32.png"), "system32.png");
  assert.equal(sanitizeFilename("....//evil.png"), "evil.png");
  assert.equal(sanitizeFilename("/absolute/path.png"), "path.png");
  // Only the basename survives, so no approved path can contain a traversal.
  const v = approveUpload(req({filename: "../../../evil.webp"}));
  assert.equal(v.ok, true);
  assert.equal(v.value!.storagePath, "cms/draft-123/evil.webp");
});

test("8. a browser-supplied absolute storage path is simply not a field", () => {
  // approveUpload takes no path input at all — it only composes one. Passing a
  // path is ignored rather than honoured.
  const v = approveUpload({...req(), storagePath: "users/private/steal.webp"} as never);
  assert.equal(v.value!.storagePath, "cms/draft-123/raya-banner.webp");
  assert.equal(v.value!.storagePath.startsWith("cms/"), true);
});

test("9. the staging id is sanitised, so it cannot escape the prefix", () => {
  assert.equal(approveUpload(req({stagingId: "../users"})).value!.storagePath,
    "cms/users/raya-banner.webp");
  assert.equal(approveUpload(req({stagingId: "a/b"})).value!.storagePath,
    "cms/ab/raya-banner.webp");
  assert.equal(approveUpload(req({stagingId: "!!!"})).error, "media_staging_id_invalid");
  assert.equal(approveUpload(req({stagingId: ""})).error, "media_staging_id_invalid");
});

test("10. the server always chooses the path under cms/", () => {
  for (const staging of ["draft-1", "cms", "content-abc"]) {
    const v = approveUpload(req({stagingId: staging}));
    assert.equal(v.value!.storagePath.startsWith("cms/"), true);
    assert.equal(v.value!.storagePath.includes(".."), false);
    assert.equal(v.value!.storagePath.includes("//"), false);
  }
});

// ── CONTENT SNIFFING ───────────────────────────────────────────────────────

test("11. magic bytes must agree with the declared type", () => {
  assert.equal(magicBytesMatch("image/jpeg", [0xff, 0xd8, 0xff, 0xe0]), true);
  assert.equal(magicBytesMatch("image/png",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), true);
  assert.equal(magicBytesMatch("image/webp",
    [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]), true);

  // An HTML document announced as a PNG.
  assert.equal(magicBytesMatch("image/png", [0x3c, 0x21, 0x44, 0x4f]), false);
  // A Windows executable announced as a JPEG.
  assert.equal(magicBytesMatch("image/jpeg", [0x4d, 0x5a]), false);
  // RIFF that is not WEBP (e.g. a WAV) must not pass as an image.
  assert.equal(magicBytesMatch("image/webp",
    [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]), false);
  assert.equal(magicBytesMatch("image/svg+xml", [0x3c, 0x73]), false);
});

test("12. every accepted type has a signature to check against", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.ok(MAGIC_BYTES[type], `${type} must have a signature`);
  }
});

// ── HANDOFF ────────────────────────────────────────────────────────────────

test("13. the bridge authenticates and reuses the existing secret", () => {
  assert.ok(bridge.includes("timingSafeEqual"));
  assert.ok(bridge.includes("CMS_ADMIN_BRIDGE_SECRET"),
    "no new secret is introduced for uploads");
  assert.ok(bridge.includes("UNAUTHENTICATED"));
  assert.ok(bridge.includes("METHOD_NOT_ALLOWED"));
});

test("14. the signed URL is bound to the server path AND the content type", () => {
  assert.ok(bridge.includes("approved.value.storagePath"));
  assert.ok(bridge.includes("contentType: approved.value.contentType"),
    "binding the type means a PUT cannot swap it after approval");
  assert.ok(bridge.includes('action: "write"'));
  assert.ok(bridge.includes("UPLOAD_URL_TTL_MS"));
  assert.equal(UPLOAD_URL_TTL_MS <= 15 * 60 * 1000, true, "the handoff is short-lived");
});

test("15. the response carries no secret and no internal detail", () => {
  const start = bridge.indexOf("response.status(200).json({");
  const body = bridge.slice(start, bridge.indexOf("});", start));
  for (const leak of ["secret", "presented", "bucket", "serviceaccount"]) {
    assert.equal(body.toLowerCase().includes(leak), false, `response leaked ${leak}`);
  }
  assert.ok(body.includes("uploadUrl"));
  assert.ok(body.includes("storagePath"));
});

test("16. approved media is exactly what CMS content may then reference", () => {
  const v = approveUpload(req());
  // The same four fields the CMS media validator requires, so an approved
  // upload can be attached to content without any reshaping in between.
  assert.deepEqual(Object.keys(v.value!).sort(),
    ["byteSize", "contentType", "filename", "storagePath"]);
});

test("17. extension parsing is not fooled by dots", () => {
  assert.equal(extensionOf("a.b.webp"), "webp");
  assert.equal(extensionOf(".hidden"), "");
  assert.equal(extensionOf("trailing."), "");
  assert.equal(extensionOf("none"), "");
});
