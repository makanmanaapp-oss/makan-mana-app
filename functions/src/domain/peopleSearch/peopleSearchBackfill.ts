// HOTFIX 4.6A — one-time public_profiles backfill of usernameLower/
// displayNameLower. Bounded, idempotent, dry-run capable, retry-safe, no delete,
// no private-field copy. Pure page processor with injected IO → emulator/unit
// testable. Production WRITE mode is gated in the callable wrapper.

import {computeLowerUpdate, LowerUpdate} from "./normalize";

export interface ProfileRow {
  id: string;
  data: Record<string, unknown>;
}
export interface BackfillDeps {
  listProfiles: (
    pageSize: number,
    cursor?: string
  ) => Promise<{docs: ProfileRow[]; nextCursor: string | null}>;
  writeLower: (id: string, upd: LowerUpdate) => Promise<void>;
}
export interface BackfillOpts {
  dryRun: boolean;
  pageSize: number;
  cursor?: string;
}
export interface BackfillPageResult {
  dryRun: boolean;
  scanned: number;
  updated: number;
  skipped: number;
  nextCursor: string | null;
}

export async function backfillPage(
  deps: BackfillDeps,
  opts: BackfillOpts
): Promise<BackfillPageResult> {
  const size = Math.max(1, Math.min(500, Math.floor(opts.pageSize || 200)));
  const {docs, nextCursor} = await deps.listProfiles(size, opts.cursor);
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  for (const d of docs) {
    scanned++;
    const upd = computeLowerUpdate(
      d.data.username as string | undefined,
      d.data.displayName as string | undefined,
      d.data as {usernameLower?: unknown; displayNameLower?: unknown}
    );
    if (!upd) {
      skipped++; // already current OR nothing to derive
      continue;
    }
    if (!opts.dryRun) await deps.writeLower(d.id, upd); // merge-only, no delete
    updated++;
  }
  return {dryRun: opts.dryRun, scanned, updated, skipped, nextCursor};
}
