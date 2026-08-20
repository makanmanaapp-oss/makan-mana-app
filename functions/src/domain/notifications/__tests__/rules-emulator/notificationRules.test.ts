/** Notification ownership and safe-state Firestore rules. Run via test:rules. */
import {after, before, beforeEach, test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc} from "firebase/firestore";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) throw new Error("FIRESTORE_EMULATOR_HOST unset — run via npm run test:rules.");
const [host, port] = HOST.split(":");
let env: RulesTestEnvironment;

const path = (uid: string, id = "n1") => `users/${uid}/notifications/${id}`;
const seeded = {
  recipientUid: "userA", type: "social_comment", category: "social",
  titleKey: "notificationSocialCommentTitle", bodyKey: "notificationSocialCommentBody",
  metadata: {postId: "private-post"}, createdAt: new Date("2026-08-14T00:00:00Z"),
  isRead: false, status: "unread", schemaVersion: 2,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mm-notifications-rules",
    firestore: {rules: readFileSync(resolve(process.cwd(), "..", "firestore.rules"), "utf8"), host, port: Number(port)},
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path("userA")), seeded);
    await setDoc(doc(context.firestore(), path("userB")), {...seeded, recipientUid: "userB", metadata: {postId: "another-private-post"}});
  });
});

test("A: recipient can read own notification", async () => {
  await assertSucceeds(getDoc(doc(env.authenticatedContext("userA").firestore(), path("userA"))));
});
test("B/H: another user cannot read notification or its protected metadata", async () => {
  await assertFails(getDoc(doc(env.authenticatedContext("userA").firestore(), path("userB"))));
});
test("C: client cannot create a trusted notification", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), path("userB", "forged")), seeded));
});
test("D: recipient cannot mark another user's notification read", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), path("userB")), {isRead: true, readAt: new Date(), status: "read"}, {merge: true}));
});
test("recipient may persist only the allowed opened/read state", async () => {
  await assertSucceeds(setDoc(doc(env.authenticatedContext("userA").firestore(), path("userA")), {isRead: true, readAt: new Date(), openedAt: new Date(), status: "read"}, {merge: true}));
});

test("legacy mobile may mark read without changing status", async () => {
  await assertSucceeds(setDoc(
    doc(env.authenticatedContext("userA").firestore(), path("userA")),
    {isRead: true, readAt: new Date()},
    {merge: true},
  ));
});

test("recipient cannot change notification status to an arbitrary value", async () => {
  await assertFails(setDoc(
    doc(env.authenticatedContext("userA").firestore(), path("userA")),
    {isRead: true, readAt: new Date(), status: "forged"},
    {merge: true},
  ));
});
test("E: trusted backend fixture path can create a valid persisted record", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await assertSucceeds(setDoc(doc(context.firestore(), path("userA", "backend-created")), seeded));
  });
});

// ── PROMPT 3.1 — push device registry + delivery-log ownership (Part 7) ──
// Tokens are private. Registry writes are SERVER-ONLY (registerPushDevice /
// unregisterPushDevice callables run with admin privilege). Delivery logs are
// never client-visible. These prove no cross-user token leakage / enumeration.
const devPath = (uid: string, id = "inst-1") => `users/${uid}/pushDevices/${id}`;
const delPath = (uid: string, id = "n1__inst-1") => `users/${uid}/push_deliveries/${id}`;
const deviceDoc = {
  deviceId: "inst-1", token: "f".repeat(140), platform: "android", enabled: true,
  createdAt: new Date("2026-08-14T00:00:00Z"), tokenUpdatedAt: new Date("2026-08-14T00:00:00Z"),
  schemaVersion: 2,
};
const deliveryDoc = {
  notificationId: "n1", deviceId: "inst-1", tokenMask: "tok_abc123", status: "sent",
  attemptedAt: new Date("2026-08-14T00:00:00Z"),
};

test("P1: owner CAN read own push device (registration confirmation)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), devPath("userA")), deviceDoc);
  });
  await assertSucceeds(getDoc(doc(env.authenticatedContext("userA").firestore(), devPath("userA"))));
});
test("P2: user B CANNOT read user A's push device (no token leakage)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), devPath("userA")), deviceDoc);
  });
  await assertFails(getDoc(doc(env.authenticatedContext("userB").firestore(), devPath("userA"))));
});
test("P3: unauthenticated CANNOT read any push device", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), devPath("userA")), deviceDoc);
  });
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), devPath("userA"))));
});
test("P4: client CANNOT create its own push device (server-only registration)", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), devPath("userA")), deviceDoc));
});
test("P5: client CANNOT update/overwrite an existing push device (no token injection)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), devPath("userA")), deviceDoc);
  });
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), devPath("userA")),
    {...deviceDoc, token: "z".repeat(140)}, {merge: true}));
});
test("P6: user B CANNOT write into user A's device registry (no cross-user binding)", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userB").firestore(), devPath("userA")), deviceDoc));
});
test("P7: owner CANNOT read own push_deliveries log (server-only observability)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), delPath("userA")), deliveryDoc);
  });
  await assertFails(getDoc(doc(env.authenticatedContext("userA").firestore(), delPath("userA"))));
});
test("P8: user B CANNOT read user A's push_deliveries log", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), delPath("userA")), deliveryDoc);
  });
  await assertFails(getDoc(doc(env.authenticatedContext("userB").firestore(), delPath("userA"))));
});
test("P9: client CANNOT write push_deliveries (no forged delivery records)", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), delPath("userA")), deliveryDoc));
});
test("P10: trusted backend path CAN seed device + delivery (admin bypass works)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await assertSucceeds(setDoc(doc(c.firestore(), devPath("userA")), deviceDoc));
    await assertSucceeds(setDoc(doc(c.firestore(), delPath("userA")), deliveryDoc));
  });
});

// ── PROMPT 4 — notification preferences are server-only (Part 25/37) ──
test("PREF1: client CANNOT write own notificationPreferences directly (callable-only)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users/userA"), {displayName: "A"});
  });
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), "users/userA"),
    {notificationPreferences: {social: {pushEnabled: false}}}, {merge: true}));
});
test("PREF2: client CANNOT write notificationQuietHours directly", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users/userA"), {displayName: "A"});
  });
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), "users/userA"),
    {notificationQuietHours: {quietHoursEnabled: true}}, {merge: true}));
});
test("PREF3: client CAN still update its own non-protected user fields", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users/userA"), {displayName: "A"});
  });
  await assertSucceeds(setDoc(doc(env.authenticatedContext("userA").firestore(), "users/userA"),
    {displayName: "A2"}, {merge: true}));
});
test("PREF4: user B CANNOT write user A's notificationPreferences", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users/userA"), {displayName: "A"});
  });
  await assertFails(setDoc(doc(env.authenticatedContext("userB").firestore(), "users/userA"),
    {notificationPreferences: {social: {pushEnabled: false}}}, {merge: true}));
});

// ── PROMPT 4A — recipient cannot forge server-owned inAppVisible (Part 30) ──
test("PREF5: recipient CANNOT write inAppVisible (server-owned presentation)", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(), path("userA")),
    {isRead: true, readAt: new Date(), status: "read", inAppVisible: true}, {merge: true}));
});

// ── PROMPT 5A — meal reminder schedules are server-only (Part 28) ──
test("PREF6: client CANNOT read meal_reminder_schedules", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "meal_reminder_schedules/userA__lunch"),
      {uid: "userA", slot: "lunch", enabled: true, nextDueAt: new Date()});
  });
  await assertFails(getDoc(doc(env.authenticatedContext("userA").firestore(),
    "meal_reminder_schedules/userA__lunch")));
});
test("PREF7: client CANNOT write/forge a meal reminder schedule", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(),
    "meal_reminder_schedules/userA__lunch"),
    {uid: "userA", slot: "lunch", enabled: true, nextDueAt: new Date()}));
});
test("PREF8: client CANNOT read/write reconciliation checkpoint (Part 22)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "notification_reconcile_state/meal_backfill"),
      {cursorPath: "users/x/pushDevices/y"});
  });
  await assertFails(getDoc(doc(env.authenticatedContext("userA").firestore(),
    "notification_reconcile_state/meal_backfill")));
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(),
    "notification_reconcile_state/meal_backfill"), {cursorPath: "hack"}));
});

// ── PROMPT 6A — admin broadcast test-recipient allowlist is server-only ──────
test("PREF9: client CANNOT read/write notification_test_recipients (Prompt 6A)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "notification_test_recipients/userA"),
      {firebase_uid: "userA", active: true, label: "QA"});
  });
  // No normal user (even the same uid) may read the allowlist or forge an entry.
  await assertFails(getDoc(doc(env.authenticatedContext("userA").firestore(),
    "notification_test_recipients/userA")));
  await assertFails(setDoc(doc(env.authenticatedContext("userA").firestore(),
    "notification_test_recipients/userA"), {active: true, label: "self-add"}));
  await assertFails(setDoc(doc(env.authenticatedContext("userB").firestore(),
    "notification_test_recipients/userC"), {active: true}));
});
