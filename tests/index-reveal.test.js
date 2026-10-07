// The sealed teaser must stay sealed: the real date and travel list may only
// be wired up when reveal.show is exactly true, and a hidden teaser block
// must really be hidden (display:flex used to beat the [hidden] attribute).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/\r\n/g, "\n");

test(".reveal-wrap[hidden] is display:none", () => {
  assert.match(html, /\.reveal-wrap\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
});

test("the wedding-date countdown is only attached when reveal.show === true", () => {
  assert.match(html, /if \(REVEAL\.show === true\) Countdown\.attach\(WEDDING_DATE/);
});

test("the travel list stays hidden unless reveal.show === true", () => {
  assert.match(html, /REVEAL\.show !== true \|\| !Travel\.visible\(/);
});

test("the teaser steps aside only on reveal.show === true", () => {
  assert.match(html, /if \(REVEAL\.show === true\) \{ return; \}/);
});
