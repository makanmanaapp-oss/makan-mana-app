/**
 * B5 QA isolation — a locally executed Function must never push an aggregate to
 * the production Control Center mirror.
 *
 * The danger is one-directional: an emulator run that reaches production writes
 * fabricated analytics into the real console. So the override that redirects the
 * push is fenced twice — the process must actually BE the emulator, and the
 * target must be loopback — and every other combination resolves to production,
 * which is what a deployed function needs and what an isolated run cannot reach.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  CONTROL_CENTER_MIRROR_URL,
  resolveControlCenterMirrorUrl,
} from "../../../controlCenter/mirrorEventPush";

const PRODUCTION = "https://makanmana-control-center.vercel.app/api/internal/sync/mirror";
const transport = readFileSync(
  resolve(process.cwd(), "src/controlCenter/mirrorEventPush.ts"),
  "utf8",
);

test("an emulator run may be redirected to a loopback receiver", () => {
  const url = resolveControlCenterMirrorUrl({
    FUNCTIONS_EMULATOR: "true",
    CONTROL_CENTER_MIRROR_URL_OVERRIDE: "http://127.0.0.1:3000/api/internal/sync/mirror",
  } as NodeJS.ProcessEnv);
  assert.equal(url, "http://127.0.0.1:3000/api/internal/sync/mirror");
  assert.notEqual(url, PRODUCTION);
});

test("configuration alone cannot redirect a DEPLOYED function", () => {
  // FUNCTIONS_EMULATOR is set by the emulator and is absent in production, so
  // an attacker or a mistake that only sets the override changes nothing.
  for (const env of [
    {CONTROL_CENTER_MIRROR_URL_OVERRIDE: "http://127.0.0.1:3000/x"},
    {FUNCTIONS_EMULATOR: "false", CONTROL_CENTER_MIRROR_URL_OVERRIDE: "http://127.0.0.1:3000/x"},
    {FUNCTIONS_EMULATOR: "1", CONTROL_CENTER_MIRROR_URL_OVERRIDE: "http://127.0.0.1:3000/x"},
  ]) {
    assert.equal(resolveControlCenterMirrorUrl(env as NodeJS.ProcessEnv), PRODUCTION);
  }
});

test("an emulator run cannot be pointed at a non-loopback host", () => {
  for (const override of [
    "http://10.0.2.2:3000/x",
    "http://192.168.1.10:3000/x",
    "https://makanmana-control-center.vercel.app/api/internal/sync/mirror",
    "http://127.0.0.1.evil.test/x",
    "http://localhost:3000/x",
  ]) {
    assert.equal(
      resolveControlCenterMirrorUrl({
        FUNCTIONS_EMULATOR: "true",
        CONTROL_CENTER_MIRROR_URL_OVERRIDE: override,
      } as NodeJS.ProcessEnv),
      PRODUCTION,
      `must not accept ${override}`,
    );
  }
});

test("an emulator run with no override still uses production, not a blank URL", () => {
  // A blank or relative URL would fail late and confusingly; production is the
  // honest default, and an isolated run has no route to it.
  assert.equal(
    resolveControlCenterMirrorUrl({FUNCTIONS_EMULATOR: "true"} as NodeJS.ProcessEnv),
    PRODUCTION,
  );
});

test("the module-level constant is the resolved value and stays single-sourced", () => {
  assert.equal(typeof CONTROL_CENTER_MIRROR_URL, "string");
  assert.ok(CONTROL_CENTER_MIRROR_URL.endsWith("/api/internal/sync/mirror"));
  // Guarded elsewhere too (mirrorEvents.test.ts); repeated here because this is
  // the file that introduced a second way to compute the endpoint.
  assert.equal((transport.match(/CONTROL_CENTER_MIRROR_URL\s*=/g) ?? []).length, 1);
  assert.equal((transport.match(/https:\/\/makanmana-control-center\.vercel\.app/g) ?? []).length, 1);
});
