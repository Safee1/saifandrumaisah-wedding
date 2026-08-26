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

  function drawUnit(fu, chart, svg) {
    var couple = children(fu, ".fu-couple")[0];
    var kidsEl = children(fu, ".fu-kids")[0];
    if (!couple) { return; }

    var nodes = children(couple, ".k-node, .p-node");
    var rootDot = children(couple, ".fu-rootdot")[0];
    var startX, startY;

    if (nodes.length === 2) {
      var a = box(nodes[0].querySelector(".avatar"), chart);
      var b = box(nodes[1].querySelector(".avatar"), chart);
      var y = a.y + a.h / 2;
      // marriage line between the two seals
      svg.appendChild(path("M" + (a.x + a.w) + " " + y + " L" + b.x + " " + y, "ln-marriage"));
      startX = (a.x + a.w + b.x) / 2;
      startY = y;
    } else if (nodes.length === 1) {
      var s = box(nodes[0], chart);
      var av = box(nodes[0].querySelector(".avatar"), chart);
      startX = av.cx;
      startY = s.y + s.h;      // below the name
    } else if (rootDot) {
      var r = box(rootDot, chart);
      startX = r.cx;
      startY = r.y + r.h;
    } else {
      return;
    }

    if (!kidsEl) { return; }
    var kids = children(kidsEl, ".k-node, .fu");
    if (!kids.length) { return; }

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

    var prevY = startY;
    rows.forEach(function (row) {
      var barY = row.top - BAR_GAP;
      var minX = Math.min.apply(null, row.xs.concat([startX]));
      var maxX = Math.max.apply(null, row.xs.concat([startX]));
      // spine down to this row's bar (behind any seals it passes)
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
    var units = chart.querySelectorAll(".fu");
    for (var i = 0; i < units.length; i++) {
      // a hidden unit (folded dup) has no boxes to measure
      if (units[i].offsetWidth) { drawUnit(units[i], chart, svg); }
    }
  }

  function drawAll(scope) {
    var charts = scope.querySelectorAll(".chart");
    for (var i = 0; i < charts.length; i++) { draw(charts[i]); }
  }

  return { draw: draw, drawAll: drawAll };
});
