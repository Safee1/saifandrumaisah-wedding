(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./family-plan.js"), require("./family-lines.js"));
  } else {
    root.FamilyTree = factory(root.FamilyPlan, root.FamilyLines);
  }
})(typeof self !== "undefined" ? self : this, function (FamilyPlan, FamilyLines) {
  "use strict";

  // ---------------------------------------------------------------
  // Renders the live database as one drawn family tree with the
  // couple large at its heart. Every family is a "unit": the couple
  // side by side joined by a marriage line, a spine dropping to a bar
  // across their children, a tick to each child — drawn by
  // js/family-lines.js from the laid-out DOM. The main picture holds
  // the two immediate families; everyone beyond lives behind a small
  // gold plus: a married sibling unfolds their own unit, a parent
  // unfolds the branch of their brothers & sisters — themselves
  // highlighted among them, each sibling with spouse and children.
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

  function kidStar() {
    return svgUse("kid-star", "0 0 24 24", "#star-shape", 10);
  }

  // one person: a bordered box carrying their name (+ little-one star,
  // groom/bride tag, or their kinship label — everyone beyond the
  // immediate family wears one). big = a parent's box; isAnchor = the
  // person whose branch this fold belongs to, ringed in gold.
  function buildNode(person, crown, big, isAnchor) {
    var node = makeEl("div", (big ? "p-node" : "k-node") + " " + (TINTS[person.side] || "t1") + (isAnchor ? " is-anchor" : ""));
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

  // the couple, always the tree's centre: two boxes joined by a marriage
  // line, larger and gold-bordered to stand apart from everyone else
  function buildCoupleNode(a, b) {
    var wrap = makeEl("div", "couple-node rv");
    var pa = makeEl("div", "cn-person " + (TINTS[a.side] || "t1"));
    pa.appendChild(makeEl("p", "cn-name", a.name));
    var pb = makeEl("div", "cn-person " + (TINTS[b.side] || "t1"));
    pb.appendChild(makeEl("p", "cn-name", b.name));
    wrap.appendChild(pa);
    wrap.appendChild(svgUse("cn-heart", "0 0 24 24", "#heart-shape", 18));
    wrap.appendChild(pb);
    return wrap;
  }

  // the couple's box splits into two square branches, one to each
  // family — a plain right-angle T, matching the tree's own connectors
  function buildFlowLink() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "flow-link rv-draw");
    svg.setAttribute("viewBox", "0 0 120 56");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    [
      "M60 2 L60 22 L12 22 L12 54",
      "M60 2 L60 22 L108 22 L108 54"
    ].forEach(function (d) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("pathLength", "100");
      svg.appendChild(path);
    });
    return svg;
  }

  function coupleCaption(members) {
    return members.map(function (m) { return m.name; }).join(" & ");
  }

  function afterPaint(fn) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { requestAnimationFrame(fn); });
    } else {
      fn();
    }
  }

  // layout position of el within ancestor (transform-immune)
  function offsetWithin(el, ancestor) {
    var x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function markScrollable(scope) {
    var wraps = scope.querySelectorAll(".chart-scroll");
    for (var i = 0; i < wraps.length; i++) {
      if (wraps[i].scrollWidth > wraps[i].clientWidth + 2) {
        wraps[i].classList.add("can-scroll");
        wraps[i].setAttribute("tabindex", "0");   // keyboard users can scroll the branch too
      } else {
        wraps[i].classList.remove("can-scroll");
        wraps[i].removeAttribute("tabindex");
      }
    }
  }

  function drawLines(scope) {
    FamilyLines.drawAll(scope);
    markScrollable(scope);
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

    // the popover hangs just beneath its owner, wherever they sit
    function placeFold() {
      if (fullMode) { wrap.style.top = ""; return; }
      var parent = wrap.offsetParent;
      if (!parent) { return; }
      var nb = offsetWithin(node, parent);
      wrap.style.top = (nb.y + nb.h + 4) + "px";
    }
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
    function setOpen(open, pinned) {
      cancelClose();
      wrap.hidden = !open;
      node.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) { wrap.removeAttribute("data-pinned"); return; }
      if (pinned) { wrap.setAttribute("data-pinned", "1"); } else { wrap.removeAttribute("data-pinned"); }
      placeFold();
      afterPaint(function () {
        if (!wrap.getAttribute("data-bloomed")) { wrap.setAttribute("data-bloomed", "1"); bloom(); }
        drawLines(wrap);
        placeCaret();
      });
    }
    function isPinned() { return wrap.getAttribute("data-pinned") === "1"; }
    function scheduleClose() {
      if (fullMode || wrap.hidden || isPinned()) { return; }
      cancelClose();
      closeTimer = setTimeout(function () { setOpen(false); }, 380);
    }
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
    wrap.foldPlace = function () { if (!wrap.hidden) { placeFold(); placeCaret(); } };
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

    // A family unit: the couple (blood relative first), then their
    // children beneath — a child with their own family becomes a
    // nested unit, so the branches keep going.
    // opts.foldKids: in the main picture a married child gets a plus
    // and a popover instead of an inline subtree (collected in opts.folds)
    function buildUnit(members, kidIds, opts) {
      opts = opts || {};
      var fu = makeEl("div", "fu" + (opts.wrap ? " fu-wrap" : "") + (opts.dup ? " tw-dup" : ""));
      var couple = makeEl("div", "fu-couple");
      members.forEach(function (m) {
        couple.appendChild(buildNode(m, crown, !!opts.big, m.id === opts.anchorId));
      });
      fu.appendChild(couple);
      if (opts.caption) { fu.appendChild(makeEl("p", "fu-cap", opts.caption)); }
      if (!kidIds.length) { return fu; }
      var kids = makeEl("div", "fu-kids");
      kidIds.forEach(function (cid) {
        var child = graph.byId[cid];
        var f = familyOf(cid);
        var hasFamily = f.spouseId || f.kidIds.length;
        if (hasFamily && opts.foldKids) {
          var node = buildNode(child, crown, false, false);
          kids.appendChild(node);
          var fold = buildMiniFold(cid, f);
          opts.folds.push({ node: node, fold: fold, label: child.name + "'s own family" });
        } else if (hasFamily) {
          var cm = [child];
          if (f.spouseId) { cm.push(graph.byId[f.spouseId]); }
          kids.appendChild(buildUnit(cm, f.kidIds, { depth: (opts.depth || 0) + 1, dup: opts.dup }));
        } else {
          kids.appendChild(buildNode(child, crown, false, false));
        }
      });
      fu.appendChild(kids);
      return fu;
    }

    function foldShell(kind) {
      var wrap = makeEl("div", "fold " + kind);
      wrap.hidden = true;
      var card = makeEl("div", "fold-card rv");
      wrap.appendChild(card);
      return { wrap: wrap, card: card };
    }
    function chartIn(card) {
      var scroll = makeEl("div", "chart-scroll");
      var chart = makeEl("div", "chart");
      scroll.appendChild(chart);
      card.appendChild(scroll);
      return chart;
    }

    // a married sibling's own family, with them highlighted
    function buildMiniFold(personId, f) {
      var shell = foldShell("fold-mini");
      var members = [graph.byId[personId]];
      if (f.spouseId) { members.push(graph.byId[f.spouseId]); }
      chartIn(shell.card).appendChild(buildUnit(members, f.kidIds, { anchorId: personId }));
      return shell.wrap;
    }

    // a parent's brothers & sisters as one branch: an unnamed root
    // above, the siblings on one bar (the parent highlighted among
    // them), each married sibling with spouse and children beneath
    function buildSiblingFold(anchor, boughs) {
      var shell = foldShell("fold-twigs");
      shell.card.appendChild(makeEl("p", "tw-title", anchor.name + "'s brothers & sisters"));
      var chart = chartIn(shell.card);
      var rootUnit = makeEl("div", "fu fu-root");
      var couple = makeEl("div", "fu-couple");
      var dotEl = makeEl("span", "fu-rootdot");
      dotEl.setAttribute("aria-hidden", "true");
      couple.appendChild(dotEl);
      rootUnit.appendChild(couple);
      var kids = makeEl("div", "fu-kids");

      var entries = [{ id: anchor.id, self: true }];
      boughs.forEach(function (b) { entries.push({ id: b.members[0].id, bough: b }); });
      entries.sort(function (p, q) { return plan.byOrder(p.id, q.id); });
      var xrefs = [];
      entries.forEach(function (e) {
        if (e.self) {
          kids.appendChild(buildNode(anchor, crown, false, true));
          return;
        }
        var dup = !!(e.bough.anchors && e.bough.anchors[0].id !== anchor.id);
        kids.appendChild(buildUnit(e.bough.members, plan.childrenOfHousehold(e.bough.members), { dup: dup }));
        if (dup) { xrefs.push(coupleCaption(e.bough.members) + " — see " + e.bough.anchors[0].name + "'s brothers & sisters"); }
      });
      rootUnit.appendChild(kids);
      chart.appendChild(rootUnit);
      xrefs.forEach(function (t) { shell.card.appendChild(makeEl("p", "tw-xref", t)); });
      return shell.wrap;
    }

    var memberNodes = {};
    var folds = [];

    // the main picture: parents with the couple's brothers & sisters
    if (plan.primary) {
      var chart = makeEl("div", "chart chart-main rv");
      var unit = buildUnit(plan.primary, plan.childrenOfHousehold(plan.primary), {
        big: true, wrap: true, caption: captionText, foldKids: true, folds: folds
      });
      var pnodes = unit.querySelectorAll(":scope > .fu-couple > .p-node");
      plan.primary.forEach(function (m, i) { if (pnodes[i]) { memberNodes[m.id] = pnodes[i]; } });
      chart.appendChild(unit);
      sideEl.appendChild(chart);
    }
    plan.extras.forEach(function (members) {
      var extraChart = makeEl("div", "chart chart-main rv");
      extraChart.appendChild(buildUnit(members, plan.childrenOfHousehold(members), { big: true, wrap: true, foldKids: true, folds: folds }));
      sideEl.appendChild(extraChart);
    });
    folds.forEach(function (f) {
      sideEl.appendChild(f.fold);
      attachFoldToggle(f.node, f.fold, f.label);
    });

    // each parent with sibling households gets their own branch fold;
    // a cross-married household belongs to both parents' branches
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
        var twigs = buildSiblingFold(g.anchor, g.boughs);
        var anchorNode = memberNodes[g.anchor.id];
        sideEl.appendChild(twigs);
        if (anchorNode) {
          attachFoldToggle(anchorNode, twigs, g.anchor.name + "'s brothers & sisters");
        } else {
          twigs.hidden = false; // never strand them unreachable
        }
      });
    }

    if (plan.loners.length) {
      sideEl.appendChild(makeEl("p", "fu-cap rv", "family & friends"));
      var lonersRow = makeEl("div", "kids-row rv");
      plan.loners.forEach(function (p) { lonersRow.appendChild(buildNode(p, crown, false, false)); });
      sideEl.appendChild(lonersRow);
    }
  }

  var resizeTimer = null;

  function redraw(container) {
    drawLines(container);
    var folds = container.querySelectorAll(".fold");
    for (var i = 0; i < folds.length; i++) { if (folds[i].foldPlace) { folds[i].foldPlace(); } }
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

    drawLines(container);
    // web fonts change name widths — redraw once they land, and on resize
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { redraw(container); });
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { redraw(container); }, 120);
      });
    }

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
    afterPaint(function () { redraw(container); });
  }

  return {
    render: render,
    redraw: redraw,
    setFullView: setFullView,
    buildGraph: FamilyPlan.buildGraph,
    findCrownCouple: FamilyPlan.findCrownCouple,
    planSide: FamilyPlan.planSide
  };
});
