// Structural checks on admin-activity.html: password gate, RPC usage,
// filters, counts and CSV export must all be present, and it must stay
// out of search engines and off the public nav.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin-activity.html"), "utf8");

test("noindex meta tag is present", () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
});

test("robots.txt disallows the page", () => {
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  assert.match(robots, /Disallow: \/admin-activity\.html/);
});

test("uses the same admin_check-backed password gate via admin_list_activity", () => {
  assert.match(html, /admin_list_activity/);
  assert.match(html, /id="pw"/);
});

test("has filter, refresh and CSV export controls", () => {
  assert.match(html, /id="kindFilter"/);
  assert.match(html, /id="refreshBtn"/);
  assert.match(html, /id="csvBtn"/);
});

test("has today/7-day stat tiles", () => {
  assert.match(html, /id="stats"/);
  assert.match(html, /New RSVPs \(today\)/);
  assert.match(html, /New RSVPs \(7 days\)/);
  assert.match(html, /Failed logins \(7 days\)/);
});

test("tree-admin and rsvp-admin link to the activity log", () => {
  const treeAdmin = fs.readFileSync(path.join(root, "tree-admin.html"), "utf8");
  const rsvpAdmin = fs.readFileSync(path.join(root, "rsvp-admin.html"), "utf8");
  assert.match(treeAdmin, /admin-activity\.html/);
  assert.match(rsvpAdmin, /admin-activity\.html/);
});
