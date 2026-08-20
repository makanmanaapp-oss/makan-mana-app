import assert from "node:assert/strict";
import test from "node:test";

import {categoryForType, CRITICAL_TYPES, isNotificationType, shouldSuppressSelf, stableDedupKey} from "../notificationContract";
import {notificationFixtureCommand, notificationQaFixtureCommand} from "../notificationFixture";

test("notification contract validates types and categories", () => {
  assert.equal(isNotificationType("social_comment"), true);
  assert.equal(isNotificationType("social_quote"), true);
  assert.equal(isNotificationType("group_update"), true);
  assert.equal(isNotificationType("arbitrary"), false);
  assert.equal(categoryForType("weekly_report_ready"), "report");
  assert.equal(categoryForType("group_invite"), "group");
});

test("self notification is suppressed except allowlisted critical types", () => {
  assert.equal(shouldSuppressSelf("u1", "u1", "social_comment"), true);
  assert.equal(shouldSuppressSelf("u1", "u1", "account_security"), false);
  assert.equal(CRITICAL_TYPES.has("account_security"), true);
});

test("dedup key is deterministic and recipient-specific", () => {
  assert.equal(stableDedupKey("social_comment", "u1", "c1"), stableDedupKey("social_comment", "u1", "c1"));
  assert.notEqual(stableDedupKey("social_comment", "u1", "c1"), stableDedupKey("social_comment", "u2", "c1"));
});

test("emulator fixtures cover safe social and system examples", () => {
  const comment = notificationFixtureCommand("social_comment", "userA");
  const system = notificationFixtureCommand("system_announcement", "userA");
  assert.equal(comment.type, "social_comment");
  assert.equal(comment.deepLink, "/social");
  assert.equal(system.type, "system_announcement");
  assert.equal(system.deepLink, "/home");
});

test("production QA fixtures are self-recipient, marked and predetermined", () => {
  const normal = notificationQaFixtureCommand("social_comment", "ownerA");
  const suppressed = notificationQaFixtureCommand("self_suppressed_social_reaction", "ownerA");
  const unavailable = notificationQaFixtureCommand("unavailable_target", "ownerA");
  assert.equal(normal.recipientUid, "ownerA");
  assert.equal(normal.source, "qa_fixture");
  assert.equal(normal.deepLink, "/social");
  assert.equal(suppressed.actorUid, "ownerA");
  assert.equal(unavailable.entityId, "qa-unavailable-target");
  assert.equal(unavailable.deepLink, undefined);
});
