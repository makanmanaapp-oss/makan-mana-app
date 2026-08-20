/** PROMPT 3 — push copy: localized, lock-screen-safe, deterministic fallback. */
import assert from "node:assert/strict";
import {test} from "node:test";
import {hasPushCopy, normalizePushLang, pushCopyFor} from "../pushCopy";

test("push copy exists for all push-eligible types", () => {
  for (const t of ["social_reaction","social_comment","social_follow","social_repost","social_quote","group_invite","group_invite_accepted","payment_issue","account_security"] as const) {
    assert.equal(hasPushCopy(t), true, t);
  }
});
test("normalizePushLang deterministic fallback to ms", () => {
  assert.equal(normalizePushLang("en"), "en");
  assert.equal(normalizePushLang("zh-CN"), "zh");
  assert.equal(normalizePushLang("fr"), "ms");
  assert.equal(normalizePushLang(undefined), "ms");
});
test("localized copy per language; body is generic (no private details)", () => {
  const en = pushCopyFor("social_comment", "en");
  assert.equal(en?.title, "New comment");
  const zh = pushCopyFor("social_comment", "zh");
  assert.ok(zh && zh.title.length > 0);
  const ta = pushCopyFor("group_invite", "ta");
  assert.ok(ta && ta.body.length > 0);
  // lock-screen safety: generic body, no post/comment content
  assert.ok(!en!.body.includes("http"));
});
test("non-push-eligible type → null copy", () => {
  assert.equal(pushCopyFor("tongtong_bill_created", "en"), null);
});
