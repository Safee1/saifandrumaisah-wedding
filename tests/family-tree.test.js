"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const FamilyTree = require("../js/family-tree.js");

// A miniature of the real data: crown couple bridging two sides,
// a primary household, an uncle's household hung off mum via
// sibling_of (with a married child nesting inside it), an
// unconnected extra household, and a loner.
function person(id, side, isKid) {
  return { id: id, name: id, side: side, is_kid: !!isKid };
}

const PEOPLE = [
  // saif side, in sort order: dad, mum, groom, sister, uncle+aunt, cousins, cousin's wife+kid
  person("dad", "saif"), person("mum", "saif"),
  person("groom", "saif"), person("sister", "saif", true),
  person("uncle", "saif"), person("aunt", "saif"),
  person("cousinA", "saif"), person("cousinB", "saif", true),
  person("cousinWife", "saif"), person("cousinKid", "saif", true),
  person("strayA", "saif"), person("strayB", "saif"),
  person("loner", "saif"),
  // bride side
  person("bmum", "rumaisah"), person("bride", "rumaisah")
];

const RELS = [
  { from_person: "dad", to_person: "mum", type: "spouse_of" },
  { from_person: "dad", to_person: "groom", type: "parent_of" },
  { from_person: "mum", to_person: "groom", type: "parent_of" },
  { from_person: "mum", to_person: "sister", type: "parent_of" },
  { from_person: "mum", to_person: "uncle", type: "sibling_of" },
  { from_person: "uncle", to_person: "aunt", type: "spouse_of" },
  { from_person: "uncle", to_person: "cousinA", type: "parent_of" },
  { from_person: "uncle", to_person: "cousinB", type: "parent_of" },
  { from_person: "cousinA", to_person: "cousinWife", type: "spouse_of" },
  { from_person: "cousinA", to_person: "cousinKid", type: "parent_of" },
  { from_person: "strayA", to_person: "strayB", type: "spouse_of" },
  { from_person: "bmum", to_person: "bride", type: "parent_of" },
  { from_person: "groom", to_person: "bride", type: "spouse_of" }
];

function saifPlan() {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS);
  const sidePeople = PEOPLE.filter(function (p) { return p.side === "saif"; });
  return FamilyTree.planSide(sidePeople, graph, "groom");
}

test("buildGraph: sibling_of is symmetric and de-duplicated", () => {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS.concat([
    { from_person: "uncle", to_person: "mum", type: "sibling_of" }
  ]));
  assert.deepEqual(graph.siblingsOf["mum"], ["uncle"]);
  assert.deepEqual(graph.siblingsOf["uncle"], ["mum"]);
});

test("planSide: the crown person's parents form the primary household", () => {
  const plan = saifPlan();
  assert.deepEqual(plan.primary.map(p => p.id), ["dad", "mum"]);
});

test("planSide: a sibling's household becomes a bough anchored to the sibling", () => {
  const plan = saifPlan();
  assert.equal(plan.boughs.length, 1);
  assert.equal(plan.boughs[0].anchor.id, "mum");
  assert.deepEqual(plan.boughs[0].members.map(p => p.id), ["uncle", "aunt"]);
});

test("planSide: unrelated root households stay as extras, loners stay loners", () => {
  const plan = saifPlan();
  assert.deepEqual(plan.extras.map(h => h.map(p => p.id)), [["strayA", "strayB"]]);
  assert.deepEqual(plan.loners.map(p => p.id), ["loner"]);
});

test("planSide: married-in spouse and nested family never become roots", () => {
  const plan = saifPlan();
  const rootIds = [plan.primary].concat(plan.boughs.map(b => b.members), plan.extras)
    .flat().map(p => p.id);
  assert.ok(!rootIds.includes("cousinWife"));
  assert.ok(!rootIds.includes("cousinA"));
});

test("planSide: household children follow the people[] array order", () => {
  const plan = saifPlan();
  assert.deepEqual(plan.childrenOfHousehold(plan.primary), ["groom", "sister"]);
});

test("planSide: without a crown person the first household is primary", () => {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS);
  const sidePeople = PEOPLE.filter(p => p.side === "saif");
  const plan = FamilyTree.planSide(sidePeople, graph, null);
  assert.deepEqual(plan.primary.map(p => p.id), ["dad", "mum"]);
});

test("findCrownCouple: finds the pair bridging both sides, saif side first", () => {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS);
  const crown = FamilyTree.findCrownCouple(RELS, graph.byId);
  assert.equal(crown.a.id, "groom");
  assert.equal(crown.b.id, "bride");
});

// --- guards against bad approved data (audit follow-ups) ---

test("buildGraph: duplicate parent_of rows are kept once", () => {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS.concat([
    { from_person: "uncle", to_person: "cousinA", type: "parent_of" }
  ]));
  assert.deepEqual(graph.childrenOf["uncle"], ["cousinA", "cousinB"]);
  assert.deepEqual(graph.parentsOf["cousinA"], ["uncle"]);
});

test("buildGraph: a self-referencing row is ignored", () => {
  const graph = FamilyTree.buildGraph(PEOPLE, RELS.concat([
    { from_person: "dad", to_person: "dad", type: "parent_of" }
  ]));
  assert.deepEqual(graph.parentsOf["dad"], []);
});

test("planSide: a parent_of cycle degrades to one household instead of a blank side", () => {
  const cyclic = RELS.concat([{ from_person: "groom", to_person: "dad", type: "parent_of" }]);
  const graph = FamilyTree.buildGraph(PEOPLE, cyclic);
  const sidePeople = PEOPLE.filter(p => p.side === "saif");
  const plan = FamilyTree.planSide(sidePeople, graph, "groom");
  assert.ok(plan.primary, "side must not go blank");
  assert.ok(plan.primary.length >= 1);
});
