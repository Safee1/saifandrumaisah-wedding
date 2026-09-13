"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Travel = require("../js/travel.js");

test("parse: accepts a date or a full timestamp, rejects junk and impossible dates", () => {
  assert.equal(Travel.format(Travel.parse("2027-08-23")), "23 August 2027");
  assert.equal(Travel.format(Travel.parse("2027-08-23T16:00:00+01:00")), "23 August 2027");
  assert.equal(Travel.parse(""), null);
  assert.equal(Travel.parse("soon"), null);
  assert.equal(Travel.parse("2027-02-30"), null);
  assert.equal(Travel.parse(undefined), null);
});

test("addMonths: clamps to the end of shorter months", () => {
  assert.equal(Travel.format(Travel.addMonths(Travel.parse("2027-05-31"), -3)), "28 February 2027");
  assert.equal(Travel.format(Travel.addMonths(Travel.parse("2028-05-31"), -3)), "29 February 2028");
  assert.equal(Travel.format(Travel.addMonths(Travel.parse("2027-01-15"), -3)), "15 October 2026");
});

test("replyBy: three months before the wedding, null while the date is unset", () => {
  assert.equal(Travel.format(Travel.replyBy("2027-08-23")), "23 May 2027");
  assert.equal(Travel.replyBy(""), null);
});

test("passportUntil: six months after a two-week trip", () => {
  // 23 Aug + 14 days = 6 Sep; + 6 months = 6 Mar 2028
  assert.equal(Travel.format(Travel.passportUntil("2027-08-23")), "6 March 2028");
  assert.equal(Travel.passportUntil(""), null);
});

test("items: dates appear once the wedding date is set; general wording before", () => {
  const set = Travel.items("2027-08-23", "Bali");
  const unset = Travel.items("", "");
  const by = (list, id) => list.find((i) => i.id === id);
  assert.match(by(set, "reply").text, /RSVP by 23 May 2027/);
  assert.match(by(set, "passport").text, /valid until at least 6 March 2028/);
  assert.match(by(set, "entry").text, /Bali's page/);
  assert.match(by(Travel.items("2027-08-23", "Bali", "Indonesia"), "entry").text, /Indonesia's page/);
  assert.match(by(unset, "reply").text, /at least 3 months before the wedding/);
  assert.doesNotMatch(by(unset, "passport").text, /\d{4}/);
  assert.match(by(unset, "entry").text, /the country's page/);
});

test("items: guests book their own travel; nothing suggests the couple books it", () => {
  for (const list of [Travel.items("2027-08-23", "Bali"), Travel.items("", "")]) {
    const all = list.map((i) => i.title + " " + i.text).join(" ");
    assert.match(list.find((i) => i.id === "booking").text, /books their own travel and accommodation/);
    assert.doesNotMatch(all, /(flights|rooms|hotels?) (are|will be) (booked|paid|covered)|we('ll| will) (book|pay)/i);
  }
});

test("items: every item has a unique id and plain copy; links are RSVP or official sites", () => {
  const list = Travel.items("2027-08-23", "");
  assert.equal(new Set(list.map((i) => i.id)).size, list.length);
  for (const i of list) {
    assert.ok(i.title && i.text, i.id);
    if (i.link) { assert.match(i.link.href, /^(rsvp\.html|https:\/\/(www\.gov\.uk|travelhealthpro\.org\.uk)\/)/); }
  }
});

test("items: no link points at the retired NHS fitfortravel site", () => {
  // fitfortravel.nhs.uk was retired in 2025; NaTHNaC's TravelHealthPro replaced it
  const links = Travel.items("2027-08-23", "Bali").map((i) => i.link && i.link.href).filter(Boolean).join(" ");
  assert.doesNotMatch(links, /fitfortravel/);
  assert.match(links, /travelhealthpro\.org\.uk/);
});

test("load/save: round-trips ticks and survives junk or missing storage", () => {
  const mem = { v: {}, getItem(k) { return this.v[k] || null; }, setItem(k, s) { this.v[k] = s; } };
  Travel.save(mem, { reply: true, passport: false });
  assert.deepEqual(Travel.load(mem), { reply: true, passport: false });
  mem.v[Travel.KEY] = "{not json";
  assert.deepEqual(Travel.load(mem), {});
  mem.v[Travel.KEY] = "[1,2]";
  assert.deepEqual(Travel.load(mem), {});
  assert.deepEqual(Travel.load(null), {});
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(Travel.load(throwing), {});
  assert.doesNotThrow(() => Travel.save(throwing, { a: true }));
});

test("visible: flag on, or the private preview link only", () => {
  assert.equal(Travel.visible(true, ""), true);
  assert.equal(Travel.visible(false, ""), false);
  assert.equal(Travel.visible(false, "?travel=preview"), true);
  assert.equal(Travel.visible(false, "?to=Ammi&travel=preview"), true);
  assert.equal(Travel.visible(false, "?travel=previewX"), false);
  assert.equal(Travel.visible(false, "?xtravel=preview"), false);
});
