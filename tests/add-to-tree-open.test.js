// The tree is open to everyone now: no invite-code field/requirement on the
// public form, but the honeypot + time-gate anti-spam stays, and
// submissions still go through the RLS-gated pending path (submitOpen).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "add-to-tree.html"), "utf8");

test("no invite code field or copy remains on the public add-to-tree form", () => {
  assert.doesNotMatch(html, /inviteCode/);
  assert.doesNotMatch(html, /invite code/i);
  assert.doesNotMatch(html, /submitWithInvite/);
});

test("the honeypot field and time-gate are still present", () => {
  assert.match(html, /id="website"[^>]*tabindex="-1"/);
  assert.match(html, /loadedAt = Date\.now\(\)/);
  assert.match(html, /Date\.now\(\) - loadedAt < 2000/);
});

test("the form submits through TreeData.submitOpen (no code argument)", () => {
  assert.match(html, /TreeData\.submitOpen\(/);
});
