"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Addressee = require("../js/addressee.js");

test("clean: trims, collapses whitespace and strips control characters", () => {
  assert.equal(Addressee.clean("  Ammi & Abu  "), "Ammi & Abu");
  assert.equal(Addressee.clean("Ammi\n&\tAbu"), "Ammi & Abu");
  assert.equal(Addressee.clean("Naqvi\u0000family\u001b"), "Naqvifamily");
});

test("clean: rejects empty, whitespace-only, non-string and over-long names", () => {
  assert.equal(Addressee.clean(""), null);
  assert.equal(Addressee.clean("   "), null);
  assert.equal(Addressee.clean(null), null);
  assert.equal(Addressee.clean(undefined), null);
  assert.equal(Addressee.clean("x".repeat(41)), null);
  assert.equal(Addressee.clean("x".repeat(40)), "x".repeat(40));
});

test("clean: keeps ordinary punctuation and non-Latin names as typed", () => {
  assert.equal(Addressee.clean("Uncle Shahbaz & Aunty Nasreen"), "Uncle Shahbaz & Aunty Nasreen");
  assert.equal(Addressee.clean("\u0639\u0627\u0626\u0644\u0629 \u0646\u0642\u0648\u064a"), "\u0639\u0627\u0626\u0644\u0629 \u0646\u0642\u0648\u064a");
});

test("clean: real names from many languages and punctuation styles are kept", () => {
  const names = [
    "Dr. Khan", "O'Brien", "O\u2019Brien", "Al-Fahad", "Khan, Ahmed & Family", "Jos\u00e9 & Mar\u00eda",
    "\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645",
    "\u0622\u062f\u0645 \u062e\u0627\u0646",                       // Urdu
    "\u0645\u06cc\u0646\u0627\u06a9\u0634\u06cc\u200c\u0627\u0645\u0645\u0627", // Urdu with a zero-width non-joiner
    "\u0930\u093e\u092e \u0936\u0930\u094d\u092e\u093e",           // Hindi with vowel signs
    "\u09b0\u09b9\u09bf\u09ae \u0989\u09a6\u09cd\u09a6\u09bf\u09a8" // Bengali with vowel signs
  ];
  names.forEach((n) => assert.equal(Addressee.clean(n), n, n));
});

// The name appears on the official invitation: it must read like a name,
// not like an instruction, a link or a trick.
test("clean: markup, links, numbers and emoji are not names, so they are refused", () => {
  const notNames = [
    "<b>bold</b>", "<script>alert(1)</script>", "javascript:alert(1)", "Call 07700 900123 now",
    "Win \u00a3500 here", "free.gift.example", "www.evil.example/claim", "a@b.example",
    "Ammi \ud83d\ude00", "Naqvi family 2", "100% real"
  ];
  notNames.forEach((n) => assert.equal(Addressee.clean(n), null, n));
});

test("clean: text-direction tricks and invisible characters are removed", () => {
  // right-to-left override would make "Abu" look like "uba" after other text
  assert.equal(Addressee.clean("\u202eAbu\u202c"), "Abu");
  assert.equal(Addressee.clean("A\u2066b\u2069u"), "Abu");
  assert.equal(Addressee.clean("\ufeffAmmi"), "Ammi");
  assert.equal(Addressee.clean("Am\u00admi"), "Ammi");
  assert.equal(Addressee.clean("\u202e\u2066"), null);
});

test("clean: a damaged link (a broken % sequence) turns into a replacement mark and is refused", () => {
  assert.equal(Addressee.clean("Ammi \ufffd"), null);
});

test("clean: cleaning twice gives the same answer as cleaning once", () => {
  ["  Ammi \u202e & Abu ", "Dr.  Khan", "\u0622\u062f\u0645   \u062e\u0627\u0646"].forEach((raw) => {
    const once = Addressee.clean(raw);
    assert.equal(Addressee.clean(once), once, raw);
  });
});

test("sizeClass: short names keep the full-size script", () => {
  assert.equal(Addressee.sizeClass("Ammi & Abu"), "");
  assert.equal(Addressee.sizeClass("you"), "");
  assert.equal(Addressee.sizeClass("x".repeat(14)), "");
});

test("sizeClass: longer names step down so they clear the seal", () => {
  assert.equal(Addressee.sizeClass("Uncle Shahbaz & Aunty"), "long");
  assert.equal(Addressee.sizeClass("x".repeat(24)), "long");
  assert.equal(Addressee.sizeClass("Mohammed Abdullah & Fatima Khatoon"), "xlong");
  assert.equal(Addressee.sizeClass("x".repeat(40)), "xlong");
});
