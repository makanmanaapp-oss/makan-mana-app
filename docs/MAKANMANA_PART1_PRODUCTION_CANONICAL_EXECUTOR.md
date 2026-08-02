# MakanMana — PART 1 / Production Canonical Executor (Phase 1.14E)

The production-safe canonical migration executor. Adapts the approved migration
domain to write **real production** canonical records for the approved 25-SAFE
manifest only, under hard safety controls.

## Modules
- `functions/src/domain/places/migration/productionCanonical.ts` — **pure** builder
  (`buildProductionCanonicalWrite`): candidate → registry + immutable publication +
  active head + legacy→canonical aliases. Refuses unsafe input.
- `functions/scripts/placeProductionMigration.ts` — **guarded CLI** (modes
  `dry-run` | `execute` | `idempotency`). The only place that writes production.

## Safety controls
- **Manifest-by-checksum**: re-derives the 25 SAFE from production (read-only) and
  requires the derived checksum to equal both the manifest file's checksum and the
  `--manifest-checksum` argument (`925c3b83…`). Any drift → refuse.
- **Hard cap 25**; batch size must equal the manifest.
- **Required flags**: `--confirm-project=makanmana-c59f3`, `--owner-authorized`,
  `--no-delete`, `--preserve-legacy`; `--backup-reference` for execute.
- **Write allowlist + counter** (`GuardedWriter`): writes ONLY to `place_registry`,
  `place_publications`, `place_publication_heads`, `place_migration_aliases`,
  `place_migration_batches`, `place_migration_audit`. Any other target throws.
- **Forbidden**: `place_details`, `places_cache`, user/social/suggestion collections.
- **Per-candidate refusals**: `not_ready`, `missing_location`, `provider_mismatch`,
  `canonical_id_drift`, `empty_display_name`.
- **Idempotent**: existing `place_registry/{canonicalId}` → skipped; idempotency mode
  writes nothing.
- **Honest**: unknown states (hours/halal/allergen/business) stay `*_unknown`;
  rating shown only if legacy rating>0 with reviews. No fabrication.

## Record shapes
- `place_registry/{PLC-…}` — canonical identity + coords + provenance
  (`google_places_details`) + batch + backup ref + `publicScope=internal_cohort_only`.
- `place_publications/{PUB-…}` — immutable published version, honest display states,
  read by `submitPlaceCorrection.getActivePublication` + the read adapter.
- `place_publication_heads/{PLC-…}` — `{activePublicationId}`.
- `place_migration_aliases/{legacy/provider id}` — `{canonicalPlaceId, active}` so the
  alias resolver maps legacy IDs → canonical.
- `place_migration_batches/{PMB-…}` — batch checkpoint (`globalCompletion=false`).

## Tests
22 domain security tests (`productionCanonical.test.ts`), all pass. Executed live:
dry-run ×2 (zero-write), execute (25 migrated, 126 allowlist writes), idempotency
(0 writes).
