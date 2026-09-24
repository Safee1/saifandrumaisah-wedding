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

test("has Blessings, Emails and Message-all-guests tabs", () => {
  assert.match(html, /data-tab="blessings"/);
  assert.match(html, /data-tab="emails"/);
  assert.match(html, /data-tab="messageall"/);
});

test("blessings tab lists via a SECURITY DEFINER RPC, not a raw table read", () => {
  assert.match(html, /admin_list_blessings_full/);
  assert.doesNotMatch(html, /rest\/v1\/blessings\?select=email/);
});

test("emails tab reads via admin_list_email_log", () => {
  assert.match(html, /admin_list_email_log/);
});

test("message-all requires a successful test send before the send-to-all button will act", () => {
  assert.match(html, /testSentOk/);
  assert.match(html, /Send yourself a test first/);
});

test("message-all always asks for explicit confirmation before the real send", () => {
  assert.match(html, /confirm\(/);
});
