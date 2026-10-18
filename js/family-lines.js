(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FamilyLines = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------
  // Draws the branches of a family chart: a marriage line between a
  // couple, a spine dropping from them, a bar across their children
  // and a tick down to each child. Reads layout positions (offset*,
  // so grow-in transforms don't skew it) and paints into one SVG
  // overlay per .chart. Pure DOM measurement — no data knowledge.
  // ---------------------------------------------------------------

  var NS = "http://www.w3.org/2000/svg";
  var BAR_GAP = 14;   // px between the children's bar and their boxes

  function box(el, chart) {
    var x = 0, y = 0, n = el;
    while (n && n !== chart) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2 };
  }

  function children(el, selector) {
    var out = [];
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (!selector || c.matches(selector)) { out.push(c); }
    }
    return out;
  }

  // the box a line attaches to: a node is its own box, or for a nested
  // family unit, the blood child's box (first in its couple)
  function anchorBox(el) {
    if (el.classList.contains("fu")) {
      var couple = children(el, ".fu-couple")[0];
      return couple ? children(couple, ".k-node, .p-node")[0] : null;
    }
    return el;
  }

  function path(d, cls) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    if (cls) { p.setAttribute("class", cls); }
    return p;
  }
  function dot(x, y) {
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 2.6);
    c.setAttribute("class", "ln-dot");
    return c;
  }

  function coupleGeometry(couple, nodes, rootDot, chart) {
    if (nodes.length === 2) {
      var a = box(nodes[0], chart);
      var b = box(nodes[1], chart);
      return { a: a, b: b, x: (a.x + a.w + b.x) / 2, y: a.y + a.h / 2 };
    }
    if (nodes.length === 1) {
      var s = box(nodes[0], chart);
      return { x: s.cx, y: s.y + s.h };              // below the box
    }
    if (rootDot) {
      var r = box(rootDot, chart);
      return { x: r.cx, y: r.y + r.h };
    }
    return null;
  }

  function nudge(el, dx) {
    if (!el) { return; }
    var cur = parseFloat(el.style.left) || 0;
    el.style.position = "relative";
    el.style.left = (cur + dx) + "px";
  }

  // The middle of the gap between two neighbouring boxes of a row that is
  // closest to x, or null if the row has no real gap (one box, or touching).
  function nearestGap(row, x) {
    var b = (row.boxes || []).slice().sort(function (p, q) { return p.x - q.x; });
    var best = null, bestD = Infinity;
    for (var i = 1; i < b.length; i++) {
      var left = b[i - 1].x + b[i - 1].w, right = b[i].x;
      if (right - left >= 4) {
        var gx = (left + right) / 2, d = Math.abs(gx - x);
        if (d < bestD) { bestD = d; best = gx; }
      }
    }
    return best;
  }

  // Works out every line for one family's children, with no DOM: a spine
  // from the couple to the first bar, one bar per row with a tick to each
  // child, and, when siblings wrap onto more rows, a short trunk that drops
  // through the gap between two boxes to the next bar (so the lines make one
  // tidy ladder instead of a big C down the margin). A row with no gap falls
  // back to a trunk beside its left edge. Returns [{ cls, d }] plus the dot.
  function routeRows(rows, startX, startY) {
    var out = [], dotAt = null, trunkX = startX, prevBarY = startY;
    rows.forEach(function (row, idx) {
      var barY = row.top - BAR_GAP;
      var minX = Math.min.apply(null, row.xs.concat([trunkX]));
      var maxX = Math.max.apply(null, row.xs.concat([trunkX]));
      // where the trunk leaves this row for the next one
      var nextTrunk = null;
      if (idx < rows.length - 1) {
        nextTrunk = nearestGap(row, trunkX);
        if (nextTrunk === null) { nextTrunk = Math.max(3, row.lx - BAR_GAP); }
        minX = Math.min(minX, nextTrunk);
        maxX = Math.max(maxX, nextTrunk);
      }
      out.push({ cls: "ln-spine", d: "M" + trunkX + " " + prevBarY + " L" + trunkX + " " + barY });
      if (maxX - minX > 0.5) {
        out.push({ cls: "ln-bar", d: "M" + minX + " " + barY + " L" + maxX + " " + barY });
      }
      row.xs.forEach(function (x) {
        out.push({ cls: "ln-tick", d: "M" + x + " " + barY + " L" + x + " " + row.top });
      });
      if (idx === 0) { dotAt = { x: startX, y: barY }; }
      prevBarY = barY;
      if (nextTrunk !== null) { trunkX = nextTrunk; }
    });
    return { paths: out, dot: dotAt };
  }

  function drawUnit(fu, chart, svg) {
    var couple = children(fu, ".fu-couple")[0];
    var kidsEl = children(fu, ".fu-kids")[0];
    if (!couple) { return; }
    var nodes = children(couple, ".k-node, .p-node");
    var rootDot = children(couple, ".fu-rootdot")[0];
    var g = coupleGeometry(couple, nodes, rootDot, chart);
    if (!g) { return; }

    var kids = kidsEl ? children(kidsEl, ".k-node, .fu") : [];
    // group children into rows (a wrapped row of many siblings)
    var rows = [];
    kids.forEach(function (k) {
      if (!k.offsetWidth) { return; }   // folded away (e.g. a family shown elsewhere)
      var ab = anchorBox(k);
      if (!ab) { return; }
      var bb = box(ab, chart);
      var top = Math.round(bb.y);
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].top - top) < 6) { row = rows[i]; break; } }
      if (!row) { row = { top: top, xs: [], lx: bb.x, boxes: [] }; rows.push(row); }
      row.xs.push(bb.cx);
      row.boxes.push({ x: bb.x, w: bb.w });
      if (bb.x < row.lx) { row.lx = bb.x; }
    });
    rows.sort(function (p, q) { return p.top - q.top; });

    // the couple sits exactly over the middle of their children's bar
    if (rows.length) {
      var first = rows[0];
      var barMid = (Math.min.apply(null, first.xs) + Math.max.apply(null, first.xs)) / 2;
      var dx = barMid - g.x;
      if (Math.abs(dx) > 0.5) {
        nudge(couple, dx);
        nudge(children(fu, ".fu-cap")[0], dx);
        g = coupleGeometry(couple, nodes, rootDot, chart);
      }
    }

    if (g.a && g.b) {
      // marriage line between the two seals
      svg.appendChild(path("M" + (g.a.x + g.a.w) + " " + g.y + " L" + g.b.x + " " + g.y, "ln-marriage"));
    }
    if (!rows.length) { return; }

    var plan = routeRows(rows, g.x, g.y);
    plan.paths.forEach(function (p) { svg.appendChild(path(p.d, p.cls)); });
    if (plan.dot) { svg.appendChild(dot(plan.dot.x, plan.dot.y)); }
  }

  function draw(chart) {
    if (!chart || !chart.offsetWidth) { return; }
    var svg = chart.querySelector(":scope > svg.lines");
    if (!svg) {
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "lines");
      svg.setAttribute("aria-hidden", "true");
      chart.insertBefore(svg, chart.firstChild);
    }
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }
    // shrink the overlay before measuring: its own previous width/height
    // attributes would otherwise still be part of chart.scrollWidth/Height,
    // so every redraw could only ever grow, never shrink back down once
    // something (a since-collapsed fold, a font swap) had made it wider
    svg.setAttribute("width", 0);
    svg.setAttribute("height", 0);
    var w = chart.scrollWidth, h = chart.scrollHeight;
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    // deepest families first, so a nested couple has settled over its
    // own children before its parents' bar is measured through it
    var units = chart.querySelectorAll(".fu");
    for (var i = units.length - 1; i >= 0; i--) {
      if (units[i].offsetWidth) { drawUnit(units[i], chart, svg); }
    }
  }

  function drawAll(scope) {
    var charts = scope.querySelectorAll(".chart");
    for (var i = 0; i < charts.length; i++) { draw(charts[i]); }
  }

  return { draw: draw, drawAll: drawAll, routeRows: routeRows, nearestGap: nearestGap };
});
