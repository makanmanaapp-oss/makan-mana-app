/**
 * Phase 1.14A/1.14B — callable DIPERCAYAI submitPlaceCorrection (BELUM DI-DEPLOY).
 *
 * Wrapper onCall nipis. Menulis HANYA ke staging pembetulan dipercayai (Admin SDK)
 * — TIDAK PERNAH rekod canonical. Klien TIDAK boleh menulis koleksi ini terus.
 *
 * PHASE 1.14B — snapshot "nilai semasa" diperoleh daripada data DIPERCAYAI yang
 * dibaca server (penerbitan canonical → place_details → places_cache). Snapshot
 * yang diisytihar klien TIDAK PERNAH autoritatif; ia hanya dibandingkan (amaran
 * diredaksi). Tiada tulisan berlaku sebelum snapshot dipercayai diselesaikan.
 *
 * Urutan gerbang (Part C): auth → App Check → skema → placeId → alias dipercayai
 * → derivasi snapshot dipercayai → banding klien/server → kategori/bukti →
 * idempotensi → had kadar → tulis penghantaran → audit → respons.
 *
 * NOTA DEPLOY: dieksport melalui index.ts untuk semakan/ujian; fasa ini TIDAK
 * `firebase deploy`. Pengaktifan berpagar-pemilik.
 */
import {randomUUID} from "crypto";

import {logger} from "firebase-functions/v2";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {
  PlaceCorrectionAuditEntry,
  PlaceCorrectionSubmission,
} from "../domain/places/corrections";
import {FirestoreCorrectionStore} from "../domain/places/corrections/firestoreCorrectionRepository";
import {
  AliasResolution,
  TrustedPlaceDataSource,
  TrustedPlaceView,
  TrustedSnapshotError,
  compareClientToTrusted,
  resolveTrustedSnapshot,
} from "../domain/places/corrections/trustedSnapshotResolver";
import {
  placeDetailsDocToView,
  placesCacheDocToView,
} from "../domain/places/corrections/trustedSourceMapping";
import {
  CorrectionCallableError,
  CorrectionCallableRequest,
  CorrectionCallableResponse,
  TrustedSubmitDeps,
  mapCorrectionRequest,
  orchestrateTrustedSubmission,
} from "./submitPlaceCorrectionLogic";

const ENFORCE_APP_CHECK = process.env.CORRECTION_ENFORCE_APP_CHECK === "true";
const TRACKING_SALT = process.env.CORRECTION_TRACKING_SALT ?? "mm_correction_v1";

const C_SUB = "place_correction_submissions";
const C_ALIAS = "place_migration_aliases";
const C_PUB_HEAD = "place_publication_heads";
const C_PUB = "place_publications";
const C_DETAILS = "place_details";

/** Bina deps Firestore dipercayai (staging sahaja — bukan canonical). */
function firestoreDeps(): TrustedSubmitDeps {
  const store = new FirestoreCorrectionStore(db);
  return {
    async listUserSubmissions(reporterUid: string): Promise<readonly PlaceCorrectionSubmission[]> {
      const snap = await db.collection(C_SUB).where("submittedBy", "==", reporterUid).limit(100).get();
      return snap.docs.map((d) => d.data() as PlaceCorrectionSubmission);
    },
    async createSubmission(submission: PlaceCorrectionSubmission): Promise<void> {
      await store.createSubmission(submission);
    },
    async appendAudit(entry: PlaceCorrectionAuditEntry): Promise<void> {
      await store.appendAudit(entry);
    },
    idGen: () => `sub_${randomUUID()}`,
    trackingSalt: TRACKING_SALT,
  };
}

// ---------------------------------------------------------------------------
// Sumber data DIPERCAYAI (BACA-SAHAJA). Owner: sahkan nama medan legasi sebenar.
// ---------------------------------------------------------------------------
function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function firestoreTrustedSource(): TrustedPlaceDataSource {
  return {
    async resolveAlias(placeId: string): Promise<AliasResolution> {
      const chain: string[] = [placeId];
      const seen = new Set<string>([placeId]);
      let current = placeId;
      for (let hop = 0; hop < 8; hop++) {
        const doc = await db.collection(C_ALIAS).doc(current).get();
        if (!doc.exists) {
          return {requestedPlaceId: placeId, resolvedCanonicalPlaceId: current, chain, status: hop === 0 ? "not_found" : "resolved"};
        }
        const data = doc.data() ?? {};
        if (data.status === "blocked") {
          return {requestedPlaceId: placeId, resolvedCanonicalPlaceId: current, chain, status: "blocked"};
        }
        const next = toStr(data.canonicalPlaceId) ?? toStr(data.resolvedPlaceId);
        if (!next || next === current) {
          return {requestedPlaceId: placeId, resolvedCanonicalPlaceId: current, chain, status: "resolved"};
        }
        if (seen.has(next)) {
          return {requestedPlaceId: placeId, resolvedCanonicalPlaceId: current, chain, status: "circular"};
        }
        seen.add(next);
        chain.push(next);
        current = next;
      }
      return {requestedPlaceId: placeId, resolvedCanonicalPlaceId: current, chain, status: "circular"};
    },
    async getActivePublication(canonicalPlaceId: string): Promise<TrustedPlaceView | null> {
      const head = await db.collection(C_PUB_HEAD).doc(canonicalPlaceId).get();
      if (!head.exists) return null;
      const activeId = toStr(head.data()?.activePublicationId);
      if (!activeId) return null;
      const pub = await db.collection(C_PUB).doc(activeId).get();
      if (!pub.exists) return null;
      const d = pub.data() ?? {};
      return {
        placeId: canonicalPlaceId,
        title: toStr(d.title) ?? canonicalPlaceId,
        address: toStr(d.address),
        hoursState: toStr(d.hoursState) ?? "hours_unknown",
        priceState: toStr(d.priceState) ?? "price_unknown",
        ratingState: toStr(d.ratingState) ?? "rating_hidden",
        businessState: toStr(d.businessState) ?? "status_unknown",
        halalState: toStr(d.halalState) ?? "halal_unknown",
        dietaryState: toStr(d.dietaryState) ?? "dietary_unknown",
        allergenState: toStr(d.allergenState) ?? "allergen_unknown",
        imageReferences: [],
        tagIds: [],
        warnings: [],
        sourceMode: "live",
        publicationId: activeId,
        publicationVersion: typeof d.version === "number" ? d.version : undefined,
        blocked: d.blocked === true,
      };
    },
    async getApprovedCanonicalTestSource(): Promise<TrustedPlaceView | null> {
      return null; // tiada sumber ujian dalam produksi
    },
    async getPlaceDetails(placeId: string): Promise<TrustedPlaceView | null> {
      // Skema produksi sebenar (1.14B.4): displayName/rating/userRatingCount/
      // priceLevel/photoUrl/lastFetchedAt — pemetaan dalam trustedSourceMapping.
      const doc = await db.collection(C_DETAILS).doc(placeId).get();
      if (!doc.exists) return null;
      return placeDetailsDocToView(placeId, doc.data() ?? {});
    },
    async getPlacesCache(): Promise<TrustedPlaceView | null> {
      // places_cache ialah cache pertanyaan-KAWASAN (bukan dokumen satu-tempat
      // mengikut placeId) — TIDAK boleh menjadi sumber snapshot dipercayai.
      return placesCacheDocToView();
    },
  };
}

// Phase 1.14E — SA runtime KHUSUS (least-privilege: datastore.user + logWriter).
const CORRECTION_RUNTIME_SA =
  "makanmana-correction-runtime@makanmana-c59f3.iam.gserviceaccount.com";

export const submitPlaceCorrection = onCall(
  {enforceAppCheck: ENFORCE_APP_CHECK, serviceAccount: CORRECTION_RUNTIME_SA},
  async (request): Promise<CorrectionCallableResponse> => {
    // 1) Auth. 2) App Check.
    const reporterUid = request.auth?.uid;
    if (!reporterUid) throw new HttpsError("unauthenticated", "unauthenticated");
    if (ENFORCE_APP_CHECK && !request.app) {
      throw new HttpsError("failed-precondition", "app_check_required");
    }

    const now = Date.now();
    const req = (request.data ?? {}) as CorrectionCallableRequest;
    try {
      // 3) Skema + 4) placeId (via mapCorrectionRequest).
      const input = mapCorrectionRequest(req, now);
      const clientDeclaredPlaceId = input.placeId;

      // 5-6) Alias dipercayai + derivasi snapshot dipercayai (BUKAN klien).
      const trusted = await resolveTrustedSnapshot(
        {uid: reporterUid, placeId: input.placeId, sourceMode: toStr(req.correctionType)},
        firestoreTrustedSource(),
        now,
      );
      // Snapshot & placeId DIPERCAYAI menggantikan nilai klien SEPENUHNYA.
      input.originalSnapshot = trusted.trustedOriginalSnapshot;
      input.placeId = trusted.resolvedCanonicalPlaceId;

      // 7) Banding klien/server (amaran diredaksi sahaja).
      const mismatches = compareClientToTrusted(
        {placeId: clientDeclaredPlaceId, currentValue: toStr(req.currentValue)},
        trusted,
      );

      // 8-12) validasi kategori/bukti → idempotensi → had kadar → tulis → audit.
      const result = await orchestrateTrustedSubmission(input, reporterUid, now, firestoreDeps());

      logger.info("correction_success", {
        placeId: input.placeId,
        category: input.category,
        source: trusted.sourceUsed,
        mismatchCount: mismatches.length,
        deduplicated: result.deduplicated,
      });

      return {
        success: result.success,
        trackingId: result.trackingId,
        status: result.status,
        submittedAt: result.submittedAt,
        messageCode: result.messageCode,
        deduplicated: result.deduplicated,
      };
    } catch (err) {
      if (err instanceof TrustedSnapshotError) {
        logger.info("correction_validation_failure", {code: err.code});
        // Tiada sumber dipercayai / alias tidak selamat / rekod disekat → tolak selamat.
        throw new HttpsError("invalid-argument", err.code === "no_trusted_source" ? "invalid_place" : err.code);
      }
      if (err instanceof CorrectionCallableError) {
        logger.info("correction_validation_failure", {code: err.code});
        const map: Record<string, "unauthenticated" | "permission-denied" | "invalid-argument" | "resource-exhausted" | "failed-precondition" | "unavailable" | "internal"> = {
          unauthenticated: "unauthenticated",
          app_check_required: "failed-precondition",
          invalid_argument: "invalid-argument",
          unsupported_type: "invalid-argument",
          invalid_place: "invalid-argument",
          description_too_short: "invalid-argument",
          description_too_long: "invalid-argument",
          invalid_evidence: "invalid-argument",
          rate_limited: "resource-exhausted",
          duplicate_submission: "already-exists" as never,
          unavailable: "unavailable",
          internal: "internal",
        };
        throw new HttpsError(map[err.code] ?? "invalid-argument", err.code);
      }
      logger.error("correction_internal_failure");
      throw new HttpsError("internal", "internal");
    }
  },
);
