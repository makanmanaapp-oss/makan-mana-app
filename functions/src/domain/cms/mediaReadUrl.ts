/**
 * B1 — server-mediated READ access to CMS banner media.
 *
 * `cms/` stays private. Storage rules deny every client read, exactly as they
 * do for `group_images/`, and nothing here changes that. The app gets a
 * short-lived v4 signed READ url minted per request instead, so an operator's
 * image is viewable for as long as it takes to render it and no longer.
 *
 * Everything in this module is pure: the signer is injected. That is what lets
 * the fail-safe behaviour below be tested for real rather than asserted in a
 * comment — a signing outage is the case that matters most, and it is the one
 * a Firebase-coupled implementation would be unable to exercise.
 *
 * THE RULE: a banner must survive its image failing. Media that cannot be
 * signed degrades to `readUrl: null`, the text card still renders, and the
 * surface it sits on is untouched. A CMS image problem is never allowed to
 * become a blank Home screen.
 */
import {MEDIA_STORAGE_PREFIX} from "./cmsTypes";
import type {PublicCmsContent, PublicCmsMedia} from "./cmsDocument";

/**
 * Deliberately shorter than the 30 minute group-image read window. A banner is
 * rendered immediately on arrival; it never needs a url that outlives the
 * screen, and a shorter window narrows what a leaked url is worth.
 */
export const CMS_MEDIA_READ_TTL_MS = 15 * 60 * 1000;

/** Longest storage path worth signing. Well above any real `cms/` key. */
const MAX_PATH_LENGTH = 500;

/**
 * Whether a stored path may be signed at all.
 *
 * This is the containment boundary: the signer is given a path from a Firestore
 * document, and a document is written by the admin bridge. Re-checking here
 * means that even a malformed or tampered row cannot cause a url to be minted
 * for an object outside `cms/` — the signer never sees anything this rejects.
 */
export function isSignableCmsMediaPath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const path = value.trim();
  if (!path || path.length > MAX_PATH_LENGTH) return false;
  // Must live under the prefix this domain owns.
  if (!path.startsWith(MEDIA_STORAGE_PREFIX)) return false;
  // A prefix match alone is not containment: `cms/../secrets/x` starts with
  // `cms/` and escapes it.
  if (path.includes("..")) return false;
  if (path.includes("//")) return false;
  // A directory is not an object.
  if (path.endsWith("/")) return false;
  // Backslashes and control characters have no place in a storage key and are
  // a classic way to smuggle a different path past a naive check. Written as
  // explicit escapes, never as literal control bytes: a raw control character
  // makes the file read as binary to ordinary tooling and can be dropped by a
  // careless re-save, silently weakening this check.
  if (path.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}

/** Mints a short-lived READ url for one object. Injected, never imported. */
export type CmsMediaReadSigner = (
  storagePath: string,
  expiresAtMs: number,
) => Promise<string>;

function withReadUrl(media: PublicCmsMedia, readUrl: string | null): PublicCmsMedia {
  return {...media, readUrl};
}

/**
 * Attach a signed READ url to every item's media.
 *
 * Signing is per-object and failure is per-object: one unsignable image must
 * not cost the other banners their pictures, and must never reject the whole
 * response. Identical paths are signed once — placements are capped at three
 * items, but a campaign that reuses one image should not pay three times.
 *
 * Returns items in the SAME order they arrived. Ordering is decided upstream by
 * `compareCmsOrder`, and re-ordering here would silently override it.
 */
export async function attachCmsMediaReadUrls(
  items: readonly PublicCmsContent[],
  signer: CmsMediaReadSigner,
  nowMs: number,
  onError?: (storagePath: string, error: unknown) => void,
): Promise<PublicCmsContent[]> {
  if (items.length === 0) return [];

  const expiresAtMs = nowMs + CMS_MEDIA_READ_TTL_MS;
  const signed = new Map<string, Promise<string | null>>();

  const signOnce = (storagePath: string): Promise<string | null> => {
    const cached = signed.get(storagePath);
    if (cached) return cached;
    const pending = signer(storagePath, expiresAtMs)
      .then((url) => (typeof url === "string" && url.trim() ? url : null))
      .catch((error) => {
        // Fail safe: the banner keeps its copy and loses its picture.
        onError?.(storagePath, error);
        return null;
      });
    signed.set(storagePath, pending);
    return pending;
  };

  return Promise.all(items.map(async (item) => {
    const media = item.media;
    if (!media) return item;
    if (!isSignableCmsMediaPath(media.storagePath)) {
      onError?.(String(media.storagePath ?? ""), new Error("path_not_signable"));
      return {...item, media: withReadUrl(media, null)};
    }
    const url = await signOnce(media.storagePath);
    return {...item, media: withReadUrl(media, url)};
  }));
}
