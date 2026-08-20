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
  // family tree with the couple large at its heart. The main picture
  // holds ONLY the two immediate families — each side's parents and
  // the couple's brothers & sisters. Everyone beyond that stays
  // folded away behind a small gold plus:
  //   · a married sibling (Arisha, Tayyibah) unfolds a compact card
  //     with their own little family
  //   · a parent with siblings (Sheine) unfolds a quiet text listing
  //     of those families — no seals, they stay out of the picture
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
    // (that person belongs folded under their spouse instead).
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

  function buildFlowLink() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "flow-link rv-draw");
    svg.setAttribute("viewBox", "0 0 120 56");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    [
      "M60 2 C 60 20, 58 24, 40 32 C 22 40, 14 44, 6 54",
      "M60 2 C 60 20, 62 24, 80 32 C 98 40, 106 44, 114 54"
    ].forEach(function (d) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("pathLength", "100");
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

  function kidStar() {
    return svgUse("kid-star", "0 0 24 24", "#star-shape");
  }

  function buildKNode(person, crown) {
    var node = makeEl("div", "k-node");
    node.appendChild(avatarNode(person, "small"));
    var name = makeEl("p", "node-name", person.name);
    if (person.is_kid) { name.appendChild(kidStar()); }
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

  function coupleCaption(members) {
    return members.map(function (m) { return m.name; }).join(" & ");
  }

  var foldSeq = 0;

  // A small gold plus by someone's name that unfolds a tucked-away
  // card just beneath their row — hover, tap or keyboard.
  function attachFoldToggle(node, wrap, label) {
    foldSeq++;
    wrap.id = wrap.id || ("fold-" + foldSeq);
    node.classList.add("has-fold");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-expanded", "false");
    node.setAttribute("aria-controls", wrap.id);
    node.setAttribute("aria-label", label + " — tap to show");
    node.setAttribute("title", label);
    var name = node.querySelector(".node-name");
    if (name) { name.appendChild(svgUse("plus-mark", "0 0 24 24", "#plus-shape")); }

    function bloom() {
      var parts = wrap.querySelectorAll(".rv, .rv-draw");
      for (var i = 0; i < parts.length; i++) {
        parts[i].style.transitionDelay = Math.min(i * 70, 400) + "ms";
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
    // on desktop, hovering opens the fold; the click that naturally
    // follows within a beat must not immediately close it again
    var hoverOpenedAt = 0;
    node.addEventListener("click", function () {
      if (!wrap.hidden && Date.now() - hoverOpenedAt < 600) { return; }
      setOpen(wrap.hidden);
    });
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setOpen(wrap.hidden);
      }
    });
    node.addEventListener("mouseenter", function () {
      if (wrap.hidden) { hoverOpenedAt = Date.now(); setOpen(true); }
    });
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
    function familyOf(personId) {
      var spouseId = spouseOnSide(personId);
      var kidIds = childrenOnSide(personId).slice();
      if (spouseId) {
        childrenOnSide(spouseId).forEach(function (cid) {
          if (kidIds.indexOf(cid) === -1) { kidIds.push(cid); }
        });
        kidIds.sort(plan.byOrder);
      }
      return { spouseId: spouseId, kidIds: kidIds };
    }

    // an italic one-line note for a further generation inside a fold:
    // "Abu & Sabiha — Yana ✦"
    function subLine(personId, depth) {
      if (depth > 6) { return null; }
      var fam = familyOf(personId);
      if (!fam.spouseId && !fam.kidIds.length) { return null; }
      var person = graph.byId[personId];
      var line = makeEl("p", "fold-sub rv");
      var lead = person.name + (fam.spouseId ? " & " + graph.byId[fam.spouseId].name : "");
      line.appendChild(document.createTextNode(lead + (fam.kidIds.length ? " — " : "")));
      fam.kidIds.forEach(function (cid, i) {
        if (i > 0) { line.appendChild(document.createTextNode(" · ")); }
        line.appendChild(document.createTextNode(graph.byId[cid].name));
        if (graph.byId[cid].is_kid) { line.appendChild(kidStar()); }
      });
      return line;
    }

    // compact card for a sibling's own family: "Arisha & Amar" and
    // their little row of seals — matters to the couple, so it keeps seals
    function buildMiniFam(personId) {
      var fam = familyOf(personId);
      if (!fam.spouseId && !fam.kidIds.length) { return null; }
      var person = graph.byId[personId];
      var wrap = makeEl("div", "fold");
      wrap.hidden = true;
      var card = makeEl("div", "mini-fam rv");
      card.appendChild(makeEl("p", "grp-cap sm", person.name + (fam.spouseId ? " & " + graph.byId[fam.spouseId].name : "")));
      var row = makeEl("div", "kids-row");
      if (fam.spouseId) { row.appendChild(buildKNode(graph.byId[fam.spouseId], crown)); }
      fam.kidIds.forEach(function (cid) { row.appendChild(buildKNode(graph.byId[cid], crown)); });
      card.appendChild(row);
      fam.kidIds.forEach(function (cid) {
        var sub = subLine(cid, 2);
        if (sub) { card.appendChild(sub); }
      });
      wrap.appendChild(card);
      return wrap;
    }

    // quiet text listing of the extended families — deliberately no
    // seals: they stay out of the picture
    function buildTwigList(boughs) {
      var wrap = makeEl("div", "fold");
      wrap.hidden = true;
      var card = makeEl("div", "twig-list rv");
      boughs.forEach(function (bough) {
        var twig = makeEl("div", "twig rv");
        twig.appendChild(makeEl("p", "twig-cap", coupleCaption(bough.members)));
        var kidIds = plan.childrenOfHousehold(bough.members);
        if (kidIds.length) {
          var names = makeEl("p", "twig-names");
          kidIds.forEach(function (cid, i) {
            if (i > 0) { names.appendChild(document.createTextNode(" · ")); }
            names.appendChild(document.createTextNode(graph.byId[cid].name));
            if (graph.byId[cid].is_kid) { names.appendChild(kidStar()); }
          });
          twig.appendChild(names);
          kidIds.forEach(function (cid) {
            var sub = subLine(cid, 2);
            if (sub) { sub.className = "fold-sub"; twig.appendChild(sub); }
          });
        }
        card.appendChild(twig);
      });
      wrap.appendChild(card);
      return wrap;
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
      var folds = [];
      childIds.forEach(function (cid) {
        var node = buildKNode(graph.byId[cid], crown);
        var fold = buildMiniFam(cid);
        if (fold) {
          folds.push(fold);
          attachFoldToggle(node, fold, graph.byId[cid].name + "’s own family");
        }
        kidsRow.appendChild(node);
      });
      el.appendChild(kidsRow);
      folds.forEach(function (fold) { el.appendChild(fold); });
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
      var anchor = plan.boughs[0].anchor;
      var twigs = buildTwigList(plan.boughs);
      var anchorNode = memberNodes[anchor.id];
      if (anchorNode) {
        // the listing unfolds right beneath the parents' row, not at the
        // bottom of the column
        var parentsRow = anchorNode.parentNode;
        parentsRow.parentNode.insertBefore(twigs, parentsRow.nextSibling);
        attachFoldToggle(anchorNode, twigs, anchor.name + "’s brothers & sisters");
      } else {
        sideEl.appendChild(twigs);
        twigs.hidden = false; // never strand them unreachable
      }
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
