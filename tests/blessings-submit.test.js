// js/blessings-data.js under bad conditions: no answer, a retry after a lost
// answer, answers that only look like success, and a list that is not a list.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const NOTIFY = "/functions/v1/notify";

function load(handler) {
  global.fetch = handler;
  delete require.cache[require.resolve("../js/blessings-data.js")];
  delete require.cache[require.resolve("../js/net.js")];
  return require("../js/blessings-data.js");
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: () => (typeof body === "string" ? Promise.reject(new SyntaxError("Unexpected token <")) : Promise.resolve(body === undefined ? null : body)),
    text: () => Promise.resolve(body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body)))
  });
}

const BLESSING = { name: "Auntie Asma", message: "May your life together be full of light." };

test("submit: a saved blessing posts id, name and message, then tells the couple", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const posts = [];
  const notes = [];
  const Blessings = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { notes.push(JSON.parse(opts.body)); return reply(200, { ok: true }); }
    posts.push(JSON.parse(opts.body));
    return reply(201);
  });
  const out = await Blessings.submit(BLESSING);
  assert.equal(posts.length, 1);
  assert.deepEqual(Object.keys(posts[0]).sort(), ["id", "message", "name"]);
  assert.equal(out.id, posts[0].id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].kind, "blessing_submitted");
});

test("submit: an optional email adds the thank-you notification and is sent with the row", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const posts = [];
  const notes = [];
  const Blessings = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { notes.push(JSON.parse(opts.body)); return reply(200, {}); }
    posts.push(JSON.parse(opts.body));
    return reply(201);
  });
  await Blessings.submit(Object.assign({ email: "asma@example.com" }, BLESSING));
  assert.equal(posts[0].email, "asma@example.com");
  assert.deepEqual(notes.map((n) => n.kind).sort(), ["blessing_submitted", "blessing_thanks"]);
});

test("submit: a retry after a lost answer reuses the id; new wording gets a new id; success forgets it", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const ids = [];
  let n = 0;
  const Blessings = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { return reply(200, {}); }
    ids.push(JSON.parse(opts.body).id);
    n += 1;
    return n === 1 ? reply(502, { message: "bad gateway" }) : reply(201);
  });
  await assert.rejects(Blessings.submit(BLESSING), /bad gateway/);
  await Blessings.submit(BLESSING);
  assert.equal(ids[0], ids[1]);
  await Blessings.submit(BLESSING);          // after a save, a second blessing is a new row
  assert.notEqual(ids[2], ids[1]);
});

test("submit: after a failure, different wording is a new row, not the old id", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const ids = [];
  let n = 0;
  const Blessings = load((url, opts) => {
    if (String(url).includes(NOTIFY)) { return reply(200, {}); }
    ids.push(JSON.parse(opts.body).id);
    n += 1;
    return n === 1 ? reply(500, { message: "nope" }) : reply(201);
  });
  await assert.rejects(Blessings.submit(BLESSING), /nope/);
  await Blessings.submit(Object.assign({}, BLESSING, { message: "Different words" }));
  assert.notEqual(ids[0], ids[1]);
});

test("submit: duplicate-key 409 means it was already saved; other 409s and a plain 200 are failures", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let Blessings = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(409, { code: "23505", message: "dup" })));
  assert.ok((await Blessings.submit(BLESSING)).id);
  Blessings = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(409, { code: "23503", message: "fk" })));
  await assert.rejects(Blessings.submit(BLESSING), /fk/);
  Blessings = load((url) => (String(url).includes(NOTIFY) ? reply(200, {}) : reply(200, "<html>portal</html>")));
  await assert.rejects(Blessings.submit(BLESSING), /Unexpected response \(200\)/);
});

test("submit: a server that never answers ends in a timeout error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const Blessings = load(() => new Promise(() => {}));
  const outcome = Blessings.submit(BLESSING).then(() => "resolved", (e) => e);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15001);
  const err = await outcome;
  assert.equal(err.timeout, true);
});

test("submit: validation still rejects before any request is made", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let calls = 0;
  const Blessings = load(() => { calls += 1; return reply(201); });
  await assert.rejects(Blessings.submit({ name: "", message: "hi" }), /your name/);
  assert.equal(calls, 0);
});

test("fetchApproved: a list comes back as a list", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Blessings = load(() => reply(200, [{ id: "1", name: "A", message: "B" }]));
  assert.equal((await Blessings.fetchApproved()).length, 1);
});

test("fetchApproved: a page, an object or null instead of a list is an error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  for (const body of [{ message: "oops" }, null, "<html>maintenance</html>"]) {
    const Blessings = load(() => reply(200, body));
    await assert.rejects(Blessings.fetchApproved(), undefined, JSON.stringify(body));
  }
});

test("fetchApproved: a server that never answers ends in a timeout error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const Blessings = load(() => new Promise(() => {}));
  const outcome = Blessings.fetchApproved().then(() => "resolved", (e) => e);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15001);
  assert.equal((await outcome).timeout, true);
});
