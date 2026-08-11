// HOTFIX 4.6 — people search ranking/annotation (pure unit tests, Part 33).
import assert from "node:assert/strict";
import test from "node:test";

import {buildPeopleResults, Candidate} from "../peopleSearchV2";

const C = (uid: string, displayName: string, username?: string): Candidate => ({uid, displayName, username});
const S = (...xs: string[]) => new Set(xs);
const base = {
  selfUid: "me",
  memberUids: S(),
  pendingUids: S(),
  followingUids: S(),
  blockedUids: S(),
  query: "",
};

test("self excluded from results (Part 33.2)", () => {
  const r = buildPeopleResults({...base, candidates: [C("me", "Me"), C("a", "Ahmad")]});
  assert.deepEqual(r.map((x) => x.uid), ["a"]);
});

test("member/invited/invite state annotated (Part 33.3/33.4)", () => {
  const r = buildPeopleResults({
    ...base,
    candidates: [C("m", "Member"), C("p", "Pending"), C("n", "New")],
    memberUids: S("m"), pendingUids: S("p"),
  });
  const by = Object.fromEntries(r.map((x) => [x.uid, x.state]));
  assert.equal(by.m, "member");
  assert.equal(by.p, "invited");
  assert.equal(by.n, "invite");
});

test("blocked user excluded (Part 33.11)", () => {
  const r = buildPeopleResults({...base, candidates: [C("b", "Blocked"), C("a", "Ahmad")], blockedUids: S("b")});
  assert.deepEqual(r.map((x) => x.uid), ["a"]);
});

test("deleted/empty-name candidate skipped", () => {
  const r = buildPeopleResults({...base, candidates: [C("d", "  "), C("a", "Ahmad")]});
  assert.deepEqual(r.map((x) => x.uid), ["a"]);
});

test("empty query → following ranked first (Part 33.1/33.8)", () => {
  const r = buildPeopleResults({
    ...base,
    candidates: [C("z", "Zainab"), C("f", "Faris")],
    followingUids: S("f"),
  });
  assert.equal(r[0].uid, "f");
  assert.equal(r[0].isFollowing, true);
});

test("exact @username ranks above prefix (Part 33.6/33.7)", () => {
  const r = buildPeopleResults({
    ...base,
    query: "ali",
    candidates: [C("x", "Aliya", "aliya"), C("y", "Ali", "ali")],
  });
  assert.equal(r[0].uid, "y"); // exact username 'ali'
});

test("followed match outranks non-followed exact username (Part 33.8)", () => {
  const r = buildPeopleResults({
    ...base,
    query: "ah",
    candidates: [C("x", "Ahmad", "ahmad"), C("f", "Ahfollow", "ahfollow")],
    followingUids: S("f"),
  });
  assert.equal(r[0].uid, "f"); // followed-first dominates
});

test("displayName prefix match included (Part 33.5)", () => {
  const r = buildPeopleResults({...base, query: "ah", candidates: [C("a", "Ahmad", "xyz")]});
  assert.equal(r.length, 1);
  assert.equal(r[0].uid, "a");
});

test("dedupe by uid", () => {
  const r = buildPeopleResults({...base, candidates: [C("a", "Ahmad"), C("a", "Ahmad dup")]});
  assert.equal(r.length, 1);
});
