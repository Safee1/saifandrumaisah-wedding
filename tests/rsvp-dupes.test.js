"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const RsvpDupes = require("../js/rsvp-dupes.js");

test("normalizeName: case-, whitespace- and punctuation-insensitive", () => {
  assert.equal(RsvpDupes.normalizeName("  Jane   Doe  "), "jane doe");
  assert.equal(RsvpDupes.normalizeName("Jane-Doe"), "jane doe");
  assert.equal(RsvpDupes.normalizeName("Jane, Doe!"), "jane doe");
  assert.equal(RsvpDupes.normalizeName("JANE DOE"), "jane doe");
  assert.equal(RsvpDupes.normalizeName(""), "");
  assert.equal(RsvpDupes.normalizeName(null), "");
});

test("classifyContact: emails normalize case, distinguish from phones", () => {
  assert.deepEqual(RsvpDupes.classifyContact("Jane@Example.com"), { type: "email", key: "jane@example.com" });
  assert.deepEqual(RsvpDupes.classifyContact(" jane@example.com "), { type: "email", key: "jane@example.com" });
  assert.equal(RsvpDupes.classifyContact(""), null);
  assert.equal(RsvpDupes.classifyContact(null), null);
});

test("classifyContact: UK phone variants (44/0 prefixes) collapse to the same key", () => {
  const a = RsvpDupes.classifyContact("07911 123456");
  const b = RsvpDupes.classifyContact("+44 7911 123456");
  const c = RsvpDupes.classifyContact("447911123456");
  assert.equal(a.type, "phone");
  assert.equal(a.key, b.key);
  assert.equal(a.key, c.key);
});

test("groupDuplicates: same normalized name groups rows, keeper is latest created_at", () => {
  const rows = [
    { id: "1", name: "Jane Doe", created_at: "2027-01-01T10:00:00Z" },
    { id: "2", name: "jane   doe", created_at: "2027-01-03T10:00:00Z" },
    { id: "3", name: "JANE, DOE!", created_at: "2027-01-02T10:00:00Z" }
  ];
  const entries = RsvpDupes.groupDuplicates(rows);
  assert.equal(entries[0].isKeeper, false);
  assert.equal(entries[1].isKeeper, true);
  assert.equal(entries[2].isKeeper, false);
  assert.equal(entries[0].duplicateOf.name, "jane   doe");
  assert.equal(entries[1].groupSize, 3);
});

test("groupDuplicates: same email groups rows even with different names", () => {
  const rows = [
    { id: "1", name: "Alpha", contact: "same@example.com", created_at: "2027-01-01T10:00:00Z" },
    { id: "2", name: "Beta", contact: "SAME@Example.com", created_at: "2027-01-02T10:00:00Z" }
  ];
  const entries = RsvpDupes.groupDuplicates(rows);
  assert.equal(entries[0].isKeeper, false);
  assert.equal(entries[1].isKeeper, true);
  assert.equal(entries[0].duplicateOf.name, "Beta");
});

test("groupDuplicates: same phone in different UK formats groups rows", () => {
  const rows = [
    { id: "1", name: "Alpha", contact: "07911123456", created_at: "2027-01-01T10:00:00Z" },
    { id: "2", name: "Beta", contact: "+44 7911 123456", created_at: "2027-01-02T10:00:00Z" }
  ];
  const entries = RsvpDupes.groupDuplicates(rows);
  assert.equal(entries[0].isKeeper, false);
  assert.equal(entries[1].isKeeper, true);
});

test("groupDuplicates: unique rows are all keepers with groupSize 1", () => {
  const rows = [
    { id: "1", name: "Alpha", contact: "a@example.com", created_at: "2027-01-01T10:00:00Z" },
    { id: "2", name: "Beta", contact: "b@example.com", created_at: "2027-01-02T10:00:00Z" }
  ];
  const entries = RsvpDupes.groupDuplicates(rows);
  assert.equal(entries[0].isKeeper, true);
  assert.equal(entries[1].isKeeper, true);
  assert.equal(entries[0].groupSize, 1);
  assert.equal(entries[1].groupSize, 1);
  assert.equal(entries[0].duplicateOf, null);
});

test("groupDuplicates: empty input returns empty output", () => {
  assert.deepEqual(RsvpDupes.groupDuplicates([]), []);
});
