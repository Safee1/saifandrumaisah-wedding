(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FamilyPlan = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------
  // Pure planning for the family tree — no DOM. Turns the database
  // rows (people / relationships) into a graph, finds the crown
  // couple, and lays out one side of the tree. Rendering lives in
  // js/family-tree.js; node tests cover this module directly.
  // ---------------------------------------------------------------

  function buildGraph(people, relationships) {
    var byId = {};
    people.forEach(function (p) { byId[p.id] = p; });

    var parentsOf = {};
    var childrenOf = {};
    var spouseOf = {};
    var siblingsOf = {};

    people.forEach(function (p) {
      parentsOf[p.id] = []; childrenOf[p.id] = []; siblingsOf[p.id] = [];
    });

    relationships.forEach(function (r) {
      if (!byId[r.from_person] || !byId[r.to_person]) { return; }
      if (r.from_person === r.to_person) { return; } // degenerate row
      if (r.type === "parent_of") {
        // guests can approve the same fact twice — keep one copy
        if (childrenOf[r.from_person].indexOf(r.to_person) === -1) { childrenOf[r.from_person].push(r.to_person); }
        if (parentsOf[r.to_person].indexOf(r.from_person) === -1) { parentsOf[r.to_person].push(r.from_person); }
      } else if (r.type === "spouse_of") {
        spouseOf[r.from_person] = r.to_person;
        spouseOf[r.to_person] = r.from_person;
      } else if (r.type === "sibling_of") {
        if (siblingsOf[r.from_person].indexOf(r.to_person) === -1) { siblingsOf[r.from_person].push(r.to_person); }
        if (siblingsOf[r.to_person].indexOf(r.from_person) === -1) { siblingsOf[r.to_person].push(r.from_person); }
      }
    });

    return { byId: byId, parentsOf: parentsOf, childrenOf: childrenOf, spouseOf: spouseOf, siblingsOf: siblingsOf };
  }

  // The crown couple is the one married pair that bridges both sides —
  // they get the large avatars up top, and ALSO appear as ordinary
  // small avatars in their own side's sibling row.
  function findCrownCouple(relationships, byId) {
    var found = null;
    relationships.some(function (r) {
      if (r.type !== "spouse_of") { return false; }
      var a = byId[r.from_person], b = byId[r.to_person];
      if (!a || !b || a.side === b.side) { return false; }
      found = a.side === "saif" ? { a: a, b: b } : { a: b, b: a };
      return true;
    });
    return found;
  }

  // ---------------------------------------------------------------
  // planSide — lay out one side.
  // Returns:
  //   primary : the household the crown person grew up in (or the
  //             first household when that can't be determined)
  //   boughs  : [{ anchor, members }] households whose head is a
  //             brother/sister of someone in the primary household
  //   extras  : any other root households (kept as stacked families)
  //   loners  : people with no recorded relationships at all
  // Members and children everywhere follow the people[] array order,
  // so the database's sort_order flows through the whole layout.
  // ---------------------------------------------------------------
  function planSide(sidePeople, graph, crownPersonId) {
    var sideIds = {};
    var orderIndex = {};
    sidePeople.forEach(function (p, i) { sideIds[p.id] = true; orderIndex[p.id] = i; });

    function byOrder(a, b) { return orderIndex[a] - orderIndex[b]; }
    function parentsOnSide(id) { return graph.parentsOf[id].filter(function (pid) { return sideIds[pid]; }); }
    function spouseOnSide(id) { var s = graph.spouseOf[id]; return (s != null && sideIds[s]) ? s : null; }
    function hasAnyRelationship(id) {
      return graph.parentsOf[id].length > 0 || graph.childrenOf[id].length > 0 ||
        graph.spouseOf[id] != null || graph.siblingsOf[id].length > 0;
    }

    // A root is a person with no recorded parents on this side, who isn't
    // simply the married-in spouse of someone who does have parents here
    // (that person belongs folded under their spouse instead).
    function isRoot(id) {
      if (parentsOnSide(id).length) { return false; }
      var s = spouseOnSide(id);
      if (s && parentsOnSide(s).length) { return false; }
      return true;
    }

    var loners = sidePeople.filter(function (p) { return !hasAnyRelationship(p.id); });
    var rootPeople = sidePeople.filter(function (p) { return hasAnyRelationship(p.id) && isRoot(p.id); });

    // a bad approved row (parent cycle) can make everyone non-root;
    // degrade to showing the first connected person rather than a blank side
    if (!rootPeople.length) {
      rootPeople = sidePeople.filter(function (p) { return hasAnyRelationship(p.id); }).slice(0, 1);
    }

    var placed = {};
    var households = [];
    rootPeople.forEach(function (p) {
      if (placed[p.id]) { return; }
      placed[p.id] = true;
      var memberIds = [p.id];
      var s = spouseOnSide(p.id);
      if (s && !placed[s] && isRoot(s)) {
        placed[s] = true;
        memberIds.push(s);
      }
      households.push(memberIds.sort(byOrder).map(function (id) { return graph.byId[id]; }));
    });

    // the crown person's own parents mark the primary household
    var crownParents = {};
    if (crownPersonId && sideIds[crownPersonId]) {
      parentsOnSide(crownPersonId).forEach(function (pid) { crownParents[pid] = true; });
    }
    var primary = null;
    households.some(function (members) {
      if (members.some(function (m) { return crownParents[m.id]; })) { primary = members; return true; }
      return false;
    });
    if (!primary && households.length) { primary = households[0]; }

    var boughs = [];
    var extras = [];
    households.forEach(function (members) {
      if (members === primary) { return; }
      var anchor = null;
      members.some(function (m) {
        return graph.siblingsOf[m.id].some(function (sid) {
          if (primary && primary.some(function (pm) { return pm.id === sid; })) {
            anchor = graph.byId[sid];
            return true;
          }
          return false;
        });
      });
      if (anchor) { boughs.push({ anchor: anchor, members: members }); }
      else { extras.push(members); }
    });

    function childrenOfHousehold(members) {
      var ids = [];
      var seen = {};
      members.forEach(function (m) {
        graph.childrenOf[m.id].forEach(function (cid) {
          if (sideIds[cid] && !seen[cid]) { seen[cid] = true; ids.push(cid); }
        });
      });
      return ids.sort(byOrder);
    }

    return {
      primary: primary,
      boughs: boughs,
      extras: extras,
      loners: loners,
      childrenOfHousehold: childrenOfHousehold,
      byOrder: byOrder
    };
  }

  return { buildGraph: buildGraph, findCrownCouple: findCrownCouple, planSide: planSide };
});
