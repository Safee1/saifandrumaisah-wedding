// Bad approved data must never blank the family tree or make people vanish:
// loops, second spouses, a parent recorded as their child's spouse, and the
// order the database happens to return rows in. js/family-plan.js decides
// what is drawn, so these run offline on the pure planner.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const FamilyPlan = require("../js/family-plan.js");

function person(id, side, isKid) { return { id: id, name: id, side: side, is_kid: !!isKid }; }
function parentOf(a, b) { return { from_person: a, to_person: b, type: "parent_of" }; }
function spouseOf(a, b) { return { from_person: a, to_person: b, type: "spouse_of" }; }

const SAIF = ["dad", "mum", "groom", "sis"].map((id) => person(id, "saif"));
const BASE = [spouseOf("dad", "mum"), parentOf("dad", "groom"), parentOf("mum", "groom"), parentOf("mum", "sis")];

function descendants(graph, id, seen) {
  seen = seen || {};
  (graph.childrenOf[id] || []).forEach((c) => { if (!seen[c]) { seen[c] = true; descendants(graph, c, seen); } });
  return seen;
}

test("a two-person parent loop is cut: nobody becomes their own ancestor", () => {
  const rels = BASE.concat([parentOf("groom", "dad")]);
  const graph = FamilyPlan.buildGraph(SAIF, rels);
  SAIF.forEach((p) => assert.equal(descendants(graph, p.id)[p.id], undefined, p.id + " is their own descendant"));
});

test("a three-person parent loop is cut the same way", () => {
  const people = ["a", "b", "c"].map((id) => person(id, "saif"));
  const graph = FamilyPlan.buildGraph(people, [parentOf("a", "b"), parentOf("b", "c"), parentOf("c", "a")]);
  people.forEach((p) => assert.equal(descendants(graph, p.id)[p.id], undefined));
});

test("a parent also recorded as their child's spouse is not married to their descendant", () => {
  const graph = FamilyPlan.buildGraph(SAIF, BASE.concat([spouseOf("dad", "groom")]));
  assert.notEqual(graph.spouseOf.groom, "dad");
  assert.notEqual(graph.spouseOf.dad, "groom");
  assert.equal(graph.spouseOf.dad, "mum", "the real marriage is untouched");
});

test("a second spouse row never leaves the pairing one-sided", () => {
  const people = SAIF.concat([person("extra", "saif")]);
  const graph = FamilyPlan.buildGraph(people, BASE.concat([spouseOf("dad", "extra")]));
  Object.keys(graph.spouseOf).forEach((id) => {
    assert.equal(graph.spouseOf[graph.spouseOf[id]], id, "spouseOf is symmetric for " + id);
  });
});

test("self-referencing and unknown-person rows are ignored", () => {
  const graph = FamilyPlan.buildGraph(SAIF, BASE.concat([parentOf("dad", "dad"), spouseOf("dad", "dad"), parentOf("ghost", "dad")]));
  assert.deepEqual(graph.parentsOf.dad, []);
  assert.equal(graph.spouseOf.dad, "mum");
});

test("duplicate rows are kept once", () => {
  const graph = FamilyPlan.buildGraph(SAIF, BASE.concat(BASE));
  assert.deepEqual(graph.childrenOf.mum, ["groom", "sis"]);
  assert.deepEqual(graph.parentsOf.groom, ["dad", "mum"]);
});

test("the drawn tree does not depend on the order the database returns rows", () => {
  const rels = BASE.concat([{ from_person: "mum", to_person: "dad", type: "sibling_of" }]);
  const reference = JSON.stringify(FamilyPlan.buildGraph(SAIF, rels));
  for (let i = 0; i < rels.length; i++) {
    const rotated = rels.slice(i).concat(rels.slice(0, i));
    assert.equal(JSON.stringify(FamilyPlan.buildGraph(SAIF, rotated)), reference, "rotated by " + i);
    assert.equal(JSON.stringify(FamilyPlan.buildGraph(SAIF, rotated.slice().reverse())), reference, "reversed after rotating by " + i);
  }
});

test("the crown couple is the same whichever order the rows arrive in", () => {
  const people = SAIF.concat([person("bride", "rumaisah"), person("bride2", "rumaisah")]);
  const byId = FamilyPlan.buildGraph(people, []).byId;
  const a = [spouseOf("groom", "bride"), spouseOf("sis", "bride2")];
  const first = FamilyPlan.findCrownCouple(a, byId);
  const second = FamilyPlan.findCrownCouple(a.slice().reverse(), byId);
  assert.equal(first.a.id + "|" + first.b.id, second.a.id + "|" + second.b.id);
});

test("planning a huge sibling set is fast (no quadratic duplicate scans)", () => {
  const people = [person("p", "saif")];
  const rels = [];
  for (let i = 0; i < 4000; i++) { people.push(person("c" + i, "saif")); rels.push(parentOf("p", "c" + i)); }
  const started = Date.now();
  const graph = FamilyPlan.buildGraph(people, rels);
  assert.equal(graph.childrenOf.p.length, 4000);
  assert.ok(Date.now() - started < 1500, "took " + (Date.now() - started) + " ms");
});

test("a deep chain of 800 generations does not crash the planner", () => {
  const people = [];
  const rels = [];
  for (let i = 0; i < 800; i++) { people.push(person("g" + i, "saif")); if (i) { rels.push(parentOf("g" + (i - 1), "g" + i)); } }
  const graph = FamilyPlan.buildGraph(people, rels);
  assert.equal(graph.parentsOf.g799.length, 1);
});

test("random messy data never throws and never loses anyone from the graph", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let round = 0; round < 300; round++) {
    const n = 2 + Math.floor(rnd() * 14);
    const people = [];
    for (let i = 0; i < n; i++) { people.push(person("p" + i, rnd() < 0.5 ? "saif" : "rumaisah", rnd() < 0.2)); }
    const rels = [];
    const m = Math.floor(rnd() * n * 2);
    const types = ["parent_of", "spouse_of", "sibling_of"];
    for (let i = 0; i < m; i++) {
      rels.push({ from_person: "p" + Math.floor(rnd() * n), to_person: "p" + Math.floor(rnd() * n), type: types[Math.floor(rnd() * 3)] });
    }
    const graph = FamilyPlan.buildGraph(people, rels);
    people.forEach((p) => assert.ok(graph.byId[p.id], "person kept: " + p.id));
    people.forEach((p) => assert.equal(descendants(graph, p.id)[p.id], undefined, "loop survived in round " + round));
  }
});
