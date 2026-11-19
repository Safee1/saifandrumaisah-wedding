// Static checks for the DRAFT migration
// migrations/drafts/20261116110000_rsvp_headcount_latest_reply.sql
// (bug hunt, Nov 2026): the public headcount must count each guest once, by
// their latest reply, and not at all when that reply is a decline. "Same
// guest" must follow js/rsvp-dupes.js (same name AND a shared contact key).
// Nothing here talks to a database; all sample data is made up.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Dupes = require("../js/rsvp-dupes.js");

const ROOT = path.join(__dirname, "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const DRAFT = "migrations/drafts/20261116110000_rsvp_headcount_latest_reply.sql";
const RB_FILE = "migrations/rollbacks/20261116110000_rsvp_headcount_latest_reply_rollback.sql";
const SQL = rd(DRAFT);
const RB = rd(RB_FILE);
const OLD = rd("migrations/20260923_rsvp_interest_and_headcount.sql");

const code = (s) => s.replace(/^\s*--.*$/gm, "");
const fn = (sql, name) => {
  const start = sql.indexOf("function public." + name + "(");
  assert.ok(start >= 0, name + " defined");
  const open = sql.indexOf("$function$", start);
  return sql.slice(start, sql.indexOf("$function$;", open + 10) + 11);
};
const HEAD = code(fn(SQL, "rsvp_headcount"));
const NAME = code(fn(SQL, "rsvp_name_key"));
const CONTACT = code(fn(SQL, "rsvp_contact_keys"));

// --- a JS port of the two SQL helpers, built from the patterns IN the SQL ---
const sqlLiteral = (s) => s.replace(/''/g, "'");
const namePat = sqlLiteral(NAME.match(/'(\[\\s\\u00A0.*\]\+)', ' ', 'g'/)[1]);
const emailPat = sqlLiteral(CONTACT.match(/regexp_matches\(src\.s, '\((.+)\)', 'g'\)/)[1]);
const phonePat = sqlLiteral(CONTACT.match(/'\((\\\+\?\[0-9\].+)\)', 'g'/)[1]);

function sqlNameKey(name) {
  return String(name == null ? "" : name).normalize("NFC").toLowerCase()
    .replace(new RegExp(namePat, "g"), " ").trim();
}
// translate(text, from, to): the digit lists, read out of the SQL
const TR = CONTACT.match(/translate[(]coalesce[(]p_contact, ''[)],[ \n]+'([^']+)',[ \n]+'([0-9]+)'[)]/);
const trFrom = Array.from(TR[1]), trTo = Array.from(TR[2]);
function sqlContactKeys(contact) {
  const s = Array.from(String(contact == null ? "" : contact))
    .map((ch) => (trFrom.indexOf(ch) === -1 ? ch : trTo[trFrom.indexOf(ch)])).join("");
  const keys = new Set();
  (s.match(new RegExp(emailPat, "g")) || []).forEach((m) => {
    const e = m.trim().toLowerCase().replace(/[.]+$/, "");
    if (e) { keys.add("email:" + e); }
  });
  const rest = s.replace(new RegExp(emailPat, "g"), " ");
  (rest.match(new RegExp(phonePat, "g")) || []).forEach((m) => {
    const d0 = m.replace(/[^0-9]/g, "");
    if (d0.length < 7) { return; }
    const d1 = d0.startsWith("00") ? d0.slice(2) : d0;
    const d2 = d1.startsWith("44") && d1.length > 10 ? d1.slice(2).replace(/^0/, "")
      : d1.startsWith("0") ? d1.slice(1) : d1;
    if (d2) { keys.add("phone:" + d2); }
  });
  return Array.from(keys).sort();
}
// the WHERE clause of the new rsvp_headcount, row for row
function sqlHeadcount(rows) {
  const keyed = rows.map((r, i) => ({ r, i, nk: sqlNameKey(r.name), ck: sqlContactKeys(r.contact), t: new Date(r.created_at).getTime() }));
  return keyed.filter((a) => a.r.attending === true && !keyed.some((b) =>
    b.i !== a.i && a.nk !== "" && b.nk === a.nk && b.ck.some((k) => a.ck.includes(k)) &&
    (b.t > a.t || (b.t === a.t && b.i > a.i))
  )).reduce((n, a) => n + (a.r.adults || 0) + (a.r.children || 0), 0);
}
function adminHeadcount(rows) {
  return Dupes.groupDuplicates(rows).filter((e) => e.isKeeper && e.row.attending)
    .reduce((n, e) => n + (e.row.adults || 0) + (e.row.children || 0), 0);
}
const row = (name, contact, attending, adults, children, day) =>
  ({ name, contact, attending, adults, children, created_at: "2030-01-" + day + "T10:00:00Z" });

test("draft is marked as an unapplied draft, with a plain-English header and a rollback", () => {
  assert.match(SQL, /DRAFT\. NOT applied anywhere/);
  assert.match(SQL, /UNTESTED/);
  for (const h of ["WHAT IT CHANGES", "WHY", "WHO COUNTS AS \"THE SAME GUEST\"", "LIMITS", "HOW TO CHECK IT WORKED", "HOW TO UNDO", "WHAT THE REPO CANNOT TELL ME"]) {
    assert.ok(SQL.includes(h), "header section: " + h);
  }
  assert.ok(SQL.includes(RB_FILE), "header names the rollback file");
  assert.match(RB, /UNTESTED[\s\S]{0,40}not applied/);
  assert.ok(!fs.existsSync(path.join(ROOT, "migrations", path.basename(DRAFT))), "not promoted out of drafts/");
});

test("headcount no longer sums every attending row", () => {
  // the bug, as it stands in the applied migration
  assert.match(OLD, /from public\.rsvps\s+where attending = true;/);
  assert.doesNotMatch(HEAD, /from public\.rsvps\s+where attending = true/);
  // a newer reply from the same guest replaces an older one...
  assert.match(HEAD, /not exists/);
  assert.match(HEAD, /b\.name_key = a\.name_key/);
  assert.match(HEAD, /b\.contact_keys && a\.contact_keys/, "name AND contact, not either");
  assert.match(HEAD, /\(b\.created_at, b\.id\) > \(a\.created_at, a\.id\)/);
  assert.match(HEAD, /a\.name_key <> ''/, "a reply with no usable name is never replaced");
  // ...and only a latest reply that says 'coming' is added up
  assert.match(HEAD, /where a\.attending is true/);
  assert.doesNotMatch(HEAD, /\bor\b/i, "no name-OR-contact matching");
});

test("same shape as before: no arguments, one integer, definer, public grant; helpers are internal", () => {
  assert.match(SQL, /create or replace function public\.rsvp_headcount\(\)\s+returns integer\s+language sql\s+security definer/);
  assert.match(HEAD, /::integer/);
  assert.match(SQL, /grant execute on function public\.rsvp_headcount\(\) to anon, authenticated/);
  assert.match(SQL, /revoke all on function public\.rsvp_name_key\(text\) from public, anon, authenticated/);
  assert.match(SQL, /revoke all on function public\.rsvp_contact_keys\(text\) from public, anon, authenticated/);
  assert.doesNotMatch(code(SQL), /drop |alter table|create table/i);
});

test("rollback restores the applied definition and drops the helpers", () => {
  const body = (s) => s.slice(s.indexOf("as $$"), s.indexOf("$$;")).replace(/\s+/g, " ");
  assert.equal(body(RB), body(OLD));
  assert.match(RB, /drop function if exists public\.rsvp_name_key\(text\);/);
  assert.match(RB, /drop function if exists public\.rsvp_contact_keys\(text\);/);
});

test("SQL name and contact rules give the same matches as js/rsvp-dupes.js", () => {
  const same = [["  Test  Guest ", "test guest"], ["Test O'Guest", "test o’guest"], ["TEST-GUEST", "test guest"], ["Tést Guest", "Tést Guest"]];
  for (const [a, b] of same) {
    assert.equal(sqlNameKey(a), sqlNameKey(b), a + " ~ " + b);
    assert.equal(Dupes.normalizeName(a), Dupes.normalizeName(b));
  }
  assert.notEqual(sqlNameKey("Test Guest"), sqlNameKey("Other Guest"));
  assert.equal(sqlNameKey("  ...  "), "");
  // vowel marks are kept (they carry the vowels in several scripts)
  assert.notEqual(sqlNameKey("कि"), sqlNameKey("की"));

  const contacts = ["07700 900123", "+44 7700 900123", "+44 (0)7700 900123", "00447700900123", "07700900123 (mum)",
    "Guest@Example.COM", "guest@example.com.", "07700 900123 / guest@example.com", "call me", "", "12345", null];
  for (const c of contacts) {
    assert.deepEqual(sqlContactKeys(c), Dupes.contactKeys(c).slice().sort(), String(c));
  }
  assert.deepEqual(sqlContactKeys("+44 (0)7700 900123"), ["phone:7700900123"]);
});

// Review finding (Nov 2026): the SQL name list was narrower than the admin
// page for dashes, Arabic/Urdu and Hindi punctuation and invisible characters,
// and neither side read digits typed in another script.
test("SQL follows the admin page for non-Latin punctuation, invisible characters and non-Latin digits", () => {
  const cp = (n) => String.fromCodePoint(n);
  // en dash, em dash, minus, Arabic comma / semicolon / question mark, Urdu
  // full stop, danda, zero-width space / non-joiner / joiner, BOM, ellipsis,
  // guillemets, ideographic space, narrow no-break space
  const marks = [0x2013, 0x2014, 0x2212, 0x060C, 0x061B, 0x061F, 0x06D4, 0x0964, 0x200B, 0x200C, 0x200D,
    0xFEFF, 0x2026, 0x00AB, 0x00BB, 0x3000, 0x202F];
  for (const m of marks) {
    const typed = "Test" + cp(m) + "Guest" + cp(m);
    const hex = "U+" + m.toString(16);
    assert.equal(sqlNameKey(typed), "test guest", "SQL " + hex);
    assert.equal(Dupes.normalizeName(typed), "test guest", "admin page " + hex);
  }
  // every character the SQL list strips is one the admin page strips too
  // (so the SQL can never merge two names the admin page keeps apart)
  for (let n = 0x20; n < 0xFFFF; n++) {
    if (n >= 0xD800 && n <= 0xDFFF) { continue; }
    if (sqlNameKey("a" + cp(n) + "b") === "a b") {
      assert.equal(Dupes.normalizeName("a" + cp(n) + "b"), "a b", "U+" + n.toString(16));
    }
  }
  // each list of ten digits maps to 0-9, in order
  assert.equal(trFrom.length, trTo.length);
  assert.equal(trFrom.length % 10, 0);
  trFrom.forEach((ch, i) => {
    assert.equal(trTo[i], String(i % 10));
    assert.equal(ch.codePointAt(0) - (i % 10), trFrom[i - (i % 10)].codePointAt(0), "consecutive digits");
    assert.match(ch, /^\p{Nd}$/u);
  });
  const zeros = [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0xFF10];
  for (const z of zeros) {
    const typed = "07700 900123".replace(/[0-9]/g, (d) => cp(z + Number(d)));
    assert.deepEqual(sqlContactKeys(typed), ["phone:7700900123"], "SQL U+" + z.toString(16));
    assert.deepEqual(Dupes.contactKeys(typed), ["phone:7700900123"], "admin page U+" + z.toString(16));
  }
  // a re-send typed once on an Arabic keypad: one guest, 2 people, both sides
  const arabic = "07700 900123".replace(/[0-9]/g, (d) => cp(0x0660 + Number(d)));
  const rows = [row("Test Guest", "07700 900123", true, 2, 0, "01"), row("Test Guest", arabic, true, 2, 0, "02")];
  assert.equal(sqlHeadcount(rows), 2);
  assert.equal(adminHeadcount(rows), 2);
});

test("header tells the owner what he must decide and how to trial it", () => {
  assert.match(SQL, /DO THIS FIRST/);
  assert.match(SQL, /NOT bare Postgres/);
  assert.match(SQL, /PRIVACY, your decision/);
  assert.match(SQL, /only spaces between them/);
});

test("worked examples: re-sends count once, a later decline counts as zero, look-alikes still count", () => {
  // corrected 4 to 5: the old sum said 9, must be 5
  const corrected = [row("Test Guest", "07700 900123", true, 4, 0, "01"), row("test guest", "+44 7700 900123", true, 3, 2, "02")];
  assert.equal(sqlHeadcount(corrected), 5);
  // said yes, later said no: the old sum said 4, must be 0
  const declined = [row("Test Guest", "guest@example.com", true, 4, 0, "01"), row("Test Guest", "guest@example.com", false, 0, 0, "02")];
  assert.equal(sqlHeadcount(declined), 0);
  // said no, later said yes
  const backIn = [row("Test Guest", "guest@example.com", false, 0, 0, "01"), row("Test Guest", "guest@example.com", true, 4, 0, "02")];
  assert.equal(sqlHeadcount(backIn), 4);
  // same name with a different contact (two cousins), and same contact with a
  // different name (one phone, two households): all still counted
  const lookAlikes = [row("Test Guest", "07700 900123", true, 2, 0, "01"), row("Test Guest", "07700 900456", true, 3, 0, "02"),
    row("Other Guest", "07700 900123", true, 1, 1, "03")];
  assert.equal(sqlHeadcount(lookAlikes), 7);
  // no usable contact: never merged
  assert.equal(sqlHeadcount([row("Test Guest", "", true, 1, 0, "01"), row("Test Guest", "", true, 1, 0, "02")]), 2);
  // and the public number agrees with the admin page's total on all of these
  for (const rows of [corrected, declined, backIn, lookAlikes]) {
    assert.equal(sqlHeadcount(rows), adminHeadcount(rows));
  }
});
