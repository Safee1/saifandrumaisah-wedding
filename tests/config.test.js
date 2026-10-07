"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Config = require("../js/config.js");
const Travel = require("../js/travel.js");

test("config: date is empty or a parseable date", () => {
  assert.equal(typeof Config.date, "string");
  if (Config.date) { assert.ok(Travel.parse(Config.date), "WeddingConfig.date is not a valid YYYY-MM-DD date"); }
});

// The countdown reads the date with Date.parse and the travel dates read it
// with Travel.parse: a date with no time or no UTC offset would give each
// guest a different moment depending on their own time zone.
test("config: a set date is a full timestamp with a UTC offset that both readers agree on", () => {
  if (!Config.date) { return; }
  assert.match(Config.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/, "use e.g. 2027-07-25T16:00:00+03:00");
  assert.ok(Number.isFinite(Date.parse(Config.date)));
  assert.ok(new Date(Config.date).getUTCFullYear() >= 2026);
  const t = Travel.parse(Config.date);
  assert.equal(String(t.getMonth() + 1).padStart(2, "0"), Config.date.slice(5, 7));
});

// Turning the reveal on without the facts it shows would put "undefined",
// an empty venue line or a countdown to nothing in front of every guest.
test("config: reveal.show true needs a date, the travel switch, a day and a venue", () => {
  if (!Config.reveal.show) { return; }
  assert.ok(Config.date, "reveal.show is true but date is empty");
  assert.equal(Config.travel.show, true, "reveal.show is true but travel.show is false");
  assert.ok(Config.reveal.day, "reveal.show is true but reveal.day is empty");
  assert.ok(Config.reveal.venue, "reveal.show is true but reveal.venue is empty");
});

test("config: travel switch has the fields both pages read", () => {
  assert.equal(typeof Config.travel.show, "boolean");
  assert.equal(typeof Config.travel.destination, "string");
  assert.equal(typeof Config.travel.country, "string");
});

test("config: no page still carries its own copy of the settings", () => {
  const root = path.join(__dirname, "..");
  for (const f of ["index.html", "rsvp.html"]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    assert.match(html, /src="js\/config\.js\?v=\d+"/, f + " must load js/config.js");
    assert.doesNotMatch(html, /var WEDDING_DATE = "/, f + " hard-codes the date again");
    assert.doesNotMatch(html, /var TRAVEL = \{/, f + " hard-codes the travel switch again");
  }
});
