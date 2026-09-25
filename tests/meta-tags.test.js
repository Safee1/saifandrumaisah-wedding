// Every shipped page needs a real <title>, a meta description, a favicon
// and apple-touch-icon, and theme-color — guests share links on WhatsApp,
// so link previews and tab icons matter. Also enforces the leak guard:
// no venue/city/resort name or exact day anywhere in these tags.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pages = [
  "index.html",
  "rsvp.html",
  "add-to-tree.html",
  "tree-admin.html",
  "rsvp-admin.html",
  "404.html",
];

const leakTerms = require("./leak-terms.js").LEAK_TERMS.map((t) => t.toLowerCase());

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const head = html.slice(0, html.indexOf("</head>") + 7);

  test(`${page} has a title, meta description, favicon, apple-touch-icon and theme-color`, () => {
    assert.match(head, /<title>[^<]+<\/title>/, "missing <title>");
    assert.match(head, /<meta name="description" content="[^"]+"/, "missing meta description");
    assert.match(head, /<link rel="icon" href="favicon\.svg"/, "missing favicon");
    assert.match(head, /<link rel="icon" href="favicon\.ico"/, "missing favicon.ico fallback");
    assert.match(head, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/, "missing apple-touch-icon");
    assert.match(head, /<link rel="manifest" href="site\.webmanifest">/, "missing manifest link");
    assert.match(head, /<meta name="theme-color" content="#[0-9a-f]+">/i, "missing theme-color");
  });

  test(`${page} head never leaks a venue/city/resort name`, () => {
    const lower = head.toLowerCase();
    for (const term of leakTerms) {
      assert.ok(!lower.includes(term), `${page} head mentions "${term}"`);
    }
  });
}

// Public, shareable pages carry Open Graph + Twitter card tags so a WhatsApp
// share shows a real preview image and title instead of a bare link.
const sharePages = ["index.html", "rsvp.html", "add-to-tree.html"];
for (const page of sharePages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const head = html.slice(0, html.indexOf("</head>") + 7);

  test(`${page} has Open Graph and Twitter card tags with an image`, () => {
    assert.match(head, /<meta property="og:title" content="[^"]+"/, "missing og:title");
    assert.match(head, /<meta property="og:description" content="[^"]+"/, "missing og:description");
    assert.match(head, /<meta property="og:image" content="https:\/\/saifandrumaisah\.com\/og-image\.png">/, "missing/wrong og:image");
    assert.match(head, /<meta property="og:url" content="https:\/\/saifandrumaisah\.com\/[^"]*">/, "missing og:url");
    assert.match(head, /<meta name="twitter:card" content="summary_large_image">/, "missing twitter:card");
    assert.match(head, /<meta name="twitter:image" content="https:\/\/saifandrumaisah\.com\/og-image\.png">/, "missing/wrong twitter:image");
  });
}

test("og-image.png exists and is a real file", () => {
  const stat = fs.statSync(path.join(root, "og-image.png"));
  assert.ok(stat.size > 1000, "og-image.png looks empty/too small");
});

test("404.html exists and is styled (not the GitHub Pages default)", () => {
  const html = fs.readFileSync(path.join(root, "404.html"), "utf8");
  assert.match(html, /<style>/, "404.html has no inline styling");
  assert.match(html, /<a href="\/">/, "404.html has no link back to the site");
});

test("favicon.ico is a real multi-size ICO file", () => {
  const buf = fs.readFileSync(path.join(root, "favicon.ico"));
  assert.strictEqual(buf.readUInt16LE(2), 1, "not an ICO file (type field)");
  const count = buf.readUInt16LE(4);
  assert.ok(count >= 3, "expected at least 3 sizes (16/32/48) in favicon.ico");
});

test("site.webmanifest is valid JSON with icons and theme_color", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8"));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test("robots.txt only disallows admin pages, not the public site", () => {
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  assert.match(robots, /Disallow: \/tree-admin\.html/);
  assert.match(robots, /Disallow: \/rsvp-admin\.html/);
  assert.doesNotMatch(robots, /Disallow: \/\s*$/m, "robots.txt must not blanket-disallow the whole site (breaks link previews)");
  assert.doesNotMatch(robots, /Disallow: \/index\.html/);
  assert.doesNotMatch(robots, /Disallow: \/rsvp\.html/);
  assert.doesNotMatch(robots, /Disallow: \/add-to-tree\.html/);
});
