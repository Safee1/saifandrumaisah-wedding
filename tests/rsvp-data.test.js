// js/rsvp-data.js under bad conditions: a server that never answers, a
// retry after a lost answer, and answers that only look like success.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const NOTIFY = "/functions/v1/notify";

function load(handler) {
  global.fetch = handler;
  delete require.cache[require.resolve("../js/rsvp-data.js")];
  delete require.cache[require.resolve("../js/net.js")];
  return require("../js/rsvp-data.js").RsvpData;
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: () => Promise.resolve(body === undefined ? null : body),
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body))
  });
}

const GUEST = { name: "Aunt Zainab", contact: "zainab@example.com", likelihood: "definitely", adults: 2, children: 0 };

test("a server that never answers ends in a timeout error, not a hang", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const Rsvp = load(() => new Promise(() => {}));
  const pending = Rsvp.submitInterest(GUEST);
  const outcome = pending.then(() => "resolved", (e) => e);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15001);
  const err = await outcome;
  assert.ok(err instanceof Error && err.timeout === true, "rejects with a timeout error");
});

test("a retry after a lost answer reuses the same row id; different wording gets a new one", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const ids = [];
  let attempt = 0;
  const Rsvp = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { return reply(200, { ok: true }); }
    ids.push(JSON.parse(opts.body).id);
    attempt += 1;
    return attempt === 1 ? reply(503, { message: "upstream down" }) : reply(201);
  });
  await assert.rejects(Rsvp.submitInterest(GUEST), /upstream down/);
  await Rsvp.submitInterest(GUEST);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1], "same form, same id: the database can tell it is one RSVP");
  // saved, so a deliberate second RSVP is a new row
  await Rsvp.submitInterest(GUEST);
  assert.notEqual(ids[2], ids[1]);
});

test("changed form content after a failure is a new row, not the old id", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const ids = [];
  let n = 0;
  const Rsvp = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { return reply(200, { ok: true }); }
    ids.push(JSON.parse(opts.body).id);
    n += 1;
    return n === 1 ? reply(500, { message: "nope" }) : reply(201);
  });
  await assert.rejects(Rsvp.submitInterest(GUEST), /nope/);
  await Rsvp.submitInterest(Object.assign({}, GUEST, { adults: 3 }));
  assert.notEqual(ids[0], ids[1]);
});

test("409 with the duplicate-key code means an earlier try already saved it: success", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(409, { code: "23505", message: "duplicate key" })));
  const out = await Rsvp.submitInterest(GUEST);
  assert.ok(out.id);
});

test("409 for any other reason is still a failure", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(409, { code: "23503", message: "foreign key" })));
  await assert.rejects(Rsvp.submitInterest(GUEST), /foreign key/);
});

test("a 200 that is not a real save (a Wi-Fi sign-in page, a proxy) is not a thank-you", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(200, "<html>sign in</html>")));
  await assert.rejects(Rsvp.submitInterest(GUEST), /Unexpected response \(200\)/);
});

test("204 and 201 both count as saved", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  for (const status of [201, 204]) {
    const Rsvp = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(status)));
    assert.ok((await Rsvp.submitInterest(GUEST)).id, "status " + status);
  }
});

test("fetch throwing straight away is a rejection the page can catch", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(Rsvp.submitInterest(GUEST), /Failed to fetch/);
});

test("a failing notify call never fails the guest's RSVP", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load((url) => (String(url).includes(NOTIFY) ? Promise.reject(new Error("mail is down")) : reply(201)));
  assert.ok((await Rsvp.submitInterest(GUEST)).id);
});

test("headcount: HTML instead of a number is an error, not a silent wrong count", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("<html>nope</html>") }));
  await assert.rejects(Rsvp.headcount());
});

test("rpc: an error answer carries the server's message and status", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Rsvp = load(() => reply(400, { message: "Invalid password" }));
  const err = await Rsvp.rpc("admin_list_rsvps", { pw: "x" }).catch((e) => e);
  assert.equal(err.message, "Invalid password");
  assert.equal(err.status, 400);
});
