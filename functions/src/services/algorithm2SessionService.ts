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
import { db, FieldValue } from "../config/firebase";
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
import { normalizeRejectReason, rejectTtlMs } from "../domain/algorithm2/rejectPolicy";

interface Algo2SessionDoc {
  sessionId: string;
  shownPlaceIds: string[];
  rejectedPlaceIds: string[];
  remainingAlternativeIds: string[];
  /** MULTI-CHUNK — senarai identiti autoritatif penuh (Part 2). */
  rankedPlaceIds?: string[];
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
    /** MULTI-CHUNK — masih ada calon autoritatif selepas pop ini (Part 10/11). */
    hasMoreAuthoritative: boolean;
    /** Jumlah identiti autoritatif dalam sesi (rankedPlaceIds). */
    totalAuthoritative: number;
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
  /** FINAL REPAIR — tahap relaksasi (0=tiada, 1=drop SHOWN sesi sahaja).
   * reject-memory + reject-sesi + TUTUP + keselamatan keras TIDAK PERNAH dilonggarkan. */
  sessionRelaxationLevel: number;
  /** FINAL REPAIR — bekalan-rendah jujur: pool kekal kosong selepas relaks SHOWN
   * (tiada tempat ditolak/ditutup disajikan). Klien patut papar keadaan low-supply. */
  lowSupply: boolean;
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
 * MULTI-CHUNK — bilangan MAKSIMUM calon ber-pangkat disimpan dalam satu dokumen
 * sesi (identiti + objek calon). Chunk penghantaran kekal 30, tetapi jumlah
 * autoritatif yang boleh diguna TIDAK terhad 30. 300 × ~1KB ≈ 300KB — selamat di
 * bawah had dokumen Firestore 1MB. Kolam melebihi ini ditandakan hasMore=false
 * hanya bila senarai autoritatif habis (Part 13; elak had skala tersembunyi).
 */
export const AUTHORITATIVE_POOL_MAX = 300;
/** Saiz chunk penghantaran (kekal). BUKAN had jumlah kolam. */
export const SESSION_CHUNK_SIZE = 30;

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

  // FINAL RECOMMENDATION REPAIR — RELAKSASI REJECT-SELAMAT (Part 4/8).
  // Bila penindasan mengosongkan pool, kita HANYA melonggarkan SHOWN sesi.
  // JANGAN SEKALI melonggarkan: reject-memory, reject dalam-sesi, penapis TUTUP,
  // atau keselamatan keras (alahan/halal). "Recent rejected is strongest after
  // permanent safety/avoid rules" — reject tidak pernah dibangkitkan semula oleh
  // relaksasi (menutup RELAXATION_BYPASSES_REJECT). Jika masih kosong selepas
  // melonggar SHOWN → keadaan bekalan-rendah JUJUR (tiada tempat ditutup/ditolak
  // disajikan, tiada dummy). Reason-coded & diperhatikan.
  //   L1: gugurkan SHOWN sesi sahaja. KEKAL reject-memory + reject-sesi + TUTUP.
  let relaxationLevel = 0;
  let lowSupply = false;
  if (ranked0.length === 0 && sessionShown.length > 0) {
    // Kekalkan reject-sesi + reject-memory (buang HANYA shown dari exclude).
    const shownSet = new Set(sessionShown);
    const keepSuppressed = new Set(
      [...mergedExclude].filter((id) => !shownSet.has(id)),
    );
    if (opts.useUnified && opts.recCtx) {
      const r = rankUnified(candidates, opts.recCtx, {
        suppressedIds: keepSuppressed,
        rejectMemoryIds: new Set(rejectMemoryIds), // reject-memory KEKAL
        subFlags: opts.subFlags,
        excludeClosed: true, // TUTUP tidak pernah dilonggarkan (eat-now)
      });
      ranked0 = r.ranked;
      if (opts.recCtx.selectedMood) {
        moodFitById = new Map(r.scored.map((s) => [s.place.placeId, s.components.moodFit]));
      }
    } else {
      ranked0 = scoreAndRank([...candidates], {
        ...scoringCtx, excludePlaceIds: [...keepSuppressed, ...rejectMemoryIds],
      });
    }
    relaxationLevel = 1;
  }
  // Bekalan-rendah jujur: kekal kosong walau selepas relaks shown → JANGAN
  // resurrect reject/closed. Klien papar keadaan bekalan-rendah (Part 8 Stage 3).
  if (ranked0.length === 0) lowSupply = true;

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

  // MULTI-CHUNK — simpan KOLAM BER-PANGKAT PENUH (bukan lagi terhad 30) supaya
  // nextSuggestion boleh menyusuri chunk 2/3/… tanpa kueri provider. storeCount
  // (30) kekal HANYA saiz chunk pertama yang dipulangkan getSuggestions kepada
  // klien. Ditutup pada AUTHORITATIVE_POOL_MAX (selamat saiz-dokumen Firestore).
  const store = moodOrdered.slice(0, AUTHORITATIVE_POOL_MAX);
  const primary = store[0];
  const alternativeIds = store.slice(1).map((p) => p.placeId);
  const rankedPlaceIds = store.map((p) => p.placeId); // senarai identiti autoritatif

  // Lifecycle: sesi aktif segar → guna semula id+seed; jika tidak → sesi BAHARU
  // (id + seed baharu → putaran hampir-sama untuk konteks yang sama).
  const reuseSession = fresh && fresh.status === "active";
  const sessionId = reuseSession ? fresh.sessionId : `s_${seed.toString(36)}_${opts.now.toString(36)}`;
  // FINAL RECOMMENDATION REPAIR — bila RELAKSASI berlaku, KITAR SEMULA SHOWN
  // SAHAJA supaya kolam yang dibina semula boleh diguna oleh consumeStored
  // Alternative. rejectedPlaceIds TIDAK PERNAH direset (reject kekal ditindas
  // dalam-sesi; menutup NEW_SPIN/relaxation reject resurrection). reject-memory
  // 24h+ kekal pula ditapis semasa RANKING pool tersimpan.
  const recycledShown = relaxationLevel > 0;
  const baseShown = recycledShown ? [] : sessionShown;
  const newShown = primary ? [...new Set([...baseShown, primary.placeId])] : baseShown;
  await sessRef.set(
    {
      sessionId,
      shownPlaceIds: newShown,
      rejectedPlaceIds: sessionRejected, // JANGAN reset — reject kekal ditindas
      remainingAlternativeIds: alternativeIds,
      rankedPlaceIds, // senarai identiti autoritatif penuh (Part 2)
      candidates: store, // kolam penuh (bukan lagi 30) untuk guna-semula LANGSUNG
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
      lowSupply,
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
        hasMoreAuthoritative: stillRemaining.length > 0,
        totalAuthoritative: (s.rankedPlaceIds ?? s.candidates ?? []).length,
        sessionIdMasked: `${(s.sessionId ?? "").slice(0, 6)}…`,
      },
    };
  });
}

/**
 * Tulis rekod reject-memory dengan TTL BER-SEBAB + PROGRESIF (Part 4).
 * Reject berulang tempat yang sama → penindasan lebih kuat; do_not_suggest_again
 * → kekal. canonicalPlaceId disimpan supaya identiti alias setara ditindas juga
 * (menutup CANONICAL_ALIAS_BYPASS). Idempoten mengikut placeId (rejectCount naik).
 */
export async function writeRejectMemory(
  uid: string,
  placeId: string,
  now: number,
  opts: { canonicalPlaceId?: string | null; reason?: string | null } = {},
): Promise<void> {
  const ref = db.collection("users").doc(uid).collection("place_reject_memory").doc(placeId);
  const reason = normalizeRejectReason(opts.reason);
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data() ?? {}) : {};
  const prevCount = typeof prev.rejectCount === "number" ? prev.rejectCount : 0;
  const rejectCount = prevCount + 1;
  const ttlMs = rejectTtlMs(reason, rejectCount);
  // Kekalkan canonicalPlaceId sedia ada jika panggilan ini tak membekalkannya.
  const canonicalPlaceId = opts.canonicalPlaceId ?? (prev.canonicalPlaceId as string | null | undefined) ?? null;
  // Sebab do_not_suggest_again (permanent) tidak boleh diturunkan oleh reject
  // sebab-lemah kemudian: ambil TTL maksimum yang pernah ditetapkan.
  const prevExpiry = typeof prev.expiresAt === "number" ? prev.expiresAt : 0;
  const newExpiry = Math.max(now + ttlMs, prevExpiry);
  await ref.set(
    {
      placeId,
      canonicalPlaceId,
      rejectedAt: now,
      lastRejectedAt: now,
      rejectCount,
      reason, // sebab kanonikal TERAKHIR
      reasons: FieldValue.arrayUnion(reason), // jejak semua sebab (Part 1B)
      expiresAt: newExpiry,
      suppressedUntil: newExpiry,
    },
    { merge: true },
  );
}
