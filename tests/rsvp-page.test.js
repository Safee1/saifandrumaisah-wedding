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
  assert.match(html, /document\.getElementById\("fx_extra"\)\.value\) \{/);
  // id/name must not be something browser autofill recognises (it filled "website" for real guests)
  assert.doesNotMatch(html, /id="website"|name="website"/);
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

// Regression (26 Sep 2026): "Email or phone" accepted any text, e.g. "yes",
// leaving no way to reach the guest. Extract the check and exercise it.
test("contact must look like an email or a phone number", () => {
  const m = html.match(/var looksEmail = (.*?);\s*var looksPhone = (.*?);/s);
  assert.ok(m, "contact check missing");
  const check = new Function("contact", "var looksEmail = " + m[1] + "; var looksPhone = " + m[2] + "; return looksEmail || looksPhone;");
  for (const ok of ["zainab@example.com", "07700 900123", "+44 7700 900123", "(0121) 555-0199", "0044-7700-900123"]) {
    assert.equal(check(ok), true, ok);
  }
  for (const bad of ["yes", "will text you", "12345", "call me on whatsapp", "@zainab"]) {
    assert.equal(check(bad), false, bad);
  }
  assert.match(html, /Please give an email or phone number we can reach you on/);
});
