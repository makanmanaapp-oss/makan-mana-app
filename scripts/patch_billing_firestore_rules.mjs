import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'firestore.rules');
const original = fs.readFileSync(file, 'utf8');

const oldUsers = `    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /suggestions/{suggestionId} {
        allow read, write: if isOwner(uid);
      }

      match /meals/{mealId} {
        allow read, write: if isOwner(uid);
      }
    }`;

const newUsers = `    // Billing fields are backend-owned. A client may create its own initial
    // Free profile, but cannot grant/revoke/alter paid entitlement afterwards.
    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid)
        && request.resource.data.uid == uid
        && request.resource.data.plan == 'free'
        && request.resource.data.planStatus == 'active'
        && !request.resource.data.keys().hasAny([
          'planSource', 'planPeriodEnd', 'billingProvider',
          'subscriptionProductId', 'billingUpdatedAt'
        ]);
      allow update: if isOwner(uid)
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny([
          'plan', 'planStatus', 'planSource', 'planPeriodEnd',
          'billingProvider', 'subscriptionProductId', 'billingUpdatedAt'
        ]);
      allow delete: if isOwner(uid);

      match /suggestions/{suggestionId} {
        allow read, write: if isOwner(uid);
      }

      match /meals/{mealId} {
        allow read, write: if isOwner(uid);
      }
    }`;

const billingAnchor = `    match /brain_metrics/{date} {
      allow read, write: if false;
    }`;

const billingBlock = `${billingAnchor}

    // ---------- Google Play Billing Authority ----------
    // Purchase ownership, raw tokens, entitlement state and RTDN receipts are
    // server-only. Firebase Admin SDK bypasses these client rules.
    match /billing_account_links/{docId} {
      allow read, write: if false;
    }

    match /billing_purchase_tokens/{tokenHash} {
      allow read, write: if false;
    }

    match /billing_entitlements/{uid} {
      allow read, write: if false;
    }

    match /billing_events/{eventId} {
      allow read, write: if false;
    }

    match /billing_rtdn_receipts/{messageId} {
      allow read, write: if false;
    }

    match /billing_unmatched_rtdn/{messageId} {
      allow read, write: if false;
    }`;

if (original.includes('match /billing_purchase_tokens/{tokenHash}')) {
  console.log('Billing Firestore rules are already patched.');
  process.exit(0);
}
if (!original.includes(oldUsers)) {
  throw new Error('Refuse: expected users rules block was not found; review rules manually.');
}
if (!original.includes(billingAnchor)) {
  throw new Error('Refuse: billing insertion anchor was not found; review rules manually.');
}

const patched = original
  .replace(oldUsers, newUsers)
  .replace(billingAnchor, billingBlock);

if (patched === original) {
  throw new Error('Refuse: rules patch produced no change.');
}

fs.writeFileSync(file, patched, 'utf8');
console.log('Patched firestore.rules: protected billing fields + server-only billing collections.');
