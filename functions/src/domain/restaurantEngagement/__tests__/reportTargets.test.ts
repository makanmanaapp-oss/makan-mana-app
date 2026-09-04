import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {buildMenuCommentReportContext, isValidReportTarget, REPORT_TARGET_TYPES} from "../reportTargets";

// Required test 18 — existing report targets still work.
test("existing report targets remain valid", () => {
  for (const t of ["post", "comment", "user", "group", "bill"]) {
    assert.equal(isValidReportTarget(t), true, t);
  }
});

// Required test 19 — menu-comment reporting target accepted.
test("menu_comment is an accepted report target; unknown targets rejected", () => {
  assert.equal(isValidReportTarget("menu_comment"), true);
  assert.equal((REPORT_TARGET_TYPES as readonly string[]).includes("menu_comment"), true);
  assert.equal(isValidReportTarget("restaurant"), false);
  assert.equal(isValidReportTarget(""), false);
  assert.equal(isValidReportTarget(null), false);
});

test("reportContent uses the shared target allowlist (no inline list drift)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/callable/followControl.ts"), "utf8");
  assert.ok(src.includes("isValidReportTarget(type)"));
  // the old inline allowlist must be gone
  assert.equal(src.includes('["post", "comment", "user", "group", "bill"]'), false);
});

// ── Fix 4 — menu-comment reports carry server-derived moderation context ──

test("a missing menu-comment target yields no context (report must be rejected)", () => {
  assert.equal(buildMenuCommentReportContext("c1", null), null);
  assert.equal(buildMenuCommentReportContext("c1", undefined), null);
});

test("context is derived from the STORED target document only", () => {
  const stored = {
    canonicalPlaceId: "canon-REAL",
    menuItemId: "menu-REAL",
    authorType: "user",
    authorUid: "author-1",
    restaurantId: null,
    parentCommentId: "parent-9",
    text: "sedap",
  };
  const ctx = buildMenuCommentReportContext("c1", stored);
  assert.ok(ctx);
  assert.equal(ctx!.targetId, "c1");
  assert.equal(ctx!.canonicalPlaceId, "canon-REAL");
  assert.equal(ctx!.menuItemId, "menu-REAL");
  assert.equal(ctx!.authorType, "user");
  assert.equal(ctx!.authorUid, "author-1");
  assert.equal(ctx!.parentCommentId, "parent-9");
  // an official restaurant reply target keeps restaurant identity, no author uid
  const reply = buildMenuCommentReportContext("c2", {
    canonicalPlaceId: "canon-REAL", menuItemId: "menu-REAL",
    authorType: "restaurant", authorUid: null, restaurantId: "canon-REAL",
  });
  assert.equal(reply!.authorType, "restaurant");
  assert.equal(reply!.restaurantId, "canon-REAL");
  assert.equal(reply!.authorUid, null);
});

test("client-supplied restaurant/menu context cannot influence the report context", () => {
  // The builder accepts ONLY the stored document — there is no client-input
  // parameter, so spoofed values in a request can never reach the report.
  const stored = {canonicalPlaceId: "canon-REAL", menuItemId: "menu-REAL", authorType: "user", authorUid: "a1"};
  const ctx = buildMenuCommentReportContext("c1", stored);
  assert.equal(ctx!.canonicalPlaceId, "canon-REAL");
  assert.equal(ctx!.menuItemId, "menu-REAL");
  assert.equal(buildMenuCommentReportContext.length, 2); // (targetId, stored) only
});

test("reportContent requires + server-loads the menu-comment target, and legacy targets are untouched", () => {
  const src = readFileSync(resolve(process.cwd(), "src/callable/followControl.ts"), "utf8");
  assert.ok(src.includes('type === "menu_comment"'));           // branch is menu-comment only
  assert.ok(src.includes("normalizeCommentId(targetId)"));       // targetId required + normalized
  assert.ok(src.includes('db.collection("menu_comments").doc(commentId).get()')); // server-loaded
  assert.ok(src.includes("buildMenuCommentReportContext("));     // context derived from stored doc
  assert.ok(/Komen menu tidak dijumpai/.test(src));              // missing target rejected
  // context fields must come from the derived object, never from request data
  assert.equal(/canonicalPlaceId:\s*(input|data|request)\./.test(src), false);
});
