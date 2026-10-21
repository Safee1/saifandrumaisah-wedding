// Behaviour tests for the pure helpers the notify function uses to refuse
// abuse (the function itself needs Deno, so these run in plain Node).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const FUNC = path.join(__dirname, "..", "supabase", "functions", "notify");
let g;
test.before(async () => { g = await import(require("url").pathToFileURL(path.join(FUNC, "guards.mjs")).href); });

test("validRecipient accepts one plain mailbox and nothing else", () => {
  ["saif@example.com", "a.b+tag@mail.co.uk", "x_y%z@sub.example.org"].forEach((e) => assert.equal(g.validRecipient(e), true, e));
  ["", "no-at.com", "a@b", "a b@example.com", "a@example.com,b@example.com", "a@example.com;b@example.com",
    "Bob <bob@example.com>", "<a@example.com>", "a@example.com\n", null, undefined, 42, "a@@example.com",
    "x".repeat(250) + "@e.co"].forEach((e) => assert.equal(g.validRecipient(e), false, String(e)));
});

test("normalizeMailbox folds case and +tags", () => {
  assert.equal(g.normalizeMailbox(" Foo+bar@Example.COM "), "foo@example.com");
  assert.equal(g.normalizeMailbox("a+1@x.com"), g.normalizeMailbox("a+2@x.com"));
});

test("safeFirstName keeps names and neutralises anything else", () => {
  assert.equal(g.safeFirstName("Rumaisah Khan"), "Rumaisah");
  assert.equal(g.safeFirstName("Zoë"), "Zoë");
  assert.equal(g.safeFirstName("O'Neil"), "O'Neil");
  assert.equal(g.safeFirstName("Anne-Marie"), "Anne-Marie");
  assert.equal(g.safeFirstName("نور علی"), "نور");
  assert.equal(g.safeFirstName("<script>alert(1)</script>"), "scriptalertscript");
  assert.equal(g.safeFirstName("http://evil.example/pay"), "httpevilexamplepay");
  assert.equal(g.safeFirstName("1234 !!!"), "there");
  assert.equal(g.safeFirstName(""), "there");
  assert.equal(g.safeFirstName(null), "there");
  assert.equal(g.safeFirstName("A".repeat(100)).length, 30);
});

test("only an approved, unflagged blessing may be quoted back", () => {
  assert.equal(g.canQuoteBlessing({ status: "approved", moderation_reason: null }), true);
  assert.equal(g.canQuoteBlessing({ status: "pending", moderation_reason: null }), false);
  assert.equal(g.canQuoteBlessing({ status: "approved", moderation_reason: "link" }), false);
  assert.equal(g.canQuoteBlessing({ status: "rejected" }), false);
  assert.equal(g.canQuoteBlessing(null), false);
});

test("a broadcast is live only on an explicit boolean false", () => {
  assert.equal(g.isTestBroadcast({ test: false }), false);
  [{ test: true }, {}, { test: "false" }, { test: 0 }, { test: null }, null, undefined].forEach((p) => assert.equal(g.isTestBroadcast(p), true, JSON.stringify(p)));
});

test("ALERTS is the only source of alert kinds and links", () => {
  assert.deepEqual(Object.keys(g.ALERTS).sort(), ["admin_lockout", "blessing_submitted", "rsvp_submitted", "tree_submitted"]);
  Object.values(g.ALERTS).forEach((v) => assert.match(v, /^[a-z-]+\.html$/));
});

test("index.ts uses the guards and no longer trusts request text for alerts", () => {
  const src = fs.readFileSync(path.join(FUNC, "index.ts"), "utf8");
  assert.match(src, /from "\.\/guards\.mjs"/);
  assert.doesNotMatch(src, /payload\.summary/);
  assert.doesNotMatch(src, /payload\.adminPath/);
  assert.match(src, /canQuoteBlessing\(row\)/);
  assert.match(src, /validRecipient\(email\)/);
  assert.match(src, /AbortSignal\.timeout\(10000\)/);
  assert.match(src, /\.in\("status", \["sending", "sent", "delivered"\]\)/);
  assert.match(src, /isTestBroadcast\(payload\)/);
  assert.doesNotMatch(src, /reason: String\(err\)/);
});
