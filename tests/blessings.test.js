"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const BlessingsData = require("../js/blessings-data.js");

test("validate: a proper blessing passes", () => {
  assert.equal(BlessingsData.validate({ name: "Auntie Asma", message: "May your life together be full of light." }), null);
});

test("validate: missing name or message is named plainly", () => {
  assert.match(BlessingsData.validate({ name: "  ", message: "hi" }), /your name/);
  assert.match(BlessingsData.validate({ name: "Abu", message: "   " }), /few words/);
});

test("validate: length limits match the database constraints", () => {
  assert.equal(BlessingsData.validate({ name: "x".repeat(60), message: "y".repeat(280) }), null);
  assert.match(BlessingsData.validate({ name: "x".repeat(61), message: "fine" }), /60/);
  assert.match(BlessingsData.validate({ name: "Abu", message: "y".repeat(281) }), /280/);
});

test("validate: surrounding whitespace does not count against the limits", () => {
  assert.equal(BlessingsData.validate({ name: "  Abu  ", message: "  " + "y".repeat(280) + "  " }), null);
});
