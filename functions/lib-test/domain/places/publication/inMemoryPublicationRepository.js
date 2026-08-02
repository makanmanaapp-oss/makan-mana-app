"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryPublicationStore = void 0;
const cacheInvalidation_1 = require("./cacheInvalidation");
const publicationAudit_1 = require("./publicationAudit");
const publicationRepository_1 = require("./publicationRepository");
const publicationVersion_1 = require("./publicationVersion");
const publicationRollback_1 = require("./publicationRollback");
const eligibilityConfig_1 = require("./eligibilityConfig");
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
function paginate(ordered, idOf, page) {
    const limit = Math.max(1, Math.min(page.limit, publicationRepository_1.MAX_PUBLICATION_PAGE_LIMIT));
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
class InMemoryPublicationStore {
    clock;
    versions = new Map();
    /** placeId → publicationId[] mengikut susunan cipta. */
    versionsByPlace = new Map();
    heads = new Map();
    rollbacks = new Map();
    rollbacksByPlace = new Map();
    audit = new Map();
    invalidations = new Map();
    invalidationIds = new Set();
    constructor(clock = { now: () => Date.now() }) {
        this.clock = clock;
    }
    // ---------------------------------------------------------------------
    // Versi penerbitan
    // ---------------------------------------------------------------------
    async createPublicationVersion(version, actor) {
        // IDEMPOTENCY (Part M): ID diterbitkan daripada hash kandungan, jadi
        // kandungan yang sama memetakan ke dokumen yang sama.
        const existing = this.versions.get(version.publicationId);
        if (existing)
            return clone(existing);
        // Cegah dua ID berbeza membawa kandungan yang serupa.
        const dup = (this.versionsByPlace.get(version.placeId) ?? [])
            .map((id) => this.versions.get(id))
            .find((v) => v.contentHash === version.contentHash);
        if (dup)
            return clone(dup);
        const issues = (0, publicationVersion_1.validatePublicationVersion)(version);
        if (issues.length > 0) {
            throw new Error(`invalid publication version: ${issues.join(",")}`);
        }
        const stored = clone(version);
        this.versions.set(stored.publicationId, stored);
        const list = this.versionsByPlace.get(stored.placeId) ?? [];
        list.push(stored.publicationId);
        this.versionsByPlace.set(stored.placeId, list);
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(stored.placeId, "publication_created", stored.createdAt, stored.publicationId),
            placeId: stored.placeId,
            action: "publication_created",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            nextState: stored.publicationStatus,
            reasonCode: "publication_created",
            publicationId: stored.publicationId,
            createdAt: stored.createdAt,
        });
        await this.appendInvalidationEvent((0, cacheInvalidation_1.buildCacheInvalidationEvent)({
            placeId: stored.placeId,
            reason: "publication_created",
            createdAt: stored.createdAt,
            algorithmVersion: stored.algorithmVersion,
            publicationVersion: stored.versionNumber,
        }));
        return clone(stored);
    }
    async getPublicationVersion(publicationId) {
        const v = this.versions.get(publicationId);
        return v ? clone(v) : null;
    }
    async listVersionsByPlace(placeId, page) {
        const ordered = (this.versionsByPlace.get(placeId) ?? [])
            .map((id) => this.versions.get(id))
            .sort((a, b) => b.versionNumber - a.versionNumber); // terbaharu dahulu
        return paginate(ordered, (v) => v.publicationId, page);
    }
    async nextVersionNumber(placeId) {
        const ids = this.versionsByPlace.get(placeId) ?? [];
        let max = 0;
        for (const id of ids) {
            const v = this.versions.get(id);
            if (v.versionNumber > max)
                max = v.versionNumber;
        }
        return max + 1;
    }
    async getActiveHead(placeId) {
        const h = this.heads.get(placeId);
        return h ? clone(h) : null;
    }
    async setEmulatorActivePublication(placeId, publicationId, actor, reasonCode) {
        const version = this.versions.get(publicationId);
        if (!version)
            throw new Error(`publication not found: ${publicationId}`);
        if (version.placeId !== placeId) {
            throw new Error(`publication ${publicationId} does not belong to ${placeId}`);
        }
        const now = this.clock.now();
        const previous = this.heads.get(placeId);
        const head = {
            placeId,
            activePublicationId: publicationId,
            activeVersionNumber: version.versionNumber,
            updatedAt: now,
            updatedBy: actor.actorUid,
            reasonCode,
        };
        this.heads.set(placeId, head);
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(placeId, "publication_head_moved", now, publicationId),
            placeId,
            action: "publication_head_moved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: previous?.activePublicationId,
            nextState: publicationId,
            reasonCode,
            publicationId,
            createdAt: now,
        });
        return clone(head);
    }
    // ---------------------------------------------------------------------
    // Rollback — TIDAK PERNAH memadam versi lebih baharu
    // ---------------------------------------------------------------------
    async requestRollback(params) {
        const { placeId, fromPublicationId, targetPublicationId, actor } = params;
        const target = this.versions.get(targetPublicationId);
        if (!target)
            throw new Error(`target publication not found: ${targetPublicationId}`);
        if (target.placeId !== placeId) {
            throw new Error(`target publication does not belong to ${placeId}`);
        }
        if (!this.versions.has(fromPublicationId)) {
            throw new Error(`source publication not found: ${fromPublicationId}`);
        }
        const now = this.clock.now();
        // ID deterministik → permintaan berulang idempoten.
        const id = `rbk_${(0, publicationVersion_1.computePublicationContentHash)({
            placeId,
            snapshot: { place: target.snapshot.place },
            sourceCanonicalVersion: `${fromPublicationId}->${targetPublicationId}`,
            algorithmVersion: eligibilityConfig_1.PUBLICATION_ALGORITHM_VERSION,
            configVersion: target.configVersion,
        }).slice(0, 32)}`;
        const existing = this.rollbacks.get(id);
        if (existing)
            return clone(existing);
        const auditEntry = {
            auditId: `${id}_a0`,
            rollbackId: id,
            action: "rollback_requested",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            nextStatus: "requested",
            notes: params.notes,
            createdAt: now,
        };
        const rollback = {
            rollbackId: id,
            placeId,
            fromPublicationId,
            targetPublicationId,
            requestedBy: actor.actorUid,
            reasonCode: params.reasonCode,
            notes: params.notes,
            requestedAt: now,
            status: "requested",
            auditEntries: [auditEntry],
        };
        this.rollbacks.set(id, rollback);
        const list = this.rollbacksByPlace.get(placeId) ?? [];
        list.push(id);
        this.rollbacksByPlace.set(placeId, list);
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(placeId, "rollback_requested", now, id),
            placeId,
            action: "rollback_requested",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            nextState: "requested",
            reasonCode: params.reasonCode,
            publicationId: targetPublicationId,
            createdAt: now,
        });
        return clone(rollback);
    }
    async getRollback(rollbackId) {
        const r = this.rollbacks.get(rollbackId);
        return r ? clone(r) : null;
    }
    async approveRollback(rollbackId, actor) {
        const r = this.rollbacks.get(rollbackId);
        if (!r)
            throw new Error(`rollback not found: ${rollbackId}`);
        if (r.status === "approved")
            return clone(r); // idempoten
        (0, publicationRollback_1.assertValidRollbackTransition)(r.status, "approved");
        const now = this.clock.now();
        r.approvedBy = actor.actorUid;
        r.status = "approved";
        r.auditEntries.push({
            auditId: `${rollbackId}_a${r.auditEntries.length}`,
            rollbackId,
            action: "rollback_approved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousStatus: "requested",
            nextStatus: "approved",
            createdAt: now,
        });
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(r.placeId, "rollback_approved", now, rollbackId),
            placeId: r.placeId,
            action: "rollback_approved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: "requested",
            nextState: "approved",
            reasonCode: r.reasonCode,
            createdAt: now,
        });
        return clone(r);
    }
    /**
     * Laksanakan rollback: cipta versi BAHARU yang membawa snapshot lama, dan
     * pindahkan penunjuk aktif emulator. Versi yang lebih baharu KEKAL wujud
     * (ditanda superseded) — tiada pemadaman sejarah.
     */
    async executeRollbackInEmulator(rollbackId, actor) {
        const r = this.rollbacks.get(rollbackId);
        if (!r)
            throw new Error(`rollback not found: ${rollbackId}`);
        // IDEMPOTEN: pelaksanaan kedua tidak mencipta versi tambahan.
        if (r.status === "executed_in_emulator")
            return clone(r);
        (0, publicationRollback_1.assertValidRollbackTransition)(r.status, "executed_in_emulator");
        const target = this.versions.get(r.targetPublicationId);
        if (!target)
            throw new Error(`target publication missing: ${r.targetPublicationId}`);
        const now = this.clock.now();
        const versionNumber = await this.nextVersionNumber(r.placeId);
        const snapshot = clone(target.snapshot);
        const contentInput = {
            placeId: r.placeId,
            snapshot,
            // Bezakan daripada versi asal supaya hash BERBEZA — ini rekod baharu,
            // bukan pendua versi lama.
            sourceCanonicalVersion: `rollback:${r.rollbackId}:${target.sourceCanonicalVersion}`,
            algorithmVersion: target.algorithmVersion,
            configVersion: target.configVersion,
        };
        const restored = {
            publicationId: (0, publicationVersion_1.publicationIdFromContent)(contentInput),
            placeId: r.placeId,
            versionNumber,
            sourceCanonicalVersion: contentInput.sourceCanonicalVersion,
            snapshot,
            publicationStatus: "published",
            publishedBy: actor.actorUid,
            publishedAt: now,
            effectiveFrom: now,
            supersedesPublicationId: r.fromPublicationId,
            rollbackOfPublicationId: r.targetPublicationId,
            eligibilitySnapshot: clone(target.eligibilitySnapshot),
            warnings: [...target.warnings],
            changeSummary: ["rollback_restore"],
            contentHash: (0, publicationVersion_1.computePublicationContentHash)(contentInput),
            algorithmVersion: target.algorithmVersion,
            configVersion: target.configVersion,
            createdAt: now,
        };
        await this.createPublicationVersion(restored, actor);
        // Tanda versi terdahulu sebagai superseded — TIDAK dipadam.
        const from = this.versions.get(r.fromPublicationId);
        if (from) {
            from.publicationStatus = "superseded";
            from.effectiveUntil = now;
        }
        await this.setEmulatorActivePublication(r.placeId, restored.publicationId, actor, "rollback_executed");
        r.status = "executed_in_emulator";
        r.executedAt = now;
        r.resultingPublicationId = restored.publicationId;
        r.auditEntries.push({
            auditId: `${rollbackId}_a${r.auditEntries.length}`,
            rollbackId,
            action: "rollback_executed",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousStatus: "approved",
            nextStatus: "executed_in_emulator",
            createdAt: now,
        });
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(r.placeId, "rollback_executed", now, rollbackId),
            placeId: r.placeId,
            action: "rollback_executed",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: r.fromPublicationId,
            nextState: restored.publicationId,
            reasonCode: r.reasonCode,
            publicationId: restored.publicationId,
            createdAt: now,
        });
        await this.appendInvalidationEvent((0, cacheInvalidation_1.buildCacheInvalidationEvent)({
            placeId: r.placeId,
            reason: "rollback_executed",
            createdAt: now,
            algorithmVersion: restored.algorithmVersion,
            publicationVersion: restored.versionNumber,
        }));
        return clone(r);
    }
    async listRollbacksByPlace(placeId, page) {
        const ordered = (this.rollbacksByPlace.get(placeId) ?? []).map((id) => this.rollbacks.get(id));
        return paginate(ordered, (r) => r.rollbackId, page);
    }
    // ---------------------------------------------------------------------
    // Audit & invalidasi — append-only
    // ---------------------------------------------------------------------
    async appendStatusAudit(entry) {
        const list = this.audit.get(entry.placeId) ?? [];
        if (!list.some((e) => e.auditId === entry.auditId))
            list.push(clone(entry));
        this.audit.set(entry.placeId, list);
        return clone(entry);
    }
    async listStatusAudit(placeId, page) {
        return paginate(this.audit.get(placeId) ?? [], (e) => e.auditId, page);
    }
    async appendInvalidationEvent(event) {
        if (this.invalidationIds.has(event.eventId))
            return clone(event); // idempoten
        this.invalidationIds.add(event.eventId);
        const list = this.invalidations.get(event.placeId) ?? [];
        list.push(clone(event));
        this.invalidations.set(event.placeId, list);
        return clone(event);
    }
    async listInvalidationEvents(placeId, page) {
        return paginate(this.invalidations.get(placeId) ?? [], (e) => e.eventId, page);
    }
}
exports.InMemoryPublicationStore = InMemoryPublicationStore;
