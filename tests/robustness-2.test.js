// Two failure modes that must not make things worse:
//  1) js/config.js missing: the home page must still show the teaser and RSVP button.
//  2) "Send to all guests" with an unreadable reply must not re-enable Send.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const index = rd("index.html");
const admin = rd("admin-activity.html");

test("home page reads WeddingConfig defensively", () => {
  assert.match(index, /typeof WeddingConfig !== "undefined" && WeddingConfig/);
  assert.doesNotMatch(index, /var REVEAL = WeddingConfig\./);
  assert.doesNotMatch(index, /var WEDDING_DATE = WeddingConfig\./);
});

test("a broadcast whose outcome is unknown keeps Send off and clears the test flag", () => {
  const m = admin.match(/function sendUncertain\(\) \{[\s\S]*?\n      \}/);
  assert.ok(m, "sendUncertain missing");
  assert.match(m[0], /testSentOk = false/);
  assert.match(m[0], /maSendBtn\.disabled = true/);
  assert.match(m[0], /Emails tab/);
  assert.match(admin, /\.catch\(sendUncertain\)/);
});

test("only a clear reply re-enables Send", () => {
  const block = admin.slice(admin.indexOf('callNotify({ kind: "message_all", adminPw: pw, subject: maSubject.value, html: wrapMessage(maBody.value), text: maBody.value, test: false })'));
  assert.match(block, /if \(res\.sent\) \{ maSendBtn\.disabled = false;/);
  assert.match(block, /else if \(res\.reason\) \{ maSendBtn\.disabled = false;/);
  assert.match(block, /else \{ sendUncertain\(\); \}/);
});
