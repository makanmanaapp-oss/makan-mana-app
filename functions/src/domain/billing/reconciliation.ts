// MAKANMANA iOS WAVE 2.1 — penyelarasan langganan yang terlepas.
//
// Notifikasi boleh hilang: Apple gagal menghantar, endpoint kita tidak
// tersedia, atau percubaan semula habis. Tanpa penyelarasan, satu langganan
// yang dicabut boleh kekal "aktif" dalam pangkalan data kita selama-lamanya.
//
// PRINSIP: penyelaras membaca STATUS SEMASA YANG BERWIBAWA daripada App Store
// Server API. Ia TIDAK memainkan semula sejarah notifikasi lama — sejarah
// memberitahu apa yang pernah berlaku, bukan apa yang BENAR sekarang. Itulah
// perbezaan antara pulih daripada notifikasi terlepas dan memperkenalkan
// semula keadaan basi.

import {
  mapAppleSubscriptionToEntitlement,
  type AppleRenewalInfoLike,
  type AppleTransactionInfoLike,
} from "./appStoreSubscription";
import type {EntitlementResult} from "./googlePlaySubscription";

/** Had saiz kelompok. Penyelaras tidak pernah mengimbas keseluruhan koleksi. */
export const RECONCILE_BATCH_LIMIT = 50;

/** Rekod dianggap basi selepas tempoh ini tanpa kemas kini. */
export const RECONCILE_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

/** Percubaan maksimum sebelum rekod diketepikan untuk perhatian manusia. */
export const RECONCILE_MAX_ATTEMPTS = 5;

export interface ReconcileRecord {
  subscriptionKey: string;
  uid: string | null;
  planStatus: string;
  entitled: boolean;
  revoked: boolean;
  /** Milisaat epoch bila kita terakhir menulis rekod ini. */
  updatedAtMillis: number | null;
  /** Bila langganan sepatutnya luput, jika diketahui. */
  expiryMillis: number | null;
  /** Percubaan penyelarasan yang gagal setakat ini. */
  attempts: number;
  /** Jangan cuba lagi sebelum masa ini. */
  nextAttemptAtMillis: number | null;
  /** Pemegang kunci keserentakan, jika ada. */
  leaseUntilMillis: number | null;
}

/**
 * Backoff eksponen dengan had.
 *
 * Gangguan Apple menjejaskan SETIAP rekod serentak. Tanpa backoff, penyelaras
 * akan menukar satu gangguan menjadi banjir panggilan berulang.
 */
export function nextAttemptDelayMs(attempts: number): number {
  const safe = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  const minutes = Math.min(2 ** safe * 15, 12 * 60);
  return minutes * 60 * 1000;
}

/** Adakah rekod ini layak diselaraskan sekarang. */
export function isReconcileCandidate(
  record: ReconcileRecord,
  nowMillis: number,
  staleAfterMs: number = RECONCILE_STALE_AFTER_MS,
): boolean {
  if (record.attempts >= RECONCILE_MAX_ATTEMPTS) return false;
  if (record.nextAttemptAtMillis !== null && nowMillis < record.nextAttemptAtMillis) {
    return false;
  }
  // Keserentakan: satu rekod yang dipajak sedang dikendalikan orang lain.
  if (record.leaseUntilMillis !== null && nowMillis < record.leaseUntilMillis) {
    return false;
  }

  // Hanya rekod yang MENDAKWA memberi akses perlu disemak. Rekod yang sudah
  // luput tidak boleh merosot lagi.
  const claimsAccess =
    record.entitled ||
    record.planStatus === "active" ||
    record.planStatus === "grace_period" ||
    record.planStatus === "cancelled_but_active";
  if (!claimsAccess) return false;

  // Luput mengikut jam kita, tetapi kita belum mendengar apa-apa daripada Apple.
  if (record.expiryMillis !== null && record.expiryMillis <= nowMillis) return true;

  // Atau tidak disentuh terlalu lama.
  if (record.updatedAtMillis === null) return true;
  return nowMillis - record.updatedAtMillis >= staleAfterMs;
}

/**
 * Pilih kelompok TERHAD, paling lama dahulu.
 *
 * Susunan deterministik supaya larian berulang membuat kemajuan dan bukan
 * mengunyah rekod yang sama.
 */
export function selectReconcileBatch(params: {
  records: readonly ReconcileRecord[];
  nowMillis: number;
  limit?: number;
  staleAfterMs?: number;
}): ReconcileRecord[] {
  const limit = params.limit ?? RECONCILE_BATCH_LIMIT;
  return params.records
    .filter((r) => isReconcileCandidate(r, params.nowMillis, params.staleAfterMs))
    .sort((a, b) => (a.updatedAtMillis ?? 0) - (b.updatedAtMillis ?? 0))
    .slice(0, Math.max(0, limit));
}

/** Status semasa yang berwibawa, seperti yang dipulangkan App Store. */
export interface AuthoritativeStatus {
  status: number | null;
  transaction: AppleTransactionInfoLike | null;
  renewal: AppleRenewalInfoLike | null;
}

export type ReconcileDecision =
  | {action: "write"; entitlement: EntitlementResult; revoked: boolean; reason: string}
  | {action: "unchanged"; reason: string};

/**
 * Tentukan apa yang perlu ditulis untuk satu rekod.
 *
 * Pencabutan datang daripada `revocationDate` dalam transaksi SEMASA, bukan
 * daripada bendera `revoked` yang kita simpan. Itu sengaja: jika Apple telah
 * membalikkan bayaran balik, data semasa ialah kebenaran. Jika Apple masih
 * menunjukkan pencabutan, ia kekal dicabut walaupun status melaporkan aktif —
 * `mapAppleSubscriptionToEntitlement` sudah menguatkuasakannya.
 */
export function decideReconcile(params: {
  record: ReconcileRecord;
  authoritative: AuthoritativeStatus;
  nowMillis: number;
}): ReconcileDecision {
  const {record, authoritative, nowMillis} = params;
  const revokedNow =
    typeof authoritative.transaction?.revocationDate === "number" &&
    Number.isFinite(authoritative.transaction.revocationDate);

  const entitlement = mapAppleSubscriptionToEntitlement(
    {
      status: authoritative.status ?? null,
      transaction: authoritative.transaction,
      renewal: authoritative.renewal,
    },
    nowMillis,
  );

  // Tiada perubahan bermakna tiada tulisan. Ini yang menghalang penyelarasan
  // berulang daripada menghasilkan perubahan kelayakan duplikat.
  if (
    entitlement.entitled === record.entitled &&
    entitlement.planStatus === record.planStatus &&
    revokedNow === record.revoked
  ) {
    return {action: "unchanged", reason: "status berwibawa sepadan dengan yang disimpan"};
  }

  return {
    action: "write",
    entitlement,
    revoked: revokedNow,
    reason: `berwibawa: ${entitlement.planStatus}${revokedNow ? " (dicabut)" : ""}`,
  };
}

/** Sempadan yang disuntik. Ujian membekalkan yang palsu; tiada rangkaian. */
export interface ReconcileStore {
  /** Ambil calon yang berpotensi. Pelaksanaan sebenar mengehadkan pertanyaan. */
  listCandidates(limit: number): Promise<ReconcileRecord[]>;
  /** Ambil pajakan. Memulangkan false jika orang lain memegangnya. */
  acquireLease(subscriptionKey: string, untilMillis: number): Promise<boolean>;
  /** Tulis keadaan yang diselaraskan + medan pengguna, secara atom. */
  writeReconciled(params: {
    record: ReconcileRecord;
    decision: Extract<ReconcileDecision, {action: "write"}>;
  }): Promise<void>;
  /** Rekod kegagalan supaya backoff dan had percubaan berkuat kuasa. */
  recordFailure(params: {
    subscriptionKey: string;
    attempts: number;
    nextAttemptAtMillis: number;
  }): Promise<void>;
  /** Tandakan kejayaan (kosongkan percubaan, lepaskan pajakan). */
  recordSuccess(subscriptionKey: string): Promise<void>;
}

/** Klien App Store. Ujian membekalkan yang palsu. */
export interface AuthoritativeStatusClient {
  fetch(subscriptionKey: string): Promise<AuthoritativeStatus>;
}

export interface ReconcileSummary {
  examined: number;
  written: number;
  unchanged: number;
  skippedLeased: number;
  failed: number;
}

/** Tempoh pajakan. Cukup panjang untuk satu rekod, cukup pendek untuk pulih. */
export const RECONCILE_LEASE_MS = 5 * 60 * 1000;

/**
 * Jalankan SATU kelompok terhad.
 *
 * Tiada penjadual di sini dengan sengaja — fungsi ini mesti dipanggil secara
 * eksplisit. Tiada apa-apa dalam repo ini mencetuskannya, jadi ia tidak boleh
 * berjalan sendiri sehingga pemilik mendawainya.
 */
export async function runReconciliationBatch(params: {
  store: ReconcileStore;
  client: AuthoritativeStatusClient;
  nowMillis: number;
  limit?: number;
  staleAfterMs?: number;
}): Promise<ReconcileSummary> {
  const limit = params.limit ?? RECONCILE_BATCH_LIMIT;
  const summary: ReconcileSummary = {
    examined: 0,
    written: 0,
    unchanged: 0,
    skippedLeased: 0,
    failed: 0,
  };

  const candidates = selectReconcileBatch({
    records: await params.store.listCandidates(limit),
    nowMillis: params.nowMillis,
    limit,
    staleAfterMs: params.staleAfterMs,
  });

  for (const record of candidates) {
    summary.examined++;

    const leased = await params.store.acquireLease(
      record.subscriptionKey,
      params.nowMillis + RECONCILE_LEASE_MS,
    );
    if (!leased) {
      summary.skippedLeased++;
      continue;
    }

    try {
      const authoritative = await params.client.fetch(record.subscriptionKey);
      const decision = decideReconcile({
        record,
        authoritative,
        nowMillis: params.nowMillis,
      });

      if (decision.action === "write") {
        await params.store.writeReconciled({record, decision});
        summary.written++;
      } else {
        summary.unchanged++;
      }
      await params.store.recordSuccess(record.subscriptionKey);
    } catch {
      // Kegagalan satu rekod TIDAK menghentikan kelompok. Gangguan Apple
      // sepatutnya menyebabkan backoff, bukan larian yang gagal separuh jalan
      // dan meninggalkan baki rekod tidak disentuh selama-lamanya.
      const attempts = record.attempts + 1;
      await params.store.recordFailure({
        subscriptionKey: record.subscriptionKey,
        attempts,
        nextAttemptAtMillis: params.nowMillis + nextAttemptDelayMs(attempts),
      });
      summary.failed++;
    }
  }

  return summary;
}
