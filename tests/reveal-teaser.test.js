// The "save the date — coming soon" teaser: while WeddingConfig.reveal.show
// is false, no real date/venue/country may ever appear in the shipped
// HTML/JS, only the teaser copy and (optionally) a countdown to the reveal
// moment itself.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const Config = require("../js/config.js");

test("config: reveal has the fields index.html reads, and starts hidden with no real date", () => {
  assert.equal(typeof Config.reveal, "object");
  assert.equal(typeof Config.reveal.show, "boolean");
  assert.strictEqual(Config.reveal.show, false, "reveal.show must start false — nothing is confirmed yet");
  assert.strictEqual(Config.reveal.at === null || typeof Config.reveal.at === "string", true);
  // Belt and braces: the real date/travel settings must stay empty while
  // nothing is booked, whatever reveal.show says.
  assert.strictEqual(Config.date, "");
  assert.strictEqual(Config.travel.show, false);
});

test("index.html has a reveal teaser block that steps aside once reveal.show is true", () => {
  assert.match(html, /id="revealWrap"/);
  assert.match(html, /id="revealText"/);
  assert.match(html, /Date &amp; destination revealing soon/);
  assert.match(html, /REVEAL\.show/);
});

test("index.html never hard-codes a real date, venue or country in the reveal markup", () => {
  const revealBlock = html.slice(html.indexOf('id="revealWrap"'), html.indexOf('id="dateTbc"'));
  // no ISO-looking dates, no country/venue words baked into the markup itself
  assert.doesNotMatch(revealBlock, /\b20\d{2}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(revealBlock, /Egypt|Sharm|Hurghada|July 2027/i);
});

test("no source file mentions the destination the couple haven't announced", () => {
  const files = ["index.html", "js/config.js", "rsvp.html", "add-to-tree.html"];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(text, /Egypt|Sharm el sheikh|Hurghada/i, f + " leaks the destination");
  }
});
