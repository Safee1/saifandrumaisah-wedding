// Wrapped sibling rows must hang off ONE short trunk that drops through the
// gap between two boxes, not a long loop down the left margin (the old
// "big C"). routeRows is pure geometry, so it runs in plain Node.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/family-lines.js");

const boxes = (xs, w) => xs.map((x) => ({ x: x - (w || 100) / 2, w: w || 100 }));
const row = (top, xs, w) => ({ top: top, xs: xs, lx: Math.min.apply(null, xs) - (w || 100) / 2, boxes: boxes(xs, w) });
const xsOf = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

test("nearestGap picks the gap closest to x, and null when there is none", () => {
  const r = row(200, [100, 220, 340]);   // gaps at 160 and 280
  assert.equal(L.nearestGap(r, 150), 160);
  assert.equal(L.nearestGap(r, 300), 280);
  assert.equal(L.nearestGap(row(200, [100]), 100), null, "one box has no gap");
  assert.equal(L.nearestGap({ boxes: [{ x: 0, w: 100 }, { x: 101, w: 100 }] }, 100), null, "touching boxes have no gap");
});

test("one row: spine, one bar, a tick per child, and the dot on the bar", () => {
  const r = L.routeRows([row(200, [100, 220, 340])], 220, 120);
  const cls = r.paths.map((p) => p.cls);
  assert.deepEqual(cls, ["ln-spine", "ln-bar", "ln-tick", "ln-tick", "ln-tick"]);
  assert.deepEqual(r.dot, { x: 220, y: 186 });
});

test("a wrapped second row hangs off a trunk between two boxes, never the margin", () => {
  const rows = [row(200, [100, 220, 340]), row(300, [100, 220, 340])];
  const r = L.routeRows(rows, 220, 120);
  const spines = r.paths.filter((p) => p.cls === "ln-spine");
  assert.equal(spines.length, 2);
  const trunk = xsOf(spines[1].d)[0];
  assert.equal(trunk, 160, "trunk runs through the gap next to the middle box");
  const leftEdge = Math.min.apply(null, rows.map((x) => x.lx));
  assert.ok(trunk > leftEdge + 50, "not out in the left margin");
  const bar2 = r.paths.filter((p) => p.cls === "ln-bar")[1];
  const [bx1, , bx2] = xsOf(bar2.d);
  assert.ok(bx1 <= trunk && trunk <= bx2, "the trunk meets the second bar");
});

test("three rows: the trunk keeps stepping down through gaps, and a lone last box joins by a bar", () => {
  const rows = [row(200, [100, 220, 340]), row(300, [100, 220, 340]), row(400, [160])];
  const r = L.routeRows(rows, 220, 120);
  const spines = r.paths.filter((p) => p.cls === "ln-spine").map((p) => xsOf(p.d));
  assert.deepEqual(spines.map((s) => s[0]), [220, 160, 160]);
  const ticks = r.paths.filter((p) => p.cls === "ln-tick");
  assert.equal(ticks.length, 7);
  r.paths.filter((p) => p.cls === "ln-bar").forEach((p) => {
    const n = xsOf(p.d); assert.ok(n[2] - n[0] > 0.5, "no zero-length bar");
  });
});

test("a row with no gap falls back to a trunk beside its left edge (never off-screen)", () => {
  const rows = [row(200, [60]), row(300, [60])];   // single boxes, no gaps
  const r = L.routeRows(rows, 60, 120);
  const spine2 = xsOf(r.paths.filter((p) => p.cls === "ln-spine")[1].d)[0];
  assert.ok(spine2 >= 3 && spine2 < 60);
});

test("every coordinate is a finite number", () => {
  const r = L.routeRows([row(200, [100, 220, 340]), row(300, [100, 220]), row(400, [160])], 220, 120);
  r.paths.forEach((p) => xsOf(p.d).forEach((n) => assert.ok(Number.isFinite(n))));
});
