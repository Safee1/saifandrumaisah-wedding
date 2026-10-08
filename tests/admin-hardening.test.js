// Admin pages: break out of frames, and every control has an accessible name.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PAGES = ["rsvp-admin.html", "tree-admin.html", "admin-activity.html"];

PAGES.forEach((name) => {
  const html = fs.readFileSync(path.join(__dirname, "..", name), "utf8").replace(/\r\n/g, "\n");

  test(name + ": frame-buster runs before the rest of the page", () => {
    const i = html.indexOf("window.top !== window.self");
    assert.ok(i > -1 && i < html.indexOf("<title>"), "frame-buster missing or too late");
  });

  test(name + ": every input, select and textarea has a label", () => {
    const re = /<(input|select|textarea)\b[^>]*>/g;
    let m;
    while ((m = re.exec(html))) {
      const tag = m[0];
      if (/type="(hidden|checkbox|radio|button|submit)"/.test(tag)) { continue; }
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      const labelled = /aria-label=/.test(tag) || (id && new RegExp('<label[^>]*for="' + id + '"').test(html));
      assert.ok(labelled, name + ": unlabelled control " + tag.slice(0, 80));
    }
  });
});
