// Anyone can now add themselves to the tree without an invite code —
// submitOpen() calls the new submit_to_tree RPC (no code argument), and the
// existing invite-coded path stays intact alongside it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  delete require.cache[require.resolve("../js/tree-data.js")];
  const TreeData = require("../js/tree-data.js").TreeData;
  return Promise.resolve(fn(TreeData)).finally(() => { global.fetch = real; });
}

test("submitOpen calls submit_to_tree with person + rel and no code", () => {
  let captured;
  return withFetch((url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return Promise.resolve({ ok: true, text: () => Promise.resolve('{"person_id":"x"}') });
  }, (TreeData) => TreeData.submitOpen(
    { name: "Cousin Bilal", side: "saif", is_kid: false, note: null },
    { from_person: "anchor-id", to_person: "NEW", type: "parent_of" }
  ).then(() => {
    assert.match(captured.url, /\/rest\/v1\/rpc\/submit_to_tree$/);
    assert.deepEqual(Object.keys(captured.body).sort(), ["person", "rel"]);
    assert.equal(captured.body.person.name, "Cousin Bilal");
    assert.equal(captured.body.rel.type, "parent_of");
    assert.equal("code" in captured.body, false, "the open path must never send a code");
  }));
});

test("submitWithInvite still calls submit_with_invite with a code (invite path untouched)", () => {
  let captured;
  return withFetch((url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return Promise.resolve({ ok: true, text: () => Promise.resolve('{"person_id":"x"}') });
  }, (TreeData) => TreeData.submitWithInvite(
    "ABCD1234",
    { name: "Cousin Bilal", side: "saif", is_kid: false, note: null },
    { from_person: "anchor-id", to_person: "NEW", type: "parent_of" }
  ).then(() => {
    assert.match(captured.url, /\/rest\/v1\/rpc\/submit_with_invite$/);
    assert.equal(captured.body.code, "ABCD1234");
  }));
});
