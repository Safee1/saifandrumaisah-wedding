// Venue/city/resort names that must never appear on the site. The list itself
// is secret too (this repo is public), so it is NOT committed: it comes from
// the LEAK_TERMS env var (comma-separated; a GitHub Actions secret in CI) or
// a local, gitignored tests/.leak-terms.local file (one term per line).
"use strict";
const fs = require("fs");
const path = require("path");

function load() {
  let raw = process.env.LEAK_TERMS || "";
  const local = path.join(__dirname, ".leak-terms.local");
  if (!raw && fs.existsSync(local)) { raw = fs.readFileSync(local, "utf8"); }
  return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

const LEAK_TERMS = load();
if (!LEAK_TERMS.length) {
  console.warn("leak-terms: no LEAK_TERMS set — venue leak checks are running with an empty list");
}

function leakRegex() {
  if (!LEAK_TERMS.length) { return /(?!)/; }
  return new RegExp(LEAK_TERMS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

module.exports = { LEAK_TERMS, leakRegex };
