(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./family-plan.js"));
  } else {
    root.FamilyTree = factory(root.FamilyPlan);
  }
})(typeof self !== "undefined" ? self : this, function (FamilyPlan) {
  "use strict";

  // ---------------------------------------------------------------
  // Renders the live database as one drawn family tree with the
  // couple large at its heart. The main picture holds ONLY the two
  // immediate families — each side's parents and the couple's
  // brothers & sisters. Everyone beyond that stays folded behind a
  // small gold plus:
  //   · a married sibling (Arisha, Tayyibah) unfolds a compact card
  //     with their own little family
  //   · a parent with siblings (Sheine) unfolds a quiet text listing
  //     of those families — no seals, they stay out of the picture
  // Pure planning lives in js/family-plan.js (node-tested).
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

  function avatarNode(person, sizeClass) {
    var avatar = makeEl("div", "avatar " + sizeClass + " " + (TINTS[person.side] || "t1"), initialsFor(person.name));
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }

  // size is a safety net: an explicit width/height attribute keeps the
  // glyph sane even if the page's CSS hasn't caught up (stale cache)
  function svgUse(className, viewBox, href, size) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    if (size) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
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
    wrap.appendChild(svgUse("cn-heart", "0 0 24 24", "#heart-shape", 18));
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
    return svgUse("kid-star", "0 0 24 24", "#star-shape", 10);
  }

  // everyone beyond the immediate family wears their kinship, children
  // included — worded the same way for all of them (Saif's ruling)
  function buildKNode(person, crown) {
    var node = makeEl("div", "k-node");
    node.appendChild(avatarNode(person, "small"));
    var name = makeEl("p", "node-name", person.name);
    if (person.is_kid) { name.appendChild(kidStar()); }
    if (crown && (person.id === crown.a.id || person.id === crown.b.id)) {
      name.appendChild(makeEl("span", "tag", SIDE_TAGS[person.side] || ""));
    } else if (person.relation) {
      name.appendChild(makeEl("span", "tag tag-rel", person.relation));
    }
    node.appendChild(name);
    return node;
  }

  function stemEl() {
    var stem = makeEl("div", "stem rv");
    stem.setAttribute("aria-hidden", "true");
    return stem;
  }

  function coupleCaption(members) {
    return members.map(function (m) { return m.name; }).join(" & ");
  }

  var foldSeq = 0;
  // "see the whole family": every fold opens inline and the popover
  // behaviours (hover-close, tap-away, Escape) stand down
  var fullMode = false;

  // A small gold plus by someone's name that unfolds a tucked-away
  // card just beneath their row. A mouse hover peeks (it folds away
  // again when the cursor moves on); a tap, click or Enter pins it
  // open until the next tap. Touch devices skip the hover peek
  // entirely — iOS cancels the tap's click when a hover handler
  // mutates the page, which would leave the fold unpinned.
  // A little caret on the card points back at its owner.
  function attachFoldToggle(node, wrap, label) {
    foldSeq++;
    wrap.id = wrap.id || ("fold-" + foldSeq);
    node.classList.add("has-fold");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-expanded", "false");
    node.setAttribute("aria-controls", wrap.id);
    node.setAttribute("aria-label", label);
    node.setAttribute("title", label);
    var name = node.querySelector(".node-name");
    if (name) { name.appendChild(svgUse("plus-mark", "0 0 24 24", "#plus-shape", 13)); }

    var card = wrap.firstChild;
    var caret = makeEl("span", "fold-caret");
    caret.setAttribute("aria-hidden", "true");
    card.appendChild(caret);

    function placeCaret() {
      var nr = node.getBoundingClientRect();
      var cr = card.getBoundingClientRect();
      if (!cr.width) { return; }
      var x = nr.left + nr.width / 2 - cr.left;
      x = Math.max(16, Math.min(cr.width - 16, x));
      card.style.setProperty("--caret-x", x + "px");
    }

    function bloom() {
      var parts = wrap.querySelectorAll(".rv, .rv-draw");
      for (var i = 0; i < parts.length; i++) {
        parts[i].style.transitionDelay = Math.min(i * 70, 400) + "ms";
        parts[i].classList.add("in");
      }
    }

    var closeTimer = null;
    function cancelClose() {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    }
    function afterPaint(fn) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () { requestAnimationFrame(fn); });
      } else {
        fn();
      }
    }
    function setOpen(open, pinned) {
      cancelClose();
      wrap.hidden = !open;
      node.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) { wrap.removeAttribute("data-pinned"); return; }
      if (pinned) { wrap.setAttribute("data-pinned", "1"); } else { wrap.removeAttribute("data-pinned"); }
      // paint the un-hidden state first so the grow-in transitions play,
      // then aim the caret at the owner
      afterPaint(function () {
        if (!wrap.getAttribute("data-bloomed")) { wrap.setAttribute("data-bloomed", "1"); bloom(); }
        placeCaret();
      });
    }
    function isPinned() { return wrap.getAttribute("data-pinned") === "1"; }
    function scheduleClose() {
      if (fullMode || wrap.hidden || isPinned()) { return; }
      cancelClose();
      closeTimer = setTimeout(function () { setOpen(false); }, 380);
    }
    // activating an open-but-unpinned (hover-peeked) fold pins it;
    // click and keyboard must agree on that
    function activate() {
      if (wrap.hidden || !isPinned()) { setOpen(true, true); } else { setOpen(false); }
    }

    node.addEventListener("click", activate);
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        activate();
      }
    });

    // hover peek is mouse-only: on touch the tap goes straight to click
    var hasPE = typeof window !== "undefined" && "PointerEvent" in window;
    var enterEv = hasPE ? "pointerenter" : "mouseenter";
    var leaveEv = hasPE ? "pointerleave" : "mouseleave";
    function mouseOnly(fn) {
      return function (e) {
        if (hasPE && e.pointerType !== "mouse") { return; }
        fn();
      };
    }
    node.addEventListener(enterEv, mouseOnly(function () {
      cancelClose();
      if (wrap.hidden) { setOpen(true, false); }
    }));
    node.addEventListener(leaveEv, mouseOnly(scheduleClose));
    wrap.addEventListener(enterEv, mouseOnly(cancelClose));
    wrap.addEventListener(leaveEv, mouseOnly(scheduleClose));

    // the card floats over the tree, so it behaves like a popover:
    // tapping anywhere else (or Escape) dismisses it
    var downEv = hasPE ? "pointerdown" : "mousedown";
    document.addEventListener(downEv, function (e) {
      if (fullMode || wrap.hidden) { return; }
      if (node.contains(e.target) || wrap.contains(e.target)) { return; }
      setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (!fullMode && e.key === "Escape" && !wrap.hidden) { setOpen(false); }
    });
    wrap.foldOpen = function () { setOpen(true, true); };
    wrap.foldClose = function () { setOpen(false); };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", function () { if (!wrap.hidden) { placeCaret(); } });
    }
  }

  function renderSide(sideEl, sidePeople, graph, crown, captionText) {
    var crownPersonId = null;
    if (crown) {
      crownPersonId = sidePeople.some(function (p) { return p.id === crown.a.id; }) ? crown.a.id
        : sidePeople.some(function (p) { return p.id === crown.b.id; }) ? crown.b.id : null;
    }
    var plan = FamilyPlan.planSide(sidePeople, graph, crownPersonId);
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
      var wrap = makeEl("div", "fold fold-mini");
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

    // the extended families as a little tree of their own: each couple
    // above, a stem, their children below; a further generation (Abu &
    // Sabiha) becomes its own block; siblings with no recorded family
    // of their own share one row of seals
    function appendFamBlock(el, members, kidIds, depth, dup) {
      if (depth > 4) { return; }
      var fam = makeEl("div", "tw-fam rv" + (dup ? " tw-dup" : ""));
      fam.appendChild(makeEl("p", "twig-cap", coupleCaption(members)));
      var parentsRow = makeEl("div", "kids-row tw-row");
      members.forEach(function (m) { parentsRow.appendChild(buildKNode(m, crown)); });
      fam.appendChild(parentsRow);
      if (kidIds.length) {
        var stem = makeEl("div", "stem tw-stem");
        stem.setAttribute("aria-hidden", "true");
        fam.appendChild(stem);
        var kidsRow = makeEl("div", "kids-row tw-row");
        kidIds.forEach(function (cid) { kidsRow.appendChild(buildKNode(graph.byId[cid], crown)); });
        fam.appendChild(kidsRow);
      }
      el.appendChild(fam);
      kidIds.forEach(function (cid) {
        var f = familyOf(cid);
        if (f.spouseId || f.kidIds.length) {
          var couple = [graph.byId[cid]];
          if (f.spouseId) { couple.push(graph.byId[f.spouseId]); }
          appendFamBlock(el, couple, f.kidIds, depth + 1, dup);
        }
      });
    }

    function buildTwigList(boughs, anchor) {
      var wrap = makeEl("div", "fold fold-twigs");
      wrap.hidden = true;
      var card = makeEl("div", "twig-list rv");
      // only visible in the whole-family view, where the fold sits inline
      card.appendChild(makeEl("p", "tw-title", anchor.name + "'s brothers & sisters"));
      var singles = [];
      boughs.forEach(function (bough) {
        var kidIds = plan.childrenOfHousehold(bough.members);
        if (bough.members.length === 1 && !kidIds.length) {
          singles.push(bough.members[0]);
          return;
        }
        // a cross-married family lives in both parents' folds; in the
        // whole-family view it is drawn once (under its first anchor) and
        // pointed to from the other
        var dup = bough.anchors && bough.anchors[0].id !== anchor.id;
        appendFamBlock(card, bough.members, kidIds, 1, dup);
        if (dup) {
          card.appendChild(makeEl("p", "tw-xref", coupleCaption(bough.members) + " — see " + bough.anchors[0].name + "'s brothers & sisters"));
        }
      });
      if (singles.length) {
        var row = makeEl("div", "kids-row tw-row tw-singles rv");
        singles.forEach(function (p) { row.appendChild(buildKNode(p, crown)); });
        card.appendChild(row);
      }
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

      // no children on this side → no stem descending into nothing
      var childIds = plan.childrenOfHousehold(members);
      if (!childIds.length) { return; }

      el.appendChild(stemEl());
      if (caption) { el.appendChild(makeEl("p", "grp-cap rv", caption)); }

      var kidsRow = makeEl("div", "kids-row rv");
      var folds = [];
      childIds.forEach(function (cid) {
        var node = buildKNode(graph.byId[cid], crown);
        var fold = buildMiniFam(cid);
        if (fold) {
          folds.push(fold);
          attachFoldToggle(node, fold, graph.byId[cid].name + "'s own family");
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

    // each parent with sibling households gets their own fold; a
    // cross-married household appears in every anchor's fold
    if (plan.boughs.length) {
      var groups = [];
      var groupByAnchor = {};
      plan.boughs.forEach(function (bough) {
        (bough.anchors || [bough.anchor]).forEach(function (anchor) {
          var g = groupByAnchor[anchor.id];
          if (!g) {
            g = { anchor: anchor, boughs: [] };
            groupByAnchor[anchor.id] = g;
            groups.push(g);
          }
          g.boughs.push(bough);
        });
      });
      groups.forEach(function (g) {
        var twigs = buildTwigList(g.boughs, g.anchor);
        var anchorNode = memberNodes[g.anchor.id];
        if (anchorNode) {
          // the listing unfolds right beneath the parents' row, not at
          // the bottom of the column
          var parentsRow = anchorNode.parentNode;
          parentsRow.parentNode.insertBefore(twigs, parentsRow.nextSibling);
          attachFoldToggle(anchorNode, twigs, g.anchor.name + "'s brothers & sisters");
        } else {
          sideEl.appendChild(twigs);
          twigs.hidden = false; // never strand them unreachable
        }
      });
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

    var graph = FamilyPlan.buildGraph(data.people, data.relationships);
    var crown = FamilyPlan.findCrownCouple(data.relationships, graph.byId);

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

  // the whole family at once — every fold unfolded into the picture,
  // the couple still at its heart
  function setFullView(container, on) {
    fullMode = !!on;
    if (container.classList) {
      if (fullMode) { container.classList.add("tree-full"); } else { container.classList.remove("tree-full"); }
    }
    var folds = container.querySelectorAll(".fold");
    for (var i = 0; i < folds.length; i++) {
      if (fullMode && folds[i].foldOpen) { folds[i].foldOpen(); }
      else if (!fullMode && folds[i].foldClose) { folds[i].foldClose(); }
    }
  }

  return {
    render: render,
    setFullView: setFullView,
    buildGraph: FamilyPlan.buildGraph,
    findCrownCouple: FamilyPlan.findCrownCouple,
    planSide: FamilyPlan.planSide
  };
});
