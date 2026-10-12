// 404.html rescues near-miss URLs (wrong case, trailing slash) by redirecting
// to a fixed list of real pages. Runs the inline script against a fake location.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "404.html"), "utf8").replace(/\r\n/g, "\n");
const m = html.match(/<script>\s*\/\/ GitHub Pages is case-sensitive[\s\S]*?<\/script>/);

function run(pathname, search, hash) {
  const calls = [];
  const location = { pathname, search: search || "", hash: hash || "", replace: (u) => calls.push(u) };
  new Function("location", m[0].replace(/^<script>|<\/script>$/g, ""))(location);
  return calls;
}

test("the rescue script is present", () => { assert.ok(m, "rescue script missing from 404.html"); });

test("near-miss URLs go to the real page and keep ?query and #hash", () => {
  assert.deepEqual(run("/RSVP.html"), ["/rsvp.html"]);
  assert.deepEqual(run("/rsvp/", "?to=Ammi+%26+Abu", "#top"), ["/rsvp.html?to=Ammi+%26+Abu#top"]);
  assert.deepEqual(run("/Privacy/"), ["/privacy.html"]);
  assert.deepEqual(run("/Add-To-Tree"), ["/add-to-tree.html"]);
  assert.deepEqual(run("/INDEX.HTML"), ["/"]);
});

test("unknown paths stay on the 404 page", () => {
  ["/nope", "/rsvp/extra", "/admin-activity.html/", "//evil.example", "/https://evil.example"].forEach((p) => assert.deepEqual(run(p), [], p));
});

test("a correct URL never redirects (no loops)", () => {
  ["/rsvp.html", "/privacy.html", "/add-to-tree.html"].forEach((p) => assert.deepEqual(run(p), [], p));
});

test("404.html icon and manifest links are root-absolute", () => {
  ["favicon.svg", "favicon.ico", "site.webmanifest", "apple-touch-icon.png"].forEach((f) => assert.ok(html.includes('href="/' + f + '"'), f));
});
