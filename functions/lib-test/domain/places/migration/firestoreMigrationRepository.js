"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreMigrationStore = void 0;
const migrationPlan_1 = require("./migrationPlan");
const C_INVENTORY = "place_migration_inventory";
const C_CANDIDATES = "place_migration_candidates";
const C_PLANS = "place_migration_plans";
const C_CHECKPOINTS = "place_migration_checkpoints";
const C_ALIASES = "place_migration_aliases";
const C_AUDIT = "place_migration_audit";
const C_COMPARISONS = "place_read_comparisons";
const C_MARKERS = "migration_completion_markers";
const C_EMU_CANONICAL = "place_migration_emulator_canonical";
const C_ROLLBACK = "place_migration_rollback_plans";
function toPlain(value) {
    return JSON.parse(JSON.stringify(value));
}
class FirestoreMigrationStore {
    db;
    emulatorOnly = true;
    constructor(db) {
        this.db = db;
    }
    // --- Inventori -----------------------------------------------------------
    async saveInventory(records) {
        const batch = this.db.batch();
        for (const record of records) {
            batch.set(this.db.collection(C_INVENTORY).doc(record.legacyRecordId), toPlain(record));
        }
        await batch.commit();
    }
    async listInventory() {
        const snap = await this.db.collection(C_INVENTORY).get();
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
    }
    async getInventoryRecord(legacyRecordId) {
        const doc = await this.db.collection(C_INVENTORY).doc(legacyRecordId).get();
        return doc.exists ? doc.data() : null;
    }
    // --- Calon ---------------------------------------------------------------
    async saveCandidates(candidates) {
        const batch = this.db.batch();
        for (const candidate of candidates) {
            batch.set(this.db.collection(C_CANDIDATES).doc(candidate.candidateId), toPlain(candidate));
        }
        await batch.commit();
    }
    async listCandidates() {
        const snap = await this.db.collection(C_CANDIDATES).get();
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    }
    async getCandidate(candidateId) {
        const doc = await this.db.collection(C_CANDIDATES).doc(candidateId).get();
        return doc.exists ? doc.data() : null;
    }
    // --- Pelan ---------------------------------------------------------------
    async savePlan(plan) {
        await this.db.collection(C_PLANS).doc(plan.migrationPlanId).set(toPlain(plan));
    }
    async getPlan(migrationPlanId) {
        const doc = await this.db.collection(C_PLANS).doc(migrationPlanId).get();
        return doc.exists ? doc.data() : null;
    }
    async listPlans() {
        const snap = await this.db.collection(C_PLANS).get();
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) => a.migrationPlanId.localeCompare(b.migrationPlanId));
    }
    async approveForEmulator(migrationPlanId, approvedBy, at) {
        const ref = this.db.collection(C_PLANS).doc(migrationPlanId);
        const doc = await ref.get();
        if (!doc.exists)
            return null;
        const plan = doc.data();
        if (!(0, migrationPlan_1.canTransitionPlan)(plan.status, "approved_for_emulator"))
            return null;
        const updated = {
            ...plan,
            status: "approved_for_emulator",
            approvedBy,
            approvedAt: at,
        };
        await ref.set(toPlain(updated));
        return updated;
    }
    // --- Alias ---------------------------------------------------------------
    async saveAliases(aliases) {
        const batch = this.db.batch();
        for (const alias of aliases) {
            batch.set(this.db.collection(C_ALIASES).doc(alias.aliasId), toPlain(alias));
        }
        await batch.commit();
    }
    async listAliases() {
        const snap = await this.db.collection(C_ALIASES).get();
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) => a.aliasId.localeCompare(b.aliasId));
    }
    async markRolledBack(aliasIds, at) {
        const batch = this.db.batch();
        for (const aliasId of aliasIds) {
            // Kemas kini medan sahaja — dokumen alias TIDAK PERNAH dipadam.
            batch.set(this.db.collection(C_ALIASES).doc(aliasId), { status: "rolled_back", supersededAt: at }, { merge: true });
        }
        await batch.commit();
    }
    // --- Checkpoint ----------------------------------------------------------
    async saveCheckpoint(checkpoint) {
        await this.db
            .collection(C_CHECKPOINTS)
            .doc(checkpoint.checkpointId)
            .set(toPlain(checkpoint));
    }
    async getCheckpoint(checkpointId) {
        const doc = await this.db.collection(C_CHECKPOINTS).doc(checkpointId).get();
        return doc.exists ? doc.data() : null;
    }
    // --- Rekod canonical emulator --------------------------------------------
    async saveCanonicalRecords(records) {
        const batch = this.db.batch();
        for (const record of records) {
            batch.set(this.db.collection(C_EMU_CANONICAL).doc(record.canonicalPlaceId), toPlain(record));
        }
        await batch.commit();
    }
    async listCanonicalRecords() {
        const snap = await this.db.collection(C_EMU_CANONICAL).get();
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) => a.canonicalPlaceId.localeCompare(b.canonicalPlaceId));
    }
    async deactivateCanonicalRecords(canonicalPlaceIds) {
        const batch = this.db.batch();
        for (const id of canonicalPlaceIds) {
            // Nyahaktif, bukan padam.
            batch.set(this.db.collection(C_EMU_CANONICAL).doc(id), { active: false }, { merge: true });
        }
        await batch.commit();
    }
    async saveRollbackPlan(plan) {
        await this.db
            .collection(C_ROLLBACK)
            .doc(plan.rollbackPlanId)
            .set(toPlain(plan));
    }
    async getRollbackPlan(rollbackPlanId) {
        const doc = await this.db.collection(C_ROLLBACK).doc(rollbackPlanId).get();
        return doc.exists ? doc.data() : null;
    }
    // --- Audit (hanya-tambah melalui create) ---------------------------------
    async appendAudit(entries) {
        for (const entry of entries) {
            try {
                // `create` gagal jika dokumen wujud — menguatkuasa hanya-tambah.
                await this.db.collection(C_AUDIT).doc(entry.auditId).create(toPlain(entry));
            }
            catch {
                // Entri sedia ada dibiarkan tidak berubah (main semula idempoten).
            }
        }
    }
    async listAudit(migrationPlanId) {
        const snap = await this.db
            .collection(C_AUDIT)
            .where("migrationPlanId", "==", migrationPlanId)
            .get();
        return snap.docs.map((d) => d.data());
    }
    // --- Perbandingan bayangan ----------------------------------------------
    async saveComparisons(comparisons) {
        const batch = this.db.batch();
        for (const comparison of comparisons) {
            const id = `${comparison.placeId}_${comparison.comparedAt}`;
            batch.set(this.db.collection(C_COMPARISONS).doc(id), toPlain(comparison));
        }
        await batch.commit();
    }
    async listComparisons() {
        const snap = await this.db.collection(C_COMPARISONS).get();
        return snap.docs.map((d) => d.data());
    }
    // --- Penanda penyiapan ---------------------------------------------------
    async saveMarker(marker) {
        await this.db.collection(C_MARKERS).doc(marker.markerId).set(toPlain(marker));
    }
    async listMarkers() {
        const snap = await this.db.collection(C_MARKERS).get();
        return snap.docs.map((d) => d.data());
    }
}
exports.FirestoreMigrationStore = FirestoreMigrationStore;
