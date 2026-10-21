// "Option B": family who know a shared code see the children's real names; everyone
// else still gets "Little one". Pins the browser side and the draft database side.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");

function loadTreeData(fetchImpl) {
  global.fetch = fetchImpl;
  delete require.cache[require.resolve("../js/tree-data.js")];
  delete require.cache[require.resolve("../js/net.js")];
  return require("../js/tree-data.js").TreeData;
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const bad = (status, body) => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

test("fetchFamilyTree posts the code to the family_tree function and returns the tree", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let call = null;
  const T = loadTreeData(async (url, opts) => { call = { url, body: JSON.parse(opts.body) }; return ok({ people: [{ id: "a", name: "Armani" }], relationships: [] }); });
  const data = await T.fetchFamilyTree("  my family code ");
  assert.match(call.url, /\/rest\/v1\/rpc\/family_tree$/);
  assert.deepEqual(call.body, { code: "  my family code " });
  assert.equal(data.people[0].name, "Armani");
});

test("a wrong code is a 400 the page can recognise; a weird answer is an error", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  let T = loadTreeData(async () => bad(400, { message: "wrong code" }));
  await assert.rejects(T.fetchFamilyTree("nope"), (e) => e.status === 400 && /wrong code/.test(e.message));
  T = loadTreeData(async () => ok({ nothing: true }));
  await assert.rejects(T.fetchFamilyTree("x"), /Unexpected response/);
  T = loadTreeData(async () => ok({ people: [], relationships: [] }));
  assert.deepEqual((await T.fetchFamilyTree(null)).people, [], "a missing code is sent as an empty string");
});

test("the home page still fetches only the public tree on unlock, and offers the code box after", () => {
  const html = rd("index.html");
  assert.match(html, /TreeData\.fetchApprovedTree\(\)/);
  assert.match(html, /id="familyCodeForm"/);
  assert.match(html, /type="password" id="familyCodeInput" aria-label="Family code"/);
  assert.match(html, /codeBox\.hidden = false/);
  assert.doesNotMatch(html, /fetchFamilyTree\([^)]*\)[\s\S]{0,40}fetchApprovedTree/, "family tree is never fetched before the visitor types a code");
});

test("the code is kept for the visit only (sessionStorage), never in localStorage or the page source", () => {
  const html = rd("index.html");
  assert.match(html, /sessionStorage\.setItem\("familyCode"/);
  assert.doesNotMatch(html, /localStorage\.setItem\("familyCode"/);
});

test("the admin page can set the code, and tells the owner when the database update is missing", () => {
  const html = rd("tree-admin.html");
  assert.match(html, /admin_set_family_code/);
  assert.match(html, /Not installed yet: the database needs the family_code update first/);
  assert.match(html, /id="familyCodeNew" aria-label="New family code"/);
});

test("the draft migration stores only a hash, hides the table, keeps public_tree untouched and can be rolled back", () => {
  const sql = rd("migrations/20261019100000_family_code.sql");
  assert.match(sql, /code_hash text not null/);
  assert.match(sql, /alter table public\.family_access enable row level security;/);
  assert.match(sql, /revoke all on public\.family_access from anon, authenticated;/);
  assert.match(sql, /code_hash = crypt\(btrim\(coalesce\(code, ''\)\), code_hash\)/);
  assert.match(sql, /raise exception 'wrong code'/);
  assert.match(sql, /if not admin_check\(pw\) then raise exception 'invalid password'/);
  assert.match(sql, /length\(btrim\(new_code\)\) < 8/);
  assert.match(sql, /gen_salt\('bf', 10\)/);
  assert.match(sql, /drop table if exists public\.family_access;/);
  assert.doesNotMatch(sql, /create or replace function public\.public_tree/, "the public tree is not changed");
});

test("the family tree function returns the same shape as public_tree, with real names", () => {
  const sql = rd("migrations/20261019100000_family_code.sql");
  const pub = rd("migrations/20260924_public_tree_hide_kid_names.sql");
  ["'people'", "'relationships'", "'id', p.id", "'side', p.side", "'is_kid', p.is_kid", "'from_person', r.from_person"].forEach((k) => {
    assert.ok(sql.includes(k) && pub.includes(k), "missing " + k);
  });
  assert.match(sql, /'name', p\.name,/);
  assert.match(sql, /'relation', p\.relation/);
  assert.match(pub, /case when p\.is_kid then 'Little one'/);
});
