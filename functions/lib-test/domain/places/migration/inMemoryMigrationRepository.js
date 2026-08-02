"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryMigrationStore = void 0;
const migrationPlan_1 = require("./migrationPlan");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
class InMemoryMigrationStore {
    emulatorOnly = true;
    inventory = new Map();
    candidates = new Map();
    plans = new Map();
    aliases = new Map();
    checkpoints = new Map();
    canonicalRecords = new Map();
    rollbackPlans = new Map();
    auditEntries = [];
    comparisons = [];
    markers = new Map();
    reset() {
        this.inventory.clear();
        this.candidates.clear();
        this.plans.clear();
        this.aliases.clear();
        this.checkpoints.clear();
        this.canonicalRecords.clear();
        this.rollbackPlans.clear();
        this.auditEntries = [];
        this.comparisons = [];
        this.markers.clear();
    }
    // --- Inventori (baca sahaja bagi data legasi sebenar) ---------------------
    async saveInventory(records) {
        for (const record of records) {
            this.inventory.set(record.legacyRecordId, clone(record));
        }
    }
    async listInventory() {
        return [...this.inventory.values()]
            .map(clone)
            .sort((a, b) => a.legacyRecordId.localeCompare(b.legacyRecordId));
    }
    async getInventoryRecord(legacyRecordId) {
        const found = this.inventory.get(legacyRecordId);
        return found ? clone(found) : null;
    }
    // --- Calon ---------------------------------------------------------------
    async saveCandidates(candidates) {
        for (const candidate of candidates) {
            this.candidates.set(candidate.candidateId, clone(candidate));
        }
    }
    async listCandidates() {
        return [...this.candidates.values()]
            .map(clone)
            .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    }
    async getCandidate(candidateId) {
        const found = this.candidates.get(candidateId);
        return found ? clone(found) : null;
    }
    // --- Pelan ---------------------------------------------------------------
    async savePlan(plan) {
        this.plans.set(plan.migrationPlanId, clone(plan));
    }
    async getPlan(migrationPlanId) {
        const found = this.plans.get(migrationPlanId);
        return found ? clone(found) : null;
    }
    async listPlans() {
        return [...this.plans.values()]
            .map(clone)
            .sort((a, b) => a.migrationPlanId.localeCompare(b.migrationPlanId));
    }
    async approveForEmulator(migrationPlanId, approvedBy, at) {
        const plan = this.plans.get(migrationPlanId);
        if (!plan)
            return null;
        if (!(0, migrationPlan_1.canTransitionPlan)(plan.status, "approved_for_emulator"))
            return null;
        const updated = {
            ...clone(plan),
            status: "approved_for_emulator",
            approvedBy,
            approvedAt: at,
        };
        this.plans.set(migrationPlanId, updated);
        return clone(updated);
    }
    // --- Alias ---------------------------------------------------------------
    async saveAliases(aliases) {
        for (const alias of aliases) {
            this.aliases.set(alias.aliasId, clone(alias));
        }
    }
    async listAliases() {
        return [...this.aliases.values()]
            .map(clone)
            .sort((a, b) => a.aliasId.localeCompare(b.aliasId));
    }
    async markRolledBack(aliasIds, at) {
        for (const aliasId of aliasIds) {
            const alias = this.aliases.get(aliasId);
            // Tandakan sahaja — alias tidak pernah dibuang daripada stor.
            if (alias) {
                this.aliases.set(aliasId, {
                    ...alias,
                    status: "rolled_back",
                    supersededAt: at,
                });
            }
        }
    }
    // --- Checkpoint ----------------------------------------------------------
    async saveCheckpoint(checkpoint) {
        this.checkpoints.set(checkpoint.checkpointId, clone(checkpoint));
    }
    async getCheckpoint(checkpointId) {
        const found = this.checkpoints.get(checkpointId);
        return found ? clone(found) : null;
    }
    // --- Rekod canonical emulator --------------------------------------------
    async saveCanonicalRecords(records) {
        for (const record of records) {
            this.canonicalRecords.set(record.canonicalPlaceId, clone(record));
        }
    }
    async listCanonicalRecords() {
        return [...this.canonicalRecords.values()]
            .map(clone)
            .sort((a, b) => a.canonicalPlaceId.localeCompare(b.canonicalPlaceId));
    }
    async deactivateCanonicalRecords(canonicalPlaceIds) {
        for (const id of canonicalPlaceIds) {
            const record = this.canonicalRecords.get(id);
            // Nyahaktif, bukan padam — rollback kekal boleh diaudit.
            if (record)
                this.canonicalRecords.set(id, { ...record, active: false });
        }
    }
    async saveRollbackPlan(plan) {
        this.rollbackPlans.set(plan.rollbackPlanId, clone(plan));
    }
    async getRollbackPlan(rollbackPlanId) {
        const found = this.rollbackPlans.get(rollbackPlanId);
        return found ? clone(found) : null;
    }
    // --- Audit (hanya-tambah) ------------------------------------------------
    async appendAudit(entries) {
        for (const entry of entries) {
            if (this.auditEntries.some((e) => e.auditId === entry.auditId))
                continue;
            this.auditEntries.push(clone(entry));
        }
    }
    async listAudit(migrationPlanId) {
        return this.auditEntries
            .filter((e) => e.migrationPlanId === migrationPlanId)
            .map(clone);
    }
    // --- Perbandingan bayangan ----------------------------------------------
    async saveComparisons(comparisons) {
        this.comparisons.push(...comparisons.map(clone));
    }
    async listComparisons() {
        return this.comparisons.map(clone);
    }
    // --- Penanda penyiapan ---------------------------------------------------
    async saveMarker(marker) {
        this.markers.set(marker.markerId, clone(marker));
    }
    async listMarkers() {
        return [...this.markers.values()].map(clone);
    }
}
exports.InMemoryMigrationStore = InMemoryMigrationStore;
