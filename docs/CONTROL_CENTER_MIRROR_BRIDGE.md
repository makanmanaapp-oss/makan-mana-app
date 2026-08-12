# Control Center read-only mirror bridge

This bridge exports a privacy-minimized operational mirror from Firebase to the MakanMana Control Center.

## Safety boundary

- Firebase remains authoritative.
- The bridge performs Firestore reads only.
- It never mutates Firebase, Supabase, Google Play entitlement, or mobile app state directly.
- Raw email/phone values are never sent; only masked values may leave Firebase.
- Private and group-only social posts are excluded from mirror v1.
- No auth tokens, purchase tokens, passwords, DMs, or health data are exported.
- The Control Center's production-write and external-action flags remain independent and may stay disabled.

## Exported v1 entities

- `user` from `users/{uid}`
- `place` from active `place_publication_heads/{canonicalPlaceId}` + immutable `place_publications/{publicationId}`
- `social_post` from eligible `feed_posts/{postId}` records

Subscriptions and finance are intentionally excluded until their authoritative billing storage contract is reviewed separately.

## Endpoint

The Cloud Function pushes normalized batches to:

`https://makanmana-control-center.vercel.app/api/internal/sync/mirror`

Both the manual trigger and the outbound mirror request use the Firebase Secret Manager secret named `CONTROL_CENTER_SYNC_SECRET`. The same value must be configured as the Vercel server-side environment variable `CONTROL_CENTER_SYNC_SECRET`. Never commit or log the value.

## Manual request

`syncControlCenterMirrors` accepts POST JSON:

```json
{
  "entity": "user",
  "pageSize": 200,
  "maxPages": 10,
  "cursor": "optional-document-id"
}
```

Allowed entities: `user`, `place`, `social_post`, `all`.

The request must include:

`Authorization: Bearer <CONTROL_CENTER_SYNC_SECRET>`

If a single-entity run reports `complete: false`, repeat with the returned `nextCursor`.

## Idempotency

Each outbound batch receives a deterministic event ID derived from the normalized record payload. Re-running an unchanged batch is therefore treated as a duplicate by the Control Center ingest layer rather than creating duplicate mirror rows.
