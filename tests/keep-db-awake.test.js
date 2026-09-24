"use strict";

// The keep-db-awake workflow scrapes the Supabase URL and anon key out of
// js/tree-data.js. If that file is ever reshaped, the ping would silently
// stop and the free project would pause — so pin the shape here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js/tree-data.js"), "utf8");
const wf = fs.readFileSync(path.join(root, ".github/workflows/keep-db-awake.yml"), "utf8");

test("tree-data.js still exposes the URL and key in the shape the ping reads", () => {
  assert.match(src, /https:\/\/[a-z0-9]+\.supabase\.co/);
  assert.match(src, /SUPABASE_ANON_KEY = "[^"]{20,}"/);
});

test("the ping runs at least every 3 days and calls the public_tree RPC, not a direct table read", () => {
  assert.match(wf, /cron: "[^"]*\*\/3 \* \*"/);
  assert.match(wf, /\/rest\/v1\/rpc\/public_tree/);
  assert.doesNotMatch(wf, /\/rest\/v1\/people\?select=/);
  assert.match(wf, /workflow_dispatch/);
});
