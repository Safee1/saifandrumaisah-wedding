(function (root) {
  "use strict";

  // ---------------------------------------------------------------
  // Renders the live database (people / relationships) into the
  // approved static layout: a couple "crown" at the top, flowing
  // down into two side-by-side family columns. No per-person SVG
  // connectors — just stems, captions and nested cards, exactly
  // like the approved design (see git show 7a42606:index.html).
  // ---------------------------------------------------------------

  var TINTS = { saif: "t1", rumaisah: "t2" };
  var SIDE_LABELS = { saif: "Saif's side", rumaisah: "Rumaisah's side" };
  var SIDE_TAGS = { saif: "groom", rumaisah: "bride" };

  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text != null) { el.textContent = text; }
    return el;
  }

  function initialsFor(name) {
    var words = name.trim().split(/\s+/);
    if (words.length > 1 && words[0] && words[1]) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return name.trim().charAt(0).toUpperCase();
  }

  function buildGraph(people, relationships) {
    var byId = {};
    people.forEach(function (p) { byId[p.id] = p; });

    var parentsOf = {};
    var childrenOf = {};
    var spouseOf = {};

    people.forEach(function (p) { parentsOf[p.id] = []; childrenOf[p.id] = []; });

    relationships.forEach(function (r) {
      if (!byId[r.from_person] || !byId[r.to_person]) { return; }
      if (r.type === "parent_of") {
        childrenOf[r.from_person].push(r.to_person);
        parentsOf[r.to_person].push(r.from_person);
      } else if (r.type === "spouse_of") {
        spouseOf[r.from_person] = r.to_person;
        spouseOf[r.to_person] = r.from_person;
      }
    });

    return { byId: byId, parentsOf: parentsOf, childrenOf: childrenOf, spouseOf: spouseOf };
  }

  // The crown couple is the one married pair that bridges both sides —
  // they get the large avatars up top, and (per the approved design)
  // ALSO appear as ordinary small avatars in their own side's sibling row.
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

  function avatarNode(person, sizeClass) {
    var avatar = makeEl("div", "avatar " + sizeClass + " " + (TINTS[person.side] || "t1"), initialsFor(person.name));
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }

  function heartIcon(className) {
    var heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heart.setAttribute("class", className);
    heart.setAttribute("viewBox", "0 0 24 24");
    heart.setAttribute("fill", "currentColor");
    heart.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#heart-shape");
    heart.appendChild(use);
    return heart;
  }

  function buildCoupleNode(a, b) {
    var wrap = makeEl("div", "couple-node");
    var pa = makeEl("div", "cn-person");
    pa.appendChild(avatarNode(a, "large"));
    pa.appendChild(makeEl("p", "cn-name", a.name));
    var pb = makeEl("div", "cn-person");
    pb.appendChild(avatarNode(b, "large"));
    pb.appendChild(makeEl("p", "cn-name", b.name));
    wrap.appendChild(pa);
    wrap.appendChild(heartIcon("cn-heart"));
    wrap.appendChild(pb);
    return wrap;
  }

  function buildFlowLink() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "flow-link");
    svg.setAttribute("viewBox", "0 0 120 56");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    [
      "M60 2 C 60 20, 58 24, 40 32 C 22 40, 14 44, 6 54",
      "M60 2 C 60 20, 62 24, 80 32 C 98 40, 106 44, 114 54"
    ].forEach(function (d) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function buildPNode(person) {
    var node = makeEl("div", "p-node");
    node.appendChild(avatarNode(person, "med"));
    node.appendChild(makeEl("p", "node-name", person.name));
    return node;
  }

  function buildKNode(person, crown) {
    var node = makeEl("div", "k-node");
    node.appendChild(avatarNode(person, "small"));
    var name = makeEl("p", "node-name", person.name);
    if (person.is_kid) {
      var star = makeEl("span", "kid-star", "✦");
      star.setAttribute("aria-hidden", "true");
      name.appendChild(star);
    }
    if (crown && (person.id === crown.a.id || person.id === crown.b.id)) {
      name.appendChild(makeEl("span", "tag", SIDE_TAGS[person.side] || ""));
    }
    node.appendChild(name);
    return node;
  }

  function stemEl(sizeClass) {
    var stem = makeEl("div", sizeClass ? "stem " + sizeClass : "stem");
    stem.setAttribute("aria-hidden", "true");
    return stem;
  }

  // Renders one side (a family column): every gen-0 household (parents
  // with no parents of their own recorded) gets a parents-row + stem +
  // caption + kids-row. A kid who has married in (same-side spouse)
  // and/or has children of their own gets a nested cream card below the
  // row, recursing for any further generations under them.
  function renderSide(sideEl, sidePeople, graph, crown, captionText) {
    var sideIds = {};
    sidePeople.forEach(function (p) { sideIds[p.id] = true; });

    function parentsOnSide(id) { return graph.parentsOf[id].filter(function (pid) { return sideIds[pid]; }); }
    function childrenOnSide(id) { return graph.childrenOf[id].filter(function (cid) { return sideIds[cid]; }); }
    function spouseOnSide(id) { var s = graph.spouseOf[id]; return (s != null && sideIds[s]) ? s : null; }
    function hasAnyRelationship(id) {
      return graph.parentsOf[id].length > 0 || graph.childrenOf[id].length > 0 || graph.spouseOf[id] != null;
    }

    // A root is a person with no recorded parents on this side, who isn't
    // simply the married-in spouse of someone who does have parents here
    // (that person belongs in a nested card under their spouse instead).
    function isRoot(id) {
      if (parentsOnSide(id).length) { return false; }
      var s = spouseOnSide(id);
      if (s && parentsOnSide(s).length) { return false; }
      return true;
    }

    function appendNested(parentEl, personId, depth) {
      if (depth > 6) { return; } // guard against unexpected cycles in the data
      var spouseId = spouseOnSide(personId);
      var kidIds = childrenOnSide(personId).slice();
      if (spouseId) {
        childrenOnSide(spouseId).forEach(function (cid) {
          if (kidIds.indexOf(cid) === -1) { kidIds.push(cid); }
        });
      }
      if (!spouseId && !kidIds.length) { return; }

      var person = graph.byId[personId];
      var nested = makeEl("div", "nested");
      nested.appendChild(stemEl("sm"));
      var capText = person.name + (spouseId ? " & " + graph.byId[spouseId].name : "");
      nested.appendChild(makeEl("p", "grp-cap sm", capText));
      var kidsRow = makeEl("div", "kids-row");
      if (spouseId) { kidsRow.appendChild(buildKNode(graph.byId[spouseId], crown)); }
      kidIds.forEach(function (cid) { kidsRow.appendChild(buildKNode(graph.byId[cid], crown)); });
      nested.appendChild(kidsRow);
      parentEl.appendChild(nested);

      kidIds.forEach(function (cid) { appendNested(nested, cid, depth + 1); });
    }

    var loners = sidePeople.filter(function (p) { return !hasAnyRelationship(p.id); });
    var rootPeople = sidePeople.filter(function (p) { return hasAnyRelationship(p.id) && isRoot(p.id); });

    var placed = {};
    var rootHouseholds = [];
    rootPeople.forEach(function (p) {
      if (placed[p.id]) { return; }
      placed[p.id] = true;
      var members = [p];
      var s = spouseOnSide(p.id);
      if (s && !placed[s] && isRoot(s)) {
        placed[s] = true;
        members.push(graph.byId[s]);
      }
      rootHouseholds.push(members);
    });

    rootHouseholds.forEach(function (members, i) {
      var parentsRow = makeEl("div", "parents-row");
      if (i > 0) { parentsRow.style.marginTop = "2rem"; }
      members.forEach(function (m) { parentsRow.appendChild(buildPNode(m)); });
      sideEl.appendChild(parentsRow);
      sideEl.appendChild(stemEl());
      if (captionText) { sideEl.appendChild(makeEl("p", "grp-cap", captionText)); }

      var childIds = [];
      var seenChild = {};
      members.forEach(function (m) {
        childrenOnSide(m.id).forEach(function (cid) {
          if (!seenChild[cid]) { seenChild[cid] = true; childIds.push(cid); }
        });
      });

      var kidsRow = makeEl("div", "kids-row");
      childIds.forEach(function (cid) { kidsRow.appendChild(buildKNode(graph.byId[cid], crown)); });
      sideEl.appendChild(kidsRow);

      childIds.forEach(function (cid) { appendNested(sideEl, cid, 1); });
    });

    if (loners.length) {
      var stem = stemEl();
      if (rootHouseholds.length) { stem.style.marginTop = "2rem"; }
      sideEl.appendChild(stem);
      sideEl.appendChild(makeEl("p", "grp-cap", "family & friends"));
      var lonersRow = makeEl("div", "kids-row");
      loners.forEach(function (p) { lonersRow.appendChild(buildKNode(p, crown)); });
      sideEl.appendChild(lonersRow);
    }
  }

  function render(container, data, options) {
    options = options || {};
    var captions = options.captions || {};
    container.textContent = "";

    if (!data.people.length) {
      container.appendChild(makeEl("p", "status", "the tree is just getting started…"));
      return;
    }

    var graph = buildGraph(data.people, data.relationships);
    var crown = findCrownCouple(data.relationships, graph.byId);

    if (crown) {
      container.appendChild(buildCoupleNode(crown.a, crown.b));
      container.appendChild(buildFlowLink());
    }

    var sides = makeEl("div", "sides");
    ["saif", "rumaisah"].forEach(function (sideKey) {
      var sidePeople = data.people.filter(function (p) { return p.side === sideKey; });
      if (!sidePeople.length) { return; }
      var sideEl = makeEl("div", "side");
      sideEl.appendChild(makeEl("h3", "side-label", SIDE_LABELS[sideKey] || sideKey));
      renderSide(sideEl, sidePeople, graph, crown, captions[sideKey]);
      sides.appendChild(sideEl);
    });
    container.appendChild(sides);
  }

  root.FamilyTree = { render: render, buildGraph: buildGraph, findCrownCouple: findCrownCouple };
})(typeof self !== "undefined" ? self : this);
