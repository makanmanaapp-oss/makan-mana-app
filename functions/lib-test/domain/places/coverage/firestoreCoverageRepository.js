"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreCoverageStore = void 0;
/**
 * Phase 1.7 Part O & P — repository liputan Firestore — UJIAN EMULATOR SAHAJA.
 *
 * TIDAK diimport oleh functions/src/index.ts. Koleksi:
 *   food_coverage_cells/{cellId}
 *   place_coverage_memberships/{membershipId}
 *   coverage_metrics/{cellId}
 *   place_discovery_queue/{requestId}
 *   area_place_cache/{cacheKey}
 *
 * TIADA callable mobile, TIADA panggilan pembekal, TIADA place_registry,
 * TIADA hard delete sejarah penerbitan.
 */
const firestore_1 = require("firebase-admin/firestore");
const areaCache_1 = require("./areaCache");
const coverageCell_1 = require("./coverageCell");
const coverageMembership_1 = require("./coverageMembership");
const coverageVersion_1 = require("./coverageVersion");
const discoveryQueue_1 = require("./discoveryQueue");
const coverageRepository_1 = require("./coverageRepository");
const C_CELLS = "food_coverage_cells";
const C_MEMBERSHIPS = "place_coverage_memberships";
const C_METRICS = "coverage_metrics";
const C_QUEUE = "place_discovery_queue";
const C_CACHE = "area_place_cache";
/** Koleksi penerbitan Phase 1.6 — dibaca SAHAJA di sini. */
const C_PUBLICATIONS = "place_publications";
const C_HEADS = "place_publication_heads";
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
class FirestoreCoverageStore {
    db;
    clock;
    constructor(db, clock = { now: () => Date.now() }) {
        this.db = db;
        this.clock = clock;
    }
    // ---------------------------------------------------------------------
    // Sel
    // ---------------------------------------------------------------------
    async getCell(cellId) {
        const s = await this.db.collection(C_CELLS).doc(cellId).get();
        return s.exists ? s.data() : null;
    }
    async upsertCell(cell, _actor) {
        await this.db.collection(C_CELLS).doc(cell.cellId).set(toPlain(cell), { merge: true });
        return cell;
    }
    async getCellsBounded(cellIds) {
        const bounded = cellIds.slice(0, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT);
        if (bounded.length === 0)
            return [];
        const refs = bounded.map((id) => this.db.collection(C_CELLS).doc(id));
        const snaps = await this.db.getAll(...refs);
        return snaps
            .filter((s) => s.exists)
            .map((s) => s.data());
    }
    async getCoverageVersions(cellIds) {
        const cells = await this.getCellsBounded(cellIds);
        const byId = new Map(cells.map((c) => [c.cellId, c.coverageVersion]));
        const out = {};
        for (const id of cellIds.slice(0, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT)) {
            out[id] = byId.get(id) ?? coverageVersion_1.EMPTY_COVERAGE_VERSION;
        }
        return out;
    }
    /** Kira semula satu sel daripada keahlian sebenar dalam Firestore. */
    async recomputeCell(cellId, actor) {
        const snap = await this.db
            .collection(C_MEMBERSHIPS)
            .where("searchableCellIds", "array-contains", cellId)
            .limit(coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT)
            .get();
        const members = [];
        const categoryCoverage = {};
        const cuisineCoverage = {};
        const sourceCoverage = {};
        for (const d of snap.docs) {
            const m = d.data();
            if (m.eligibilityState === "blocked")
                continue;
            members.push({
                placeId: m.placeId,
                publicationId: m.publicationId,
                publicationVersion: m.publicationVersion,
            });
            const pub = await this.getPublicationById(m.publicationId);
            if (!pub)
                continue;
            for (const t of pub.snapshot.place.tagSet.tags) {
                if (t.family === "place_type") {
                    categoryCoverage[t.tagId] = (categoryCoverage[t.tagId] ?? 0) + 1;
                }
                else if (t.family === "cuisine") {
                    cuisineCoverage[t.tagId] = (cuisineCoverage[t.tagId] ?? 0) + 1;
                }
            }
            for (const ref of pub.snapshot.place.providerRefs) {
                sourceCoverage[ref.sourceType] = (sourceCoverage[ref.sourceType] ?? 0) + 1;
            }
        }
        const now = this.clock.now();
        const version = (0, coverageVersion_1.coverageVersionFromMembers)(members);
        const existing = await this.getCell(cellId);
        const base = existing ?? (0, coverageCell_1.makeEmptyCoverageCell)(cellId, now, version);
        const updated = {
            ...base,
            coverageVersion: version,
            activePlaceCount: members.length,
            publishedPlaceIds: members.map((m) => m.placeId).sort(),
            categoryCoverage,
            cuisineCoverage,
            sourceCoverage,
            updatedAt: now,
        };
        await this.upsertCell(updated, actor);
        return updated;
    }
    // ---------------------------------------------------------------------
    // Keahlian
    // ---------------------------------------------------------------------
    async upsertMembership(membership, _actor) {
        const id = (0, coverageMembership_1.membershipId)(membership.placeId);
        const ref = this.db.collection(C_MEMBERSHIPS).doc(id);
        const existing = await ref.get();
        if (existing.exists) {
            const prev = existing.data();
            // IDEMPOTEN: kandungan sama → tiada tulisan semula.
            if (prev.contentHash === membership.contentHash)
                return prev;
        }
        await ref.set(toPlain(membership));
        return membership;
    }
    async getMembership(placeId) {
        const s = await this.db.collection(C_MEMBERSHIPS).doc((0, coverageMembership_1.membershipId)(placeId)).get();
        return s.exists ? s.data() : null;
    }
    async listMembershipsByCell(cellId, page) {
        const limit = Math.max(1, Math.min(page.limit, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT));
        let q = this.db
            .collection(C_MEMBERSHIPS)
            .where("searchableCellIds", "array-contains", cellId)
            .orderBy(firestore_1.FieldPath.documentId());
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    async listMembershipsByCells(cellIds) {
        const seen = new Map();
        for (const cellId of cellIds.slice(0, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT)) {
            const page = await this.listMembershipsByCell(cellId, {
                limit: coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT,
            });
            for (const m of page.items)
                seen.set(m.placeId, m);
        }
        return [...seen.values()].sort((a, b) => a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0);
    }
    /**
     * Buang keahlian liputan. Sejarah PENERBITAN (place_publications) TIDAK
     * disentuh — hanya indeks liputan dialih keluar.
     */
    async removeMembership(placeId, _reason, actor) {
        const existing = await this.getMembership(placeId);
        if (!existing)
            return;
        await this.db.collection(C_MEMBERSHIPS).doc((0, coverageMembership_1.membershipId)(placeId)).delete();
        for (const cellId of existing.searchableCellIds) {
            await this.recomputeCell(cellId, actor);
        }
    }
    // ---------------------------------------------------------------------
    // Metrik
    // ---------------------------------------------------------------------
    async putMetrics(metrics, _actor) {
        await this.db.collection(C_METRICS).doc(metrics.cellId).set(toPlain(metrics));
        return metrics;
    }
    async getMetrics(cellId) {
        const s = await this.db.collection(C_METRICS).doc(cellId).get();
        return s.exists ? s.data() : null;
    }
    // ---------------------------------------------------------------------
    // Baris gilir discovery
    // ---------------------------------------------------------------------
    async enqueueDiscovery(request, _actor) {
        const ref = this.db.collection(C_QUEUE).doc(request.requestId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data(); // IDEMPOTEN
        await ref.create(toPlain(request));
        return request;
    }
    async getDiscoveryRequest(requestId) {
        const s = await this.db.collection(C_QUEUE).doc(requestId).get();
        return s.exists ? s.data() : null;
    }
    async listQueue(status, page) {
        const limit = Math.max(1, Math.min(page.limit, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT));
        let q = this.db.collection(C_QUEUE).orderBy(firestore_1.FieldPath.documentId());
        if (status) {
            q = this.db
                .collection(C_QUEUE)
                .where("status", "==", status)
                .orderBy(firestore_1.FieldPath.documentId());
        }
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    async transitionDiscoveryStatus(requestId, to, _actor, errorCode) {
        const r = await this.getDiscoveryRequest(requestId);
        if (!r)
            throw new Error(`discovery request not found: ${requestId}`);
        (0, discoveryQueue_1.assertValidDiscoveryTransition)(r.status, to);
        r.status = to;
        if (to === "processing")
            r.attemptCount += 1;
        if (errorCode)
            r.lastErrorCode = errorCode;
        await this.db.collection(C_QUEUE).doc(requestId).set(toPlain(r));
        return r;
    }
    // ---------------------------------------------------------------------
    // Bacaan penerbitan aktif (Phase 1.6 — BACA SAHAJA)
    // ---------------------------------------------------------------------
    async getPublicationById(publicationId) {
        const s = await this.db.collection(C_PUBLICATIONS).doc(publicationId).get();
        return s.exists ? s.data() : null;
    }
    async getActivePublicationSnapshot(placeId) {
        const head = await this.db.collection(C_HEADS).doc(placeId).get();
        if (!head.exists)
            return null;
        const activeId = head.data()
            .activePublicationId;
        if (!activeId)
            return null;
        return this.getPublicationById(activeId);
    }
    // ---------------------------------------------------------------------
    // Cache kawasan
    // ---------------------------------------------------------------------
    async getCacheEntry(cacheKey) {
        const s = await this.db.collection(C_CACHE).doc(cacheKey).get();
        return s.exists ? s.data() : null;
    }
    async putCacheEntry(entry, _actor) {
        await this.db.collection(C_CACHE).doc(entry.cacheKey).set(toPlain(entry));
        return entry;
    }
    async invalidateByCoverageVersion(centerCellId, currentPoolVersion) {
        const snap = await this.db
            .collection(C_CACHE)
            .where("centerCellId", "==", centerCellId)
            .limit(coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT)
            .get();
        const now = this.clock.now();
        let removed = 0;
        for (const d of snap.docs) {
            const e = d.data();
            if (!(0, areaCache_1.isCacheEntryUsable)(e, currentPoolVersion, now)) {
                await d.ref.delete();
                removed++;
            }
        }
        return removed;
    }
}
exports.FirestoreCoverageStore = FirestoreCoverageStore;
