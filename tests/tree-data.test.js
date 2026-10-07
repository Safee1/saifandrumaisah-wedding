// js/tree-data.js: the tree answer is checked before it reaches the
// renderer, every call has a time limit, and "saved" means 201/204.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function load(handler) {
  global.fetch = handler;
  delete require.cache[require.resolve("../js/tree-data.js")];
  delete require.cache[require.resolve("../js/net.js")];
  return require("../js/tree-data.js").TreeData;
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: () => Promise.resolve(body === undefined ? null : body),
    text: () => Promise.resolve(body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body)))
  });
}

test("fetchApprovedTree: people and relationships arrays pass through", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const data = { people: [{ id: "a" }], relationships: [] };
  const Tree = load(() => reply(200, data));
  assert.deepEqual(await Tree.fetchApprovedTree(), data);
});

test("fetchApprovedTree: anything else is one plain error the page already handles", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const bad = [null, [], { people: [] }, { relationships: [] }, { people: "x", relationships: [] }, "<html>down for maintenance</html>"];
  for (const body of bad) {
    const Tree = load(() => reply(200, body));
    await assert.rejects(Tree.fetchApprovedTree(), /Unexpected response|JSON/, JSON.stringify(body));
  }
});

test("fetchApprovedTree: a server error is an error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Tree = load(() => reply(503, { message: "project paused" }));
  await assert.rejects(Tree.fetchApprovedTree(), /project paused/);
});

test("fetchApprovedTree: a server that never answers ends in a timeout error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const Tree = load(() => new Promise(() => {}));
  const outcome = Tree.fetchApprovedTree().then(() => "resolved", (e) => e);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15001);
  assert.equal((await outcome).timeout, true);
});

test("submitOpen: a server that never answers ends in a timeout error (the add-to-tree button can recover)", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const Tree = load(() => new Promise(() => {}));
  const outcome = Tree.submitOpen({ name: "Bilal", side: "saif", is_kid: false }, null).then(() => "resolved", (e) => e);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15001);
  assert.equal((await outcome).timeout, true);
});

test("fetch throwing straight away is a rejection, not a crash", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Tree = load(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(Tree.fetchApprovedTree(), /Failed to fetch/);
  await assert.rejects(Tree.submitOpen({ name: "x", side: "saif" }, null), /Failed to fetch/);
});

test("submitPerson: only 201 or 204 counts as saved", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let Tree = load(() => reply(201));
  assert.ok((await Tree.submitPerson({ name: "A", side: "saif" })).id);
  Tree = load(() => reply(200, "<html>sign in</html>"));
  await assert.rejects(Tree.submitPerson({ name: "A", side: "saif" }), /Unexpected response \(200\)/);
});

test("rpc: errors carry the server message, and an empty body is null", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let Tree = load(() => reply(400, { message: "Invalid password" }));
  assert.equal((await Tree.rpc("admin_check", { pw: "x" }).catch((e) => e)).message, "Invalid password");
  Tree = load(() => reply(200));
  assert.equal(await Tree.rpc("admin_set_person_status", {}), null);
});

test("notify: never throws and never leaves the caller waiting", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  const Tree = load(() => Promise.reject(new Error("offline")));
  assert.doesNotThrow(() => Tree.notify("tree_person_submitted", "x"));
  await new Promise((resolve) => setImmediate(resolve));
});
