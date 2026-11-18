// The invitation card in each reveal state, run for real: the inline script
// from index.html is executed against a small stand-in DOM with made-up
// config values (never a real date or venue).
//   teaser    - country + month shown, day and venue sealed, RSVP block shown
//   countdown - the same, counting down to the reveal moment
//   revealed  - full date + venue from config, wedding countdown, RSVP kept
// Also the private travel preview (?travel=preview) on the home page.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/\r\n/g, "\n");
const Countdown = require("../js/countdown.js");
const Travel = require("../js/travel.js");

const START = "// the wedding date and travel switch live in js/config.js";
const from = html.indexOf(START);
assert.ok(from > 0, "the config-driven inline script is in index.html");
const SCRIPT = html.slice(from, html.indexOf("</script>", from));

// Obviously fake values.
const FAKE_DATE = "2099-01-15T12:00:00Z";
const FAKE = { country: "Dummyland", month: "January 2099", day: "15", venue: "Dummy Hall", town: "Dummytown" };

function makeEl(id, hidden) {
  const classes = [];
  const el = {
    id: id, hidden: hidden, textContent: "", className: "", attrs: {}, style: {},
    children: [], parentNode: null, scrolled: false,
    classList: {
      add: function () { for (const c of arguments) { if (classes.indexOf(c) < 0) { classes.push(c); } } },
      remove: function () { for (const c of arguments) { const i = classes.indexOf(c); if (i >= 0) { classes.splice(i, 1); } } },
      contains: function (c) { return classes.indexOf(c) >= 0; }
    },
    setAttribute: function (k, v) { el.attrs[k] = String(v); },
    removeAttribute: function (k) { delete el.attrs[k]; },
    getAttribute: function (k) { return k in el.attrs ? el.attrs[k] : null; },
    appendChild: function (c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore: function (c, ref) {
      c.parentNode = el;
      const i = el.children.indexOf(ref);
      if (i < 0) { el.children.push(c); } else { el.children.splice(i, 0, c); }
      return c;
    },
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
    scrollIntoView: function () { el.scrolled = true; }
  };
  return el;
}

// Runs the inline script with the given config; returns the elements it touched.
function run(config, opts) {
  opts = opts || {};
  const byId = {};
  const created = [];
  const document = {
    getElementById: function (id) {
      if (!byId[id]) {
        const tag = new RegExp('<[a-z0-9]+\\b[^>]*\\bid="' + id + '"[^>]*>').exec(html);
        assert.ok(tag, "index.html has #" + id);
        const el = makeEl(id, /\shidden(?=[\s>])/.test(tag[0]));
        const cls = /\bclass="([^"]*)"/.exec(tag[0]);
        if (cls) { cls[1].split(/\s+/).forEach(function (c) { el.classList.add(c); }); }
        if (/\baria-hidden="true"/.test(tag[0])) { el.attrs["aria-hidden"] = "true"; }
        byId[id] = el;
      }
      return byId[id];
    },
    createElement: function (name) { const el = makeEl("", false); el.tagName = name; created.push(el); return el; }
  };
  const sandbox = {
    WeddingConfig: config, Countdown: Countdown, Travel: Travel, document: document,
    location: { search: opts.search || "", hash: opts.hash || "" },
    window: { localStorage: null },
    setInterval: function () { return 1; },
    Date: opts.now ? Object.assign(function () {}, { now: function () { return opts.now; }, parse: Date.parse }) : Date
  };
  vm.runInNewContext(SCRIPT, sandbox);
  const el = function (id) { return document.getElementById(id); };
  const allText = Object.keys(byId).map(function (k) { return byId[k].textContent; })
    .concat(created.map(function (c) { return c.textContent; })).join(" | ");
  return { el: el, created: created, allText: allText };
}

function config(over) {
  const base = {
    date: "",
    travel: { show: false, destination: "", country: "" },
    reveal: { at: null, show: false, country: FAKE.country, month: FAKE.month, day: null, venue: null }
  };
  over = over || {};
  return {
    date: "date" in over ? over.date : base.date,
    travel: Object.assign({}, base.travel, over.travel),
    reveal: Object.assign({}, base.reveal, over.reveal)
  };
}

const REVEALED = config({
  date: FAKE_DATE,
  travel: { show: true, destination: FAKE.town, country: FAKE.country },
  reveal: { show: true, day: FAKE.day, venue: FAKE.venue }
});
const BEFORE_WEDDING = Date.parse("2098-06-01T00:00:00Z");

// ---------- teaser ----------

test("teaser: country and month show, day and venue stay sealed, the RSVP block shows", () => {
  const r = run(config());
  assert.equal(r.el("revealWrap").hidden, false);
  assert.equal(r.el("revealCountry").textContent, FAKE.country);
  assert.equal(r.el("revealMonthText").textContent, FAKE.month);
  assert.equal(r.el("revealDay").textContent, "2?");
  assert.ok(r.el("revealDay").classList.contains("redact-day"));
  assert.equal(r.el("revealVenue").textContent, "");
  assert.ok(r.el("revealVenue").classList.contains("redact-bar"));
  assert.equal(r.el("revealText").hidden, false, "the sealed line shows");
  assert.equal(r.el("revealTeaser").hidden, false, "the teaser line shows");
  assert.equal(r.el("revealCountdown").hidden, true);
  assert.equal(r.el("dateTbc").hidden, true);
  assert.equal(r.el("whereLine").hidden, true, "country is printed once");
  assert.equal(r.el("countdown").hidden, true);
  assert.equal(r.el("travel").hidden, true);
});

test("teaser: a date and travel details filled in early do not leak while reveal.show is false", () => {
  const r = run(config({ date: FAKE_DATE, travel: { show: true, destination: FAKE.town, country: FAKE.country } }),
    { now: BEFORE_WEDDING });
  assert.equal(r.el("countdown").hidden, true, "no wedding countdown");
  assert.equal(r.el("cd-days").textContent, "");
  assert.equal(r.el("travel").hidden, true, "no travel checklist");
  assert.doesNotMatch(r.allText, /Dummytown|2099-01|15 January|October 2098|July 2099/);
});

test("teaser: reveal.show must be exactly true, a truthy string does not reveal", () => {
  const r = run(config({ date: FAKE_DATE, travel: { show: true, destination: FAKE.town }, reveal: { show: "true" } }),
    { now: BEFORE_WEDDING });
  assert.equal(r.el("countdown").hidden, true);
  assert.equal(r.el("travel").hidden, true);
  assert.equal(r.el("revealText").hidden, false);
});

// ---------- countdown to the reveal moment ----------

test("countdown: a future reveal.at counts down to the reveal, still sealed", () => {
  const r = run(config({ reveal: { at: "2098-12-01T00:00:00Z" } }), { now: Date.parse("2098-11-29T00:00:00Z") });
  assert.equal(r.el("revealCountdown").hidden, false);
  assert.equal(r.el("revealText").hidden, true);
  assert.equal(r.el("rv-days").textContent, "2");
  assert.equal(r.el("revealDay").textContent, "2?");
  assert.equal(r.el("revealVenue").textContent, "");
  assert.equal(r.el("countdown").hidden, true);
});

test("countdown: once reveal.at has passed the teaser says so and stays sealed", () => {
  const r = run(config({ reveal: { at: "2098-12-01T00:00:00Z" } }), { now: Date.parse("2098-12-02T00:00:00Z") });
  assert.equal(r.el("revealCountdown").hidden, true);
  assert.equal(r.el("revealText").hidden, false);
  assert.match(r.el("revealText").textContent, /revealing very soon/);
  assert.equal(r.el("revealVenue").textContent, "");
});

// ---------- fully revealed ----------

test("revealed: the card shows the country, the full date and the venue from config", () => {
  const r = run(REVEALED, { now: BEFORE_WEDDING });
  assert.equal(r.el("revealWrap").hidden, false, "the block holding the details and the RSVP button shows");
  assert.equal(r.el("revealCountry").textContent, FAKE.country);
  assert.equal(r.el("revealCountry").hidden, false);
  assert.equal(r.el("revealDay").textContent, FAKE.day);
  assert.equal(r.el("revealMonthText").textContent, FAKE.month);
  assert.equal(r.el("revealMonthLine").hidden, false);
  assert.equal(r.el("revealVenue").textContent, FAKE.venue);
  assert.equal(r.el("revealVenueLine").hidden, false);
});

test("revealed: day and venue are real text, not sealed placeholders, and screen readers get them", () => {
  const r = run(REVEALED, { now: BEFORE_WEDDING });
  assert.equal(r.el("revealDay").classList.contains("redact-day"), false);
  assert.ok(r.el("revealDay").classList.contains("reveal-day-known"));
  assert.equal(r.el("revealVenue").classList.contains("redact-bar"), false);
  assert.equal(r.el("revealDay").getAttribute("aria-hidden"), null);
  assert.equal(r.el("revealVenue").getAttribute("aria-hidden"), null);
  assert.equal(r.el("revealVenueLine").getAttribute("aria-label"), null);
});

test("revealed: the sealed line, the reveal countdown and the 'full reveal' teaser line step aside", () => {
  const r = run(config({
    date: FAKE_DATE, travel: REVEALED.travel,
    reveal: { show: true, day: FAKE.day, venue: FAKE.venue, at: "2098-12-01T00:00:00Z" }
  }), { now: BEFORE_WEDDING });
  assert.equal(r.el("revealText").hidden, true);
  assert.equal(r.el("revealCountdown").hidden, true);
  assert.equal(r.el("revealTeaser").hidden, true);
  assert.equal(r.el("whereLine").hidden, true, "country is still printed once");
});

test("revealed: the wedding countdown runs and sits inside the block, above the RSVP button", () => {
  const r = run(REVEALED, { now: BEFORE_WEDDING });
  assert.equal(r.el("countdown").hidden, false);
  assert.equal(r.el("dateTbc").hidden, true);
  assert.notEqual(r.el("cd-days").textContent, "");
  assert.equal(r.el("countdown").parentNode, r.el("revealWrap"));
  assert.equal(r.el("dateTbc").parentNode, r.el("revealWrap"));
});

test("revealed: the RSVP button lives in the block that stays shown", () => {
  const block = html.slice(html.indexOf('id="revealWrap"'), html.indexOf('id="dateTbc"'));
  assert.match(block, /<a class="rsvp-cta" href="rsvp\.html">RSVP<\/a>/);
  assert.equal(run(REVEALED, { now: BEFORE_WEDDING }).el("revealWrap").hidden, false);
});

test("revealed: after the wedding the countdown gives way to the past text", () => {
  const r = run(REVEALED, { now: Date.parse("2099-02-01T00:00:00Z") });
  assert.equal(r.el("countdown").hidden, true);
  assert.equal(r.el("dateTbc").hidden, false);
  assert.match(r.el("dateTbc").textContent, /just married/);
});

test("revealed: a missing day or venue is left out, never shown as a sealed placeholder", () => {
  const r = run(config({ date: FAKE_DATE, travel: REVEALED.travel, reveal: { show: true } }), { now: BEFORE_WEDDING });
  assert.equal(r.el("revealDay").hidden, true);
  assert.equal(r.el("revealDay").classList.contains("redact-day"), false, ".redact-day sets display, which would beat [hidden]");
  assert.notEqual(r.el("revealDay").textContent, "2?");
  assert.equal(r.el("revealVenueLine").hidden, true);
});

test("revealed: the travel checklist shows with the destination and dates", () => {
  const r = run(REVEALED, { now: BEFORE_WEDDING });
  assert.equal(r.el("travel").hidden, false);
  assert.match(r.el("travelSub").textContent, /Dummytown/);
  assert.match(r.allText, /Please RSVP by 15 October 2098/);
});

// ---------- the private travel preview ----------

test("travel preview: ?travel=preview shows the checklist on the home page before the reveal", () => {
  const r = run(config(), { search: "?travel=preview", hash: "#travel" });
  assert.equal(r.el("travel").hidden, false);
  assert.ok(r.created.length > 0, "checklist items are rendered");
  assert.equal(r.el("travel").scrolled, true, "the #travel link lands on the checklist");
});

test("travel preview: before the reveal it prints no date and no destination, even if filled in early", () => {
  const r = run(config({ date: FAKE_DATE, travel: { show: true, destination: FAKE.town, country: FAKE.country } }),
    { search: "?travel=preview", now: BEFORE_WEDDING });
  assert.equal(r.el("travel").hidden, false);
  assert.doesNotMatch(r.allText, /Dummytown|2098|2099-|15 January/);
  assert.match(r.allText, /at least 3 months before the wedding/);
  assert.equal(r.el("countdown").hidden, true, "the preview does not start the wedding countdown");
  assert.equal(r.el("revealVenue").textContent, "");
});

test("travel preview: without the preview link the checklist stays hidden before the reveal", () => {
  assert.equal(run(config({ travel: { show: true } })).el("travel").hidden, true);
  assert.equal(run(config(), { search: "?travel=other" }).el("travel").hidden, true);
});
