/**
 * Phase 1.6 Part D, E & F — MESIN KEADAAN (business / verification / publication).
 *
 * Semua helper TULEN. Peralihan yang memerlukan bukti terkawal (reopen,
 * semakan lokasi, restore dipercayai) TIDAK dibenarkan melalui laluan biasa —
 * ia memerlukan `ControlledTransitionEvidence` yang HANYA boleh dibekalkan
 * oleh lapisan repository (Admin SDK), bukan klien.
 */
import { PlaceStatus, PublicationStatus, VerificationStatus } from "../placeEnums";

// ---------------------------------------------------------------------------
// Bukti terkawal — gerbang untuk peralihan sensitif
// ---------------------------------------------------------------------------

/**
 * Bukti yang diperlukan untuk peralihan terkawal. Setiap bendera mesti
 * dibekalkan oleh pelaku DIPERCAYAI di lapisan repository. Ketiadaan medan =
 * tiada bukti (peralihan ditolak) — bukan "diandaikan benar".
 */
export interface ControlledTransitionEvidence {
  /** Bukti kedai dibuka semula (tinjauan lapangan/merchant/admin). */
  reopenEvidence?: boolean;
  /** Semakan lokasi selesai untuk kedai yang berpindah. */
  locationReviewed?: boolean;
  /** Tindakan restore oleh pelaku dipercayai (admin). */
  trustedRestore?: boolean;
  /** Bukti merchant disahkan (untuk merchant_verified). */
  merchantEvidence?: boolean;
  /** Pelaku ialah admin dipercayai (untuk admin_verified). */
  trustedActor?: boolean;
  /** Revalidasi selesai (untuk keluar dari stale/rejected). */
  revalidated?: boolean;
  /** Versi penerbitan BAHARU dicipta (untuk keluar dari superseded/hidden). */
  newVersionCreated?: boolean;
}

const NO_EVIDENCE: ControlledTransitionEvidence = {};

export interface TransitionCheck {
  allowed: boolean;
  /** Kod sebab kanonikal bila ditolak. */
  reason?: string;
  /** Bukti yang tiada tetapi diperlukan. */
  requiredEvidence?: (keyof ControlledTransitionEvidence)[];
}

// ---------------------------------------------------------------------------
// Part D — MESIN KEADAAN STATUS PERNIAGAAN
// ---------------------------------------------------------------------------

/** Peralihan yang dibenarkan TANPA bukti tambahan. */
const PLACE_ALLOWED: Record<PlaceStatus, PlaceStatus[]> = {
  pending_validation: [
    "active",
    "permanently_closed",
    "hidden_by_admin",
    "community_unverified",
  ],
  active: [
    "temporarily_closed",
    "permanently_closed",
    "moved",
    "hidden_by_admin",
    "stale_critical",
  ],
  temporarily_closed: ["active", "permanently_closed", "hidden_by_admin", "stale_critical"],
  // permanently_closed → active HANYA dengan reopenEvidence (lihat PLACE_CONTROLLED).
  permanently_closed: ["hidden_by_admin"],
  // moved → active HANYA selepas semakan lokasi.
  moved: ["permanently_closed", "hidden_by_admin"],
  // hidden_by_admin → apa-apa HANYA melalui trustedRestore.
  hidden_by_admin: [],
  // stale_critical → active HANYA selepas revalidasi.
  stale_critical: ["temporarily_closed", "permanently_closed", "hidden_by_admin"],
  community_unverified: [
    "active",
    "temporarily_closed",
    "permanently_closed",
    "hidden_by_admin",
    "stale_critical",
  ],
};

/** Peralihan TERKAWAL: dibenarkan hanya bila SEMUA bukti tersenarai hadir. */
const PLACE_CONTROLLED: {
  from: PlaceStatus;
  to: PlaceStatus;
  required: (keyof ControlledTransitionEvidence)[];
  reason: string;
}[] = [
  {
    from: "permanently_closed",
    to: "active",
    required: ["reopenEvidence", "trustedActor"],
    reason: "reopen_requires_controlled_evidence",
  },
  {
    from: "moved",
    to: "active",
    required: ["locationReviewed"],
    reason: "move_requires_location_review",
  },
  {
    from: "hidden_by_admin",
    to: "active",
    required: ["trustedRestore"],
    reason: "unhide_requires_trusted_restore",
  },
  {
    from: "stale_critical",
    to: "active",
    required: ["revalidated"],
    reason: "stale_critical_requires_revalidation",
  },
];

export function checkPlaceStatusTransition(
  from: PlaceStatus,
  to: PlaceStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: "no_op_transition" };

  const controlled = PLACE_CONTROLLED.find((c) => c.from === from && c.to === to);
  if (controlled) {
    const missing = controlled.required.filter((k) => evidence[k] !== true);
    return missing.length === 0
      ? { allowed: true }
      : { allowed: false, reason: controlled.reason, requiredEvidence: missing };
  }

  if ((PLACE_ALLOWED[from] ?? []).includes(to)) return { allowed: true };
  return { allowed: false, reason: "transition_not_allowed" };
}

/** Bentuk boolean ringkas (tandatangan yang diminta spesifikasi Part D). */
export function canTransitionPlaceStatus(
  from: PlaceStatus,
  to: PlaceStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): boolean {
  return checkPlaceStatusTransition(from, to, evidence).allowed;
}

export function assertValidPlaceStatusTransition(
  from: PlaceStatus,
  to: PlaceStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): void {
  const r = checkPlaceStatusTransition(from, to, evidence);
  if (!r.allowed) {
    throw new Error(
      `invalid place status transition: ${from} -> ${to} (${r.reason ?? "denied"})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Part E — MESIN KEADAAN VERIFICATION
// ---------------------------------------------------------------------------

const VERIFICATION_ALLOWED: Record<VerificationStatus, VerificationStatus[]> = {
  unverified: ["source_verified", "community_reported", "rejected"],
  source_verified: ["community_reported", "rejected", "unverified"],
  // community_reported TIDAK boleh terus ke admin_verified tanpa pelaku
  // dipercayai (lihat VERIFICATION_CONTROLLED) — laporan komuniti tidak
  // boleh "menjadi" pengesahan admin secara senyap.
  community_reported: ["rejected", "unverified"],
  merchant_verified: ["community_reported", "rejected", "unverified"],
  admin_verified: ["community_reported", "rejected", "unverified"],
  // rejected mesti melalui revalidasi.
  rejected: [],
};

const VERIFICATION_CONTROLLED: {
  from: VerificationStatus | "*";
  to: VerificationStatus;
  required: (keyof ControlledTransitionEvidence)[];
  reason: string;
}[] = [
  {
    from: "*",
    to: "merchant_verified",
    required: ["merchantEvidence"],
    reason: "merchant_verification_requires_merchant_evidence",
  },
  {
    from: "*",
    to: "admin_verified",
    required: ["trustedActor"],
    reason: "admin_verification_requires_trusted_actor",
  },
  {
    from: "rejected",
    to: "unverified",
    required: ["revalidated"],
    reason: "rejected_requires_revalidation",
  },
  {
    from: "rejected",
    to: "source_verified",
    required: ["revalidated"],
    reason: "rejected_requires_revalidation",
  },
];

export function checkVerificationTransition(
  from: VerificationStatus,
  to: VerificationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: "no_op_transition" };

  const controlled = VERIFICATION_CONTROLLED.find(
    (c) => (c.from === "*" || c.from === from) && c.to === to,
  );
  if (controlled) {
    const missing = controlled.required.filter((k) => evidence[k] !== true);
    if (missing.length > 0) {
      return { allowed: false, reason: controlled.reason, requiredEvidence: missing };
    }
    // Bukti mencukupi — tetapi "rejected" masih tidak boleh melompat terus
    // ke verified tanpa revalidasi (dikuatkuasa oleh entri rejected di atas).
    if (from === "rejected" && evidence.revalidated !== true) {
      return {
        allowed: false,
        reason: "rejected_requires_revalidation",
        requiredEvidence: ["revalidated"],
      };
    }
    return { allowed: true };
  }

  if ((VERIFICATION_ALLOWED[from] ?? []).includes(to)) return { allowed: true };
  return { allowed: false, reason: "transition_not_allowed" };
}

export function canTransitionVerificationStatus(
  from: VerificationStatus,
  to: VerificationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): boolean {
  return checkVerificationTransition(from, to, evidence).allowed;
}

export function assertValidVerificationTransition(
  from: VerificationStatus,
  to: VerificationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): void {
  const r = checkVerificationTransition(from, to, evidence);
  if (!r.allowed) {
    throw new Error(
      `invalid verification transition: ${from} -> ${to} (${r.reason ?? "denied"})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Part F — MESIN KEADAAN PUBLICATION
// ---------------------------------------------------------------------------

const PUBLICATION_ALLOWED: Record<PublicationStatus, PublicationStatus[]> = {
  // draft TIDAK BOLEH terus ke published — mesti melalui review + approve.
  draft: ["needs_review", "rejected"],
  needs_review: ["approved", "rejected", "draft"],
  // approved → published ialah SATU-SATUNYA laluan masuk ke published.
  approved: ["published", "needs_review", "rejected"],
  published: ["stale", "hidden", "superseded"],
  // stale → published memerlukan revalidasi + versi baharu.
  stale: ["hidden", "superseded", "needs_review"],
  // hidden → published memerlukan restore terkawal + versi baharu.
  hidden: ["superseded", "needs_review"],
  // rejected TIDAK BOLEH terus ke published.
  rejected: ["needs_review", "draft"],
  // superseded ialah keadaan TERMINAL untuk versi itu — versi yang sama
  // tidak boleh diterbitkan semula (versi baharu diperlukan).
  superseded: [],
};

const PUBLICATION_CONTROLLED: {
  from: PublicationStatus;
  to: PublicationStatus;
  required: (keyof ControlledTransitionEvidence)[];
  reason: string;
}[] = [
  {
    from: "stale",
    to: "published",
    required: ["revalidated", "newVersionCreated"],
    reason: "stale_republish_requires_revalidation_and_new_version",
  },
  {
    from: "hidden",
    to: "published",
    required: ["trustedRestore", "newVersionCreated"],
    reason: "hidden_republish_requires_trusted_restore_and_new_version",
  },
];

export function checkPublicationTransition(
  from: PublicationStatus,
  to: PublicationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: "no_op_transition" };

  // Larangan mutlak — tiada bukti boleh membukanya.
  if (to === "published") {
    if (from === "draft") return { allowed: false, reason: "draft_cannot_publish_directly" };
    if (from === "needs_review") {
      return { allowed: false, reason: "needs_review_cannot_publish_directly" };
    }
    if (from === "rejected") return { allowed: false, reason: "rejected_cannot_publish" };
    if (from === "superseded") {
      return { allowed: false, reason: "superseded_version_cannot_republish" };
    }
  }

  const controlled = PUBLICATION_CONTROLLED.find((c) => c.from === from && c.to === to);
  if (controlled) {
    const missing = controlled.required.filter((k) => evidence[k] !== true);
    return missing.length === 0
      ? { allowed: true }
      : { allowed: false, reason: controlled.reason, requiredEvidence: missing };
  }

  if ((PUBLICATION_ALLOWED[from] ?? []).includes(to)) return { allowed: true };
  return { allowed: false, reason: "transition_not_allowed" };
}

export function canTransitionPublicationStatus(
  from: PublicationStatus,
  to: PublicationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): boolean {
  return checkPublicationTransition(from, to, evidence).allowed;
}

export function assertValidPublicationTransition(
  from: PublicationStatus,
  to: PublicationStatus,
  evidence: ControlledTransitionEvidence = NO_EVIDENCE,
): void {
  const r = checkPublicationTransition(from, to, evidence);
  if (!r.allowed) {
    throw new Error(
      `invalid publication transition: ${from} -> ${to} (${r.reason ?? "denied"})`,
    );
  }
}
