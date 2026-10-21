// Docs that point at files which no longer exist send people (and AI
// assistants) the wrong way. Every backticked file path in AGENTS.md and
// README.md must exist.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXT = /\.(html|js|mjs|css|md|yml|yaml|json|sql|ts|toml|txt|sh)$/;

["AGENTS.md", "README.md"].forEach((doc) => {
  test(doc + ": every file path in backticks exists", () => {
    const text = fs.readFileSync(path.join(ROOT, doc), "utf8");
    const missing = [];
    const re = /`([^`\s]+)`/g;
    let m;
    while ((m = re.exec(text))) {
      const p = m[1].replace(/[.,;:]+$/, "");
      if (!EXT.test(p) || /[*<>{}()|]|^https?:/.test(p) || p.startsWith("/")) { continue; }
      if (!fs.existsSync(path.join(ROOT, p))) { missing.push(p); }
    }
    assert.deepEqual(missing, [], doc + " mentions files that do not exist");
  });
});
