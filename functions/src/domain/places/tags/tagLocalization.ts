/**
 * Phase 1.5 — kontrak penyetempatan (localization). ID canonical disimpan
 * backend; labelKey dihantar ke klien; label BM/EN/ZH/TA kekal sumber l10n.
 * TIADA teks terjemah sebagai kunci Firestore.
 */
import { TagFamily } from "../placeTags";

export interface TagLocalizationRef {
  tagId: string;
  familyId: TagFamily;
  /** Kunci l10n (bukan teks setempat). */
  labelKey: string;
  /** Fallback selamat = label English canonical atau ID. */
  fallbackLabel: string;
}

export function tagLabelKey(familyId: TagFamily, tagId: string): string {
  return `tag.${familyId}.${tagId}`;
}

export interface LocalizedIdCheck {
  localized: boolean;
  reasons: string[];
}

/**
 * Kesan ID yang berkemungkinan label terjemah/teks setempat dipakai sebagai
 * kunci DB: ruang, huruf besar, tanda baca berat, Unicode bukan-ascii.
 * Transliterasi canonical sah (cth. "ayam_geprek", "nasi_lemak") TIDAK ditolak.
 */
export function isLikelyLocalizedTagId(id: string): LocalizedIdCheck {
  const reasons: string[] = [];
  if (/\s/.test(id)) reasons.push("contains_space");
  if (/[A-Z]/.test(id)) reasons.push("contains_uppercase");
  if (/[^a-z0-9_]/.test(id)) {
    if (/[^\x00-\x7F]/.test(id)) reasons.push("non_ascii");
    else reasons.push("punctuation");
  }
  return { localized: reasons.length > 0, reasons };
}
