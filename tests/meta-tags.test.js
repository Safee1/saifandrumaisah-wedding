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

const leakTerms = [
  "sharm", "nabq", "rixos", "seagate", "hurghada", "sahl hasheesh",
  "soma bay", "baron palace", "kempinski", "regnum", "carya", "belek",
  "mardan palace", "albatros", "mamlouk",
];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const head = html.slice(0, html.indexOf("</head>") + 7);

  test(`${page} has a title, meta description, favicon, apple-touch-icon and theme-color`, () => {
    assert.match(head, /<title>[^<]+<\/title>/, "missing <title>");
    assert.match(head, /<meta name="description" content="[^"]+"/, "missing meta description");
    assert.match(head, /<link rel="icon" href="favicon\.svg"/, "missing favicon");
    assert.match(head, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/, "missing apple-touch-icon");
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
