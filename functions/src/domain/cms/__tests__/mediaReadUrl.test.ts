/**
 * B1 — signed READ url for CMS banner media.
 *
 * The signer is injected, so the cases that actually matter operationally — a
 * signing outage, a tampered path, a partial failure across several banners —
 * are exercised for real here rather than trusted to a comment.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CMS_MEDIA_READ_TTL_MS,
  attachCmsMediaReadUrls,
  isSignableCmsMediaPath,
} from "../mediaReadUrl";
import type {PublicCmsContent} from "../cmsDocument";

function item(overrides: Partial<PublicCmsContent> = {}): PublicCmsContent {
  return {
    contentId: "c1",
    placement: "home_top",
    title: "Raya",
    subtitle: "",
    body: "",
    ctaLabel: "",
    ctaDestination: "",
    media: {
      storagePath: "cms/banners/raya.webp",
      contentType: "image/webp",
      width: 1200,
      height: 600,
      altText: "Raya",
      readUrl: null,
    },
    priority: 100,
    canonicalPlaceId: null,
    ...overrides,
  };
}

const signer = async (path: string, expiresAtMs: number) =>
  `https://signed.example/${encodeURIComponent(path)}?exp=${expiresAtMs}`;

// ── 3. a path outside cms/ is rejected ─────────────────────────────────────

test("1. only paths contained inside cms/ are signable", () => {
  assert.equal(isSignableCmsMediaPath("cms/banners/raya.webp"), true);
  assert.equal(isSignableCmsMediaPath("  cms/banners/raya.webp  "), true);

  for (const bad of [
    "feed_images/u1/a.jpg",
    "group_images/g1/a.jpg",
    "profile_images/u1/a.jpg",
    "wallet_images/u1/receipt.jpg",
    "/cms/banners/raya.webp",
    "cmsx/banners/raya.webp",
    "CMS/banners/raya.webp",
  ]) {
    assert.equal(isSignableCmsMediaPath(bad), false, `must reject: ${bad}`);
  }
});

test("2. a prefix match alone is not containment", () => {
  // Each of these starts with `cms/` and still leaves it.
  for (const escape of [
    "cms/../wallet_images/u1/receipt.jpg",
    "cms/banners/../../secrets/key.json",
    "cms//banners/raya.webp",
    "cms/banners//raya.webp",
  ]) {
    assert.equal(isSignableCmsMediaPath(escape), false, `must reject: ${escape}`);
  }
});

test("3. directories, backslashes and control characters are refused", () => {
  assert.equal(isSignableCmsMediaPath("cms/banners/"), false, "a directory is not an object");
  assert.equal(isSignableCmsMediaPath("cms/banners\\raya.webp"), false);
  assert.equal(isSignableCmsMediaPath("cms/banners/raya\u0000.webp"), false);
  assert.equal(isSignableCmsMediaPath("cms/banners/raya\n.webp"), false);
  assert.equal(isSignableCmsMediaPath("cms/banners/raya\u007f.webp"), false);
  assert.equal(isSignableCmsMediaPath(`cms/${"a".repeat(600)}.webp`), false, "absurd length");
});

test("4. non-strings and empties are refused without throwing", () => {
  for (const bad of [null, undefined, 42, {}, [], "", "   "]) {
    assert.equal(isSignableCmsMediaPath(bad), false);
  }
});

// ── 1. a valid image gets a signed READ url ────────────────────────────────

test("5. a valid CMS image receives a signed read url with a short TTL", async () => {
  const nowMs = 1_700_000_000_000;
  const out = await attachCmsMediaReadUrls([item()], signer, nowMs);

  assert.equal(out.length, 1);
  const url = out[0].media!.readUrl!;
  assert.ok(url.startsWith("https://signed.example/"), "must be the signer's url");
  assert.ok(url.includes(`exp=${nowMs + CMS_MEDIA_READ_TTL_MS}`), "TTL must be applied");
  // 15 minutes: long enough to render, short enough that a leaked url is cheap.
  assert.equal(CMS_MEDIA_READ_TTL_MS, 15 * 60 * 1000);
});

test("6. the rest of the content is passed through untouched", async () => {
  const source = item({title: "Raya", priority: 7, ctaDestination: "/explore"});
  const [out] = await attachCmsMediaReadUrls([source], signer, 1);
  assert.equal(out.title, "Raya");
  assert.equal(out.priority, 7);
  assert.equal(out.ctaDestination, "/explore");
  assert.equal(out.media!.width, 1200);
  assert.equal(out.media!.altText, "Raya");
});

// ── 2. a WRITE url is never what the app receives ──────────────────────────

test("7. the signer is only ever asked for a read, and only for cms/ paths", async () => {
  const calls: {path: string; expiresAtMs: number}[] = [];
  await attachCmsMediaReadUrls(
    [
      item(),
      item({
        contentId: "c2",
        media: {...item().media!, storagePath: "wallet_images/u1/receipt.jpg"},
      }),
    ],
    async (path, expiresAtMs) => {
      calls.push({path, expiresAtMs});
      return "https://signed.example/ok";
    },
    1000,
  );
  // The wallet path never reached the signer at all — containment happens
  // BEFORE a url can be minted, not after.
  assert.deepEqual(calls.map((c) => c.path), ["cms/banners/raya.webp"]);
});

// ── 4. missing media stays a safe, image-free banner ───────────────────────

test("8. content with no media is returned unchanged", async () => {
  const [out] = await attachCmsMediaReadUrls([item({media: null})], signer, 1);
  assert.equal(out.media, null);
  assert.equal(out.title, "Raya");
});

test("9. an unsignable path yields readUrl null, never a thrown response", async () => {
  const [out] = await attachCmsMediaReadUrls(
    [item({media: {...item().media!, storagePath: "cms/../escape.png"}})],
    signer,
    1,
  );
  assert.equal(out.media!.readUrl, null);
  assert.equal(out.title, "Raya", "the text card survives");
});

// ── 5. a signing outage is fail-safe ───────────────────────────────────────

test("10. a signer that throws degrades to no image, not to an error", async () => {
  const boom = async () => {
    throw new Error("credentials unavailable");
  };
  const out = await attachCmsMediaReadUrls([item(), item({contentId: "c2"})], boom, 1);
  assert.equal(out.length, 2, "every banner still ships");
  assert.equal(out[0].media!.readUrl, null);
  assert.equal(out[1].media!.readUrl, null);
  assert.equal(out[0].title, "Raya");
});

test("11. a signer returning junk is treated as no url", async () => {
  for (const junk of ["", "   ", null, undefined, 42]) {
    const [out] = await attachCmsMediaReadUrls(
      [item()],
      (async () => junk) as never,
      1,
    );
    assert.equal(out.media!.readUrl, null, `junk url: ${String(junk)}`);
  }
});

test("12. one failing image does not cost the others their pictures", async () => {
  const partial = async (path: string) => {
    if (path.includes("broken")) throw new Error("nope");
    return "https://signed.example/ok";
  };
  const out = await attachCmsMediaReadUrls(
    [
      item({contentId: "a"}),
      item({contentId: "b", media: {...item().media!, storagePath: "cms/broken.webp"}}),
      item({contentId: "c", media: {...item().media!, storagePath: "cms/other.webp"}}),
    ],
    partial,
    1,
  );
  assert.deepEqual(out.map((o) => o.contentId), ["a", "b", "c"], "order preserved");
  assert.equal(out[0].media!.readUrl, "https://signed.example/ok");
  assert.equal(out[1].media!.readUrl, null, "only the broken one loses its image");
  assert.equal(out[2].media!.readUrl, "https://signed.example/ok");
});

test("13. failures are reported to the caller for logging", async () => {
  const seen: string[] = [];
  await attachCmsMediaReadUrls(
    [item({media: {...item().media!, storagePath: "feed_images/u1/a.jpg"}})],
    signer,
    1,
    (path) => seen.push(path),
  );
  assert.deepEqual(seen, ["feed_images/u1/a.jpg"]);
});

// ── efficiency + ordering ──────────────────────────────────────────────────

test("14. a repeated image is signed once", async () => {
  let calls = 0;
  const counting = async () => {
    calls += 1;
    return "https://signed.example/ok";
  };
  const out = await attachCmsMediaReadUrls(
    [item({contentId: "a"}), item({contentId: "b"}), item({contentId: "c"})],
    counting,
    1,
  );
  assert.equal(calls, 1, "same storagePath must not be signed three times");
  assert.ok(out.every((o) => o.media!.readUrl === "https://signed.example/ok"));
});

test("15. an empty list does no work and returns empty", async () => {
  let calls = 0;
  const out = await attachCmsMediaReadUrls([], async () => {
    calls += 1;
    return "x";
  }, 1);
  assert.deepEqual(out, []);
  assert.equal(calls, 0);
});

test("16. every image shares one expiry, so a placement expires together", async () => {
  const expiries: number[] = [];
  await attachCmsMediaReadUrls(
    [
      item({contentId: "a"}),
      item({contentId: "b", media: {...item().media!, storagePath: "cms/two.webp"}}),
    ],
    async (_path, expiresAtMs) => {
      expiries.push(expiresAtMs);
      return "https://signed.example/ok";
    },
    5_000,
  );
  assert.deepEqual(expiries, [
    5_000 + CMS_MEDIA_READ_TTL_MS,
    5_000 + CMS_MEDIA_READ_TTL_MS,
  ]);
});
