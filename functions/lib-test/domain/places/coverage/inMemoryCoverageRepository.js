"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryCoverageStore = void 0;
const cacheInvalidation_1 = require("../publication/cacheInvalidation");
const areaCache_1 = require("./areaCache");
const coverageCell_1 = require("./coverageCell");
const coverageMembership_1 = require("./coverageMembership");
const coverageIndexing_1 = require("./coverageIndexing");
const coverageVersion_1 = require("./coverageVersion");
const discoveryQueue_1 = require("./discoveryQueue");
const coverageRepository_1 = require("./coverageRepository");
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
function paginate(ordered, idOf, page) {
    const limit = Math.max(1, Math.min(page.limit, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT));
    let list = ordered;
    if (page.cursor) {
        const idx = list.findIndex((v) => idOf(v) === page.cursor);
        list = idx >= 0 ? list.slice(idx + 1) : list;
    }
    const slice = list.slice(0, limit);
    return {
        items: slice.map(clone),
        nextCursor: list.length > limit ? idOf(slice[slice.length - 1]) : undefined,
    };
}
class InMemoryCoverageStore {
    clock;
    cells = new Map();
    /** placeId → keahlian kanonikal (SATU per kedai). */
    memberships = new Map();
    metrics = new Map();
    queue = new Map();
    queueOrder = [];
    cache = new Map();
    /** Snapshot penerbitan aktif yang didaftarkan (disuntik oleh Phase 1.6). */
    publications = new Map();
    invalidations = [];
    constructor(clock = { now: () => Date.now() }) {
        this.clock = clock;
    }
    // ---- Sokongan ujian: daftar penerbitan aktif ----
    registerActivePublication(v) {
        this.publications.set(v.placeId, clone(v));
    }
    unregisterActivePublication(placeId) {
        this.publications.delete(placeId);
    }
    listInvalidationEvents() {
        return this.invalidations.map(clone);
    }
    // ---------------------------------------------------------------------
    // Sel liputan
    // ---------------------------------------------------------------------
    async getCell(cellId) {
        const c = this.cells.get(cellId);
        return c ? clone(c) : null;
    }
    async upsertCell(cell, _actor) {
        this.cells.set(cell.cellId, clone(cell));
        return clone(cell);
    }
    async getCellsBounded(cellIds) {
        const bounded = cellIds.slice(0, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT);
        return bounded
            .map((id) => this.cells.get(id))
            .filter((c) => c !== undefined)
            .map(clone);
    }
    async getCoverageVersions(cellIds) {
        const out = {};
        for (const id of cellIds.slice(0, coverageRepository_1.MAX_COVERAGE_PAGE_LIMIT)) {
            out[id] = this.cells.get(id)?.coverageVersion ?? coverageVersion_1.EMPTY_COVERAGE_VERSION;
        }
        return out;
    }
    /** Ahli versi bagi satu sel (daripada keahlian semasa). */
    membersOfCell(cellId) {
        const out = [];
        for (const m of this.memberships.values()) {
            if (m.eligibilityState === "blocked")
                continue;
            if (m.searchableCellIds.includes(cellId)) {
                out.push({
                    placeId: m.placeId,
                    publicationId: m.publicationId,
                    publicationVersion: m.publicationVersion,
                });
            }
        }
        return out;
    }
    /** Kira semula sel yang terjejas selepas keahlian berubah. */
    async recomputeCells(cellIds, now, actor) {
        const versions = {};
        let changed = false;
        for (const cellId of cellIds) {
            const members = this.membersOfCell(cellId);
            const version = (0, coverageVersion_1.coverageVersionFromMembers)(members);
            const existing = this.cells.get(cellId);
            const previous = existing?.coverageVersion;
            if (previous !== version)
                changed = true;
            const base = existing ?? (0, coverageCell_1.makeEmptyCoverageCell)(cellId, now, version);
            const placeIds = members.map((m) => m.placeId).sort();
            // Metrik kategori/masakan daripada penerbitan aktif ahli.
            const categoryCoverage = {};
            const cuisineCoverage = {};
            const sourceCoverage = {};
            for (const m of members) {
                const v = this.publications.get(m.placeId);
                if (!v)
                    continue;
                for (const t of v.snapshot.place.tagSet.tags) {
                    if (t.family === "place_type") {
                        categoryCoverage[t.tagId] = (categoryCoverage[t.tagId] ?? 0) + 1;
                    }
                    else if (t.family === "cuisine") {
                        cuisineCoverage[t.tagId] = (cuisineCoverage[t.tagId] ?? 0) + 1;
                    }
                }
                for (const ref of v.snapshot.place.providerRefs) {
                    sourceCoverage[ref.sourceType] = (sourceCoverage[ref.sourceType] ?? 0) + 1;
                }
            }
            const updated = {
                ...base,
                coverageVersion: version,
                activePlaceCount: placeIds.length,
                publishedPlaceIds: placeIds,
                categoryCoverage,
                cuisineCoverage,
                sourceCoverage,
                updatedAt: now,
            };
            this.cells.set(cellId, updated);
            versions[cellId] = version;
        }
        if (changed) {
            // Nota: `actor` disimpan untuk audit masa hadapan; sel emulator tidak
            // menyimpan pelaku per-medan dalam fasa ini.
            void actor;
        }
        return { changed, versions };
    }
    appendInvalidation(placeId, reason, now, publicationVersion) {
        const ev = (0, cacheInvalidation_1.buildCacheInvalidationEvent)({
            placeId,
            reason,
            createdAt: now,
            algorithmVersion: coverageVersion_1.COVERAGE_ALGORITHM_VERSION,
            publicationVersion,
        });
        if (!this.invalidations.some((e) => e.eventId === ev.eventId)) {
            this.invalidations.push(ev);
        }
    }
    // ---------------------------------------------------------------------
    // Keahlian
    // ---------------------------------------------------------------------
    async upsertMembership(membership, _actor) {
        const existing = this.memberships.get(membership.placeId);
        // IDEMPOTEN: kandungan sama → kekalkan rekod asal (indexedAt tidak berubah).
        if (existing && existing.contentHash === membership.contentHash) {
            return clone(existing);
        }
        this.memberships.set(membership.placeId, clone(membership));
        return clone(membership);
    }
    async getMembership(placeId) {
        const m = this.memberships.get(placeId);
        return m ? clone(m) : null;
    }
    async listMembershipsByCell(cellId, page) {
        const ordered = [...this.memberships.values()]
            .filter((m) => m.searchableCellIds.includes(cellId))
            .sort((a, b) => (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0));
        return paginate(ordered, (m) => (0, coverageMembership_1.membershipId)(m.placeId), page);
    }
    async listMembershipsByCells(cellIds) {
        const set = new Set(cellIds);
        return [...this.memberships.values()]
            .filter((m) => m.searchableCellIds.some((c) => set.has(c)))
            .sort((a, b) => (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0))
            .map(clone);
    }
    async removeMembership(placeId, reason, actor) {
        const existing = this.memberships.get(placeId);
        if (!existing)
            return;
        const affected = [...existing.searchableCellIds];
        this.memberships.delete(placeId);
        const now = this.clock.now();
        await this.recomputeCells(affected, now, actor);
        this.appendInvalidation(placeId, mapReasonToInvalidation(reason), now);
        // Sejarah PENERBITAN kekal — kami hanya membuang keahlian liputan.
    }
    // ---------------------------------------------------------------------
    // Perkhidmatan pengindeksan (Part F & G)
    // ---------------------------------------------------------------------
    async indexPublishedPlaceIntoCoverage(params) {
        const { publicationHead, publicationVersion, canonicalLocation, context, actor } = params;
        const decision = (0, coverageIndexing_1.evaluateIndexingDecision)(publicationHead
            ? {
                placeId: publicationHead.placeId,
                activePublicationId: publicationHead.activePublicationId,
                activeVersionNumber: publicationVersion.versionNumber,
                updatedAt: context.now,
                updatedBy: actor.actorUid,
                reasonCode: "publish",
            }
            : null, publicationVersion, canonicalLocation, context);
        if (!decision.indexable) {
            // Jika kedai ini pernah diindeks, keahliannya mesti DIBUANG.
            const existed = this.memberships.get(publicationVersion.placeId);
            if (existed) {
                await this.removeMembership(publicationVersion.placeId, "publication_superseded", actor);
            }
            return {
                indexed: false,
                denyReasons: [...decision.denyReasons],
                affectedCellIds: [],
                coverageVersionChanged: existed !== undefined,
            };
        }
        const previous = this.memberships.get(publicationVersion.placeId);
        const previousCells = previous ? [...previous.searchableCellIds] : [];
        // Bina keahlian; versi liputan diisi selepas pengiraan semula sel.
        const draft = (0, coverageIndexing_1.buildMembership)(publicationVersion, canonicalLocation, decision, context, previous?.coverageVersion ?? coverageVersion_1.EMPTY_COVERAGE_VERSION);
        // IDEMPOTEN: kandungan sama → tiada perubahan langsung.
        if (previous && previous.contentHash === draft.contentHash) {
            return {
                indexed: true,
                denyReasons: [],
                membership: clone(previous),
                affectedCellIds: previousCells,
                previousCoverageVersion: previous.coverageVersion,
                coverageVersion: previous.coverageVersion,
                coverageVersionChanged: false,
            };
        }
        this.memberships.set(draft.placeId, clone(draft));
        this.registerActivePublication(publicationVersion);
        // Sel yang terjejas = sel lama (bila berpindah) + sel baharu.
        const affectedCellIds = Array.from(new Set([...previousCells, ...draft.searchableCellIds]));
        const now = context.now;
        const { changed, versions } = await this.recomputeCells(affectedCellIds, now, actor);
        // Simpan versi liputan sel RUMAH ke dalam keahlian.
        const homeVersion = versions[draft.homeCellId] ?? coverageVersion_1.EMPTY_COVERAGE_VERSION;
        const stored = { ...draft, coverageVersion: homeVersion };
        this.memberships.set(stored.placeId, clone(stored));
        this.appendInvalidation(stored.placeId, "publication_created", now, publicationVersion.versionNumber);
        return {
            indexed: true,
            denyReasons: [],
            membership: clone(stored),
            affectedCellIds,
            previousCoverageVersion: previous?.coverageVersion,
            coverageVersion: homeVersion,
            coverageVersionChanged: changed,
        };
    }
    async removePlaceFromCoverage(params) {
        const existing = this.memberships.get(params.placeId);
        if (!existing) {
            return {
                indexed: false,
                denyReasons: ["no_membership"],
                affectedCellIds: [],
                coverageVersionChanged: false,
            };
        }
        const affected = [...existing.searchableCellIds];
        const previousVersion = existing.coverageVersion;
        this.memberships.delete(params.placeId);
        this.unregisterActivePublication(params.placeId);
        const { changed, versions } = await this.recomputeCells(affected, params.now, params.actor);
        this.appendInvalidation(params.placeId, mapReasonToInvalidation(params.reason), params.now);
        // Sahkan bahawa mutasi versi konsisten dengan Part E.
        const mutation = coverageIndexing_1.REASON_TO_MUTATION[params.reason];
        void (0, coverageVersion_1.calculateCoverageVersion)(previousVersion, {
            kind: mutation,
            placeId: params.placeId,
        }, []);
        return {
            indexed: false,
            denyReasons: [],
            affectedCellIds: affected,
            previousCoverageVersion: previousVersion,
            coverageVersion: versions[existing.homeCellId],
            coverageVersionChanged: changed,
        };
    }
    async reindexPlaceCoverage(params) {
        // Indeks semula = nilai semula keputusan + kemas kini keahlian.
        // Perpindahan lokasi dikendalikan kerana sel rumah dikira semula.
        return this.indexPublishedPlaceIntoCoverage({
            publicationHead: params.publicationHead,
            publicationVersion: params.publicationVersion,
            canonicalLocation: params.canonicalLocation,
            context: params.context,
            actor: params.actor,
        });
    }
    // ---------------------------------------------------------------------
    // Metrik
    // ---------------------------------------------------------------------
    async putMetrics(metrics, _actor) {
        this.metrics.set(metrics.cellId, clone(metrics));
        return clone(metrics);
    }
    async getMetrics(cellId) {
        const m = this.metrics.get(cellId);
        return m ? clone(m) : null;
    }
    // ---------------------------------------------------------------------
    // Baris gilir discovery
    // ---------------------------------------------------------------------
    async enqueueDiscovery(request, _actor) {
        const existing = this.queue.get(request.requestId);
        if (existing)
            return clone(existing); // IDEMPOTEN
        this.queue.set(request.requestId, clone(request));
        this.queueOrder.push(request.requestId);
        return clone(request);
    }
    async getDiscoveryRequest(requestId) {
        const r = this.queue.get(requestId);
        return r ? clone(r) : null;
    }
    async listQueue(status, page) {
        const ordered = this.queueOrder
            .map((id) => this.queue.get(id))
            .filter((r) => (status ? r.status === status : true));
        return paginate(ordered, (r) => r.requestId, page);
    }
    async transitionDiscoveryStatus(requestId, to, _actor, errorCode) {
        const r = this.queue.get(requestId);
        if (!r)
            throw new Error(`discovery request not found: ${requestId}`);
        (0, discoveryQueue_1.assertValidDiscoveryTransition)(r.status, to);
        r.status = to;
        if (to === "processing")
            r.attemptCount += 1;
        if (errorCode)
            r.lastErrorCode = errorCode;
        return clone(r);
    }
    // ---------------------------------------------------------------------
    // Bacaan penerbitan aktif
    // ---------------------------------------------------------------------
    async getActivePublicationSnapshot(placeId) {
        const v = this.publications.get(placeId);
        return v ? clone(v) : null;
    }
    // ---------------------------------------------------------------------
    // Cache kawasan
    // ---------------------------------------------------------------------
    async getCacheEntry(cacheKey) {
        const e = this.cache.get(cacheKey);
        return e ? clone(e) : null;
    }
    async putCacheEntry(entry, _actor) {
        this.cache.set(entry.cacheKey, clone(entry));
        return clone(entry);
    }
    async invalidateByCoverageVersion(centerCellId, currentPoolVersion) {
        let removed = 0;
        const now = this.clock.now();
        for (const [key, entry] of [...this.cache.entries()]) {
            if (entry.centerCellId !== centerCellId)
                continue;
            if (!(0, areaCache_1.isCacheEntryUsable)(entry, currentPoolVersion, now)) {
                this.cache.delete(key);
                removed++;
            }
        }
        return removed;
    }
}
exports.InMemoryCoverageStore = InMemoryCoverageStore;
function mapReasonToInvalidation(reason) {
    switch (reason) {
        case "publication_superseded":
            return "publication_superseded";
        case "rollback_executed":
            return "rollback_executed";
        case "merge_executed":
            return "merge_executed";
        case "moved":
        case "location_corrected":
            return "location_moved";
        case "tag_set_changed":
            return "tag_set_changed";
        case "critical_freshness_expired":
            return "critical_freshness_expired";
        case "hidden":
        case "restored":
        case "permanently_closed":
        default:
            return "business_status_changed";
    }
}
