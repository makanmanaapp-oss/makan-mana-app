/**
 * PROMPT 6.1 GATE C — marketing push contract is truthful (pure).
 *
 * Marketing is push-ELIGIBLE (Gate C) but OPT-IN with default OFF/OFF, so
 * eligibility never means unsolicited delivery: the resolver + persistence
 * decision gate everything. No admin bypass, no critical.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  CRITICAL_TYPES,
  resolveNotificationPersistence,
  resolvePreference,
} from "../notificationContract";
import {isPushEligibleType} from "../pushDelivery";

const MK = "marketing" as const;
const eligible = isPushEligibleType("marketing_campaign", MK); // Gate C: true
// The full persistence+push decision for a marketing record given a pref map.
function decide(prefs: Record<string, unknown>) {
  const pref = resolvePreference(prefs, MK, false);
  const persistence = resolveNotificationPersistence(pref, eligible);
  const pushDeliverable = pref.pushEnabled && eligible;
  return {pref, persistence, pushDeliverable};
}

test("marketing is push-eligible after Gate C", () => {
  assert.equal(eligible, true);
});

test("missing marketing preference → OFF/OFF, no record, no push", () => {
  const d = decide({});
  assert.deepEqual(d.pref, {inAppEnabled: false, pushEnabled: false});
  assert.equal(d.persistence.persist, false);
  assert.equal(d.pushDeliverable, false);
});

test("marketing OFF/OFF → no visible record, 0 push", () => {
  const d = decide({marketing: {inAppEnabled: false, pushEnabled: false}});
  assert.equal(d.persistence.persist, false);
  assert.equal(d.persistence.inAppVisible, false);
  assert.equal(d.pushDeliverable, false);
});

test("marketing In-App ON, Push OFF → visible record, 0 FCM", () => {
  const d = decide({marketing: {inAppEnabled: true, pushEnabled: false}});
  assert.equal(d.persistence.persist, true);
  assert.equal(d.persistence.inAppVisible, true);
  assert.equal(d.pushDeliverable, false);
});

test("marketing In-App OFF, Push ON → hidden canonical, push eligible (TRUTHFUL)", () => {
  const d = decide({marketing: {inAppEnabled: false, pushEnabled: true}});
  assert.equal(d.persistence.persist, true);       // record kept for the push tap
  assert.equal(d.persistence.inAppVisible, false);  // never shown / never counted
  assert.equal(d.pushDeliverable, true);            // push may deliver
});

test("marketing ON/ON → visible record + push eligible", () => {
  const d = decide({marketing: {inAppEnabled: true, pushEnabled: true}});
  assert.equal(d.persistence.persist, true);
  assert.equal(d.persistence.inAppVisible, true);
  assert.equal(d.pushDeliverable, true);
});

test("master OFF overrides an opted-in marketing preference (no bypass)", () => {
  const d = decide({master: {inAppEnabled: false, pushEnabled: false}, marketing: {inAppEnabled: true, pushEnabled: true}});
  assert.equal(d.pref.inAppEnabled, false);
  assert.equal(d.pref.pushEnabled, false);
  assert.equal(d.persistence.persist, false);
  assert.equal(d.pushDeliverable, false);
});

test("marketing is never critical (cannot bypass preferences)", () => {
  assert.equal(CRITICAL_TYPES.has("marketing_campaign"), false);
  // even a fully-off marketing pref is not overridden by any critical path
  const d = decide({marketing: {inAppEnabled: false, pushEnabled: false}});
  assert.equal(d.persistence.persist, false);
});
