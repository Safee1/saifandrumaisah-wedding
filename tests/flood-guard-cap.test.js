// Static checks for the migration (now applied) 20261023100000_flood_guard_rsvps_cap_40.sql
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const SQL = rd("migrations/20261023100000_flood_guard_rsvps_cap_40.sql");
const RB = rd("migrations/rollbacks/20261023100000_flood_guard_rsvps_cap_40_rollback.sql");
const LIVE = rd("migrations/20260925150000_flood_guard_definer_and_admin_delay.sql");

test("forward file is marked applied (do not re-run); rollback is not applied", () => {
  assert.match(SQL, /APPLIED to production on 23 Oct 2026 by Saif in the Supabase SQL editor/);
  assert.match(SQL, /Do NOT re-run/);
  assert.doesNotMatch(SQL, /not applied|DRAFT/);
  assert.match(RB, /not applied/);
});

test("rollback files live in migrations/rollbacks/, none beside their forward migration", () => {
  const top = fs.readdirSync(path.join(__dirname, "..", "migrations"));
  assert.deepEqual(top.filter((f) => /_rollback\.sql$/.test(f)), []);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "migrations/rollbacks/20261023100000_flood_guard_rsvps_cap_40_rollback.sql")));
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "migrations/drafts/20261023100000_flood_guard_rsvps_cap_40.sql")));
});

test("rsvps limit is 40, every other table stays at 300", () => {
  assert.match(SQL, /case TG_TABLE_NAME when 'rsvps' then 40 else 300 end/);
  assert.match(SQL, /v_recent_count >= v_limit/);
  const code = SQL.replace(/--.*$/gm, "");
  assert.equal((code.match(/\b300\b/g) || []).length, 1, "300 only as the else-branch");
  assert.doesNotMatch(SQL, /'(blessings|people)' then/);
});

test("signature, definer and search_path unchanged; no trigger DDL", () => {
  for (const s of [SQL, RB]) {
    assert.match(s, /CREATE OR REPLACE FUNCTION public\.flood_guard\(\)/);
    assert.match(s, /SECURITY DEFINER/);
    assert.match(s, /SET search_path TO 'public', 'pg_temp'/);
    assert.doesNotMatch(s, /create trigger|drop trigger/i);
  }
});

test("rollback body is the live definition (threshold 300 for all)", () => {
  assert.match(RB, /v_recent_count >= 300/);
  const body = (s) => s.slice(s.indexOf("declare"), s.indexOf("$function$;")).replace(/--.*\n/g, "");
  const liveBody = LIVE.slice(LIVE.indexOf("declare"), LIVE.indexOf("$function$;"));
  assert.equal(body(RB).replace(/\s+/g, " "), body(liveBody + "$function$;").replace(/\s+/g, " "));
});

test("front-ends show a friendly message and re-enable the button on the flood error", () => {
  for (const f of ["rsvp.html", "add-to-tree.html", "index.html"]) {
    const s = rd(f);
    assert.match(s, /Too many submissions/, f);
    assert.match(s, /lot of replies right now/, f);
  }
});
