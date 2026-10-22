import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {db} from "../../../../config/firebase";
import {deliverRecommendation, recordRecommendationReject, runRecommendationRequest} from "../../../../services/recommendationDeliveryService";
import {prepareRecommendationSource, type RecommendationSource} from "../../../../services/recommendationSourceService";
import {getSuggestions} from "../../../../callable/getSuggestions";
import {nextSuggestion} from "../../../../callable/nextSuggestion";
import {RECOMMENDATION_COOLDOWN_MS as TTL} from "../../recommendationPolicy";
import {place} from "../fixtures";
const skip = !process.env.FIRESTORE_EMULATOR_HOST ? "requires isolated Firestore emulator" : false;
const now = Date.now();
const uid = () => `rec-${randomUUID()}`;
const context = (hash = "a".repeat(24)) => ({lat: 3.1, lng: 101.6, radiusMeters: 3000, mood: null, languageCode: "ms", contextHash: hash});
const source = (ids = ["outlet-a", "outlet-b"]): RecommendationSource => ({candidates: ids.map((id) => place({placeId: id, lat: 3.1, lng: 101.6})), aliases: {}});

test("emulator: simultaneous different-context requests cannot issue the same outlet", {skip}, async () => {
  const user = uid();
  const results = await Promise.all([deliverRecommendation(user, source(["only"]), context(), now), deliverRecommendation(user, source(["only"]), context("b".repeat(24)), now)]);
  assert.equal(results.filter(Boolean).length, 1);
});
test("emulator: separate users keep separate cooldowns", {skip}, async () => {
  const results = await Promise.all([deliverRecommendation(uid(), source(["only"]), context(), now), deliverRecommendation(uid(), source(["only"]), context(), now)]);
  assert.ok(results.every(Boolean));
});
test("emulator: 26-hour boundary is enforced against stored history", {skip}, async () => {
  const user = uid();
  assert.ok(await deliverRecommendation(user, source(["only"]), context(), now));
  assert.equal(await deliverRecommendation(user, source(["only"]), context(), now + TTL - 1), null);
  assert.ok(await deliverRecommendation(user, source(["only"]), context(), now + TTL));
});
test("emulator: reject retries create one memory increment and one learning event", {skip}, async () => {
  const user = uid();
  await Promise.all([recordRecommendationReject(user, "only", "same-event", "not_mood", now), recordRecommendationReject(user, "only", "same-event", "not_mood", now)]);
  const records = await db.collection("users").doc(user).collection("place_reject_memory").get();
  assert.equal(records.docs[0].data().rejectCount, 1);
  const events = await db.collection("events").where("userId", "==", user).get();
  assert.equal(events.size, 1);
  assert.equal(await deliverRecommendation(user, source(["only"]), context(), now + 25 * 3600000), null);
});
test("emulator: expired rejected outlet stays behind fresh candidates", {skip}, async () => {
  const user = uid();
  await recordRecommendationReject(user, "outlet-a", "old-reject", "not_mood", now - TTL - 1);
  assert.equal((await deliverRecommendation(user, source(), context(), now))?.primary.placeId, "outlet-b");
});
test("emulator: profile updates are read at delivery, not cached from the shortlist", {skip}, async () => {
  const user = uid();
  await db.collection("user_profiles").doc(user).set({allergies: ["seafood"]});
  const pool = source(); pool.candidates[0].cuisine = "seafood"; pool.candidates[0].name = "Seafood House";
  assert.equal((await deliverRecommendation(user, pool, context(), now))?.primary.placeId, "outlet-b");
});
test("emulator: legacy pre-upgrade suggestion documents bootstrap cooldown", {skip}, async () => {
  const user = uid();
  await db.collection("users").doc(user).collection("suggestions").doc("legacy").set({placeId: "only", createdAt: Timestamp.fromMillis(now - 1000)});
  assert.equal(await deliverRecommendation(user, source(["only"]), context(), now), null);
});
test("emulator: canonical registration preserves old provider reject history", {skip}, async () => {
  const user = uid(); const provider = `provider-${randomUUID()}`; const canonical = `PLC-${randomUUID()}`;
  await recordRecommendationReject(user, provider, "before-registration", "other", now);
  await db.collection("place_migration_aliases").doc(provider).set({canonicalPlaceId: canonical, active: true});
  const pool = source([canonical]); pool.candidates[0].canonicalPlaceId = canonical; pool.aliases[canonical] = [provider, canonical];
  assert.equal(await deliverRecommendation(user, pool, context(), now), null);
});
test("emulator: request replay returns its result without repeating work", {skip}, async () => {
  const user = uid(); let calls = 0;
  const work = async () => ({value: ++calls});
  assert.deepEqual(await runRecommendationRequest(user, "request", "same", work), {value: 1});
  assert.deepEqual(await runRecommendationRequest(user, "request", "same", work), {value: 1});
  await assert.rejects(runRecommendationRequest(user, "request", "different", work));
  assert.equal(calls, 1);
});
test("emulator: a source changed after preparation cannot be delivered", {skip}, async () => {
  const user = uid(); const ref = db.collection("recommendation_test_versions").doc(uid());
  await ref.set({version: 1}); const snapshot = await ref.get();
  const pool = source(); pool.versionChecks = [{path: ref.path, version: snapshot.updateTime!.valueOf()}];
  await ref.set({version: 2});
  await assert.rejects(deliverRecommendation(user, pool, context(), now), /recommendation_source_changed/);
});
test("emulator: source only includes active approved publications and strips private fields", {skip}, async () => {
  const canonical = `PLC-${randomUUID()}`; const provider = `provider-${randomUUID()}`; const publication = `PUB-${randomUUID()}`;
  await db.collection("place_registry").doc(canonical).set({provenanceSource: "makanmana_master_registry", lifecycleStatus: "active", firebaseId: provider});
  await db.collection("place_migration_aliases").doc(provider).set({canonicalPlaceId: canonical, active: true});
  await db.collection("place_publication_heads").doc(canonical).set({activePublicationId: publication});
  const pub = db.collection("place_publications").doc(publication);
  await pub.set({publicationStatus: "published", blocked: false, name: "Approved Shop", lat: 3.1, lng: 101.6, businessStatus: "active", ownerEmail: "private@example.invalid", reviewNotes: "PRIVATE-NOTES", menuItems: [{name: "Meal", price: 8, available: true, section: "makanan"}]});
  const pool = await prepareRecommendationSource(source([provider]).candidates, context(), now);
  const matches = pool.candidates.filter((p) => p.canonicalPlaceId === canonical);
  assert.equal(matches.length, 1); assert.equal(matches[0].menuItems?.[0].price, 8);
  assert.ok(!JSON.stringify(matches).includes("private@example")); assert.ok(!JSON.stringify(matches).includes("PRIVATE-NOTES"));
  await pub.update({publicationStatus: "withdrawn"});
  const after = await prepareRecommendationSource(source([provider]).candidates, context(), now);
  assert.ok(!after.candidates.some((p) => p.placeId === provider || p.canonicalPlaceId === canonical));
});
test("emulator: actual Home/Spin/Next handlers share cooldown without cohort flags", {skip}, async () => {
  const user = uid(); const hash = "f".repeat(24);
  const first = await deliverRecommendation(user, source(["api-a", "api-b", "api-c"]), context(hash), now);
  assert.ok(first);
  const response = await nextSuggestion.run({auth: {uid: user, token: {}}, data: {action: "reject", contextHash: hash, actionId: "api-action", placeId: first.primary.placeId, suggestionId: first.suggestionId}} as never) as Record<string, unknown>;
  assert.equal(response.actionAccepted, true); assert.ok(response.nextPlace); assert.notEqual((response.nextPlace as {placeId: string}).placeId, first.primary.placeId);
  const replay = await nextSuggestion.run({auth: {uid: user, token: {}}, data: {action: "reject", contextHash: hash, actionId: "api-action", placeId: first.primary.placeId, suggestionId: first.suggestionId}} as never);
  assert.deepEqual(replay, response);
  // The callable with no client location must not fabricate a KL suggestion.
  const missingLocation = await getSuggestions.run({auth: {uid: user, token: {}}, data: {mode: "preview", requestId: "no-location"}} as never) as Record<string, unknown>;
  assert.equal(missingLocation.status, "PLACES_UNAVAILABLE");
});

test("emulator: real Home -> Reject -> Spin exhausts the published pool and refunds quota", {skip}, async () => {
  const user = uid();
  const request = {auth: {uid: user, token: {}}, data: {mode: "preview", requestId: "home-request", lat: 3.1, lng: 101.6, radiusMeters: 3000}};
  // Published, provider-independent fixture from the preceding source test is
  // withdrawn. Publish two distinct outlet fixtures for this actual handler.
  for (let i = 0; i < 2; i++) {
    const id = `PLC-api-${randomUUID()}`;
    await db.collection("place_registry").doc(id).set({provenanceSource: "makanmana_master_registry", lifecycleStatus: "active"});
    await db.collection("place_publication_heads").doc(id).set({activePublicationId: id});
    await db.collection("place_publications").doc(id).set({publicationStatus: "published", name: `Shop ${i}`, businessStatus: "active", lat: 3.1, lng: 101.6});
  }
  const home = await getSuggestions.run(request as never) as Record<string, unknown>;
  assert.equal(home.status, "OK");
  assert.equal((home.alternatives as unknown[]).length, 0, "client must not locally recycle a shortlist");
  const rejected = await nextSuggestion.run({auth: request.auth, data: {action: "reject", contextHash: home.contextHash, actionId: "home-reject", placeId: (home.primary as {placeId: string}).placeId, suggestionId: home.suggestionId}} as never) as Record<string, unknown>;
  assert.ok(rejected.nextPlace);
  assert.notEqual((rejected.nextPlace as {placeId: string}).placeId, (home.primary as {placeId: string}).placeId);
  const spin = await getSuggestions.run({auth: request.auth, data: {...request.data, mode: "spin", requestId: "spin-request", forceLegacy: true}} as never) as Record<string, unknown>;
  assert.equal(spin.status, "OK_EMPTY"); assert.equal(spin.spinRefunded, true);
  const usage = await db.collection("daily_usage").where("userId", "==", user).get();
  assert.equal(usage.docs[0].data().spinUsed, 0);
  await assert.rejects(getSuggestions.run(request as never), /recommendation_replay_no_longer_current/);
});

test("emulator: legacy preview reject bridges once, plain views do not reject", {skip}, async () => {
  const {ingestLegacyRecommendationSkip} = await import("../../../../triggers/onLegacyRecommendationSkipped");
  const user = uid();
  const first = await deliverRecommendation(user, source(["legacy-preview"]), context(), now);
  assert.ok(first);
  const data = {eventType: "suggestion_skipped", userId: user, placeId: "legacy-preview", metadata: {reason: "not_mood"}};
  assert.equal(await ingestLegacyRecommendationSkip("legacy-event", data), true);
  assert.equal(await ingestLegacyRecommendationSkip("legacy-event", data), true);
  assert.equal(await ingestLegacyRecommendationSkip("view", {...data, eventType: "suggestion_viewed"}), false);
  const rejects = await db.collection("users").doc(user).collection("place_reject_memory").get();
  assert.equal(rejects.docs[0].data().rejectCount, 1);
});
