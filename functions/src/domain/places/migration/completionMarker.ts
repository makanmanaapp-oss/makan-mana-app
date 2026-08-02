/**
 * Phase 1.12 Part O — penanda penyiapan migrasi.
 *
 * Penanda mendakwa "migrasi ini selesai untuk persekitaran ini". Dalam fasa
 * ini HANYA `emulator_complete` boleh dicipta. Mencipta penanda produksi
 * bermakna berbohong tentang keadaan sistem, jadi ia ditolak secara keras.
 */
import { EpochMillis } from "../common";
import { hashCanonical } from "../staging/hashing";
import {
  CompletionMarkerStatus,
  FORBIDDEN_MARKER_STATUSES,
} from "./migrationTypes";

export const MIGRATION_ENVIRONMENTS = ["emulator", "qa", "production"] as const;
export type MigrationEnvironment = (typeof MIGRATION_ENVIRONMENTS)[number];

export interface MarkerValidationSummary {
  candidatesExecuted: number;
  aliasesCreated: number;
  referencesRewritten: number;
  heldCandidates: number;
  legacyRecordsDeleted: 0;
  productionWrites: 0;
}

export interface MigrationCompletionMarker {
  markerId: string;
  migrationPlanId: string;
  environment: MigrationEnvironment;
  canonicalDataVersion: string;
  aliasVersion: string;
  referenceRewriteVersion: string;
  validationSummary: MarkerValidationSummary;
  completedAt: EpochMillis;
  approvedBy: string;
  status: CompletionMarkerStatus;
}

export const MARKER_REFUSAL_CODES = [
  "forbidden_status_in_this_phase",
  "non_emulator_environment",
  "held_candidates_present",
  "production_write_reported",
  "legacy_deletion_reported",
] as const;
export type MarkerRefusalCode = (typeof MARKER_REFUSAL_CODES)[number];

export interface MarkerCreationResult {
  ok: boolean;
  refusalCode: MarkerRefusalCode | null;
  marker: MigrationCompletionMarker | null;
}

export interface CreateMarkerInput {
  migrationPlanId: string;
  environment: MigrationEnvironment;
  canonicalDataVersion: string;
  aliasVersion: string;
  referenceRewriteVersion: string;
  validationSummary: MarkerValidationSummary;
  approvedBy: string;
  status: CompletionMarkerStatus;
}

function refuse(code: MarkerRefusalCode): MarkerCreationResult {
  return { ok: false, refusalCode: code, marker: null };
}

/**
 * Cipta penanda penyiapan. Setiap penolakan di bawah adalah pagar keselamatan
 * yang disengajakan, bukan pengesahan input.
 */
export function createCompletionMarker(
  input: CreateMarkerInput,
  now: EpochMillis,
): MarkerCreationResult {
  // Fasa 1.12: penanda produksi DILARANG sepenuhnya.
  if (FORBIDDEN_MARKER_STATUSES.includes(input.status)) {
    return refuse("forbidden_status_in_this_phase");
  }
  if (input.status !== "emulator_complete" && input.status !== "rolled_back") {
    // `qa_complete` memerlukan larian QA yang diluluskan — bukan fasa ini.
    return refuse("forbidden_status_in_this_phase");
  }
  if (input.environment !== "emulator") {
    return refuse("non_emulator_environment");
  }
  if (input.validationSummary.heldCandidates > 0) {
    // Migrasi dengan calon yang ditahan tidak boleh dipanggil selesai.
    return refuse("held_candidates_present");
  }
  if (input.validationSummary.productionWrites !== 0) {
    return refuse("production_write_reported");
  }
  if (input.validationSummary.legacyRecordsDeleted !== 0) {
    return refuse("legacy_deletion_reported");
  }

  return {
    ok: true,
    refusalCode: null,
    marker: {
      markerId: `MCM-${hashCanonical({
        migrationPlanId: input.migrationPlanId,
        environment: input.environment,
      }).slice(0, 24)}`,
      migrationPlanId: input.migrationPlanId,
      environment: input.environment,
      canonicalDataVersion: input.canonicalDataVersion,
      aliasVersion: input.aliasVersion,
      referenceRewriteVersion: input.referenceRewriteVersion,
      validationSummary: input.validationSummary,
      completedAt: now,
      approvedBy: input.approvedBy,
      status: input.status,
    },
  };
}

/**
 * Adakah bacaan canonical produksi dibenarkan? Ia memerlukan penanda
 * `production_complete`, yang fasa ini tidak boleh cipta — jadi jawapannya
 * sentiasa tidak. Ini adalah fungsi yang dirujuk oleh penyelaras feature flag.
 */
export function productionCanonicalReadAllowed(
  markers: readonly MigrationCompletionMarker[],
): boolean {
  return markers.some(
    (m) => m.environment === "production" && m.status === "production_complete",
  );
}
