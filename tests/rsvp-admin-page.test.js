// Structural checks on rsvp-admin.html: it must surface the expression-of-
// interest fields (contact, adults, children, likelihood) that
// 20260923_rsvp_interest_and_headcount.sql added to rsvps, and the CSV
// export must include them too.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "rsvp-admin.html"), "utf8");

test("totals include adults, children and a likelihood breakdown", () => {
  for (const id of ["statTotal", "statAdults", "statChildren", "statAttending", "statDeclined",
    "statDefinitely", "statVeryLikely", "statHopingTo"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + " stat missing");
  }
});

test("each row can render contact, adults/children split and likelihood", () => {
  assert.match(html, /row\.contact/);
  assert.match(html, /row\.adults/);
  assert.match(html, /row\.children/);
  assert.match(html, /row\.likelihood/);
  assert.match(html, /LIKELIHOOD_LABEL/);
});

test("CSV export header includes the new fields", () => {
  const header = html.match(/var header = \[([^\]]+)\];/);
  assert.ok(header, "CSV header array not found");
  for (const col of ["Contact", "Adults", "Children", "Likelihood"]) {
    assert.ok(header[1].includes('"' + col + '"'), col + " missing from CSV header");
  }
});

test("delete flow still uses the existing admin_delete_rsvp RPC", () => {
  assert.match(html, /admin_delete_rsvp/);
});
