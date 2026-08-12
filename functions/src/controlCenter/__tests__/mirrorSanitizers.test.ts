import assert from "node:assert/strict";
import test from "node:test";

import {
  maskEmail,
  maskPhone,
  sanitizePlacePublicationMirror,
  sanitizeSocialPostMirror,
  sanitizeUserMirror,
  shouldMirrorSocialPost,
  toIsoTimestamp,
} from "../mirrorSanitizers";

test("mask contact values without retaining raw values", () => {
  assert.equal(maskEmail("owner@example.com"), "ow***@example.com");
  assert.equal(maskPhone("+60 12-345 6789"), "*******6789");
});

test("normalize common timestamp forms", () => {
  assert.equal(toIsoTimestamp(0), "1970-01-01T00:00:00.000Z");
  assert.equal(
    toIsoTimestamp({toMillis: () => 1_700_000_000_000}),
    "2023-11-14T22:13:20.000Z",
  );
});

test("user mirror never emits raw email or phone keys", () => {
  const record = sanitizeUserMirror("uid-1", {
    displayName: "Aina",
    username: "aina",
    email: "aina@example.com",
    phone: "+60123456789",
    accountStatus: "active",
  });
  assert.equal(record.firebase_uid, "uid-1");
  assert.equal(record.email_masked, "ai***@example.com");
  assert.equal(record.phone_masked, "*******6789");
  assert.equal("email" in record, false);
  assert.equal("phone" in record, false);
});

test("private and group-only social posts are excluded from mirror v1", () => {
  assert.equal(shouldMirrorSocialPost({visibility: "public"}), true);
  assert.equal(shouldMirrorSocialPost({visibility: "followers_only"}), true);
  assert.equal(shouldMirrorSocialPost({visibility: "private"}), false);
  assert.equal(shouldMirrorSocialPost({visibility: "group_only"}), false);
});

test("deleted social posts become removed mirror records", () => {
  const record = sanitizeSocialPostMirror("post-1", {
    authorUid: "uid-1",
    text: "hello",
    visibility: "public",
    status: "deleted",
    deletedAt: 1_700_000_000_000,
  });
  assert.equal(record.moderation_status, "removed");
  assert.equal(record.content_excerpt, "hello");
  assert.equal(record.removed_at, "2023-11-14T22:13:20.000Z");
});

test("canonical snapshot publication becomes compact place mirror record", () => {
  const record = sanitizePlacePublicationMirror(
    "place-1",
    {activePublicationId: "pub-1", updatedAt: 1_700_000_000_000},
    "pub-1",
    {
      versionNumber: 3,
      publicationStatus: "published",
      snapshot: {
        place: {
          status: "active",
          verificationStatus: "verified",
          displaySnapshot: {name: "Nasi Lemak Satu"},
          location: {
            lat: 3.14,
            lng: 101.69,
            locality: "Kuala Lumpur",
            state: "Kuala Lumpur",
            countryCode: "MY",
          },
        },
      },
    },
  );
  assert.ok(record);
  assert.equal(record?.firebase_id, "place-1");
  assert.equal(record?.name, "Nasi Lemak Satu");
  assert.equal(record?.latitude, 3.14);
  assert.deepEqual(record?.source_summary, {
    publication_id: "pub-1",
    publication_version: 3,
    verification_status: "verified",
    locality: "Kuala Lumpur",
    state: "Kuala Lumpur",
    country_code: "MY",
    source_canonical_version: null,
  });
});

test("production 1.14E flat publication is mirrored without a snapshot wrapper", () => {
  const record = sanitizePlacePublicationMirror(
    "PLC-123",
    {activePublicationId: "PUB-123", updatedAt: 1_700_000_000_000},
    "PUB-123",
    {
      publicationId: "PUB-123",
      placeId: "PLC-123",
      versionNumber: 1,
      title: "Warung Production",
      lat: 3.139,
      lng: 101.687,
      publicationStatus: "published",
      sourceCanonicalVersion: "1.14E.1",
      publishedAt: 1_700_000_000_000,
      createdAt: 1_700_000_000_000,
    },
  );

  assert.ok(record);
  assert.equal(record?.firebase_id, "PLC-123");
  assert.equal(record?.canonical_place_id, "PLC-123");
  assert.equal(record?.name, "Warung Production");
  assert.equal(record?.latitude, 3.139);
  assert.equal(record?.longitude, 101.687);
  assert.equal(record?.publication_status, "published");
  assert.equal(record?.lifecycle_status, "active");
  assert.deepEqual(record?.source_summary, {
    publication_id: "PUB-123",
    publication_version: 1,
    verification_status: null,
    locality: null,
    state: null,
    country_code: null,
    source_canonical_version: "1.14E.1",
  });
});
