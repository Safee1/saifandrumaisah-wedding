// An admin gate must only say "Wrong password." when the server really
// rejected the password; and CSV cells holding a bare CR must be quoted.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

["rsvp-admin.html", "tree-admin.html"].forEach((page) => {
  const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8").replace(/\r\n/g, "\n");
  const m = html.match(/function gateFailure\(err\) \{[\s\S]*?\n      \}\n/);

  test(page + ": gate error text is chosen by gateFailure", () => {
    assert.ok(m, "gateFailure missing");
    assert.match(html, /lockoutMessage\(err\) \|\| gateFailure\(err\)/);
    assert.doesNotMatch(html, /lockoutMessage\(err\) \|\| "Wrong password\."/);
  });

  test(page + ": timeouts, dropped connections and 5xx are not 'wrong password'", () => {
    const gateFailure = new Function(m[0] + "; return gateFailure;")();
    assert.match(gateFailure({ timeout: true }), /reach the server/);
    assert.match(gateFailure(new TypeError("Failed to fetch")), /reach the server/);
    assert.match(gateFailure({ status: 503 }), /server had a problem/);
    assert.equal(gateFailure({ status: 400 }), "Wrong password.");
    assert.equal(gateFailure({ status: 401 }), "Wrong password.");
  });
});

test("rsvp-admin CSV quotes fields containing a carriage return", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "rsvp-admin.html"), "utf8");
  assert.ok(html.includes('[",'+ "\\r\\n]/.test(s)"));
});
