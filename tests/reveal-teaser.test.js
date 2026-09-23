// The partial "revealing soon" teaser: country + month/year are allowed to
// show now (Egypt, July 2027), but while WeddingConfig.reveal.day/venue are
// null, no exact day and no venue/city/resort name may ever appear in the
// shipped HTML/JS — only the redacted/sealed placeholders, the teaser copy,
// and (optionally) a countdown to the full reveal moment itself.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const Config = require("../js/config.js");

// Real venue/city/resort names that must never appear anywhere in source,
// regardless of reveal state. Country (Egypt) and month/year (July 2027)
// are deliberately NOT in this list — those are the allowed partial reveal.
const FORBIDDEN_VENUE_WORDS = /Sharm|Nabq|Rixos|Seagate|Hurghada|Red Sea|Sahl Hasheesh/i;

test("config: reveal has the fields index.html reads, and starts hidden with no real date", () => {
  assert.equal(typeof Config.reveal, "object");
  assert.equal(typeof Config.reveal.show, "boolean");
  assert.strictEqual(Config.reveal.show, false, "reveal.show must start false — nothing is confirmed yet");
  assert.strictEqual(Config.reveal.at === null || typeof Config.reveal.at === "string", true);
  // Country/month are allowed to be set (the partial reveal); day/venue
  // must stay null until confirmed.
  assert.strictEqual(Config.reveal.day, null, "exact day must stay sealed");
  assert.strictEqual(Config.reveal.venue, null, "venue must stay sealed");
  // Belt and braces: the real date/travel settings must stay empty while
  // nothing is booked, whatever reveal.show says.
  assert.strictEqual(Config.date, "");
  assert.strictEqual(Config.travel.show, false);
});

test("index.html has a reveal teaser block that steps aside once reveal.show is true", () => {
  assert.match(html, /id="revealWrap"/);
  assert.match(html, /id="revealText"/);
  assert.match(html, /id="revealCountry"/);
  assert.match(html, /id="revealMonthText"/);
  assert.match(html, /id="revealDay"/);
  assert.match(html, /id="revealVenue"/);
  assert.match(html, /REVEAL\.show/);
});

test("index.html reveal markup never hard-codes an exact day or a venue/city/resort name", () => {
  const revealBlock = html.slice(html.indexOf('id="revealWrap"'), html.indexOf('id="dateTbc"'));
  // no ISO-looking dates, no venue/city name baked into the markup itself
  assert.doesNotMatch(revealBlock, /\b20\d{2}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(revealBlock, FORBIDDEN_VENUE_WORDS);
  // no exact day digit hard-coded next to "July 2027" (e.g. "10 July 2027")
  assert.doesNotMatch(revealBlock, /\b\d{1,2}\s+July\s+2027\b/i);
});

test("no source file mentions the destination the couple haven't announced (venue/city, not country)", () => {
  const files = ["index.html", "js/config.js", "rsvp.html", "add-to-tree.html"];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(text, FORBIDDEN_VENUE_WORDS, f + " leaks the venue/city");
    assert.doesNotMatch(text, /\b\d{1,2}\s+July\s+2027\b/i, f + " leaks an exact day");
  }
});

test('country is printed once: the plain "where" line hides when the teaser shows', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="whereLine"/);
  assert.match(html, /getElementById\("revealWrap"\)\.hidden = false;[\s\S]{0,200}getElementById\("whereLine"\)\.hidden = true/);
});
