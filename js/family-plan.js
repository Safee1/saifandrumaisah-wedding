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

    var index = Object.create(null);
    people.forEach(function (p, i) { index[p.id] = i; });
    function byIndex(x, y) { return index[x] - index[y]; }
    // Rows are processed in a canonical order (by people[] position, then type) so the
    // result never depends on the order the database happens to return them in.
    // parent_of rows first, so the spouse check below can see every ancestor line
    function TYPE_RANK(t) { return t === "parent_of" ? 0 : t === "spouse_of" ? 1 : t === "sibling_of" ? 2 : 3; }
    var rows = relationships.filter(function (r) { return byId[r.from_person] && byId[r.to_person]; }).sort(function (r1, r2) {
      return (TYPE_RANK(r1.type) - TYPE_RANK(r2.type)) || (index[r1.from_person] - index[r2.from_person]) || (index[r1.to_person] - index[r2.to_person]);
    });

    var parentsOf = {};
    var childrenOf = {};
    var spouseOf = {};
    var siblingsOf = {};
    // O(1) duplicate checks (the old indexOf scans made a couple with N children cost O(N^2))
    var childSet = {};
    var sibSet = {};

    people.forEach(function (p) {
      parentsOf[p.id] = []; childrenOf[p.id] = []; siblingsOf[p.id] = [];
      childSet[p.id] = Object.create(null); sibSet[p.id] = Object.create(null);
    });

    // true when 'target' is already a descendant of 'start' (so start -> ... -> target exists)
    function reaches(start, target) {
      var seen = Object.create(null);
      var stack = [start];
      while (stack.length) {
        var id = stack.pop();
        if (id === target) { return true; }
        if (seen[id]) { continue; }
        seen[id] = true;
        var kids = childrenOf[id];
        for (var i = 0; i < kids.length; i++) { stack.push(kids[i]); }
      }
      return false;
    }

    // spouse rows are collected first and paired afterwards in people[] order, so the
    // pairing never depends on the (unspecified) order the database returns rows in,
    // spouseOf is always symmetric and nobody is left half-married
    var partners = Object.create(null);
    function addPartner(a, b) {
      (partners[a] = partners[a] || []).push(b);
    }

    rows.forEach(function (r) {
      if (r.from_person === r.to_person) { return; } // degenerate row
      if (r.type === "parent_of") {
        // guests can approve the same fact twice — keep one copy
        if (childSet[r.from_person][r.to_person]) { return; }
        // a bad approved row that would make someone their own ancestor is skipped:
        // one loop would otherwise recurse forever in the renderer (or hide people)
        if (reaches(r.to_person, r.from_person)) { return; }
        childSet[r.from_person][r.to_person] = true;
        childrenOf[r.from_person].push(r.to_person);
        parentsOf[r.to_person].push(r.from_person);
      } else if (r.type === "spouse_of") {
        // someone cannot be married to their own ancestor/descendant (it would loop the layout)
        if (reaches(r.from_person, r.to_person) || reaches(r.to_person, r.from_person)) { return; }
        addPartner(r.from_person, r.to_person); addPartner(r.to_person, r.from_person);
      } else if (r.type === "sibling_of") {
        if (!sibSet[r.from_person][r.to_person]) { sibSet[r.from_person][r.to_person] = true; siblingsOf[r.from_person].push(r.to_person); }
        if (!sibSet[r.to_person][r.from_person]) { sibSet[r.to_person][r.from_person] = true; siblingsOf[r.to_person].push(r.from_person); }
      }
    });

    people.forEach(function (p) {
      var cands = partners[p.id];
      if (spouseOf[p.id] != null || !cands) { return; }
      cands.slice().sort(byIndex).some(function (c) {
        if (spouseOf[c] != null || c === p.id) { return false; }
        spouseOf[p.id] = c; spouseOf[c] = p.id; return true;
      });
    });
    people.forEach(function (p) { siblingsOf[p.id].sort(byIndex); });

    return { byId: byId, parentsOf: parentsOf, childrenOf: childrenOf, spouseOf: spouseOf, siblingsOf: siblingsOf };
  }

  // The crown couple is the one married pair that bridges both sides —
  // they get the large avatars up top, and ALSO appear as ordinary
  // small avatars in their own side's sibling row.
  function findCrownCouple(relationships, byId) {
    var best = null, bestKey = null;
    relationships.forEach(function (r) {
      if (r.type !== "spouse_of") { return; }
      var a = byId[r.from_person], b = byId[r.to_person];
      if (!a || !b || a.side === b.side) { return; }
      var pair = a.side === "saif" ? { a: a, b: b } : { a: b, b: a };
      var key = pair.a.id + "|" + pair.b.id;      // same answer whatever order the rows arrive in
      if (bestKey === null || key < bestKey) { best = pair; bestKey = key; }
    });
    return best;
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

    // a household may hang from MORE than one primary member — a
    // cross-marriage (mum's brother married dad's sister) belongs in
    // both parents' folds
    var boughs = [];
    var extras = [];
    households.forEach(function (members) {
      if (members === primary) { return; }
      var anchors = [];
      members.forEach(function (m) {
        graph.siblingsOf[m.id].forEach(function (sid) {
          if (primary && primary.some(function (pm) { return pm.id === sid; }) &&
              !anchors.some(function (a) { return a.id === sid; })) {
            anchors.push(graph.byId[sid]);
          }
        });
      });
      if (anchors.length) { boughs.push({ anchor: anchors[0], anchors: anchors, members: members }); }
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

  // A cross-married household appears in both parents' folds; in each fold
  // the parent's OWN sibling must come first (the bloodline, left), the
  // married-in spouse second — otherwise Kashif's fold looks like it hangs
  // off Sheine's brother instead of Kashif's sister.
  function orderForAnchor(graph, members, anchorId) {
    function rank(m) { return graph.siblingsOf[m.id].indexOf(anchorId) !== -1 ? 0 : 1; }
    return members.slice().sort(function (a, b) { return rank(a) - rank(b); });
  }

  return { buildGraph: buildGraph, findCrownCouple: findCrownCouple, planSide: planSide, orderForAnchor: orderForAnchor };
});
