"use strict";

// supabase/functions/resend-webhook/index.ts runs on Deno (jsr: imports)
// and can't be executed under node:test directly, so this pins the Svix
// verification contract structurally — same pattern as notify-function.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "resend-webhook", "index.ts"),
  "utf8",
);

test("reads the raw body before any JSON.parse", () => {
  const rawIdx = src.indexOf("await req.text()");
  const parseIdx = src.indexOf("JSON.parse(rawBody)");
  assert.notEqual(rawIdx, -1);
  assert.notEqual(parseIdx, -1);
  assert.ok(rawIdx < parseIdx, "raw body must be read before it is parsed as JSON");
});

test("secret is the whsec_-stripped, base64-decoded RESEND_WEBHOOK_SECRET", () => {
  assert.match(src, /secretEnv\.startsWith\("whsec_"\)/);
  assert.match(src, /slice\("whsec_"\.length\)/);
  assert.match(src, /base64ToBytes\(secretB64\)/);
});

test("signed content is svix-id.svix-timestamp.rawBody, HMAC-SHA256 base64", () => {
  assert.match(src, /\$\{svixId\}\.\$\{svixTimestamp\}\.\$\{rawBody\}/);
  assert.match(src, /HMAC-SHA256|"HMAC".*hash:\s*"SHA-256"/s);
});

test("compares against every v1,<sig> entry in svix-signature with a constant-time compare", () => {
  assert.match(src, /svixSignature\.split\(/);
  assert.match(src, /version !== "v1"/);
  assert.match(src, /timingSafeEqual\(sig, expectedSig\)/);
  assert.match(src, /function timingSafeEqual/);
});

test("rejects a timestamp older than 5 minutes", () => {
  assert.match(src, /FIVE_MINUTES_SECONDS\s*=\s*5\s*\*\s*60/);
  assert.match(src, /nowSeconds - ts > FIVE_MINUTES_SECONDS/);
});

test("an invalid signature is rejected with 401 before the payload is trusted", () => {
  assert.match(src, /if \(!verified\)\s*\{\s*return fail\(\{ ok: false, error: "invalid signature" \}, 401\)/);
});
