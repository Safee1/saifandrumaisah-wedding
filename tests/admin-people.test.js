// The admin "people" list: sorting, filtering, labels, wiring, and the draft database function.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const AdminPeople = require("../js/admin-people.js");

const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");

test("sortPeople is alphabetical, case-insensitive, and stable for equal names", () => {
  const rows = [
    { id: "b", name: "syed", side: "saif", is_kid: false },
    { id: "a", name: "Armani", side: "saif", is_kid: false },
    { id: "d", name: "Syed", side: "rumaisah", is_kid: true },
    { id: "c", name: "Syed", side: "saif", is_kid: false }
  ];
  assert.deepEqual(AdminPeople.sortPeople(rows).map((r) => r.id), ["a", "b", "c", "d"]);
  assert.deepEqual(rows.map((r) => r.id), ["b", "a", "d", "c"], "input must not be mutated");
  assert.deepEqual(AdminPeople.sortPeople(null), []);
});

test("filterPeople matches part of a name, ignoring case and spaces at the ends", () => {
  const rows = [{ name: "Armani" }, { name: "Syed" }, { name: "Rumaisah" }];
  assert.equal(AdminPeople.filterPeople(rows, "  SY ").length, 1);
  assert.equal(AdminPeople.filterPeople(rows, "a").length, 2);
  assert.equal(AdminPeople.filterPeople(rows, "").length, 3);
  assert.equal(AdminPeople.filterPeople(rows, "zzz").length, 0);
});

test("labels say what the button will do", () => {
  assert.equal(AdminPeople.buttonLabel({ is_kid: false }), "Mark as child");
  assert.equal(AdminPeople.buttonLabel({ is_kid: true }), "Mark as adult");
  assert.equal(AdminPeople.sideLabel("saif"), "Saif's side");
  assert.equal(AdminPeople.sideLabel("rumaisah"), "Rumaisah's side");
});

test("tree-admin loads the helper, uses the new RPC and shows names with textContent only", () => {
  const html = rd("tree-admin.html");
  const helper = rd("js/admin-people.js");
  assert.match(html, /<script src="js\/admin-people\.js\?v=\d+"><\/script>/);
  assert.match(html, /admin_set_person_kid/);
  assert.match(html, /admin_list_all/);
  assert.doesNotMatch(helper, /innerHTML/);
  assert.match(helper, /main\.textContent = row\.name/);
  const stamps = [...html.matchAll(/<script src="js\/[^"?]+\?v=(\d+)"/g)].map((m) => m[1]);
  assert.ok(stamps.length >= 3 && new Set(stamps).size === 1, "stamps must be uniform: " + stamps);
});

test("the draft migration checks the password, changes one person, and is not in the live migrations folder", () => {
  const sql = rd("migrations/drafts/20261018100000_admin_set_person_kid.sql");
  assert.match(sql, /if not admin_check\(pw\) then raise exception 'invalid password'/);
  assert.match(sql, /update people set is_kid = new_kid where id = target;/);
  assert.match(sql, /raise exception 'no such person'/);
  assert.match(sql, /revoke all on function public\.admin_set_person_kid\(text, uuid, boolean\) from public;/);
  assert.match(sql, /rollback/i);
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "migrations", "20261018100000_admin_set_person_kid.sql")));
});
