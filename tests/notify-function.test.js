"use strict";

// supabase/functions/notify/index.ts runs on Deno and can't be executed
// under node:test directly (jsr: imports), so this pins its behaviour
// structurally — same pattern as keep-db-awake.test.js. A bug here means
// the deployed function drifted from the CORS/dedupe/rate-limit contract
// described in AGENTS.md and the PR that introduced it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "notify", "index.ts"),
  "utf8",
);

test("handles OPTIONS preflight before anything else", () => {
  assert.match(src, /req\.method === "OPTIONS"/);
  assert.match(src, /status:\s*204,\s*headers:\s*CORS_HEADERS/);
});

test("CORS headers are pinned to the live origin and applied to every response", () => {
  assert.match(src, /Access-Control-Allow-Origin["']?:\s*SITE/);
  assert.match(src, /"https:\/\/saifandrumaisah\.com"/);
  assert.match(src, /Access-Control-Allow-Headers["']?:\s*"content-type"/);
  assert.match(src, /Access-Control-Allow-Methods["']?:\s*"POST"/);
  // both success (ok) and error (fail) responders spread the same headers
  assert.match(src, /function ok\([\s\S]{0,200}?\.\.\.CORS_HEADERS/);
  assert.match(src, /function fail\([\s\S]{0,200}?\.\.\.CORS_HEADERS/);
  // the old unauthenticated 401 Response with no CORS headers is gone
  assert.doesNotMatch(src, /new Response\(JSON\.stringify\(\{ ok: false, error: "unauthorized" \}\), \{ status: 401 \}\)/);
});

test("rsvp_confirmation ignores request text and rebuilds from the newest matching rsvps row", () => {
  assert.match(src, /findRecentRsvp/);
  assert.match(src, /\.from\("rsvps"\)/);
  assert.match(src, /rsvpConfirmationEmail\(String\(row\.name/);
  assert.match(src, /alreadySentForRef\(sb, "rsvp_confirmation", String\(row\.id\)\)/);
});

test("blessing_thanks ignores request text and rebuilds from the newest matching blessings row", () => {
  assert.match(src, /findRecentBlessing/);
  assert.match(src, /\.from\("blessings"\)/);
  assert.match(src, /blessingThanksEmail\(String\(row\.name[\s\S]{0,40}String\(row\.message/);
  assert.match(src, /alreadySentForRef\(sb, "blessing_thanks", String\(row\.id\)\)/);
});

test("ops alerts require a matching activity_log row and a 20/hour global cap", () => {
  assert.match(src, /hasRecentActivity/);
  assert.match(src, /\.from\("activity_log"\)/);
  assert.match(src, /OPS_ALERT_HOURLY_CAP\s*=\s*20/);
  assert.match(src, /opsAlertsOverCap/);
});

test("guest-facing kinds are capped at 5 per email per hour", () => {
  assert.match(src, /GUEST_FACING_HOURLY_CAP\s*=\s*5/);
  assert.match(src, /guestFacingOverCap/);
});

test("both rsvp lookup and blessing lookup are scoped to the last 10 minutes", () => {
  assert.match(src, /TEN_MINUTES_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
});
