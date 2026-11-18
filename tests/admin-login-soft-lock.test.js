// Static checks for the DRAFT migration
// migrations/drafts/20261116100000_admin_login_counts_and_soft_lock.sql
// (bug hunt, Nov 2026): wrong admin passwords must be counted and logged even
// though every admin_* caller raises afterwards, and a stranger must not be
// able to lock the couple out. Nothing here talks to a database.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const DRAFT = "migrations/drafts/20261116100000_admin_login_counts_and_soft_lock.sql";
const RB_FILE = "migrations/rollbacks/20261116100000_admin_login_counts_and_soft_lock_rollback.sql";
const SQL = rd(DRAFT);
const RB = rd(RB_FILE);
const LIVE = rd("migrations/20260925150000_flood_guard_definer_and_admin_delay.sql");

const code = (s) => s.replace(/--.*$/gm, "");
const fn = (sql, name) => {
  const start = sql.search(new RegExp("function public\\." + name + "\\(", "i"));
  assert.ok(start >= 0, name + " defined");
  const open = sql.indexOf("$function$", start);
  return sql.slice(start, sql.indexOf("$function$;", open + 10) + 11);
};
const CHECK = code(fn(SQL, "admin_check"));
const FLUSH = code(fn(SQL, "admin_login_log_flush"));

test("draft is marked as an unapplied draft, with a plain-English header and a rollback", () => {
  assert.match(SQL, /DRAFT\. NOT applied anywhere/);
  assert.match(SQL, /UNTESTED/);
  for (const h of ["WHAT IT CHANGES", "WHY", "THE TRADE-OFF CHOSEN", "HOW TO CHECK IT WORKED", "HOW TO UNDO", "WHAT THE REPO CANNOT TELL ME"]) {
    assert.ok(SQL.includes(h), "header section: " + h);
  }
  assert.ok(SQL.includes(RB_FILE), "header names the rollback file");
  assert.match(RB, /UNTESTED[\s\S]{0,40}not applied/);
  assert.ok(!fs.existsSync(path.join(ROOT, "migrations", path.basename(DRAFT))), "not promoted out of drafts/");
});

test("failures are counted with sequences, which survive the caller's raise", () => {
  // the bug: the only failure record was a table row, rolled back by 'invalid password'
  assert.doesNotMatch(CHECK, /count\(\*\)/, "the count no longer comes from table rows");
  assert.match(CHECK, /setval\('public\.admin_fail_window'/);
  assert.match(CHECK, /nextval\('public\.admin_fail_total'\)/);
  for (const s of ["admin_fail_window", "admin_fail_total", "admin_fail_last_at", "admin_fail_alarm"]) {
    assert.match(SQL, new RegExp("to_regclass\\('public\\." + s + "'\\) is null"), s + " created only if missing");
  }
  assert.match(SQL, /revoke all on sequence public\.admin_fail_window, public\.admin_fail_total, public\.admin_fail_last_at,\s+public\.admin_fail_alarm\s+from public, anon, authenticated/);
});

// Review findings (Nov 2026) on the first version of this draft.
test("a stranger cannot make it write without limit: no failure rows, and a per-slot cap on log lines", () => {
  // wrong guesses add no table row (on the open paths that row is kept)
  assert.doesNotMatch(CHECK, /insert into admin_login_attempts \(success\) values \(v_ok\)/);
  const ins = CHECK.indexOf("insert into admin_login_attempts (success) values (true)");
  assert.ok(ins > 0, "successes are still recorded");
  assert.match(CHECK.slice(0, ins), /if v_ok then\s+begin\s+$/, "and only inside the right-password branch");
  // the catch-up logger: a fixed allowance per 15-minute slot, then one summary line, then nothing
  assert.match(FLUSH, /c_lines_per_slot constant integer := 3;/);
  assert.match(FLUSH, /v_slot := floor\(extract\(epoch from clock_timestamp\(\)\) \/ 900\)::bigint;/);
  assert.match(FLUSH, /if v_log_slot <> v_slot then\s+v_lines := 0;/);
  assert.match(FLUSH, /elsif v_total > v_logged and v_lines <= c_lines_per_slot then/);
  assert.match(FLUSH, /v_write := least\(v_total - v_logged, c_lines_per_slot - v_lines\)::integer;/);
  assert.match(FLUSH, /generate_series\(1, v_write\)/);
  assert.match(FLUSH, /v_lines := c_lines_per_slot \+ 1;\s+v_logged := v_total;/, "after the summary line the slot is closed");
  assert.doesNotMatch(FLUSH, /50/, "the old per-catch-up cap of 50 is gone");
  const inserts = FLUSH.match(/insert into activity_log/g) || [];
  assert.equal(inserts.length, 3, "single lines, one summary, one alarm: nothing else is written");
  assert.match(SQL, /add column if not exists log_slot bigint/);
  assert.match(SQL, /add column if not exists log_slot_lines integer/);
});

// The cap, run as a model of the logger above (same steps, same names), to
// prove the two things the header promises: never more than 4 failed-login
// lines in a slot, and the lines plus the "Plus N" figures equal the count.
test("model of the cap: at most 3 lines + 1 summary per slot, and no guess is lost from the numbers", () => {
  const C = Number(FLUSH.match(/c_lines_per_slot constant integer := (\d+);/)[1]);
  const led = { logged: 0, slot: 0, lines: 0 };
  let total = 0;
  const log = []; // { slot, n } where n = guesses that line stands for
  function flush(slot) {
    let lines = led.slot !== slot ? 0 : led.lines;
    let logged = led.logged;
    if (total > logged && lines <= C) {
      const write = Math.min(total - logged, C - lines);
      for (let i = 0; i < write; i++) { log.push({ slot, n: 1 }); }
      lines += write; logged += write;
      if (total > logged) { log.push({ slot, n: total - logged }); lines = C + 1; logged = total; }
    }
    led.logged = logged; led.slot = slot; led.lines = lines;
  }
  // a stranger hammering an open path: every wrong call is kept and flushes
  for (let slot = 100; slot < 104; slot++) {
    for (let i = 0; i < 500; i++) { total += 1; flush(slot); }
  }
  for (let slot = 100; slot < 104; slot++) {
    assert.ok(log.filter((l) => l.slot === slot).length <= C + 1, "slot " + slot);
  }
  // guesses made after a slot's summary wait in the counter...
  assert.ok(log.reduce((n, l) => n + l.n, 0) < total);
  // ...and the next login in a later slot accounts for every one of them
  flush(104);
  assert.equal(log.reduce((n, l) => n + l.n, 0), total);
  assert.ok(log.length <= 5 * (C + 1));
  // guesses at a login gate (all undone, nothing flushed) then one login
  total += 6; flush(200);
  assert.deepEqual(log.slice(-4).map((l) => l.n), [1, 1, 1, 3]);
});

test("the 'five or more' line is remembered when it happens, so a later quiet slot cannot hide it", () => {
  const wrong = CHECK.slice(CHECK.indexOf("if not v_ok then"));
  assert.match(wrong, /if v_count >= 5 then\s+perform setval\('public\.admin_fail_alarm', v_win, true\);/);
  assert.match(FLUSH, /select last_value into v_alarm_slot from public\.admin_fail_alarm;/);
  assert.match(FLUSH, /if v_alarm_slot > v_alarm then\s+insert into activity_log[\s\S]{0,120}'admin_lockout'/);
  assert.doesNotMatch(FLUSH, /admin_fail_window/, "the alarm no longer depends on the current slot's counter");
});

test("header is straight about what soft mode does not do, and about the trial and the undo", () => {
  assert.match(SQL, /SOFT DOES NOT LIMIT HOW FAST\s+--\s+SOMEONE CAN GUESS/);
  assert.doesNotMatch(SQL, /wrong guesses are only slowed/);
  assert.match(SQL, /The ONLY protection is the password itself/);
  assert.match(SQL, /DO THIS FIRST[\s\S]{0,200}pg_get_functiondef\('public\.admin_check\(text\)'::regprocedure\)/);
  assert.match(SQL, /NOT bare Postgres/);
  assert.match(SQL, /COUNT LINES/);
  assert.match(SQL, /one burst of parallel requests gets more than\s+--\s+5 tries per slot/);
  assert.match(SQL, /about 480 a day/);
  assert.match(RB, /READ BEFORE RUNNING/);
  assert.match(RB, /dropped whether or not the draft created/);
});

test("a wrong password returns false and never raises; the correct one is never refused by default", () => {
  assert.doesNotMatch(CHECK, /raise exception 'invalid password'/);
  assert.match(CHECK, /c_hard_lock constant boolean := false;/);
  const raises = CHECK.match(/raise exception/g) || [];
  assert.equal(raises.length, 1, "the only raise is the opt-in hard lock");
  const hardStart = CHECK.indexOf("if c_hard_lock then");
  const raiseAt = CHECK.indexOf("raise exception 'Too many attempts — try again in 15 minutes'");
  const verify = CHECK.indexOf("crypt(coalesce(pw, ''), password_hash)");
  assert.ok(hardStart > 0 && raiseAt > hardStart && raiseAt < verify, "the raise sits inside the hard-lock branch");
  // the password is verified before anything that depends on the failure count
  assert.ok(verify < CHECK.indexOf("if not v_ok then"));
  assert.match(CHECK, /return v_ok;\s*end;/);
});

test("wrong-password path: pause, then advisory lock, then read and write the counter", () => {
  const split = CHECK.indexOf("if not v_ok then");
  const wrong = CHECK.slice(split);
  const sleep = wrong.indexOf("pg_sleep(1.5)");
  const lock = wrong.indexOf("pg_advisory_xact_lock(hashtext('admin_login'))");
  const read = wrong.indexOf("select last_value into v_packed from public.admin_fail_window");
  const write = wrong.indexOf("setval('public.admin_fail_window'");
  assert.ok(sleep > 0 && lock > sleep, "sleep is not under the lock");
  assert.ok(read > lock && write > read, "count is read and written under the lock");
  // the right-password path takes neither
  assert.doesNotMatch(CHECK.slice(0, split), /pg_sleep|pg_advisory/);
});

test("failed logins reach the activity log through the catch-up logger", () => {
  assert.match(CHECK, /perform public\.admin_login_log_flush\(\);/);
  assert.match(FLUSH, /for update/);
  assert.match(FLUSH, /'admin_login_failed', 'Admin login attempt failed'/);
  assert.match(FLUSH, /'admin_lockout'/);
  assert.match(FLUSH, /update admin_login_ledger\s+set logged_total = v_logged, alarm_window = v_alarm, log_slot = v_slot, log_slot_lines = v_lines\s+where id = 1/);
  assert.match(FLUSH, /exception when others then\s+null;/, "logging can never break a login");
  // every UPDATE carries a WHERE (pg-safeupdate may be loaded for the REST role)
  const updates = (FLUSH + CHECK).match(/update [^;]+;/g) || [];
  assert.ok(updates.length >= 1);
  for (const u of updates) { assert.match(u, /where/); }
  assert.match(SQL, /revoke all on function public\.admin_login_log_flush\(\) from public, anon, authenticated/);
  assert.match(SQL, /alter table public\.admin_login_ledger enable row level security/);
  assert.match(SQL, /revoke all on public\.admin_login_ledger from public, anon, authenticated/);
});

test("same signature, definer and grants; safe to run twice; no other function touched", () => {
  assert.match(SQL, /create or replace function public\.admin_check\(pw text\)\s+returns boolean\s+language plpgsql\s+security definer/);
  assert.match(SQL, /grant execute on function public\.admin_check\(text\) to anon, authenticated/);
  assert.match(SQL, /create table if not exists public\.admin_login_ledger/);
  assert.match(SQL, /on conflict \(id\) do nothing/);
  const defined = (code(SQL).match(/create (or replace )?function public\.(\w+)/g) || []).map((s) => s.split(".")[1]).sort();
  assert.deepEqual(defined, ["admin_check", "admin_login_log_flush"]);
  assert.doesNotMatch(code(SQL), /drop (function|table|sequence)/i);
});

test("rollback restores the repo's newest admin_check and removes what the draft added", () => {
  const body = (s) => s.slice(s.indexOf("declare"), s.indexOf("$function$;")).replace(/\s+/g, " ");
  assert.equal(body(fn(RB, "admin_check")), body(fn(LIVE, "admin_check")));
  assert.match(RB, /drop function if exists public\.admin_login_log_flush\(\)/);
  assert.match(RB, /drop table if exists public\.admin_login_ledger/);
  for (const s of ["admin_fail_window", "admin_fail_total", "admin_fail_last_at", "admin_fail_alarm"]) {
    assert.match(RB, new RegExp("drop sequence if exists public\\." + s + ";"));
  }
});

test("the Edge Function did not need a change: it still calls admin_check and reads a boolean", () => {
  const ts = rd("supabase/functions/notify/index.ts");
  assert.match(ts, /sb\.rpc\("admin_check", \{ pw \}\)/);
  assert.match(ts, /if \(authErr \|\| !authOk\)/);
});

test("ops doc points at the draft", () => {
  assert.ok(rd("docs/OPERATIONS.md").includes(DRAFT));
});
