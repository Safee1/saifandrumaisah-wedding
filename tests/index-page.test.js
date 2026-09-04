// Structural checks on index.html that CI can run offline: the things
// that have broken the live site before (mismatched cache stamps) and
// the envelope/seal markup the intro's CSS relies on.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("every js/ and css/ reference on the page carries the same ?v= stamp", () => {
  const stamps = [...html.matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\?v=(\d+)"/g)].map((m) => m[1]);
  assert.ok(stamps.length >= 6, "expected stamped script/style tags, found " + stamps.length);
  assert.strictEqual(new Set(stamps).size, 1, "stamps differ: " + stamps.join(","));
});

test("every stamped js/ and css/ file exists in the repo", () => {
  const files = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)\?v=\d+"/g)].map((m) => m[1]);
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(root, f)), f + " is referenced but missing");
  }
});

test("the envelope CSS is no longer duplicated inline", () => {
  assert.match(html, /<link rel="stylesheet" href="css\/envelope\.css\?v=\d+">/);
  const inlineStyle = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  for (const sel of [".env-wrap", ".env-flap", ".seal {", ".mini-card"]) {
    assert.ok(!inlineStyle.includes(sel), sel + " still defined inline as well as in css/envelope.css");
  }
});

test("the wax seal is a labelled button holding two clipped halves", () => {
  const seal = html.match(/<button class="seal" id="seal"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(seal, "seal button missing");
  assert.match(seal[0], /aria-label="[^"]*seal[^"]*"/i);
  assert.strictEqual((seal[0].match(/class="wax wax-[lr]" aria-hidden="true"/g) || []).length, 2);
});

test("the flap is a two-faced sheet so the liner shows once it turns over", () => {
  const flap = html.match(/<div class="env-flap"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(flap, "env-flap missing");
  assert.match(flap[0], /class="flap-face"/);
  assert.match(flap[0], /class="flap-liner"/);
});

test("envelope.css keeps the flap faces one-sided and the halves clipped", () => {
  const css = fs.readFileSync(path.join(root, "css", "envelope.css"), "utf8");
  assert.match(css, /\.flap-face, \.flap-liner \{[^}]*backface-visibility: hidden/);
  assert.match(css, /\.flap-liner \{[^}]*rotateX\(180deg\)/);
  assert.match(css, /\.wax-l \{ clip-path: polygon/);
  assert.match(css, /\.wax-r \{ clip-path: polygon/);
  assert.match(css, /\.opened \.wax-l \{ animation: crackL/);
  assert.match(css, /\.opened \.wax-r \{ animation: crackR/);
});
