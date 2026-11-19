// The two walking figures in the intro story: the markup exposes limb and
// cloth groups, css/story-figures.css animates them through a walk cycle
// that ends on the standing pose, and none of it runs under reduced motion.
// What the walk looks like in a real browser (rest pose after the walk,
// ankles that never cross, a planted foot that stays put) is checked in
// tests/e2e/story-figures.spec.mjs.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const css = read("css/story-figures.css");
// comments out, whitespace collapsed: the checks below must survive a reformat
const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

function figure(cls) {
  const m = html.match(new RegExp('<div class="figure ' + cls + '">[\\s\\S]*?</svg></div></div>'));
  assert.ok(m, "figure ." + cls + " missing");
  return m[0];
}
const groups = (svg) => [...svg.matchAll(/<g class="([^"]+)"/g)].map((m) => m[1]);

// every @keyframes block in the stylesheet, name -> [{ stop, body }]
function keyframes() {
  const out = {};
  for (const m of flat.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)) {
    out[m[1]] = [...m[2].matchAll(/([\d.]+%)\s*\{([^{}]*)\}/g)].map((s) => ({ stop: s[1], body: s[2].trim() }));
  }
  return out;
}
const KF = keyframes();
const CYCLE = ["bob", "legLead", "legTrail", "kneeLead", "kneeTrail", "stepLead", "stepTrail",
  "armReach", "armSwing", "clothSway", "tailTrail", "trainTrail", "veilFlutter"];

// the declarations of every rule whose selector list contains `sel`, joined
function decls(sel, from) {
  const src = from === undefined ? flat.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})+\s*\}/g, "") : from;
  let out = "";
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(",").some((s) => s.trim().endsWith(sel))) { out += m[2] + ";"; }
  }
  return out;
}
// every number inside the transform functions of one keyframe stop
const amounts = (body) => [...body.matchAll(/(?:rotate|skewX|translateY)\(\s*([-\d.]+)/g)].map((m) => Number(m[1]));
const rotation = (stop) => Number(stop.body.match(/rotate\(\s*([-\d.]+)deg\)/)[1]);

test("groom: legs (with shins), both arms, coat and coat tail are separate groups", () => {
  const g = groups(figure("fig-l"));
  for (const c of ["arm arm-swing", "arm arm-reach", "leg leg-lead", "leg leg-trail", "coat-sway", "coat-tail"]) {
    assert.ok(g.includes(c), "groom is missing <g class=\"" + c + "\">");
  }
  assert.equal(g.filter((c) => c === "shin").length, 2, "each leg needs a shin group");
  const svg = figure("fig-l");
  // each shin carries its own shoe, so shoes follow the feet
  assert.equal((svg.match(/<g class="shin">\s*<path class="sil"[^>]*>\s*<path class="shoe"/g) || []).length, 2);
  // legs and the swinging arm sit behind the coat, the reaching arm in front
  assert.ok(svg.indexOf("leg-lead") < svg.indexOf("coat-sway"));
  assert.ok(svg.indexOf("arm-swing") < svg.indexOf("coat-sway"));
  assert.ok(svg.indexOf("arm-reach") > svg.indexOf("coat-sway"));
});

test("bride: veil, stepping ankles, gown, trailing hem and reaching arm are separate groups", () => {
  const svg = figure("fig-r");
  const g = groups(svg);
  for (const c of ["veil-sway", "step step-lead", "step step-trail", "gown-train", "gown-sway", "arm arm-reach"]) {
    assert.ok(g.includes(c), "bride is missing <g class=\"" + c + "\">");
  }
  assert.match(svg, /<g class="veil-sway"><path class="veil"/);
  assert.equal((svg.match(/<g class="step step-(?:lead|trail)"><path class="thin"/g) || []).length, 2);
  assert.ok(svg.indexOf("step-lead") < svg.indexOf("gown-sway"), "ankles sit behind the gown");
});

test("the silhouette art classes are all still in use", () => {
  const both = figure("fig-l") + figure("fig-r");
  for (const c of ["sil", "coat", "gown", "veil", "trim", "btn", "shoe", "thin", "hair"]) {
    assert.match(both, new RegExp('class="' + c + '"'), "." + c + " no longer used");
    if (c !== "coat" && c !== "gown") {
      assert.match(css, new RegExp("\\.figure \\." + c + "\\s*\\{"), "." + c + " not styled");
    }
  }
});

test("figure styles live in css/story-figures.css, not inline", () => {
  assert.match(html, /<link rel="stylesheet" href="css\/story-figures\.css\?v=\d+">/);
  const from = html.indexOf("<style>\n"); // the page's main inline block (the first one is @font-face only)
  assert.ok(from > -1, "main inline <style> not found");
  const inline = html.slice(from, html.indexOf("</style>", from));
  for (const s of [".fig-bob", "@keyframes walkL", "@keyframes walkR", "@keyframes bob", ".figure .sil"]) {
    assert.ok(!inline.includes(s), s + " is still defined inline");
    assert.ok(css.includes(s), s + " missing from css/story-figures.css");
  }
  // url(#...) paints resolve against the stylesheet's own URL in some
  // engines, so the two gradient fills have to stay in the page
  assert.doesNotMatch(flat, /url\(#/);
  assert.match(inline, /\.figure \.coat\s*\{\s*fill: url\(#g-coat\);\s*\}/);
  assert.match(inline, /\.figure \.gown\s*\{\s*fill: url\(#g-gown\);\s*\}/);
});

test("the walk-cycle keyframes exist and every one is wired to a group", () => {
  for (const name of CYCLE) {
    assert.ok(KF[name] && KF[name].length >= 3, "@keyframes " + name + " missing");
    assert.match(flat, new RegExp("animation(?:-name)?:\\s*" + name + "\\b"), name + " is never used");
  }
  for (const sel of [".leg-lead", ".leg-trail", ".shin", ".step-lead", ".step-trail", ".arm-reach", ".arm-swing",
    ".coat-sway", ".coat-tail", ".gown-sway", ".gown-train", ".veil-sway"]) {
    assert.match(decls(sel), /animation-name:/, sel + " has no animation");
  }
});

test("every walk-cycle animation ends on the standing pose (no snap on arrival)", () => {
  for (const name of CYCLE) {
    const last = KF[name][KF[name].length - 1];
    assert.equal(last.stop, "100%", name + " must define its end frame");
    assert.ok(amounts(last.body).length >= 1, name + " end frame has no transform");
    for (const n of amounts(last.body)) { assert.equal(n, 0, name + " ends on " + last.body + ", not the rest pose"); }
  }
  // limbs that are hidden or drawn in their rest pose also start from it
  for (const name of CYCLE.filter((n) => n !== "armReach")) {
    const first = KF[name][0];
    assert.equal(first.stop, "0%", name + " must define its start frame");
    assert.ok(amounts(first.body).length >= 1, name + " start frame has no transform");
    for (const n of amounts(first.body)) { assert.equal(n, 0, name + " starts on " + first.body + ", not the rest pose"); }
  }
});

test("only transform and opacity are animated (no path morphing)", () => {
  for (const name of Object.keys(KF)) {
    for (const s of KF[name]) {
      const props = s.body.split(";").map((d) => d.split(":")[0].trim()).filter(Boolean);
      for (const p of props) { assert.ok(p === "transform" || p === "opacity", name + " animates " + p); }
    }
  }
});

test("limbs, cloth and bob share the walk's duration and delay, six steps", () => {
  // one duration and one delay, defined once and used by everything
  assert.match(decls(".figure"), /--walk:\s*[\d.]+s\s*;/);
  assert.match(decls(".figure"), /--walk-delay:\s*[\d.]+s\s*;/);
  for (const [sel, name] of [[".fig-l", "walkL"], [".fig-r", "walkR"], [".fig-bob", "bob"]]) {
    const anim = (decls(sel).match(/animation:([^;]*);/) || [])[1] || "";
    assert.match(anim, new RegExp("\\b" + name + "\\b"), sel + " does not run " + name);
    assert.match(anim, /var\(--walk\)/, sel + " ignores the shared duration");
    assert.match(anim, /var\(--walk-delay\)/, sel + " ignores the shared delay");
    assert.match(anim, /\bboth\b/, sel + " must hold its first and last frame");
  }
  for (const sel of [".leg", ".shin", ".arm", ".step", ".coat-sway", ".coat-tail", ".gown-sway", ".gown-train", ".veil-sway"]) {
    const d = decls(".figure " + sel);
    assert.match(d, /animation-duration:\s*var\(--walk\)/, sel + " duration");
    assert.match(d, /animation-delay:\s*var\(--walk-delay\)/, sel + " delay");
    // first frame held through the delay; nothing left applied after the walk
    assert.match(d, /animation-fill-mode:\s*backwards/, sel + " fill mode");
  }
  // feet and bob agree: both keyframe sets sit on the same twelfths
  const contacts = ["8.33%", "25%", "41.67%", "58.33%", "75%", "91.67%"];
  for (const name of ["bob", "legLead", "legTrail"]) {
    const stops = KF[name].map((s) => s.stop);
    for (const c of contacts) { assert.ok(stops.includes(c), name + " has no keyframe at foot contact " + c); }
  }
  // legs move in opposition at every keyframe
  KF.legLead.forEach((s, i) => {
    assert.equal(KF.legTrail[i].stop, s.stop);
    assert.equal(rotation(s) + rotation(KF.legTrail[i]), 0, "legs not opposed at " + s.stop);
  });
});

test("the bride's ankle lines can never cross or meet under the gown", () => {
  // two lines swinging in opposition about hidden hips: the feet close the
  // gap between them by at most twice the largest swing
  const lines = [...figure("fig-r").matchAll(/<g class="step step-(lead|trail)"><path class="thin" d="M([\d.]+) [^"]* ([\d.]+)"/g)];
  assert.equal(lines.length, 2);
  const gap = Math.abs(Number(lines[0][2]) - Number(lines[1][2]));
  let reach = 0;
  for (const m of lines) {
    const pivotY = Number(decls(".step-" + m[1]).match(/transform-origin:\s*[\d.]+px\s+([\d.]+)px/)[1]);
    const name = m[1] === "lead" ? "stepLead" : "stepTrail";
    const swing = Math.max(...KF[name].map((s) => Math.abs(rotation(s))));
    reach += (Number(m[3]) - pivotY) * Math.sin(swing * Math.PI / 180);
  }
  assert.ok(reach < gap / 2, "feet travel " + reach.toFixed(1) + " towards each other with only " + gap + " between them");
});

test("the first swing is the smallest: the walk starts slowly", () => {
  // a big first swing drags the planted foot backwards while the body has
  // barely moved (the travel eases in); the long strides belong mid-walk
  const at = (stop) => Math.abs(rotation(KF.legLead.find((s) => s.stop === stop)));
  assert.ok(at("8.33%") < at("25%") / 4, "first contact swings too far");
  assert.ok(at("8.33%") < at("41.67%") / 4, "first contact swings too far");
});

test("every moving group pivots on a user-unit origin, the same in every engine", () => {
  // fill-box percentages on a <g> resolve differently in Firefox
  assert.doesNotMatch(flat, /transform-box:\s*fill-box/);
  assert.doesNotMatch(flat, /transform-origin:[^;]*%/);
  for (const sel of [".leg", ".shin", ".arm", ".step", ".coat-sway", ".coat-tail", ".gown-sway", ".gown-train", ".veil-sway"]) {
    assert.match(decls(".figure " + sel), /transform-box:\s*view-box/, sel + " is not on the view box");
  }
  for (const sel of [".leg-lead", ".leg-trail", ".leg-lead .shin", ".leg-trail .shin", ".step-lead", ".step-trail",
    ".arm-reach", ".arm-swing", ".coat-sway", ".coat-tail", ".gown-sway", ".gown-train", ".veil-sway"]) {
    assert.match(decls(sel), /transform-origin:\s*[\d.]+px\s+[\d.]+px/, sel + " has no pivot");
  }
});

test("the hem under-layer sits inside the gown's outline when she stands", () => {
  // sharing the gown's outer edge lets the under-layer bleed through the
  // gown's antialiased edge at rest
  const svg = figure("fig-r");
  const gown = svg.match(/<g class="gown-sway">\s*<path class="gown" d="([^"]+)"/)[1];
  const train = svg.match(/<g class="gown-train">\s*<path class="gown" d="([^"]+)"/)[1];
  const pts = (d) => [...d.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const hemTip = pts(gown).reduce((a, b) => (b[0] < a[0] ? b : a)); // rear point of the hem
  const trainTip = pts(train).reduce((a, b) => (b[0] < a[0] ? b : a));
  assert.ok(trainTip[0] >= hemTip[0] + 0.3, "under-layer reaches the gown's rear edge");
  const low = (d) => Math.max(...pts(d).map((p) => p[1]));
  assert.ok(low(train) < low(gown), "under-layer reaches the gown's lower edge");
});

test("nothing in the walk animates under prefers-reduced-motion", () => {
  const at = flat.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(at > -1, "reduced-motion block missing from css/story-figures.css");
  const block = flat.slice(flat.indexOf("{", at) + 1);
  for (const sel of [".fig-l", ".fig-r", ".fig-bob", ".figure .leg", ".figure .shin", ".figure .arm", ".figure .step",
    ".figure .coat-sway", ".figure .coat-tail", ".figure .gown-sway", ".figure .gown-train", ".figure .veil-sway"]) {
    assert.match(decls(sel, block), /animation:\s*none\s*!important/, sel + " not covered by the reduced-motion guard");
  }
  // with the walk switched off, the two stand where it would have ended
  for (const [sel, name] of [[".fig-l", "walkL"], [".fig-r", "walkR"]]) {
    const end = KF[name][KF[name].length - 1].body.match(/transform:\s*([^;]+);/)[1];
    assert.ok(decls(sel, block).includes("transform: " + end + " !important"), sel + " does not rest on the end of " + name);
  }
  // and the page still hides the whole story for those visitors
  const pageBlock = html.slice(html.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(pageBlock.slice(0, 400), /\.story\s*\{\s*display:\s*none;\s*\}/);
});

test("one cache stamp across every page, including the new stylesheet", () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  assert.ok(pages.includes("index.html") && pages.length >= 5, "pages not found: " + pages.join(", "));
  const stamps = [];
  for (const page of pages) {
    for (const m of read(page).matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\?v=(\d+)"/g)) { stamps.push(page + ":" + m[1]); }
  }
  assert.ok(stamps.some((s) => s.startsWith("index.html:")), "no stamped references found");
  const values = new Set(stamps.map((s) => s.split(":")[1]));
  assert.equal(values.size, 1, "stamps differ across pages: " + [...new Set(stamps)].join(", "));
});

// ---------- grounding: both figures' soles are the bottom of the art ----------

test("both figures end on the same sole line, and that line is the bottom of the view box", () => {
  // the view box is cropped to the soles, so `bottom` on the figure is the
  // ground line and nothing hovers or sinks (the bride used to end in two
  // bare ankle lines well above it)
  const soles = (svg) => [...svg.matchAll(/<path class="shoe" d="M([\d.]+) ([\d.]+) h[\d.]+ (?:l[-\d.]+ |v)([\d.]+) h/g)]
    .map((m) => Math.round((Number(m[2]) + Number(m[3])) * 100) / 100);
  for (const cls of ["fig-l", "fig-r"]) {
    const svg = figure(cls);
    const vb = svg.match(/viewBox="0 0 60 ([\d.]+)"/);
    assert.ok(vb, cls + " lost its view box");
    const s = soles(svg);
    assert.equal(s.length, 2, cls + " needs two shoes");
    for (const y of s) { assert.equal(y, Number(vb[1]), cls + " shoe bottom " + y + " is not the view-box bottom"); }
  }
  assert.match(figure("fig-r"), /<g class="step step-(?:lead|trail)"><path class="thin"[^>]*\/><path class="shoe"/, "bride's shoes ride on her ankles");
  assert.match(decls(".figure"), /bottom:\s*5\.1vh/, "soles belong on the ground line");
  assert.match(decls(".figure svg"), /display:\s*block/, "an inline svg leaves a baseline gap under the soles");
});

test("her gown reaches down to her shoes: the hem ends within a few units of the soles", () => {
  const svg = figure("fig-r");
  const gown = svg.match(/<g class="gown-sway">\s*<path class="gown" d="([^"]+)"/)[1];
  const ys = [...gown.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]));
  const low = Math.max(...ys);
  const sole = Number(svg.match(/viewBox="0 0 60 ([\d.]+)"/)[1]);
  assert.ok(sole - low < 6, "hem at " + low + " is too far above the soles at " + sole);
  assert.ok(low < sole - 2, "hem must leave room for the shoes");
});

// ---------- meeting: hands and heart ----------

test("they stop close enough for the raised hands to meet, at every width", () => {
  // the stop distance is a fraction of the figure width, so it scales with it
  assert.match(decls(".story"), /--meet:\s*calc\(var\(--fig-w\)\s*\*\s*0\.\d+\)/);
  assert.match(decls(".figure"), /width:\s*var\(--fig-w\)/);
  const end = (name) => KF[name][KF[name].length - 1].body;
  assert.match(end("walkL"), /translateX\(calc\(-50% - var\(--meet\)\)\)/);
  assert.match(end("walkR"), /translateX\(calc\(-50% \+ var\(--meet\)\)\)/);
  // hands, in view-box units from the middle of each 60-wide figure box: his reaches x=53.5, hers (mirrored) x=52
  const f = Number(decls(".story").match(/--meet:[^;]*\*\s*(0\.\d+)\)/)[1]);
  const gapUnits = 2 * f * 60 - ((53.5 - 30) + (52 - 30));
  assert.ok(gapUnits >= 0 && gapUnits <= 4, "hands end " + gapUnits.toFixed(1) + " units apart");
});

test("the heart blooms just above their heads, sized from the same figure height", () => {
  const from = html.indexOf(".meet-heart {");
  const rule = html.slice(from, html.indexOf("}", from));
  assert.match(rule, /bottom:\s*calc\([^;]*var\(--fig-h\)/);
  assert.doesNotMatch(rule, /130px/);
  assert.match(decls(".story"), /--fig-h:\s*calc\(var\(--fig-w\)\s*\*\s*1\.54\d*\)/);
});

// ---------- wide screens: ten steps ----------

const wideCss = read("css/story-figures-wide.css");
const wideFlat = wideCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const KFW = (() => {
  const out = {};
  for (const m of wideFlat.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)) {
    out[m[1]] = [...m[2].matchAll(/([\d.]+%)\s*\{([^{}]*)\}/g)].map((s) => ({ stop: s[1], body: s[2].trim() }));
  }
  return out;
})();
const WIDE = ["bobW", "legLeadW", "legTrailW", "kneeLeadW", "kneeTrailW", "stepLeadW", "stepTrailW",
  "armReachW", "armSwingW", "clothSwayW", "tailTrailW", "trainTrailW"];
const rotW = (s) => Number(s.body.match(/rotate\(\s*([-\d.]+)deg\)/)[1]);

test("the wide-screen stylesheet is linked for 1100px and up only, with the shared cache stamp", () => {
  assert.match(html, /<link rel="stylesheet" media="\(min-width: 1100px\)" href="css\/story-figures-wide\.css\?v=\d+">/);
  assert.ok(html.indexOf("story-figures-wide.css") > html.indexOf("css/story-figures.css"), "wide must load after the base");
});

test("wide screens: every ten-step keyframe set is wired, ends on the rest pose and starts on it (except the reach)", () => {
  for (const name of WIDE) {
    assert.ok(KFW[name] && KFW[name].length >= 5, "@keyframes " + name + " missing");
    assert.match(wideFlat, new RegExp("animation(?:-name)?:\\s*" + name + "\\b"), name + " is never used");
    const last = KFW[name][KFW[name].length - 1];
    assert.equal(last.stop, "100%");
    for (const n of amounts(last.body)) { assert.equal(n, 0, name + " ends on " + last.body); }
    if (name !== "armReachW") {
      assert.equal(KFW[name][0].stop, "0%");
      for (const n of amounts(KFW[name][0].body)) { assert.equal(n, 0, name + " starts on " + KFW[name][0].body); }
    }
    for (const s of KFW[name]) { assert.match(s.body, /^transform:[^;]*;?$/, name + " animates more than transform"); }
  }
  // the walk itself keeps the shared duration and delay and holds both ends
  assert.match(wideFlat, /\.fig-l \{ animation: walkL var\(--walk\) [^;]*var\(--walk-delay\) both; \}/);
  assert.match(wideFlat, /\.fig-r \{ animation: walkR var\(--walk\) [^;]*var\(--walk-delay\) both; \}/);
  assert.match(wideFlat, /\.fig-bob \{ animation: bobW var\(--walk\) var\(--stride\) var\(--walk-delay\) both; \}/);
});

test("wide screens: ten steps, feet and bob on the same twentieths, legs in opposition", () => {
  const contacts = ["5%", "15%", "25%", "35%", "45%", "55%", "65%", "75%", "85%", "95%"];
  for (const name of ["bobW", "legLeadW", "legTrailW"]) {
    const stops = KFW[name].map((s) => s.stop);
    for (const c of contacts) { assert.ok(stops.includes(c), name + " has no keyframe at foot contact " + c); }
  }
  KFW.legLeadW.forEach((s, i) => {
    assert.equal(KFW.legTrailW[i].stop, s.stop);
    assert.equal(rotW(s) + rotW(KFW.legTrailW[i]), 0, "legs not opposed at " + s.stop);
  });
  // ten alternating contacts: the lead leg changes direction every step from the second on
  const lead = contacts.map((c) => rotW(KFW.legLeadW.find((s) => s.stop === c)));
  for (let i = 2; i < lead.length; i++) { assert.ok(lead[i] * lead[i - 1] < 0, "lead leg does not alternate at contact " + (i + 1)); }
  // the walk still starts and finishes gently
  assert.ok(Math.abs(lead[0]) < Math.abs(lead[3]) / 4);
  assert.ok(Math.abs(lead[9]) < Math.abs(lead[3]) / 4);
});

test("wide screens: the ankle swing keeps the bride's feet from crossing", () => {
  const lines = [...figure("fig-r").matchAll(/<g class="step step-(lead|trail)"><path class="thin" d="M([\d.]+) [^"]* ([\d.]+)"/g)];
  const gap = Math.abs(Number(lines[0][2]) - Number(lines[1][2]));
  let reach = 0;
  for (const m of lines) {
    const pivotY = Number(decls(".step-" + m[1]).match(/transform-origin:\s*[\d.]+px\s+([\d.]+)px/)[1]);
    const swing = Math.max(...KFW[m[1] === "lead" ? "stepLeadW" : "stepTrailW"].map((s) => Math.abs(rotW(s))));
    reach += (Number(m[3]) - pivotY) * Math.sin(swing * Math.PI / 180);
  }
  assert.ok(reach < gap / 2, "feet travel " + reach.toFixed(1) + " towards each other with only " + gap + " between them");
});

test("the wide stylesheet only swaps animation names: no pivots, no paints, nothing that beats the reduced-motion guard", () => {
  assert.doesNotMatch(wideFlat, /!important/);
  assert.doesNotMatch(wideFlat, /url\(#/);
  assert.doesNotMatch(wideFlat, /transform-origin/);
});
