// The RSVP admin headcount must never silently leave out a reply that might
// be a different person. A reply is a re-send (left out, newest kept) only
// when BOTH name and contact match; a match on one alone is flagged and
// still counted. All names and contacts here are made up.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
// RSVP_DUPES_MODULE lets the same tests be pointed at an older copy of the
// module to show they fail without the fix.
const Dupes = require(process.env.RSVP_DUPES_MODULE || "../js/rsvp-dupes.js");

const html = fs.readFileSync(path.join(__dirname, "..", "rsvp-admin.html"), "utf8");

function row(id, name, contact, adults, day) {
  return {
    id: id, name: name, contact: contact, attending: true, adults: adults, children: 0,
    guest_count: adults, created_at: "2027-01-" + String(day).padStart(2, "0") + "T10:00:00Z"
  };
}

// totals the way rsvp-admin.html does: only non-keepers are skipped
function headcount(entries) {
  return entries.filter((e) => e.isKeeper).reduce((sum, e) => sum + e.row.guest_count, 0);
}

test("two different guests with the same name and different contacts are both counted", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Test Guest", "07700 900111", 2, 1),
    row("2", "test  guest", "07700 900222", 4, 2)
  ]);
  assert.equal(headcount(entries), 6);
  assert.deepEqual(entries.map((e) => e.isKeeper), [true, true]);
  assert.equal(entries[0].possibleDuplicateOf.length, 1);
  assert.equal(entries[0].possibleDuplicateOf[0].sameName, true);
  assert.equal(entries[0].possibleDuplicateOf[0].sameContact, false);
  assert.equal(entries[1].possibleDuplicateOf[0].name, "Test Guest");
});

test("one relative replying for two households on one phone: both households counted", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Household One", "07700 900123", 2, 1),
    row("2", "Household Two", "+44 7700 900123", 5, 2)
  ]);
  assert.equal(headcount(entries), 7);
  assert.equal(entries[0].possibleDuplicateOf[0].sameContact, true);
  assert.equal(Dupes.flagText(entries[0]), "same contact as Household Two");
});

test("a chain of name-only and contact-only matches drops nobody", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "07700 900001", 2, 1),
    row("2", "Guest A", "07700 900002", 1, 2),
    row("3", "Guest B", "07700 900002", 5, 3)
  ]);
  assert.equal(headcount(entries), 8);
  assert.deepEqual(Dupes.summarize(entries), { counted: 3, excluded: 0, flagged: 3 });
});

test("a true re-send (same name AND same contact) keeps only the newest reply", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "07700 900001", 2, 1),
    row("2", "GUEST  a", "+447700900001", 3, 5),
    row("3", "Guest A", "0044 7700 900001", 4, 3)
  ]);
  assert.deepEqual(entries.map((e) => e.isKeeper), [false, true, false]);
  assert.equal(headcount(entries), 3);
  assert.equal(entries[0].duplicateOf.name, "GUEST  a");
  assert.equal(entries[1].groupSize, 3);
  assert.deepEqual(Dupes.summarize(entries), { counted: 1, excluded: 2, flagged: 0 });
});

test("same name with no contact on either reply is flagged, not dropped", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "", 2, 1),
    row("2", "Guest A", null, 3, 2)
  ]);
  assert.equal(headcount(entries), 5);
  assert.equal(entries[0].possibleDuplicateOf.length, 1);
});

test("a counted reply is not flagged against a reply that is already left out", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "a@example.com", 2, 1),
    row("2", "Guest A", "a@example.com", 2, 2),
    row("3", "Guest C", "c@example.com", 1, 3)
  ]);
  assert.deepEqual(Dupes.summarize(entries), { counted: 2, excluded: 1, flagged: 0 });
});

test("normalizePhone: +44, 0044, 44, +44 (0) and a leading 0 are the same number", () => {
  const want = Dupes.normalizePhone("07700 900666");
  assert.equal(want, "7700900666");
  for (const s of ["+44 7700 900666", "0044 7700 900666", "447700900666", "+44 (0)7700 900666", "00447700900666"]) {
    assert.equal(Dupes.normalizePhone(s), want, s);
  }
});

test("a re-send typed once with 0044 and once with a leading 0 is recognised", () => {
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "0044 7700 900666", 2, 1),
    row("2", "Guest A", "07700 900666", 2, 2)
  ]);
  assert.deepEqual(entries.map((e) => e.isKeeper), [false, true]);
});

test("contactKeys: a word after the number, or a phone plus an email, still match", () => {
  assert.deepEqual(Dupes.contactKeys("07700 900666 (mum)"), ["phone:7700900666"]);
  assert.deepEqual(Dupes.contactKeys("A@Example.com / 0044 7700 900666").sort(),
    ["email:a@example.com", "phone:7700900666"]);
  assert.deepEqual(Dupes.contactKeys("ask mum"), []);
  assert.deepEqual(Dupes.contactKeys(null), []);
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "07700 900666 (mum)", 2, 1),
    row("2", "Guest A", "a@example.com, 07700900666", 2, 2)
  ]);
  assert.deepEqual(entries.map((e) => e.isKeeper), [false, true]);
});

test("summaryText says how many are left out and how many are flagged but counted", () => {
  assert.equal(Dupes.summaryText(Dupes.groupDuplicates([row("1", "Guest A", "a@example.com", 1, 1)])), "");
  const text = Dupes.summaryText(Dupes.groupDuplicates([
    row("1", "Guest A", "a@example.com", 2, 1),
    row("2", "Guest A", "a@example.com", 2, 2),
    row("3", "Guest B", "b@example.com", 1, 3),
    row("4", "Guest B", "other@example.com", 1, 4)
  ]));
  assert.match(text, /^1 earlier reply is left out of the totals/);
  assert.match(text, /2 replies share a name or a contact with another reply/);
  assert.match(text, /still counted/);
  const onlyFlags = Dupes.summaryText(Dupes.groupDuplicates([
    row("1", "Guest B", "b@example.com", 1, 3),
    row("2", "Guest B", "other@example.com", 1, 4)
  ]));
  assert.match(onlyFlags, /^No replies are left out of the totals\./);
});

test("rsvp-admin.html: totals skip only re-sends, and page and CSV use the shared wording", () => {
  assert.match(html, /if \(!entry\.isKeeper\) \{ return; \}/);
  assert.match(html, /RsvpDupes\.summaryText\(entries\)/);
  assert.match(html, /Possible duplicate, still counted/);
  assert.match(html, /Earlier reply, not counted/);
  assert.doesNotMatch(html, /possible duplicate" \+/, "old 'N possible duplicates excluded' note is gone");
  const header = html.match(/var header = \[([^\]]+)\];/)[1];
  assert.ok(header.includes('"Counted in totals"'));
  assert.match(html, /csvField\(entry\.isKeeper \? "Yes" : "No"\)/);
  assert.match(html, /RsvpDupes\.flagText\(entry\)/);
});

// Review findings (Nov 2026): re-sends that were counted twice.
test("contactKeys: a number typed with digits from another script is the same number", () => {
  const inScript = (zero) => "07700 900666".replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
  // Arabic-Indic, Persian/Urdu, Devanagari, Bengali, Gurmukhi, Gujarati, full-width
  for (const zero of [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0xFF10]) {
    assert.deepEqual(Dupes.contactKeys(inScript(zero)), ["phone:7700900666"], "U+" + zero.toString(16));
  }
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "07700 900666", 2, 1),
    row("2", "Guest A", inScript(0x0660), 2, 2)
  ]);
  assert.deepEqual(entries.map((e) => e.isKeeper), [false, true]);
  assert.equal(headcount(entries), 2);
});

test("contactKeys: two numbers with only spaces between them are two keys, not one long one", () => {
  assert.deepEqual(Dupes.contactKeys("07700 900666 07700 900777"), ["phone:7700900666", "phone:7700900777"]);
  assert.deepEqual(Dupes.contactKeys("07700900666 07700900777 07700900888"),
    ["phone:7700900666", "phone:7700900777", "phone:7700900888"]);
  assert.deepEqual(Dupes.contactKeys("+44 (0)7700 900666 (0)7700 900777"), ["phone:7700900666", "phone:7700900777"]);
  // one number, however it is spaced, is never cut (15 digits or fewer)
  assert.deepEqual(Dupes.contactKeys("0044 7700 900 666"), ["phone:7700900666"]);
  assert.deepEqual(Dupes.contactKeys("00 44 0 7700 900666"), ["phone:7700900666"]);
  assert.deepEqual(Dupes.contactKeys("+92 300 0000000"), ["phone:923000000000"]);
  const entries = Dupes.groupDuplicates([
    row("1", "Guest A", "07700 900666", 2, 1),
    row("2", "Guest A", "07700 900777 07700 900666", 2, 2)
  ]);
  assert.deepEqual(entries.map((e) => e.isKeeper), [false, true]);
});
