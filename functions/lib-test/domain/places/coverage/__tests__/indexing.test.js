"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.7 Part R — ujian pengindeksan & keahlian (9-20) + versi (39-41).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
function store() {
    let t = fixtures_1.T;
    return new index_1.InMemoryCoverageStore({ now: () => (t += 1000) });
}
const ctx = { now: fixtures_1.T };
// 9. Penerbitan AKTIF berjaya diindeks.
(0, node_test_1.default)("9. penerbitan aktif diindeks", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_a", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(place);
    const r = await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_a", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    });
    strict_1.default.equal(r.indexed, true, r.denyReasons.join(","));
    strict_1.default.equal(r.membership?.homeCellId, (0, index_1.getCoverageCellId)(fixtures_1.CENTER.lat, fixtures_1.CENTER.lng));
    strict_1.default.ok(r.membership.searchableCellIds.length <= 9);
    strict_1.default.equal(r.membership.lat, fixtures_1.CENTER.lat, "koordinat TEPAT dikekalkan");
    strict_1.default.equal(r.coverageVersionChanged, true);
    const cell = await s.getCell(r.membership.homeCellId);
    strict_1.default.equal(cell?.activePlaceCount, 1);
    strict_1.default.deepEqual(cell?.publishedPlaceIds, ["mm_a"]);
});
// 10-15. Penerbitan yang TIDAK boleh diindeks.
const denyCases = [
    {
        name: "10. draft tidak diindeks",
        build: () => {
            const p = (0, fixtures_1.makePlace)({ placeId: "mm_draft", location: fixtures_1.CENTER });
            return (0, fixtures_1.makeRawPublication)(p, { publicationStatus: "draft" });
        },
        expect: "publication_status_not_published",
    },
    {
        name: "11. approved-belum-terbit tidak diindeks",
        build: () => {
            const p = (0, fixtures_1.makePlace)({ placeId: "mm_appr", location: fixtures_1.CENTER });
            return (0, fixtures_1.makeRawPublication)(p, { publicationStatus: "approved" });
        },
        expect: "publication_status_not_published",
    },
    {
        name: "12. hidden tidak diindeks",
        build: () => {
            const p = (0, fixtures_1.makePlace)({ placeId: "mm_hidden", location: fixtures_1.CENTER });
            return (0, fixtures_1.makeRawPublication)(p, { publicationStatus: "hidden" });
        },
        expect: "publication_status_not_published",
    },
    {
        name: "13. kedai tutup kekal tidak diindeks",
        build: () => {
            const p = (0, fixtures_1.makePlace)({
                placeId: "mm_closed",
                location: fixtures_1.CENTER,
                status: "permanently_closed",
            });
            return (0, fixtures_1.makeRawPublication)(p);
        },
        expect: "permanently_closed",
    },
    {
        name: "14. alias digabung tidak diindeks secara bebas",
        build: () => {
            const p = (0, fixtures_1.makePlace)({ placeId: "mm_merged", location: fixtures_1.CENTER, merged: true });
            return (0, fixtures_1.makeRawPublication)(p);
        },
        expect: "merged_or_superseded_alias",
    },
    {
        name: "15. penerbitan disekat freshness kritikal tidak diindeks",
        build: () => {
            const p = (0, fixtures_1.makePlace)({ placeId: "mm_expired", location: fixtures_1.CENTER });
            const v = (0, fixtures_1.makeRawPublication)(p);
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
    (0, node_test_1.default)(c.name, async () => {
        const s = store();
        const v = c.build();
        const r = await s.indexPublishedPlaceIntoCoverage({
            publicationHead: (0, fixtures_1.head)(v.placeId, v.publicationId),
            publicationVersion: v,
            canonicalLocation: fixtures_1.CENTER,
            context: ctx,
            actor: fixtures_1.ADMIN,
        });
        strict_1.default.equal(r.indexed, false);
        strict_1.default.ok(r.denyReasons.includes(c.expect), `dijangka ${c.expect}, dapat ${r.denyReasons.join(",")}`);
        strict_1.default.equal(await s.getMembership(v.placeId), null);
    });
}
(0, node_test_1.default)("10b. rejected & superseded juga ditolak", () => {
    for (const status of ["rejected", "superseded", "needs_review", "stale"]) {
        const p = (0, fixtures_1.makePlace)({ placeId: `mm_${status}`, location: fixtures_1.CENTER });
        const v = (0, fixtures_1.makeRawPublication)(p, { publicationStatus: status });
        const d = (0, index_1.evaluateIndexingDecision)({ placeId: v.placeId, activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: fixtures_1.T, updatedBy: "x", reasonCode: "y" }, v, fixtures_1.CENTER, ctx);
        strict_1.default.equal(d.indexable, false, status);
        strict_1.default.ok(d.denyReasons.includes("publication_status_not_published"));
    }
});
(0, node_test_1.default)("penerbitan yang BUKAN kepala aktif ditolak", () => {
    const p = (0, fixtures_1.makePlace)({ placeId: "mm_nothead", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(p);
    const d = (0, index_1.evaluateIndexingDecision)({ placeId: "mm_nothead", activePublicationId: "pub_lain", activeVersionNumber: 9, updatedAt: fixtures_1.T, updatedBy: "x", reasonCode: "y" }, v, fixtures_1.CENTER, ctx);
    strict_1.default.equal(d.indexable, false);
    strict_1.default.ok(d.denyReasons.includes("publication_not_active_head"));
});
(0, node_test_1.default)("koordinat tidak sah menolak pengindeksan", () => {
    const p = (0, fixtures_1.makePlace)({ placeId: "mm_badloc", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(p);
    const d = (0, index_1.evaluateIndexingDecision)({ placeId: "mm_badloc", activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: fixtures_1.T, updatedBy: "x", reasonCode: "y" }, v, { lat: 999, lng: 0 }, ctx);
    strict_1.default.equal(d.indexable, false);
    strict_1.default.ok(d.denyReasons.includes("invalid_location"));
});
(0, node_test_1.default)("tutup sementara BOLEH diindeks tetapi BUKAN cadangan utama", () => {
    const p = (0, fixtures_1.makePlace)({
        placeId: "mm_tc",
        location: fixtures_1.CENTER,
        status: "temporarily_closed",
    });
    const v = (0, fixtures_1.makeRawPublication)(p);
    const d = (0, index_1.evaluateIndexingDecision)({ placeId: "mm_tc", activePublicationId: v.publicationId, activeVersionNumber: 1, updatedAt: fixtures_1.T, updatedBy: "x", reasonCode: "y" }, v, fixtures_1.CENTER, ctx);
    strict_1.default.equal(d.indexable, true, d.denyReasons.join(","));
    strict_1.default.equal(d.primarySuggestionEligible, false);
});
// 16. Pengindeksan IDEMPOTEN.
(0, node_test_1.default)("16. pengindeksan sama adalah idempoten", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_idem", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(place);
    const args = {
        publicationHead: (0, fixtures_1.head)("mm_idem", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    };
    const a = await s.indexPublishedPlaceIntoCoverage(args);
    const b = await s.indexPublishedPlaceIntoCoverage(args);
    strict_1.default.equal(a.membership.contentHash, b.membership.contentHash);
    strict_1.default.equal(b.coverageVersionChanged, false, "ulangan tidak mengubah versi");
    strict_1.default.equal(a.coverageVersion, b.coverageVersion);
    const cell = await s.getCell(a.membership.homeCellId);
    strict_1.default.equal(cell?.activePlaceCount, 1, "tiada keahlian pendua");
});
// 17. Perubahan penerbitan mengemas kini keahlian.
(0, node_test_1.default)("17. versi penerbitan baharu mengemas kini keahlian", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_upd", location: fixtures_1.CENTER });
    const v1 = (0, fixtures_1.makePublication)(place);
    await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_upd", v1.publicationId),
        publicationVersion: v1,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    });
    const changed = (0, fixtures_1.makePlace)({ placeId: "mm_upd", location: fixtures_1.CENTER, rating: 4.9 });
    const v2 = (0, fixtures_1.makePublication)(changed, 2, fixtures_1.T + 5000);
    const r = await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_upd", v2.publicationId),
        publicationVersion: v2,
        canonicalLocation: fixtures_1.CENTER,
        context: { now: fixtures_1.T + 5000 },
        actor: fixtures_1.ADMIN,
    });
    strict_1.default.equal(r.indexed, true);
    strict_1.default.equal(r.membership.publicationVersion, 2);
    strict_1.default.equal(r.coverageVersionChanged, true, "versi liputan berubah");
    const m = await s.getMembership("mm_upd");
    strict_1.default.equal(m?.publicationId, v2.publicationId);
});
// 18. Perpindahan lokasi menukar sel rumah.
(0, node_test_1.default)("18. perpindahan lokasi menukar sel rumah + membuang sel lama", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_move", location: fixtures_1.CENTER });
    const v1 = (0, fixtures_1.makePublication)(place);
    const first = await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_move", v1.publicationId),
        publicationVersion: v1,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    });
    const oldHome = first.membership.homeCellId;
    // Berpindah 50 km — sel rumah mesti berubah.
    const newLoc = (0, fixtures_1.offsetMeters)(fixtures_1.CENTER, 50_000, 0);
    const moved = (0, fixtures_1.makePlace)({ placeId: "mm_move", location: newLoc });
    const v2 = (0, fixtures_1.makePublication)(moved, 2, fixtures_1.T + 5000);
    const r = await s.reindexPlaceCoverage({
        publicationHead: (0, fixtures_1.head)("mm_move", v2.publicationId),
        publicationVersion: v2,
        canonicalLocation: newLoc,
        reason: "moved",
        context: { now: fixtures_1.T + 5000 },
        actor: fixtures_1.ADMIN,
    });
    const newHome = r.membership.homeCellId;
    strict_1.default.notEqual(newHome, oldHome);
    // Sel lama tidak lagi mengandungi kedai ini.
    const oldCell = await s.getCell(oldHome);
    strict_1.default.equal(oldCell?.publishedPlaceIds.includes("mm_move"), false);
    strict_1.default.equal(oldCell?.activePlaceCount, 0);
    // Sel baharu mengandunginya.
    const newCell = await s.getCell(newHome);
    strict_1.default.deepEqual(newCell?.publishedPlaceIds, ["mm_move"]);
});
// 19. Kedai disembunyikan membuang keahlian.
(0, node_test_1.default)("19. kedai disembunyikan membuang keahlian + menukar versi", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_hide", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(place);
    const first = await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_hide", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    });
    const homeCell = first.membership.homeCellId;
    const versionBefore = (await s.getCell(homeCell)).coverageVersion;
    const r = await s.removePlaceFromCoverage({
        placeId: "mm_hide",
        reason: "hidden",
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 9000,
    });
    strict_1.default.equal(r.coverageVersionChanged, true);
    strict_1.default.equal(await s.getMembership("mm_hide"), null);
    const after = await s.getCell(homeCell);
    strict_1.default.equal(after?.activePlaceCount, 0);
    strict_1.default.notEqual(after?.coverageVersion, versionBefore);
    // Peristiwa invalidasi dicatat.
    strict_1.default.ok(s.listInvalidationEvents().some((e) => e.placeId === "mm_hide"));
});
// 20. Restore mengindeks semula.
(0, node_test_1.default)("20. restore mengindeks semula keahlian", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_restore", location: fixtures_1.CENTER });
    const v = (0, fixtures_1.makePublication)(place);
    const args = {
        publicationHead: (0, fixtures_1.head)("mm_restore", v.publicationId),
        publicationVersion: v,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    };
    await s.indexPublishedPlaceIntoCoverage(args);
    await s.removePlaceFromCoverage({
        placeId: "mm_restore",
        reason: "hidden",
        actor: fixtures_1.ADMIN,
        now: fixtures_1.T + 1000,
    });
    strict_1.default.equal(await s.getMembership("mm_restore"), null);
    const r = await s.reindexPlaceCoverage({ ...args, reason: "restored" });
    strict_1.default.equal(r.indexed, true);
    strict_1.default.ok(await s.getMembership("mm_restore"));
    const cell = await s.getCell(r.membership.homeCellId);
    strict_1.default.deepEqual(cell?.publishedPlaceIds, ["mm_restore"]);
});
(0, node_test_1.default)("penerbitan yang menjadi tidak layak MEMBUANG keahlian sedia ada", async () => {
    const s = store();
    const place = (0, fixtures_1.makePlace)({ placeId: "mm_fall", location: fixtures_1.CENTER });
    const v1 = (0, fixtures_1.makePublication)(place);
    await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_fall", v1.publicationId),
        publicationVersion: v1,
        canonicalLocation: fixtures_1.CENTER,
        context: ctx,
        actor: fixtures_1.ADMIN,
    });
    strict_1.default.ok(await s.getMembership("mm_fall"));
    // Penerbitan seterusnya disekat oleh freshness kritikal.
    const blocked = {
        ...v1,
        eligibilitySnapshot: {
            ...v1.eligibilitySnapshot,
            criticalExpiredFieldIds: ["halalEvidence"],
        },
    };
    const r = await s.indexPublishedPlaceIntoCoverage({
        publicationHead: (0, fixtures_1.head)("mm_fall", blocked.publicationId),
        publicationVersion: blocked,
        canonicalLocation: fixtures_1.CENTER,
        context: { now: fixtures_1.T + 2000 },
        actor: fixtures_1.ADMIN,
    });
    strict_1.default.equal(r.indexed, false);
    strict_1.default.equal(await s.getMembership("mm_fall"), null, "keahlian dibuang");
});
// ---- Part E: versi liputan (39-41) ----
// 39. Versi liputan BEBAS SUSUNAN.
(0, node_test_1.default)("39. versi liputan bebas susunan set placeId", () => {
    const a = (0, index_1.coverageVersionFromMembers)([
        { placeId: "p2", publicationId: "x2", publicationVersion: 1 },
        { placeId: "p1", publicationId: "x1", publicationVersion: 1 },
    ]);
    const b = (0, index_1.coverageVersionFromMembers)([
        { placeId: "p1", publicationId: "x1", publicationVersion: 1 },
        { placeId: "p2", publicationId: "x2", publicationVersion: 1 },
    ]);
    strict_1.default.equal(a, b);
});
// 40. Set keahlian sama → versi sama.
(0, node_test_1.default)("40. set keahlian sama mengekalkan versi sama (idempoten)", () => {
    const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
    const v1 = (0, index_1.coverageVersionFromMembers)(members);
    const mutation = {
        kind: "publication_activated",
        placeId: "p1",
        publicationId: "x1",
        publicationVersion: 1,
    };
    const r1 = (0, index_1.calculateCoverageVersion)(v1, mutation, members);
    const r2 = (0, index_1.calculateCoverageVersion)(r1.version, mutation, r1.members);
    strict_1.default.equal(r1.version, v1);
    strict_1.default.equal(r1.changed, false, "mutasi sama = tiada perubahan");
    strict_1.default.equal(r2.version, r1.version);
});
// 41. Set keahlian berubah → versi berubah.
(0, node_test_1.default)("41. set keahlian berubah menukar versi", () => {
    const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
    const before = (0, index_1.coverageVersionFromMembers)(members);
    const added = (0, index_1.applyCoverageMutation)(members, {
        kind: "publication_activated",
        placeId: "p2",
        publicationId: "x2",
        publicationVersion: 1,
    });
    strict_1.default.notEqual((0, index_1.coverageVersionFromMembers)(added), before);
    const removed = (0, index_1.applyCoverageMutation)(members, {
        kind: "place_hidden",
        placeId: "p1",
    });
    strict_1.default.notEqual((0, index_1.coverageVersionFromMembers)(removed), before);
    strict_1.default.equal(removed.length, 0);
    // Versi penerbitan berbeza untuk kedai sama juga menukar versi.
    const bumped = (0, index_1.applyCoverageMutation)(members, {
        kind: "publication_activated",
        placeId: "p1",
        publicationId: "x1b",
        publicationVersion: 2,
    });
    strict_1.default.notEqual((0, index_1.coverageVersionFromMembers)(bumped), before);
});
(0, node_test_1.default)("versi bukan wall-clock: dikira semula memberi nilai sama", () => {
    const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
    strict_1.default.equal((0, index_1.coverageVersionFromMembers)(members), (0, index_1.coverageVersionFromMembers)(members));
});
(0, node_test_1.default)("versi kolam gabungan bebas susunan sel", () => {
    const a = (0, index_1.combinedCoverageVersion)({ c1: "v1", c2: "v2" });
    const b = (0, index_1.combinedCoverageVersion)({ c2: "v2", c1: "v1" });
    strict_1.default.equal(a, b);
    strict_1.default.notEqual(a, (0, index_1.combinedCoverageVersion)({ c1: "v1", c2: "v3" }));
});
(0, node_test_1.default)("mutasi hidden/closed/merge membuang ahli", () => {
    const members = [{ placeId: "p1", publicationId: "x1", publicationVersion: 1 }];
    for (const kind of [
        "place_hidden",
        "place_permanently_closed",
        "merge_executed",
        "critical_freshness_blocked",
    ]) {
        strict_1.default.equal((0, index_1.applyCoverageMutation)(members, { kind, placeId: "p1" }).length, 0, kind);
    }
});
