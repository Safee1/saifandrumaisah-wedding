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
