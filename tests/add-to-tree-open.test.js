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
  assert.match(html, /id="fx_extra"[^>]*tabindex="-1"/);
  assert.doesNotMatch(html, /id="website"|name="website"/);
  assert.match(html, /var loadedAt = null;/);
  assert.match(html, /form\.addEventListener\("input"[^\n]*loadedAt = Date\.now\(\)/);
  assert.match(html, /loadedAt === null \|\| Date\.now\(\) - loadedAt < 2000/);
});

test("a too-fast submission shows the friendly wait message; only the honeypot is silent", () => {
  const idx = html.indexOf("loadedAt === null ||");
  assert.ok(idx > -1);
  const nearby = html.slice(idx, idx + 300);
  assert.match(nearby, /Please wait a moment and try again/);
  assert.doesNotMatch(nearby, /sent for approval/);
  const hp = html.indexOf('getElementById("fx_extra").value');
  assert.ok(hp > -1 && hp < idx, "honeypot checked first and stays silent");
});

test("the form submits through TreeData.submitOpen (no code argument)", () => {
  assert.match(html, /TreeData\.submitOpen\(/);
});
