// rsvp.html: the expression-of-interest form keeps the anti-spam pattern,
// but a too-fast submission must tell the guest to try again rather than
// silently pretending to succeed (the old bug).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "rsvp.html"), "utf8");

test("honeypot is still swallowed silently", () => {
  assert.match(html, /document\.getElementById\("website"\)\.value\) \{/);
});

test("a too-fast submission shows a real message, not a fake thank-you", () => {
  const idx = html.indexOf("Date.now() - loadedAt < 2000");
  assert.ok(idx > -1, "time-gate check missing");
  const nearby = html.slice(idx, idx + 300);
  assert.match(nearby, /please wait a moment and try again/i);
  assert.doesNotMatch(nearby, /confirmBox\.hidden = false/, "must not fake success on the time-gate branch");
});

test("copy makes clear guests book and pay their own travel", () => {
  assert.match(html, /book(s)? and pay(s)? for (their|its) own flights and rooms/i);
});

test("the public headcount reads from RsvpData.headcount(), not a raw table read", () => {
  assert.match(html, /RsvpData\.headcount\(\)/);
});

test("the form posts through RsvpData.submitInterest, not the old yes\\/no submitRsvp", () => {
  assert.match(html, /RsvpData\.submitInterest\(/);
});
