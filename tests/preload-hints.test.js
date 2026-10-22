// Scripts at the end of <body> are fetched one after another because the CSP
// <meta> hides them from the browser's preload scanner. A low-priority preload
// hint per script (same stamped URL) lets them download in parallel. A hint
// whose URL differs from the script tag would just download the file twice.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGES = ["index.html", "rsvp.html", "add-to-tree.html", "tree-admin.html", "rsvp-admin.html"];

PAGES.forEach((page) => {
  test(page + ": every local script has a matching preload hint, and no hint is orphaned", () => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8").replace(/\r\n/g, "\n");
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="(js\/[^"]+)"/g)].map((m) => m[1]);
    const hints = [...html.matchAll(/<link rel="preload" as="script" fetchpriority="low" href="([^"]+)">/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 2, page + " has few scripts");
    assert.deepEqual(hints.slice().sort(), scripts.slice().sort());
    assert.ok(html.indexOf('rel="preload"') < html.indexOf("</head>"), "hints must be in <head>");
  });
});
