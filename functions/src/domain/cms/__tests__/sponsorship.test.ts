/**
 * SPONSORSHIP — a disclosure, not a guess.
 *
 * The app used to print "Tajaan" on every Explore banner, for no reason beyond
 * the surface it sat on. That is a paid-placement disclosure nobody actually
 * made, and it is equally wrong in the other direction: a real paid banner on
 * Home carried no label at all because Home simply never passed the flag.
 *
 * The owner's rule is explicit — do not infer paid status merely because
 * content appears in the CMS. So the fact is DECLARED, stored, audited, and
 * travels to the client. These tests pin that it cannot be re-derived anywhere.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CMS_SPONSORSHIPS,
  SPONSORSHIP_EDITORIAL,
  SPONSORSHIP_PAID,
  isCmsSponsorship,
  sponsorshipOf,
} from "../cmsTypes";
import {
  CMS_EDITABLE_FIELDS,
  buildCmsDocument,
  toPublicCmsContent,
} from "../cmsDocument";

const base = {
  placement: "home_mid" as const,
  title: "Tajuk",
  subtitle: "",
  body: "",
  ctaLabel: "",
  ctaDestination: "",
  media: null,
  targeting: {kind: "all" as const, values: []},
  priority: 10,
  startsAtMs: 1,
  endsAtMs: 2,
  status: "draft" as const,
  canonicalPlaceId: null,
  actorAdminId: "a1",
  requestId: "r1",
};

test("only two sponsorship values exist", () => {
  assert.deepEqual([...CMS_SPONSORSHIPS], ["editorial", "paid"]);
  assert.equal(isCmsSponsorship("editorial"), true);
  assert.equal(isCmsSponsorship("paid"), true);
  assert.equal(isCmsSponsorship("sponsored"), false);
  assert.equal(isCmsSponsorship(""), false);
  assert.equal(isCmsSponsorship(undefined), false);
});

test("anything unrecognised reads as EDITORIAL, never as paid", () => {
  // The direction matters. Reading an unknown value as "paid" would invent a
  // commercial relationship; reading it as editorial states only that nobody
  // declared one.
  for (const junk of [undefined, null, "", "PAID", "sponsored", 1, {}]) {
    assert.equal(sponsorshipOf(junk), SPONSORSHIP_EDITORIAL, String(junk));
  }
  assert.equal(sponsorshipOf(SPONSORSHIP_PAID), SPONSORSHIP_PAID);
});

test("a banner is born editorial when nothing is declared", () => {
  const doc = buildCmsDocument(base);
  assert.equal(doc.sponsorship, SPONSORSHIP_EDITORIAL);
});

test("a declared paid placement is stored as declared", () => {
  const doc = buildCmsDocument({...base, sponsorship: SPONSORSHIP_PAID});
  assert.equal(doc.sponsorship, SPONSORSHIP_PAID);
});

test("sponsorship reaches the app explicitly", () => {
  const paid = toPublicCmsContent("c1", {
    placement: "explore_top", title: "T", sponsorship: "paid",
  });
  assert.equal(paid?.sponsorship, SPONSORSHIP_PAID);

  // A row written before this field existed. It is editorial, and the app is
  // told so rather than left to work it out from the placement.
  const legacy = toPublicCmsContent("c2", {
    placement: "explore_top", title: "T",
  });
  assert.equal(legacy?.sponsorship, SPONSORSHIP_EDITORIAL);
});

test("placement can NEVER imply sponsorship", () => {
  // This is the regression. `explore_top` was treated as "sponsored" purely
  // because it is a discovery surface.
  for (const placement of ["home_top", "home_mid", "explore_top", "restaurant_detail"]) {
    const item = toPublicCmsContent("c", {
      placement,
      title: "T",
      // restaurant_detail is dropped without one; supplying it keeps this test
      // about SPONSORSHIP rather than accidentally passing on a null row.
      canonicalPlaceId: "PLC-1",
    });
    assert.ok(item, `${placement} did not project`);
    assert.equal(item.sponsorship, SPONSORSHIP_EDITORIAL,
      `${placement} inferred a sponsorship`);
  }
});

test("an operator may correct a sponsorship later", () => {
  // A placement that becomes paid, or was mislabelled, has to be fixable —
  // otherwise the only remedy is deleting and re-creating the banner, which
  // loses its audit trail.
  assert.ok((CMS_EDITABLE_FIELDS as readonly string[]).includes("sponsorship"));
});
