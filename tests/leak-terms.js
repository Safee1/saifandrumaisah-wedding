// Venue/city/resort names that must never appear on the site. The list itself
// is secret too (this repo is public), so it is NOT committed: it comes from
// the LEAK_TERMS env var (comma-separated; a GitHub Actions secret in CI) or
// a local, gitignored tests/.leak-terms.local file (one term per line).
"use strict";
const fs = require("fs");
const path = require("path");

// Once the couple flip reveal.show, the venue is public on purpose and the
// guard has nothing left to protect.
function revealed() {
  try {
    const c = require("../js/config.js");
    return !!(c.reveal && c.reveal.show === true);
  } catch (e) { return false; }
}

function load() {
  if (revealed()) { return []; }
  let raw = process.env.LEAK_TERMS || "";
  const local = path.join(__dirname, ".leak-terms.local");
  if (!raw && fs.existsSync(local)) { raw = fs.readFileSync(local, "utf8"); }
  return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

const LEAK_TERMS = load();
if (!LEAK_TERMS.length && !revealed()) {
  const msg = "leak-terms: no LEAK_TERMS set — venue leak checks would run with an empty list";
  // CI sets REQUIRE_LEAK_TERMS=1: a missing/empty secret must fail the build, not pass it.
  if (process.env.REQUIRE_LEAK_TERMS === "1") { throw new Error(msg); }
  console.warn(msg);
}

function leakRegex() {
  if (!LEAK_TERMS.length) { return /(?!)/; }
  return new RegExp(LEAK_TERMS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

module.exports = { LEAK_TERMS, leakRegex };
