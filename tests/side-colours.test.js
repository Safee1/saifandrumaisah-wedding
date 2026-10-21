// Saif's side and Rumaisah's side must look different from the couple down:
// the left leg of the bracket and Saif's branches take his colour, the right leg
// and Rumaisah's branches take hers (matching the box top edges).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const tree = rd("js/family-tree.js");
const html = rd("index.html");

test("the bracket's two legs are tagged per side, left = Saif, right = Rumaisah", () => {
  assert.match(tree, /\{ d: "M60 2 L60 22 L12 22 L12 54", side: "saif" \}/);
  assert.match(tree, /\{ d: "M60 2 L60 22 L108 22 L108 54", side: "rumaisah" \}/);
  assert.match(tree, /path\.setAttribute\("class", "leg-" \+ leg\.side\)/);
});

test("each side column carries its own class", () => {
  assert.match(tree, /makeEl\("div", "side side-" \+ sideKey\)/);
});

test("the two legs and the two sides get different colours", () => {
  const leg = (s) => (html.match(new RegExp("\.flow-link path\.leg-" + s + " \{ stroke: ([^;]+);")) || [])[1];
  assert.ok(leg("saif") && leg("rumaisah"));
  assert.notEqual(leg("saif"), leg("rumaisah"));
  const side = (s) => (html.match(new RegExp("\.side-" + s + " \.ln-marriage[^{]*\{ stroke: ([^;]+);")) || [])[1];
  assert.ok(side("saif") && side("rumaisah"));
  assert.notEqual(side("saif"), side("rumaisah"));
  assert.match(html, /\.t1 \{ border-top: 3px solid #5b7ba3; \}/, "Saif's boxes keep the same blue family");
});
