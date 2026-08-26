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
  var BAR_GAP = 12;   // px between the children's bar and their avatars

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

  // the avatar that lines attach to: a node's own seal, or for a
  // nested family unit, the blood child's seal (first in its couple)
  function anchorAvatar(el) {
    if (el.classList.contains("fu")) {
      var couple = children(el, ".fu-couple")[0];
      var first = couple ? children(couple, ".k-node, .p-node")[0] : null;
      return first ? first.querySelector(".avatar") : null;
    }
    return el.querySelector(".avatar");
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
      var a = box(nodes[0].querySelector(".avatar"), chart);
      var b = box(nodes[1].querySelector(".avatar"), chart);
      return { a: a, b: b, x: (a.x + a.w + b.x) / 2, y: a.y + a.h / 2 };
    }
    if (nodes.length === 1) {
      var s = box(nodes[0], chart);
      var av = box(nodes[0].querySelector(".avatar"), chart);
      return { x: av.cx, y: s.y + s.h };            // below the name
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
      var av = anchorAvatar(k);
      if (!av) { return; }
      var bb = box(av, chart);
      var top = Math.round(bb.y);
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].top - top) < 6) { row = rows[i]; break; } }
      if (!row) { row = { top: top, xs: [] }; rows.push(row); }
      row.xs.push(bb.cx);
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

    var startX = g.x, prevY = g.y;
    rows.forEach(function (row) {
      var barY = row.top - BAR_GAP;
      var minX = Math.min.apply(null, row.xs.concat([startX]));
      var maxX = Math.max.apply(null, row.xs.concat([startX]));
      svg.appendChild(path("M" + startX + " " + prevY + " L" + startX + " " + barY, "ln-spine"));
      if (row.xs.length > 1 || Math.abs(row.xs[0] - startX) > 1) {
        svg.appendChild(path("M" + minX + " " + barY + " L" + maxX + " " + barY, "ln-bar"));
      }
      row.xs.forEach(function (x) {
        svg.appendChild(path("M" + x + " " + barY + " L" + x + " " + row.top, "ln-tick"));
      });
      svg.appendChild(dot(startX, barY));
      prevY = barY;
    });
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

  return { draw: draw, drawAll: drawAll };
});
