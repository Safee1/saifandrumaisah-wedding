// Static checks for the DRAFT migration 20261022110000_family_code_race_admin_lockout.sql
// and the admin page handling of its {"error":"invalid_password"} reply.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const SQL = rd("migrations/20261022110000_family_code_race_admin_lockout.sql");
const ROLLBACK = rd("migrations/rollbacks/20261022110000_family_code_race_admin_lockout_rollback.sql");
const fn = (sql, name) => {
  const start = sql.indexOf("function public." + name + "(");
  assert.ok(start >= 0, name + " defined");
  const m = [sql.slice(start, sql.indexOf("$function$;", sql.indexOf("$function$", start + 20)) + 11)];
  return m[0];
};

test("migration is marked untested and has a rollback", () => {
  assert.match(SQL, /APPLIED to prod 2026-10-23/);
  assert.match(ROLLBACK, /UNTESTED/);
});

test("family_tree takes the advisory lock before counting; sleep is before the lock", () => {
  const body = fn(SQL, "family_tree");
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext('family_code'))");
  assert.ok(lock > 0);
  assert.ok(lock < body.indexOf("count(*)"), "lock before count");
  assert.ok(body.indexOf("pg_sleep") < lock, "sleep not under the lock");
  assert.ok(body.indexOf("insert into family_code_attempts") > lock, "insert under the lock");
});

test("admin_set_family_code and admin_purge_guest_data return instead of raising on a bad password", () => {
  for (const name of ["admin_set_family_code", "admin_purge_guest_data"]) {
    const body = fn(SQL, name);
    assert.match(body, /invalid_password/);
    assert.doesNotMatch(body, /raise exception 'invalid password'/);
  }
  assert.match(SQL, /drop function if exists public\.admin_set_family_code\(text, text\)/);
  assert.match(ROLLBACK, /raise exception 'invalid password'/);
});

test("tree-admin.html shows the wrong-password message for the returned error", () => {
  const html = rd("tree-admin.html");
  assert.match(html, /res\.error === "invalid_password"[\s\S]{0,120}Wrong password\./);
});
