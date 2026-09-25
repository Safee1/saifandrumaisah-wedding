// Back-office folders/files must never be published by GitHub Pages.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("_config.yml excludes every back-office path from Pages", () => {
  const cfg = fs.readFileSync(path.join(__dirname, "..", "_config.yml"), "utf8");
  for (const p of ["AGENTS.md", "README.md", "package.json", "docs/", "migrations/", "supabase/", "tests/", "scripts/"]) {
    assert.ok(cfg.includes("- " + p), p + " is not excluded");
  }
});
