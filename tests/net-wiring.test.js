// js/net.js only protects a page if the page loads it BEFORE the data
// modules that use it (they fall back to a plain, unlimited request when it
// is missing). Every page with a data module must load it first.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_MODULES = ["tree-data.js", "rsvp-data.js", "blessings-data.js"];
const PAGES = fs.readdirSync(ROOT).filter((f) => /\.html$/.test(f));

function scriptOrder(html) {
  const out = [];
  const re = /<script[^>]*\ssrc="js\/([^"?]+)\?v=(\d+)"/g;
  let m;
  while ((m = re.exec(html))) { out.push({ file: m[1], stamp: m[2] }); }
  return out;
}

test("net.js exists and is a UMD module with withTimeout", () => {
  const src = fs.readFileSync(path.join(ROOT, "js", "net.js"), "utf8");
  assert.match(src, /withTimeout/);
  assert.match(src, /module\.exports/);
});

test("every page that loads a data module loads net.js first, with the same stamp", () => {
  let checked = 0;
  PAGES.forEach((page) => {
    const order = scriptOrder(fs.readFileSync(path.join(ROOT, page), "utf8"));
    const firstData = order.findIndex((s) => DATA_MODULES.indexOf(s.file) !== -1);
    if (firstData === -1) { return; }
    checked += 1;
    const net = order.findIndex((s) => s.file === "net.js");
    assert.ok(net !== -1, page + " uses a data module but does not load js/net.js");
    assert.ok(net < firstData, page + " loads net.js after a data module");
    assert.equal(order[net].stamp, order[firstData].stamp, page + ": net.js has a different ?v= stamp");
  });
  assert.ok(checked >= 5, "expected at least 5 pages with data modules, found " + checked);
});

test("no page loads net.js twice", () => {
  PAGES.forEach((page) => {
    const n = scriptOrder(fs.readFileSync(path.join(ROOT, page), "utf8")).filter((s) => s.file === "net.js").length;
    assert.ok(n <= 1, page + " loads net.js " + n + " times");
  });
});
