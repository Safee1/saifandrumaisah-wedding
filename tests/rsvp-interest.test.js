// The "are you coming?" expression of interest: submitInterest posts the
// new fields to rsvps, and headcount() reads back a single integer from
// the new SECURITY DEFINER RPC — never rows, never names/contacts.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function withFetch(handler, fn) {
  const real = global.fetch;
  const realSelf = global.self;
  global.fetch = handler;
  delete require.cache[require.resolve("../js/rsvp-data.js")];
  const RsvpData = require("../js/rsvp-data.js").RsvpData;
  return Promise.resolve(fn(RsvpData)).finally(() => {
    global.fetch = real;
    global.self = realSelf;
  });
}

test("submitInterest posts name/contact/adults/children/likelihood and syncs guest_count", () => {
  let captured;
  // submitInterest also fires a best-effort notify() call to the Edge
  // Function after the rsvps insert resolves — ignore that one here and
  // only capture the actual rsvps insert this test cares about.
  return withFetch((url, opts) => {
    if (String(url).includes("/functions/v1/notify")) {
      return Promise.resolve({ ok: true });
    }
    captured = { url, body: JSON.parse(opts.body) };
    return Promise.resolve({ ok: true });
  }, (RsvpData) => RsvpData.submitInterest({
    name: "Aunt Zainab",
    contact: "zainab@example.com",
    likelihood: "definitely",
    adults: 2,
    children: 1,
    dietary: "no nuts",
    note: "so excited"
  }).then(() => {
    assert.match(captured.url, /\/rest\/v1\/rsvps$/);
    assert.equal(captured.body.name, "Aunt Zainab");
    assert.equal(captured.body.contact, "zainab@example.com");
    assert.equal(captured.body.likelihood, "definitely");
    assert.equal(captured.body.adults, 2);
    assert.equal(captured.body.children, 1);
    assert.equal(captured.body.guest_count, 3, "guest_count should be adults + children");
    assert.equal(captured.body.attending, true);
    assert.equal(captured.body.dietary, "no nuts");
    assert.equal(captured.body.message, "so excited");
  }));
});

test("headcount() calls the rsvp_headcount RPC and returns the integer it sends back", () => {
  return withFetch((url) => {
    assert.match(url, /\/rest\/v1\/rpc\/rsvp_headcount$/);
    return Promise.resolve({ ok: true, text: () => Promise.resolve("42") });
  }, (RsvpData) => RsvpData.headcount().then((n) => {
    assert.equal(n, 42);
  }));
});

test("headcount() rejects on a failed request rather than surfacing raw rows", () => {
  return withFetch(() => Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ message: "boom" })
  }), (RsvpData) => RsvpData.headcount().then(
    () => { throw new Error("expected rejection"); },
    (err) => { assert.match(err.message, /boom/); }
  ));
});

// Regression (24 Sep 2026): the DB requires dietary_consent=true whenever
// dietary is filled; the form used to omit it and every allergy RSVP failed.
function captureInsert(row) {
  let body;
  return withFetch((url, opts) => {
    if (String(url).includes("/functions/v1/notify")) { return Promise.resolve({ ok: true }); }
    body = JSON.parse(opts.body);
    return Promise.resolve({ ok: true });
  }, (RsvpData) => RsvpData.submitInterest(row)).then(() => body);
}

test("dietary + consent sends dietary_consent=true with a timestamp", () =>
  captureInsert({ name: "A", contact: "a@b.co", likelihood: "definitely", adults: 1, children: 1,
    childrenAges: "4", dietary: "nut allergy", dietaryConsent: true }).then((b) => {
    assert.equal(b.dietary_consent, true);
    assert.ok(b.dietary_consent_at);
    assert.equal(b.children_ages, "4");
  }));

test("no dietary sends dietary_consent=false and no timestamp", () =>
  captureInsert({ name: "A", contact: "a@b.co", likelihood: "definitely", adults: 1, children: 0 }).then((b) => {
    assert.equal(b.dietary_consent, false);
    assert.equal(b.dietary_consent_at, null);
  }));

test("can't make it: attending=false, guest_count null, no likelihood", () =>
  captureInsert({ name: "A", contact: "a@b.co", likelihood: "no", adults: 3, children: 2 }).then((b) => {
    assert.equal(b.attending, false);
    assert.equal(b.guest_count, null);
    assert.equal(b.likelihood, null);
    assert.equal(b.adults, 0);
    assert.equal(b.children, 0);
  }));

test("a household of 15 is sent as guest_count 15 (DB cap is 40)", () =>
  captureInsert({ name: "A", contact: "a@b.co", likelihood: "very_likely", adults: 10, children: 5 }).then((b) => {
    assert.equal(b.guest_count, 15);
  }));
