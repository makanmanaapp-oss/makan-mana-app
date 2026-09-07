/**
 * WAVE 5 — CMS projection and mirror contract.
 *
 * The public shape is an allowlist and the mirror carries no person. Same
 * discipline as Wave 4, asserted independently because a second content system
 * is a second chance to leak.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CMS_EDITABLE_FIELDS,
  CMS_MIRROR_ENTITY_TYPE,
  buildCmsDocument,
  cmsMirrorEventId,
  toAdminCmsContent,
  toCmsMirrorRecord,
  toPublicCmsContent,
} from "../cmsDocument";
import {
  CMS_STATUS_ACTIVE,
  CMS_STATUS_DRAFT,
  DEFAULT_TARGETING,
  PLACEMENT_HOME_TOP,
  PLACEMENT_RESTAURANT_DETAIL,
} from "../cmsTypes";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...buildCmsDocument({
      placement: PLACEMENT_HOME_TOP,
      title: "Promosi Raya",
      subtitle: "Diskaun sehingga 30%",
      body: "Untuk semua pengguna",
      ctaLabel: "Lihat",
      ctaDestination: "/explore",
      media: {
        storagePath: "cms/banners/raya.webp",
        contentType: "image/webp",
        byteSize: 240_000,
        width: 1200,
        height: 600,
        altText: "Promosi Raya",
      },
      targeting: DEFAULT_TARGETING,
      priority: 10,
      startsAtMs: NOW - HOUR,
      endsAtMs: NOW + HOUR,
      status: CMS_STATUS_ACTIVE,
      canonicalPlaceId: null,
      actorAdminId: "admin-uuid-999",
      requestId: "req-abc",
    }),
    createdAtMs: NOW - HOUR,
    updatedAtMs: NOW,
    ...overrides,
  };
}

test("mirror entity type matches the Control Center contract", () => {
  assert.equal(CMS_MIRROR_ENTITY_TYPE, "cms_content");
});

test("public projection carries exactly the allowlisted keys", () => {
  const pub = toPublicCmsContent("c1", doc());
  assert.deepEqual(Object.keys(pub!).sort(), [
    "body", "canonicalPlaceId", "contentId", "ctaDestination", "ctaLabel",
    "media", "placement", "priority", "subtitle", "title",
  ]);
});

test("no admin identifier reaches the public projection", () => {
  const serialized = JSON.stringify(toPublicCmsContent("c1", doc()));
  for (const leak of ["admin-uuid-999", "createdByAdminId", "updatedByAdminId", "req-abc"]) {
    assert.equal(serialized.includes(leak), false, `public payload leaked ${leak}`);
  }
});

test("a field added to storage later cannot leak into the public shape", () => {
  const serialized = JSON.stringify(toPublicCmsContent("c1", doc({
    internalNote: "do not ship",
    approvedByAdminId: "admin-777",
  })));
  assert.equal(serialized.includes("admin-777"), false);
  assert.equal(serialized.includes("internalNote"), false);
});

test("public media omits byte size — the app has no use for it", () => {
  const pub = toPublicCmsContent("c1", doc());
  assert.deepEqual(Object.keys(pub!.media!).sort(),
    ["altText", "contentType", "height", "storagePath", "width"]);
});

test("an unrenderable row simply has no public form", () => {
  assert.equal(toPublicCmsContent("", doc()), null, "missing id");
  assert.equal(toPublicCmsContent("c1", null), null, "missing data");
  assert.equal(toPublicCmsContent("c1", doc({title: ""})), null, "no title");
  assert.equal(toPublicCmsContent("c1", doc({placement: ""})), null, "no placement");
});

test("a restaurant_detail banner without a restaurant has nowhere to render", () => {
  assert.equal(
    toPublicCmsContent("c1", doc({placement: PLACEMENT_RESTAURANT_DETAIL, canonicalPlaceId: null})),
    null,
  );
  assert.ok(
    toPublicCmsContent("c1", doc({
      placement: PLACEMENT_RESTAURANT_DETAIL, canonicalPlaceId: "canon-1",
    })),
  );
});

test("a draft has no publishedAt; a scheduled/active one does", () => {
  const draft: Record<string, unknown> = buildCmsDocument({
    placement: PLACEMENT_HOME_TOP, title: "t", subtitle: "", body: "",
    ctaLabel: "", ctaDestination: "", media: null, targeting: DEFAULT_TARGETING,
    priority: 100, startsAtMs: NOW, endsAtMs: NOW + HOUR,
    status: CMS_STATUS_DRAFT, canonicalPlaceId: null,
    actorAdminId: "", requestId: "r",
  });
  assert.equal(draft.publishedAtMs, null);
  assert.equal(doc().publishedAtMs, NOW - HOUR);
});

test("admin projection adds truthful status but still no admin id", () => {
  const a = toAdminCmsContent("c1", doc({
    startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
  }), NOW);
  assert.equal(a!.storedStatus, CMS_STATUS_ACTIVE, "intent is unchanged");
  assert.equal(a!.status, "expired", "truth is derived from the schedule");
  assert.equal(JSON.stringify(a).includes("admin-uuid-999"), false);
});

test("the editable allowlist excludes status, audit and schema", () => {
  for (const forbidden of ["status", "placement", "createdByAdminId", "updatedByAdminId",
    "publishedAtMs", "archivedAtMs", "schemaVersion"]) {
    assert.equal((CMS_EDITABLE_FIELDS as readonly string[]).includes(forbidden), false,
      `${forbidden} must not be editable`);
  }
});

test("mirror record carries operational fields and no person", () => {
  const r = toCmsMirrorRecord("c1", doc(), NOW);
  assert.ok(r);
  assert.equal(r!.content_id, "c1");
  assert.equal(r!.placement, "home_top");
  assert.equal(r!.status, "active");
  assert.equal(r!.effective_status, "active");
  assert.equal(r!.media_path, "cms/banners/raya.webp");
  assert.equal(r!.last_request_id, "req-abc");
  const serialized = JSON.stringify(r);
  for (const leak of ["admin-uuid-999", "AdminId"]) {
    assert.equal(serialized.includes(leak), false, `mirror leaked ${leak}`);
  }
});

test("mirror reports expiry even when storage says active", () => {
  const r = toCmsMirrorRecord("c1", doc({
    startsAtMs: NOW - 3 * HOUR, endsAtMs: NOW - HOUR,
  }), NOW);
  assert.equal(r!.status, "active");
  assert.equal(r!.effective_status, "expired");
});

test("a row the mirror migration would drop is never sent", () => {
  assert.equal(toCmsMirrorRecord("", doc(), NOW), null);
  assert.equal(toCmsMirrorRecord("c1", doc({title: ""}), NOW), null);
  assert.equal(toCmsMirrorRecord("c1", doc({placement: ""}), NOW), null);
  assert.equal(toCmsMirrorRecord("c1", doc({status: ""}), NOW), null);
});

test("mirror event id is stable for the same state, different for a new one", () => {
  assert.equal(cmsMirrorEventId("c1", NOW), cmsMirrorEventId("c1", NOW));
  assert.notEqual(cmsMirrorEventId("c1", NOW), cmsMirrorEventId("c1", NOW + 1));
  assert.equal(cmsMirrorEventId("c1", null), null);
  assert.equal(cmsMirrorEventId("", NOW), null);
});
