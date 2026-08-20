(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FamilyTree = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------
  // Renders the live database (people / relationships) as one drawn
  // family tree: the couple "crown" at the top flowing down into two
  // side columns. Each side shows its immediate family first, then
  // "boughs" — the households of a parent's brothers & sisters
  // (sibling_of links) — as their own branch cards, with married
  // children nesting recursively inside whichever card they grew in.
  // Pure planning lives in planSide() so node tests can cover it.
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
    var siblingsOf = {};

    people.forEach(function (p) {
      parentsOf[p.id] = []; childrenOf[p.id] = []; siblingsOf[p.id] = [];
    });

    relationships.forEach(function (r) {
      if (!byId[r.from_person] || !byId[r.to_person]) { return; }
      if (r.type === "parent_of") {
        childrenOf[r.from_person].push(r.to_person);
        parentsOf[r.to_person].push(r.from_person);
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

  // ---------------------------------------------------------------
  // planSide — pure layout planning for one side (no DOM).
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
    // (that person belongs in a nested card under their spouse instead).
    function isRoot(id) {
      if (parentsOnSide(id).length) { return false; }
      var s = spouseOnSide(id);
      if (s && parentsOnSide(s).length) { return false; }
      return true;
    }

    var loners = sidePeople.filter(function (p) { return !hasAnyRelationship(p.id); });
    var rootPeople = sidePeople.filter(function (p) { return hasAnyRelationship(p.id) && isRoot(p.id); });

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

  // ------------------------- DOM builders -------------------------

  function avatarNode(person, sizeClass) {
    var avatar = makeEl("div", "avatar " + sizeClass + " " + (TINTS[person.side] || "t1"), initialsFor(person.name));
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }

  function svgUse(className, viewBox, href) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", href);
    svg.appendChild(use);
    return svg;
  }

  function buildCoupleNode(a, b) {
    var wrap = makeEl("div", "couple-node rv");
    var pa = makeEl("div", "cn-person");
    pa.appendChild(avatarNode(a, "large"));
    pa.appendChild(makeEl("p", "cn-name", a.name));
    var pb = makeEl("div", "cn-person");
    pb.appendChild(avatarNode(b, "large"));
    pb.appendChild(makeEl("p", "cn-name", b.name));
    wrap.appendChild(pa);
    wrap.appendChild(svgUse("cn-heart", "0 0 24 24", "#heart-shape"));
    wrap.appendChild(pb);
    return wrap;
  }

  function drawnPaths(className, viewBox, ds) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    ds.forEach(function (d) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("pathLength", "100");
      svg.appendChild(path);
    });
    return svg;
  }

  function buildFlowLink() {
    return drawnPaths("flow-link rv-draw", "0 0 120 56", [
      "M60 2 C 60 20, 58 24, 40 32 C 22 40, 14 44, 6 54",
      "M60 2 C 60 20, 62 24, 80 32 C 98 40, 106 44, 114 54"
    ]);
  }

  // a small bough that carries the family column down into the branch cards
  function buildBoughLink() {
    return drawnPaths("bough-link rv-draw", "0 0 120 40", [
      "M60 2 C 60 16, 60 26, 60 38",
      "M60 13 C 53 14.5, 47 13.5, 41 9",
      "M60 23 C 67 24.5, 73 23.5, 79 19"
    ]);
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
      var star = svgUse("kid-star", "0 0 24 24", "#star-shape");
      name.appendChild(star);
    }
    if (crown && (person.id === crown.a.id || person.id === crown.b.id)) {
      name.appendChild(makeEl("span", "tag", SIDE_TAGS[person.side] || ""));
    }
    node.appendChild(name);
    return node;
  }

  function stemEl(sizeClass) {
    var stem = makeEl("div", "stem rv" + (sizeClass ? " " + sizeClass : ""));
    stem.setAttribute("aria-hidden", "true");
    return stem;
  }

  // The extended family stays out of the picture until someone asks for
  // it: the anchor (e.g. Sheine) becomes a quiet toggle — hover, tap or
  // keyboard — that lets her brothers & sisters bloom out below.
  function attachBoughsToggle(node, wrap, anchorName) {
    node.classList.add("has-boughs");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-expanded", "false");
    node.setAttribute("aria-controls", wrap.id);
    node.setAttribute("aria-label", anchorName + "’s brothers & sisters — tap to show them");
    node.setAttribute("title", "meet " + anchorName + "’s brothers & sisters");
    var name = node.querySelector(".node-name");
    if (name) { name.appendChild(svgUse("anchor-sprig", "0 0 32 32", "#sprig-shape")); }
    function bloom() {
      var parts = wrap.querySelectorAll(".rv, .rv-draw");
      for (var i = 0; i < parts.length; i++) {
        parts[i].style.transitionDelay = Math.min(i * 70, 600) + "ms";
        parts[i].classList.add("in");
      }
    }
    function setOpen(open) {
      wrap.hidden = !open;
      node.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && !wrap.getAttribute("data-bloomed")) {
        wrap.setAttribute("data-bloomed", "1");
        // double rAF so the browser paints the un-hidden state first,
        // letting the grow-in transitions actually play
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () { requestAnimationFrame(bloom); });
        } else {
          bloom();
        }
      }
    }
    node.addEventListener("click", function () { setOpen(wrap.hidden); });
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setOpen(wrap.hidden);
      }
    });
    node.addEventListener("mouseenter", function () { if (wrap.hidden) { setOpen(true); } });
  }

  function coupleCaption(members) {
    return members.map(function (m) { return m.name; }).join(" & ");
  }

  function renderSide(sideEl, sidePeople, graph, crown, captionText) {
    var crownPersonId = null;
    if (crown) {
      crownPersonId = sidePeople.some(function (p) { return p.id === crown.a.id; }) ? crown.a.id
        : sidePeople.some(function (p) { return p.id === crown.b.id; }) ? crown.b.id : null;
    }
    var plan = planSide(sidePeople, graph, crownPersonId);
    var sideIds = {};
    sidePeople.forEach(function (p) { sideIds[p.id] = true; });

    function spouseOnSide(id) { var s = graph.spouseOf[id]; return (s != null && sideIds[s]) ? s : null; }
    function childrenOnSide(id) {
      return graph.childrenOf[id].filter(function (cid) { return sideIds[cid]; }).sort(plan.byOrder);
    }

    // a married child (and/or one with children) sprouts their own
    // little card below the row, recursing for further generations
    function appendNested(parentEl, personId, depth) {
      if (depth > 6) { return; } // guard against unexpected cycles in the data
      var spouseId = spouseOnSide(personId);
      var kidIds = childrenOnSide(personId).slice();
      if (spouseId) {
        childrenOnSide(spouseId).forEach(function (cid) {
          if (kidIds.indexOf(cid) === -1) { kidIds.push(cid); }
        });
        kidIds.sort(plan.byOrder);
      }
      if (!spouseId && !kidIds.length) { return; }

      var person = graph.byId[personId];
      var nested = makeEl("div", "nested rv");
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

    var memberNodes = {};

    function renderHousehold(el, members, caption, first) {
      var parentsRow = makeEl("div", "parents-row rv");
      if (!first) { parentsRow.style.marginTop = "2rem"; }
      members.forEach(function (m) {
        var node = buildPNode(m);
        memberNodes[m.id] = node;
        parentsRow.appendChild(node);
      });
      el.appendChild(parentsRow);
      el.appendChild(stemEl());
      if (caption) { el.appendChild(makeEl("p", "grp-cap rv", caption)); }

      var childIds = plan.childrenOfHousehold(members);
      var kidsRow = makeEl("div", "kids-row rv");
      childIds.forEach(function (cid) { kidsRow.appendChild(buildKNode(graph.byId[cid], crown)); });
      el.appendChild(kidsRow);

      childIds.forEach(function (cid) { appendNested(el, cid, 1); });
    }

    var first = true;
    if (plan.primary) {
      renderHousehold(sideEl, plan.primary, captionText, first);
      first = false;
    }
    plan.extras.forEach(function (members) {
      renderHousehold(sideEl, members, null, first);
      first = false;
    });

    if (plan.boughs.length) {
      var boughsWrap = makeEl("div", "boughs");
      boughsWrap.id = "boughs-" + (sidePeople[0] ? sidePeople[0].side : "side");
      boughsWrap.hidden = true;
      boughsWrap.appendChild(buildBoughLink());
      boughsWrap.appendChild(makeEl("p", "bough-cap rv", plan.boughs[0].anchor.name + "’s brothers & sisters"));
      plan.boughs.forEach(function (bough) {
        var branch = makeEl("div", "branch rv");
        var sprig = svgUse("branch-sprig", "0 0 32 32", "#sprig-shape");
        sprig.removeAttribute("fill");
        branch.appendChild(sprig);
        branch.appendChild(makeEl("p", "grp-cap", coupleCaption(bough.members)));
        var parentsRow = makeEl("div", "parents-row");
        bough.members.forEach(function (m) { parentsRow.appendChild(buildPNode(m)); });
        branch.appendChild(parentsRow);
        var childIds = plan.childrenOfHousehold(bough.members);
        if (childIds.length) {
          branch.appendChild(stemEl("sm"));
          var kidsRow = makeEl("div", "kids-row");
          childIds.forEach(function (cid) { kidsRow.appendChild(buildKNode(graph.byId[cid], crown)); });
          branch.appendChild(kidsRow);
          childIds.forEach(function (cid) { appendNested(branch, cid, 1); });
        }
        boughsWrap.appendChild(branch);
      });
      sideEl.appendChild(boughsWrap);

      var anchorNode = memberNodes[plan.boughs[0].anchor.id];
      if (anchorNode) { attachBoughsToggle(anchorNode, boughsWrap, plan.boughs[0].anchor.name); }
      else { boughsWrap.hidden = false; } // never strand them unreachable
    }

    if (plan.loners.length) {
      var stem = stemEl();
      if (!first) { stem.style.marginTop = "2rem"; }
      sideEl.appendChild(stem);
      sideEl.appendChild(makeEl("p", "grp-cap rv", "family & friends"));
      var lonersRow = makeEl("div", "kids-row rv");
      plan.loners.forEach(function (p) { lonersRow.appendChild(buildKNode(p, crown)); });
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
      sideEl.appendChild(makeEl("h3", "side-label rv", SIDE_LABELS[sideKey] || sideKey));
      renderSide(sideEl, sidePeople, graph, crown, captions[sideKey]);
      sides.appendChild(sideEl);
    });
    container.appendChild(sides);

    if (typeof options.onRendered === "function") { options.onRendered(container); }
  }

  return { render: render, buildGraph: buildGraph, findCrownCouple: findCrownCouple, planSide: planSide };
});
