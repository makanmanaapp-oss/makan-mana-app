# Place Data A1 — Freshness and TTL verification

Bounded, read-only. **No production record was refreshed or mutated.**

## TTL — exact

Measured on a live `places_pool_v3` cell (aggregation + single-document
metadata read, no bulk download):

| Field | Value |
| --- | --- |
| `createdAt` | 1785150168191 |
| `earlyRefreshAt` | 1785236568191 |
| `expiresAt` | 1785754968191 |

- `expiresAt − createdAt` = **604,800,000 ms = exactly 7 days** ✓ contract
- `earlyRefreshAt − createdAt` = 86,400,000 ms = **1 day** — the early-refresh
  hint fires well before expiry, so a cell is refreshed proactively rather than
  being served stale and then hard-expiring.
- `schemaVersion` = 3, `rawCount` 40 / `uniqueCount` 40, `providerQueryCount` 2.

Every pool cell therefore carries an explicit expiry. **No indefinite cache
record exists without a policy** — `expiresAt` is populated on the sampled cell
and the field is written unconditionally by the pool writer.

## State distinguishability

The canonical contract keeps "we don't know" separate from "we know it is
zero/absent", which is what stops a missing value being rendered as a fact:

| State | Representation |
| --- | --- |
| fresh | `now < earlyRefreshAt` |
| refresh-due | `earlyRefreshAt ≤ now < expiresAt` |
| expired | `now ≥ expiresAt` |
| unknown | `*Known: false` + `*_unknown` publication state |
| unavailable | absent source, surfaced as its own state, never coerced |

Verified on the live pilot (aggregate counts only): `hoursKnown=false` ×25 with
`hours_unknown` ×25, `priceKnown=false` ×25 with `price_unknown` ×25,
`halal_unknown` ×25. Expired data cannot masquerade as fresh because freshness
is derived from the stored timestamps rather than stored as a boolean.

## Internal consistency

`createdAt < earlyRefreshAt < expiresAt` holds on the sampled cell, and the
migration-era source timestamps are independent of pool refresh timestamps —
the two clocks are not conflated.
