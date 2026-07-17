"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Countdown = require("../js/countdown.js");

test("remaining: exact breakdown of days/hours/minutes/seconds", () => {
  const now = 1000000000000;
  const target = now + ((3 * 86400 + 4 * 3600 + 5 * 60 + 6) * 1000);
  assert.deepEqual(Countdown.remaining(now, target), {
    past: false, days: 3, hours: 4, minutes: 5, seconds: 6
  });
});

test("remaining: under one minute", () => {
  const now = 5000;
  assert.deepEqual(Countdown.remaining(now, now + 42000), {
    past: false, days: 0, hours: 0, minutes: 0, seconds: 42
  });
});

test("remaining: target reached and passed are both past", () => {
  assert.equal(Countdown.remaining(1000, 1000).past, true);
  assert.equal(Countdown.remaining(2000, 1000).past, true);
});

test("remaining: sub-second remainder floors to zero seconds", () => {
  assert.deepEqual(Countdown.remaining(0, 999), {
    past: false, days: 0, hours: 0, minutes: 0, seconds: 0
  });
});

test("pad: two digits", () => {
  assert.equal(Countdown.pad(0), "00");
  assert.equal(Countdown.pad(9), "09");
  assert.equal(Countdown.pad(10), "10");
  assert.equal(Countdown.pad(59), "59");
});

function fakeEls() {
  const el = () => ({ hidden: false, textContent: "" });
  return { wrap: el(), fallback: el(), days: el(), hours: el(), minutes: el(), seconds: el() };
}

test("attach: empty or invalid date does nothing and returns null", () => {
  const els = fakeEls();
  const deps = { getNow: () => 0, setIntervalFn: () => 1, elements: els };
  assert.equal(Countdown.attach("", deps), null);
  assert.equal(Countdown.attach("not-a-date", deps), null);
  assert.equal(els.fallback.hidden, false);
});

test("attach: valid future date shows timer, hides fallback, renders values", () => {
  const els = fakeEls();
  const now = Date.parse("2026-07-12T00:00:00Z");
  let intervalFn = null;
  const id = Countdown.attach("2026-07-13T01:02:03Z", {
    getNow: () => now,
    setIntervalFn: (fn) => { intervalFn = fn; return 77; },
    elements: els
  });
  assert.equal(id, 77);
  assert.equal(typeof intervalFn, "function");
  assert.equal(els.wrap.hidden, false);
  assert.equal(els.fallback.hidden, true);
  assert.equal(els.days.textContent, "1");
  assert.equal(els.hours.textContent, "01");
  assert.equal(els.minutes.textContent, "02");
  assert.equal(els.seconds.textContent, "03");
});

test("attach: past date swaps back to fallback with pastText", () => {
  const els = fakeEls();
  Countdown.attach("2020-01-01T00:00:00Z", {
    getNow: () => Date.parse("2026-07-12T00:00:00Z"),
    setIntervalFn: (fn) => 1,
    pastText: "just married",
    elements: els
  });
  assert.equal(els.wrap.hidden, true);
  assert.equal(els.fallback.hidden, false);
  assert.equal(els.fallback.textContent, "just married");
});
