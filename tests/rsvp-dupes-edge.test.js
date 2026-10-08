// Name matching for duplicate RSVPs across scripts and spellings.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Dupes = require("../js/rsvp-dupes.js");

const norm = Dupes.normalizeName;

test("normalizeName: case, punctuation and spacing do not matter", () => {
  assert.equal(norm("  Aunt   ZAINAB!! "), "aunt zainab");
  assert.equal(norm("O'Brien-Smith"), "o brien smith");
});

test("normalizeName: the same name typed with composed or decomposed accents is the same key", () => {
  assert.equal(norm("José"), norm("José"));
});

test("normalizeName: vowel signs in Devanagari and Bengali are kept, so different names stay different", () => {
  // these two share the same consonants and differ only in a vowel sign
  assert.notEqual(norm("राम"), norm("रम"));
  assert.notEqual(norm("রাম"), norm("রম"));
  assert.ok(norm("राम").length >= 3);
});

test("normalizeName: Arabic and Urdu names survive intact", () => {
  assert.equal(norm("عائلة نقوي"), "عائلة نقوي");
});

test("normalizeName: empty and non-string input give an empty key", () => {
  assert.equal(norm(""), "");
  assert.equal(norm(null), "");
  assert.equal(norm(undefined), "");
  assert.equal(norm(12345), "12345");
});

test("normalizeName: it never throws on strange input", () => {
  for (const s of ["\u0000", "😀😀", "‮abc", "x".repeat(10000), "\ud800"]) {
    assert.doesNotThrow(() => norm(s));
  }
});
