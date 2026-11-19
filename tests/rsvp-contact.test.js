// rsvp.html "Email or phone": the field must accept any text that CONTAINS
// a usable phone number or email address, and still refuse text with
// neither. Regression (Nov 2026): "07700 900123 (mum)" or a phone and an
// email together were refused with a message that did not say why.
// All contact details here are made up (example.com, Ofcom drama numbers).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "rsvp.html"), "utf8");

function loadCheck() {
  const m = html.match(/function contactReachable\(contact\) \{[\s\S]*?\r?\n      \}\r?\n/);
  assert.ok(m, "contactReachable() missing from rsvp.html");
  return new Function("return " + m[0])();
}

test("a phone number with extra words is accepted", () => {
  const ok = loadCheck();
  for (const v of [
    "07700900123 (mum)",
    "Mum 07700900123",
    "call 07700 900 123",
    "07700 900123 after six please",
    "whatsapp +44 7700 900123",
    "home: (0121) 496-0199"
  ]) { assert.equal(ok(v), true, v); }
});

test("a phone and an email together are accepted", () => {
  const ok = loadCheck();
  for (const v of [
    "07700900123 / guest@example.com",
    "guest@example.com or 07700 900123",
    "07700900123, guest@example.com"
  ]) { assert.equal(ok(v), true, v); }
});

test("an email with extra words is accepted", () => {
  const ok = loadCheck();
  for (const v of [
    "guest@example.com (work)",
    "email me: guest@example.com",
    "<guest@example.com>",
    "guest@example.com"
  ]) { assert.equal(ok(v), true, v); }
});

test("phone numbers typed with non-Latin digits are accepted", () => {
  const ok = loadCheck();
  assert.equal(ok("٠٧٧٠٠٩٠٠١٢٣"), true, "Arabic-Indic");
  assert.equal(ok("۰۷۷۰۰ ۹۰۰۱۲۳"), true, "Urdu/Persian");
});

test("everything the old check accepted is still accepted", () => {
  const ok = loadCheck();
  for (const v of [
    "07700 900123", "+44 7700 900123", "(0121) 496-0199", "0044-7700-900123",
    "+44 7700-900.123", "12345678", "07700/900123", "07700 900123 me"
  ]) { assert.equal(ok(v), true, v); }
});

test("text with neither a phone number nor an email is still refused", () => {
  const ok = loadCheck();
  for (const v of [
    "", "yes", "will text you", "call me on whatsapp", "12345", "123456",
    "@guest", "guest@", "guest@example", "ask my mum",
    "flat 12, house 34, floor 5, from 2027",   // digits scattered between words
    "2 adults and 3 children, room 101"
  ]) { assert.equal(ok(v), false, JSON.stringify(v)); }
});

test("the page never refuses for length what the database accepts, nor the reverse", () => {
  // DB rule: contact is null or char_length(contact) <= 200, nothing else.
  const sql = fs.readFileSync(path.join(root, "migrations", "20260923_rsvp_length_checks_and_flood_guard.sql"), "utf8");
  const limit = Number(sql.match(/char_length\(contact\) <= (\d+)/)[1]);
  const max = Number(html.match(/id="contact" maxlength="(\d+)"/)[1]);
  assert.ok(max <= limit, "the field lets guests type more than the database stores");
});

test("the submit handler uses the check and keeps its message", () => {
  assert.match(html, /if \(!contactReachable\(contact\)\) \{/);
  assert.match(html, /Please give an email or phone number we can reach you on\./);
  assert.doesNotMatch(html, /\[A-Za-z\]\{3,\}/, "the three-letters rule must be gone");
});
