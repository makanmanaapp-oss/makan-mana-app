/**
 * Phase 1.7 Part R — ujian pengindeksan & keahlian (9-20) + versi (39-41).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryCoverageStore,
  applyCoverageMutation,
  calculateCoverageVersion,
  combinedCoverageVersion,
  coverageVersionFromMembers,
  evaluateIndexingDecision,
  getCoverageCellId,
} from "../index";
import {
  ADMIN,
  CENTER,
  head,
  makePlace,
  makePublication,
  makeRawPublication,
  offsetMeters,
  T,
} from "./fixtures";

function store() {
  let t = T;
  return new InMemoryCoverageStore({ now: () => (t += 1000) });
}

const ctx = { now: T };

// 9. Penerbitan AKTIF berjaya diindeks.
test("9. penerbitan aktif diindeks", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_a", location: CENTER });
  const v = makePublication(place);
  const r = await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_a", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  });
  assert.equal(r.indexed, true, r.denyReasons.join(","));
  assert.equal(r.membership?.homeCellId, getCoverageCellId(CENTER.lat, CENTER.lng));
  assert.ok(r.membership!.searchableCellIds.length <= 9);
  assert.equal(r.membership!.lat, CENTER.lat, "koordinat TEPAT dikekalkan");
  assert.equal(r.coverageVersionChanged, true);

  const cell = await s.getCell(r.membership!.homeCellId);
  assert.equal(cell?.activePlaceCount, 1);
  assert.deepEqual(cell?.publishedPlaceIds, ["mm_a"]);
});

// 10-15. Penerbitan yang TIDAK boleh diindeks.
const denyCases: {
  name: string;
  build: () => ReturnType<typeof makePublication>;
  expect: string;
}[] = [
  {
    name: "10. draft tidak diindeks",
    build: () => {
      const p = makePlace({ placeId: "mm_draft", location: CENTER });
      return makeRawPublication(p, { publicationStatus: "draft" });
    },
    expect: "publication_status_not_published",
  },
  {
    name: "11. approved-belum-terbit tidak diindeks",
    build: () => {
      const p = makePlace({ placeId: "mm_appr", location: CENTER });
      return makeRawPublication(p, { publicationStatus: "approved" });
    },
    expect: "publication_status_not_published",
  },
  {
    name: "12. hidden tidak diindeks",
    build: () => {
      const p = makePlace({ placeId: "mm_hidden", location: CENTER });
      return makeRawPublication(p, { publicationStatus: "hidden" });
    },
    expect: "publication_status_not_published",
  },
  {
    name: "13. kedai tutup kekal tidak diindeks",
    build: () => {
      const p = makePlace({
        placeId: "mm_closed",
        location: CENTER,
        status: "permanently_closed",
      });
      return makeRawPublication(p);
    },
    expect: "permanently_closed",
  },
  {
    name: "14. alias digabung tidak diindeks secara bebas",
    build: () => {
      const p = makePlace({ placeId: "mm_merged", location: CENTER, merged: true });
      return makeRawPublication(p);
    },
    expect: "merged_or_superseded_alias",
  },
  {
    name: "15. penerbitan disekat freshness kritikal tidak diindeks",
    build: () => {
      const p = makePlace({ placeId: "mm_expired", location: CENTER });
      const v = makeRawPublication(p);
      return {
        ...v,
        eligibilitySnapshot: {
          ...v.eligibilitySnapshot,
          criticalExpiredFieldIds: ["openingHours"],
        },
      };
    },
    expect: "critical_freshness_blocked",
  },
];

for (const c of denyCases) {
  test(c.name, async () => {
    const s = store();
    const v = c.build();
    const r = await s.indexPublishedPlaceIntoCoverage({
      publicationHead: head(v.placeId, v.publicationId),
      publicationVersion: v,
      canonicalLocation: CENTER,
      context: ctx,
      actor: ADMIN,
    });
    assert.equal(r.indexed, false);
    assert.ok(
      r.denyReasons.includes(c.expect as never),
      `dijangka ${c.expect}, dapat ${r.denyReasons.join(",")}`,
    );
    assert.equal(await s.getMembership(v.placeId), null);
  });
}

test("10b. rejected & superseded juga ditolak", () => {
  for (const status of ["rejected", "superseded", "needs_review", "stale"] as const) {
    const p = makePlace({ placeId: `mm_${status}`, location: CENTER });
    const v = makeRawPublication(p, { publicationStatus: status });
    const d = evaluateIndexingDecision(
      { placeId: v.placeId, activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: T, updatedBy: "x", reasonCode: "y" },
      v,
      CENTER,
      ctx,
    );
    assert.equal(d.indexable, false, status);
    assert.ok(d.denyReasons.includes("publication_status_not_published"));
  }
});

test("penerbitan yang BUKAN kepala aktif ditolak", () => {
  const p = makePlace({ placeId: "mm_nothead", location: CENTER });
  const v = makePublication(p);
  const d = evaluateIndexingDecision(
    { placeId: "mm_nothead", activePublicationId: "pub_lain", activeVersionNumber: 9, updatedAt: T, updatedBy: "x", reasonCode: "y" },
    v,
    CENTER,
    ctx,
  );
  assert.equal(d.indexable, false);
  assert.ok(d.denyReasons.includes("publication_not_active_head"));
});

test("koordinat tidak sah menolak pengindeksan", () => {
  const p = makePlace({ placeId: "mm_badloc", location: CENTER });
  const v = makePublication(p);
  const d = evaluateIndexingDecision(
    { placeId: "mm_badloc", activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: T, updatedBy: "x", reasonCode: "y" },
    v,
    { lat: 999, lng: 0 },
    ctx,
  );
  assert.equal(d.indexable, false);
  assert.ok(d.denyReasons.includes("invalid_location"));
});

test("tutup sementara BOLEH diindeks tetapi BUKAN cadangan utama", () => {
  const p = makePlace({
    placeId: "mm_tc",
    location: CENTER,
    status: "temporarily_closed",
  });
  const v = makeRawPublication(p);
  const d = evaluateIndexingDecision(
    { placeId: "mm_tc", activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: T, updatedBy: "x", reasonCode: "y" },
    v,
    CENTER,
    ctx,
  );
  assert.equal(d.indexable, true, d.denyReasons.join(","));
  assert.equal(d.primarySuggestionEligible, false);
});

// 16. Pengindeksan IDEMPOTEN.
test("16. pengindeksan sama adalah idempoten", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_idem", location: CENTER });
  const v = makePublication(place);
  const args = {
    publicationHead: head("mm_idem", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  };
  const a = await s.indexPublishedPlaceIntoCoverage(args);
  const b = await s.indexPublishedPlaceIntoCoverage(args);
  assert.equal(a.membership!.contentHash, b.membership!.contentHash);
  assert.equal(b.coverageVersionChanged, false, "ulangan tidak mengubah versi");
  assert.equal(a.coverageVersion, b.coverageVersion);
  const cell = await s.getCell(a.membership!.homeCellId);
  assert.equal(cell?.activePlaceCount, 1, "tiada keahlian pendua");
});

// 17. Perubahan penerbitan mengemas kini keahlian.
test("17. versi penerbitan baharu mengemas kini keahlian", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_upd", location: CENTER });
  const v1 = makePublication(place);
  await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_upd", v1.publicationId),
    publicationVersion: v1,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  });

  const changed = makePlace({ placeId: "mm_upd", location: CENTER, rating: 4.9 });
  const v2 = makePublication(changed, 2, T + 5000);
  const r = await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_upd", v2.publicationId),
    publicationVersion: v2,
    canonicalLocation: CENTER,
    context: { now: T + 5000 },
    actor: ADMIN,
  });
  assert.equal(r.indexed, true);
  assert.equal(r.membership!.publicationVersion, 2);
  assert.equal(r.coverageVersionChanged, true, "versi liputan berubah");
  const m = await s.getMembership("mm_upd");
  assert.equal(m?.publicationId, v2.publicationId);
});

// 18. Perpindahan lokasi menukar sel rumah.
test("18. perpindahan lokasi menukar sel rumah + membuang sel lama", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_move", location: CENTER });
  const v1 = makePublication(place);
  const first = await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_move", v1.publicationId),
    publicationVersion: v1,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  });
  const oldHome = first.membership!.homeCellId;

  // Berpindah 50 km — sel rumah mesti berubah.
  const newLoc = offsetMeters(CENTER, 50_000, 0);
  const moved = makePlace({ placeId: "mm_move", location: newLoc });
  const v2 = makePublication(moved, 2, T + 5000);
  const r = await s.reindexPlaceCoverage({
    publicationHead: head("mm_move", v2.publicationId),
    publicationVersion: v2,
    canonicalLocation: newLoc,
    reason: "moved",
    context: { now: T + 5000 },
    actor: ADMIN,
  });

  const newHome = r.membership!.homeCellId;
  assert.notEqual(newHome, oldHome);
  // Sel lama tidak lagi mengandungi kedai ini.
  const oldCell = await s.getCell(oldHome);
  assert.equal(oldCell?.publishedPlaceIds.includes("mm_move"), false);
  assert.equal(oldCell?.activePlaceCount, 0);
  // Sel baharu mengandunginya.
  const newCell = await s.getCell(newHome);
  assert.deepEqual(newCell?.publishedPlaceIds, ["mm_move"]);
});

// 19. Kedai disembunyikan membuang keahlian.
test("19. kedai disembunyikan membuang keahlian + menukar versi", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_hide", location: CENTER });
  const v = makePublication(place);
  const first = await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_hide", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  });
  const homeCell = first.membership!.homeCellId;
  const versionBefore = (await s.getCell(homeCell))!.coverageVersion;

  const r = await s.removePlaceFromCoverage({
    placeId: "mm_hide",
    reason: "hidden",
    actor: ADMIN,
    now: T + 9000,
  });
  assert.equal(r.coverageVersionChanged, true);
  assert.equal(await s.getMembership("mm_hide"), null);
  const after = await s.getCell(homeCell);
  assert.equal(after?.activePlaceCount, 0);
  assert.notEqual(after?.coverageVersion, versionBefore);
  // Peristiwa invalidasi dicatat.
  assert.ok(s.listInvalidationEvents().some((e) => e.placeId === "mm_hide"));
});

// 20. Restore mengindeks semula.
test("20. restore mengindeks semula keahlian", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_restore", location: CENTER });
  const v = makePublication(place);
  const args = {
    publicationHead: head("mm_restore", v.publicationId),
    publicationVersion: v,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  };
  await s.indexPublishedPlaceIntoCoverage(args);
  await s.removePlaceFromCoverage({
    placeId: "mm_restore",
    reason: "hidden",
    actor: ADMIN,
    now: T + 1000,
  });
  assert.equal(await s.getMembership("mm_restore"), null);

  const r = await s.reindexPlaceCoverage({ ...args, reason: "restored" });
  assert.equal(r.indexed, true);
  assert.ok(await s.getMembership("mm_restore"));
  const cell = await s.getCell(r.membership!.homeCellId);
  assert.deepEqual(cell?.publishedPlaceIds, ["mm_restore"]);
});

test("penerbitan yang menjadi tidak layak MEMBUANG keahlian sedia ada", async () => {
  const s = store();
  const place = makePlace({ placeId: "mm_fall", location: CENTER });
  const v1 = makePublication(place);
  await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_fall", v1.publicationId),
    publicationVersion: v1,
    canonicalLocation: CENTER,
    context: ctx,
    actor: ADMIN,
  });
  assert.ok(await s.getMembership("mm_fall"));

  // Penerbitan seterusnya disekat oleh freshness kritikal.
  const blocked = {
    ...v1,
    eligibilitySnapshot: {
      ...v1.eligibilitySnapshot,
      criticalExpiredFieldIds: ["halalEvidence"],
    },
  };
  const r = await s.indexPublishedPlaceIntoCoverage({
    publicationHead: head("mm_fall", blocked.publicationId),
    publicationVersion: blocked,
    canonicalLocation: CENTER,
    context: { now: T + 2000 },
    actor: ADMIN,
  });
  assert.equal(r.indexed, false);
  assert.equal(await s.getMembership("mm_fall"), null, "keahlian dibuang");
});

// ---- Part E: versi liputan (39-41) ----

// 39. Versi liputan BEBAS SUSUNAN.
test("39. versi liputan bebas susunan set placeId", () => {
  const a = coverageVersionFromMembers([
    { placeId: "p2", publicationId: "x2", publicationVersion: 1 },
    { placeId: "p1", publicationId: "x1", publicationVersion: 1 },
  ]);
  const b = coverageVersionFromMembers([
    { placeId: "p1", publicationId: "x1", publicationVersion: 1 },
    { placeId: "p2", publicationId: "x2", publicationVersion: 1 },
  ]);
  assert.equal(a, b);
});

// 40. Set keahlian sama → versi sama.
test("40. set keahlian sama mengekalkan versi sama (idempoten)", () => {
  const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
  const v1 = coverageVersionFromMembers(members);
  const mutation = {
    kind: "publication_activated" as const,
    placeId: "p1",
    publicationId: "x1",
    publicationVersion: 1,
  };
  const r1 = calculateCoverageVersion(v1, mutation, members);
  const r2 = calculateCoverageVersion(r1.version, mutation, r1.members);
  assert.equal(r1.version, v1);
  assert.equal(r1.changed, false, "mutasi sama = tiada perubahan");
  assert.equal(r2.version, r1.version);
});

// 41. Set keahlian berubah → versi berubah.
test("41. set keahlian berubah menukar versi", () => {
  const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
  const before = coverageVersionFromMembers(members);

  const added = applyCoverageMutation(members, {
    kind: "publication_activated",
    placeId: "p2",
    publicationId: "x2",
    publicationVersion: 1,
  });
  assert.notEqual(coverageVersionFromMembers(added), before);

  const removed = applyCoverageMutation(members, {
    kind: "place_hidden",
    placeId: "p1",
  });
  assert.notEqual(coverageVersionFromMembers(removed), before);
  assert.equal(removed.length, 0);

  // Versi penerbitan berbeza untuk kedai sama juga menukar versi.
  const bumped = applyCoverageMutation(members, {
    kind: "publication_activated",
    placeId: "p1",
    publicationId: "x1b",
    publicationVersion: 2,
  });
  assert.notEqual(coverageVersionFromMembers(bumped), before);
});

test("versi bukan wall-clock: dikira semula memberi nilai sama", () => {
  const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
  assert.equal(
    coverageVersionFromMembers(members),
    coverageVersionFromMembers(members),
  );
});

test("versi kolam gabungan bebas susunan sel", () => {
  const a = combinedCoverageVersion({ c1: "v1", c2: "v2" });
  const b = combinedCoverageVersion({ c2: "v2", c1: "v1" });
  assert.equal(a, b);
  assert.notEqual(a, combinedCoverageVersion({ c1: "v1", c2: "v3" }));
});

test("mutasi hidden/closed/merge membuang ahli", () => {
  const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
  for (const kind of [
    "place_hidden",
    "place_permanently_closed",
    "merge_executed",
    "critical_freshness_blocked",
  ] as const) {
    assert.equal(applyCoverageMutation(members, { kind, placeId: "p1" }).length, 0, kind);
  }
});
