/**
 * Algorithm 2 / Phase 2.2 — perkhidmatan sesi (I/O). Server-derived sahaja.
 *
 * State algo2 disimpan pada `users/{uid}/algo2_sessions/{contextHash}` (baca
 * kunci-terus, tiada indeks). Reject-memory 24 jam pada
 * `users/{uid}/place_reject_memory/{placeId}`. Digunakan HANYA untuk kohort +
 * bendera aktif; awam tidak pernah memanggil laluan ini.
 *
 * TIDAK mengubah berat skor. Menggunakan mekanisme excludePlaceIds sedia ada +
 * enjin tulen (penindasan/putaran/kepelbagaian).
 */
import { db } from "../config/firebase";
import { PlaceCandidate } from "../types/place";
import { ScoringContext, scoreAndRank } from "./scoringService";
import {
  RejectMemoryRecord,
  activeRejectMemoryIds,
  applyCuisineDiversity,
  applyMoodPriority,
  buildExcludeIds,
  seedFromString,
  sessionSeededRotation,
} from "../domain/algorithm2/sessionEngine";
import { RecommendationUserContext } from "../domain/algorithm2/recommendationContext";
import { rankUnified, ScoringSubFlags, UnifiedRankDiagnostics } from "../domain/algorithm2/unifiedRanking";

interface Algo2SessionDoc {
  sessionId: string;
  shownPlaceIds: string[];
  rejectedPlaceIds: string[];
  remainingAlternativeIds: string[];
  /** Ringkasan calon tersimpan (untuk guna-semula LANGSUNG tanpa search/rank). */
  candidates: PlaceCandidate[];
  rotationSeed: number;
  startedAt: number;
  expiresAt: number;
  lastActivityAt: number;
  status: "active" | "accepted" | "expired";
}

/** Hasil guna-semula alternatif LANGSUNG (tiada search/rank). */
export interface AlternativeConsumeResult {
  candidate: PlaceCandidate;
  diagnostics: {
    responseSource: "session_alternative";
    providerQueryCount: 0;
    rankingExecuted: false;
    alternativesBefore: number;
    invalidAlternativesRemoved: number;
    alternativesAfter: number;
    sessionIdMasked: string;
  };
}

export interface Algorithm2Diagnostics {
  rawCandidateCount: number;
  eligibleAfterExcludeCount: number;
  excludedShownCount: number;
  excludedRejectedCount: number;
  excludedRejectMemoryCount: number;
  rankedCount: number;
  rotationApplied: boolean;
  diversityApplied: boolean;
  alternativeRemainingCount: number;
  responseSource: "ranked" | "ranked_with_algo2";
  /** Master fix — tahap relaksasi penindasan (0=tiada, 1=drop sesi shown/rejected,
   * 2=drop reject-memory juga; keselamatan keras TIDAK PERNAH dilonggarkan). */
  sessionRelaxationLevel: number;
  /** Phase 2.3 — versi pemarkahan digunakan (legasi atau bersatu). */
  scoringVersion: string;
  /** Phase 2.3 — diagnostik pemarkahan bersatu (null bila legasi). */
  unified: UnifiedRankDiagnostics | null;
}

export interface Algorithm2Flags {
  sessionSuppression: boolean;
  rejectMemory: boolean;
  sessionRotation: boolean;
}

export interface Algorithm2Result {
  ranked: PlaceCandidate[];
  diagnostics: Algorithm2Diagnostics;
}

const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // sesi aktif 3 jam

/**
 * Ranking dengan Algorithm 2: penindasan shown/rejected + reject-memory 24h,
 * putaran ber-benih-sesi, kepelbagaian cuisine. Menulis semula state sesi.
 * TIDAK mengubah berat skor.
 */
export async function rankWithAlgorithm2(
  candidates: PlaceCandidate[],
  scoringCtx: ScoringContext,
  opts: {
    uid: string; contextHash: string; now: number; flags: Algorithm2Flags; storeCount: number;
    // Phase 2.3 — pemarkahan bersatu (bila kohort + bendera unifiedScoring ON).
    recCtx?: RecommendationUserContext;
    subFlags?: ScoringSubFlags;
    useUnified?: boolean;
  },
): Promise<Algorithm2Result> {
  const sessRef = db.collection("users").doc(opts.uid).collection("algo2_sessions").doc(opts.contextHash);
  const sessSnap = await sessRef.get();
  const existing = sessSnap.exists ? (sessSnap.data() as Algo2SessionDoc) : null;
  const fresh = existing && opts.now - (existing.lastActivityAt ?? 0) <= SESSION_TTL_MS ? existing : null;

  const sessionShown = fresh?.shownPlaceIds ?? [];
  const sessionRejected = fresh?.rejectedPlaceIds ?? [];

  // Reject-memory 24 jam (baca-terus koleksi kecil).
  let rejectMemoryIds: string[] = [];
  if (opts.flags.rejectMemory) {
    const memSnap = await db.collection("users").doc(opts.uid).collection("place_reject_memory").get();
    const recs: RejectMemoryRecord[] = memSnap.docs.map((d) => d.data() as RejectMemoryRecord);
    rejectMemoryIds = activeRejectMemoryIds(recs, opts.now);
  }

  const excludeIds = opts.flags.sessionSuppression
    ? buildExcludeIds({ sessionShown, sessionRejected, rejectMemoryIds })
    : [];

  // Gabung dengan excludePlaceIds sedia ada (jika ada) — mekanisme scoreAndRank.
  const mergedExclude = [...new Set([...(scoringCtx.excludePlaceIds ?? []), ...excludeIds])];

  // Phase 2.3 — pemarkahan BERSATU (v2) bila kohort + unifiedScoring ON; jika
  // tidak, laluan legasi scoreAndRank (rollback-capable, tidak berubah).
  let ranked0: PlaceCandidate[];
  let unifiedDiag: UnifiedRankDiagnostics | null = null;
  let scoringVersion = "legacy_scoreAndRank_v1";
  // Master fix — peta moodFit per calon (untuk peringkat keutamaan mood).
  let moodFitById: Map<string, number> | null = null;
  if (opts.useUnified && opts.recCtx) {
    const res = rankUnified(candidates, opts.recCtx, {
      suppressedIds: new Set(mergedExclude),
      rejectMemoryIds: new Set(rejectMemoryIds),
      subFlags: opts.subFlags,
      excludeClosed: true,
    });
    ranked0 = res.ranked;
    unifiedDiag = res.diagnostics;
    scoringVersion = res.diagnostics.scoringVersion;
    if (opts.recCtx.selectedMood) {
      moodFitById = new Map(res.scored.map((s) => [s.place.placeId, s.components.moodFit]));
    }
  } else {
    ranked0 = scoreAndRank([...candidates], { ...scoringCtx, excludePlaceIds: mergedExclude });
  }

  // Master fix — RELAKSASI TERKAWAL (directive F/G): bila penindasan sesi
  // mengosongkan pool, JANGAN pulangkan kosong (yang menyebabkan not-found →
  // fallback sampel/dummy di klien). Relaks berperingkat, KEKALKAN keselamatan
  // keras (alahan/halal ditapis dalam rankUnified). Reason-coded & diperhatikan.
  //  L1: gugurkan penindasan shown/rejected sesi (KEKAL reject-memory 24h).
  //  L2: gugurkan reject-memory juga (last resort) supaya pengguna dapat tempat
  //      SEBENAR, bukan dummy. Keselamatan keras tidak pernah dilonggarkan.
  let relaxationLevel = 0;
  if (ranked0.length === 0 && (mergedExclude.length > 0 || rejectMemoryIds.length > 0)) {
    const relaxRank = (suppressed: Set<string>, rejectMem: Set<string>): PlaceCandidate[] => {
      if (opts.useUnified && opts.recCtx) {
        const r = rankUnified(candidates, opts.recCtx, {
          suppressedIds: suppressed, rejectMemoryIds: rejectMem,
          subFlags: opts.subFlags, excludeClosed: true,
        });
        if (opts.recCtx.selectedMood) {
          moodFitById = new Map(r.scored.map((s) => [s.place.placeId, s.components.moodFit]));
        }
        return r.ranked;
      }
      return scoreAndRank([...candidates], { ...scoringCtx, excludePlaceIds: [...rejectMem] });
    };
    // L1 — kekal reject-memory sahaja.
    ranked0 = relaxRank(new Set(), new Set(rejectMemoryIds));
    relaxationLevel = 1;
    if (ranked0.length === 0) {
      // L2 — keselamatan keras sahaja (excludeClosed juga dilonggarkan supaya
      // sentiasa ada tempat sebenar jika ada calon selamat langsung).
      ranked0 = opts.useUnified && opts.recCtx
        ? rankUnified(candidates, opts.recCtx, { subFlags: opts.subFlags, excludeClosed: false }).ranked
        : scoreAndRank([...candidates], { ...scoringCtx, excludePlaceIds: [] });
      relaxationLevel = 2;
    }
  }

  // Putaran ber-benih-sesi (hanya calon hampir-sama).
  const rotationApplied = opts.flags.sessionRotation && ranked0.length > 1;
  const seed = seedFromString(`${opts.uid}:${opts.contextHash}:${fresh ? fresh.rotationSeed : opts.now}`);
  const rotated = rotationApplied ? sessionSeededRotation(ranked0, seed) : ranked0;

  // Kepelbagaian cuisine (selamat; melonggar bila pool kecil).
  const diversified = applyCuisineDiversity(rotated, { cuisineCap: 2, window: 12 });

  // Master fix — peringkat KEUTAMAAN MOOD terakhir: calon padanan-mood kuat diangkat
  // ke hadapan (mood mempengaruhi hasil TERATAS), relevans+kepelbagaian jadi tiebreak
  // dalam tier. Bila tiada padanan-mood (semua tier sama) susunan kekal (jujur).
  const moodOrdered = moodFitById
    ? applyMoodPriority(diversified, (id) => (moodFitById as Map<string, number>).get(id) ?? 0.5)
    : diversified;

  const store = moodOrdered.slice(0, opts.storeCount);
  const primary = store[0];
  const alternativeIds = store.slice(1).map((p) => p.placeId);

  // Lifecycle: sesi aktif segar → guna semula id+seed; jika tidak → sesi BAHARU
  // (id + seed baharu → putaran hampir-sama untuk konteks yang sama).
  const reuseSession = fresh && fresh.status === "active";
  const sessionId = reuseSession ? fresh.sessionId : `s_${seed.toString(36)}_${opts.now.toString(36)}`;
  // Master fix — bila RELAKSASI berlaku (pool ditindas sehingga kosong), KITAR
  // SEMULA sesi: reset shown/rejected supaya kolam yang dibina semula benar-benar
  // BOLEH digunakan oleh consumeStoredAlternative (jika tidak, ia menindas semula
  // segala-galanya → exhausted → dummy). Reason-coded (sessionRelaxationLevel).
  const recycledShown = relaxationLevel > 0;
  const baseShown = recycledShown ? [] : sessionShown;
  const newShown = primary ? [...new Set([...baseShown, primary.placeId])] : baseShown;
  await sessRef.set(
    {
      sessionId,
      shownPlaceIds: newShown,
      rejectedPlaceIds: recycledShown ? [] : sessionRejected,
      remainingAlternativeIds: alternativeIds,
      candidates: store, // ringkasan tersimpan untuk guna-semula LANGSUNG
      rotationSeed: reuseSession ? fresh.rotationSeed : (seed % 100000),
      startedAt: reuseSession ? fresh.startedAt : opts.now,
      expiresAt: opts.now + SESSION_TTL_MS,
      lastActivityAt: opts.now,
      status: "active",
    },
    { merge: true },
  );

  return {
    ranked: moodOrdered,
    diagnostics: {
      rawCandidateCount: candidates.length,
      eligibleAfterExcludeCount: ranked0.length,
      excludedShownCount: sessionShown.length,
      excludedRejectedCount: sessionRejected.length,
      excludedRejectMemoryCount: rejectMemoryIds.length,
      rankedCount: diversified.length,
      rotationApplied,
      diversityApplied: true,
      alternativeRemainingCount: alternativeIds.length,
      responseSource: "ranked_with_algo2",
      sessionRelaxationLevel: relaxationLevel,
      scoringVersion,
      unified: unifiedDiag ? { ...unifiedDiag, diversityApplied: true } : null,
    },
  };
}

/**
 * Guna-semula alternatif tersimpan LANGSUNG — TIADA searchNearby, TIADA
 * scoreAndRank, TIADA panggilan provider. Pop alternatif sah pertama dari
 * `remainingAlternativeIds`, tandakan shown, alih keluar dari baki (atomik).
 * Pulangkan null bila tiada alternatif sah (pemanggil buat retrieval biasa).
 */
export async function consumeStoredAlternative(
  uid: string,
  contextHash: string,
  now: number,
  flags: Algorithm2Flags,
): Promise<AlternativeConsumeResult | null> {
  const sessRef = db.collection("users").doc(uid).collection("algo2_sessions").doc(contextHash);
  // Master fix — void flags.rejectMemory di sini: reject-memory 24h SUDAH ditapis
  // semasa RANKING (pembinaan sesi). Menapisnya SEMULA di sini tidak KOHEREN dengan
  // relaksasi terkawal (L2 sengaja memasukkan calon reject-memory untuk mengisi
  // pool bila supply tipis) — ia akan menindas SEMULA segala-galanya → exhausted →
  // dummy. Consume hanya perlu menghormati shown/rejected DALAM-SESI (dari dokumen
  // sesi). Ulang-reject dalam sesi tetap ditangkap oleh s.rejectedPlaceIds.
  void flags;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(sessRef);
    if (!snap.exists) return null;
    const s = snap.data() as Algo2SessionDoc;
    if (s.status !== "active" || (s.expiresAt ?? 0) <= now) return null;
    const remaining = s.remainingAlternativeIds ?? [];
    const stored = s.candidates ?? [];
    if (remaining.length === 0 || stored.length === 0) return null;

    const exclude = new Set(buildExcludeIds({
      sessionShown: s.shownPlaceIds, sessionRejected: s.rejectedPlaceIds,
    }));
    const before = remaining.length;
    const byId = new Map(stored.map((c) => [c.placeId, c]));
    let chosen: PlaceCandidate | null = null;
    const stillRemaining: string[] = [];
    for (const id of remaining) {
      const cand = byId.get(id);
      const valid = cand && cand.isOpen !== false && !exclude.has(id);
      if (!chosen && valid) { chosen = cand!; continue; } // pop first valid
      if (cand && !exclude.has(id)) stillRemaining.push(id); // keep other valid-ish
    }
    if (!chosen) return null; // queue empty of valid → caller does retrieval

    tx.set(sessRef, {
      shownPlaceIds: [...new Set([...(s.shownPlaceIds ?? []), chosen.placeId])],
      remainingAlternativeIds: stillRemaining,
      lastActivityAt: now,
    }, { merge: true });

    return {
      candidate: chosen,
      diagnostics: {
        responseSource: "session_alternative" as const,
        providerQueryCount: 0 as const,
        rankingExecuted: false as const,
        alternativesBefore: before,
        invalidAlternativesRemoved: before - stillRemaining.length - 1,
        alternativesAfter: stillRemaining.length,
        sessionIdMasked: `${(s.sessionId ?? "").slice(0, 6)}…`,
      },
    };
  });
}

/** Tulis rekod reject-memory 24 jam (idempoten mengikut placeId). */
export async function writeRejectMemory(
  uid: string,
  placeId: string,
  now: number,
  opts: { canonicalPlaceId?: string | null; reason?: string | null } = {},
): Promise<void> {
  const ttlMs = 24 * 60 * 60 * 1000;
  await db.collection("users").doc(uid).collection("place_reject_memory").doc(placeId).set(
    {
      placeId,
      canonicalPlaceId: opts.canonicalPlaceId ?? null,
      rejectedAt: now,
      expiresAt: now + ttlMs,
      reason: opts.reason ?? null,
    },
    { merge: true },
  );
  // Tandakan juga dalam mana-mana sesi algo2 aktif (best-effort, tidak menyekat).
}
