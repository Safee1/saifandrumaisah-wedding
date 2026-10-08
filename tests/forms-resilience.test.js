// The RSVP and add-to-tree forms must (a) reach their data modules through a
// promise so a missing script is a handled error, (b) tell people without
// JavaScript, (c) let a decline through even if Adults holds junk.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function page(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8").replace(/\r\n/g, "\n");
}
const rsvp = page("rsvp.html");
const tree = page("add-to-tree.html");

test("rsvp: submit goes through a promise and the form has novalidate", () => {
  assert.match(rsvp, /Promise\.resolve\(\)\.then\(function \(\) \{ return RsvpData\.submitInterest\(/);
  assert.match(rsvp, /<form id="rsvpForm" novalidate>/);
});

test("add-to-tree: load and submit go through a promise", () => {
  assert.match(tree, /Promise\.resolve\(\)\.then\(function \(\) \{ return TreeData\.fetchApprovedTree\(\); \}\)/);
  assert.match(tree, /Promise\.resolve\(\)\.then\(function \(\) \{ return TreeData\.submitOpen\(/);
});

test("both forms show a noscript notice and a timeout-specific message", () => {
  [rsvp, tree].forEach((html) => {
    assert.match(html, /<noscript><p class="status err">This form needs JavaScript/);
    assert.match(html, /err && err\.timeout/);
  });
});

test("add-to-tree: a failed tree load replaces the 'Loading' option", () => {
  assert.match(tree, /Couldn't load the tree — refresh the page to try again/);
});
