/** Phase 1.2 — identiti, lokasi, kontak & snapshot paparan diluluskan. */
import { EpochMillis } from "./common";

export interface PlaceIdentity {
  canonicalName: string;
  /** Nama dinormalkan (huruf kecil, tanpa noise) untuk padanan dedup nanti. */
  normalizedName: string;
  alternateNames: string[];
  branchName?: string;
  merchantRegistrationId?: string;
  websiteDomain?: string;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
  address?: string;
  locality?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
  /** Sel liputan stabil (Phase 1.7) — belum diisi dalam fasa ini. */
  canonicalCellId?: string;
  geohash?: string;
}

export interface PlaceContacts {
  phones: string[];
  email?: string;
  website?: string;
}

/**
 * Snapshot medan paparan yang telah diluluskan (immutable pada publish).
 * Hanya nama/alamat venue yang dibenarkan sebagai teks sudah-setempat.
 */
export interface ApprovedDisplaySnapshot {
  name: string;
  address?: string;
  approvedAt?: EpochMillis;
  approvedBy?: string;
}
