(function (root) {
  "use strict";

  var TINTS = { saif: "t1", rumaisah: "t2" };

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

  function assignGenerations(people, graph) {
    var gen = {};
    people.forEach(function (p) { gen[p.id] = 0; });

    var changed = true;
    var guard = 0;
    var maxGuard = people.length * 4 + 10;
    while (changed && guard < maxGuard) {
      changed = false;
      guard += 1;
      people.forEach(function (p) {
        graph.childrenOf[p.id].forEach(function (childId) {
          if (graph.byId[childId] && gen[childId] < gen[p.id] + 1) {
            gen[childId] = gen[p.id] + 1;
            changed = true;
          }
        });
        var spouseId = graph.spouseOf[p.id];
        if (spouseId != null && graph.byId[spouseId] && gen[spouseId] !== gen[p.id]) {
          var shared = Math.max(gen[spouseId], gen[p.id]);
          if (gen[spouseId] !== shared) { gen[spouseId] = shared; changed = true; }
          if (gen[p.id] !== shared) { gen[p.id] = shared; changed = true; }
        }
      });
    }
    return gen;
  }

  // Keeps each family branch visually clustered together within a generation
  // row (rather than interleaved alphabetically), so a wide row wraps at a
  // family boundary instead of splitting siblings apart.
  function computeClusterKeys(people, graph) {
    var key = {};
    var visiting = {};

    function keyFor(id) {
      if (key[id] != null) { return key[id]; }
      if (visiting[id]) { return graph.byId[id].name; }
      visiting[id] = true;
      var parents = graph.parentsOf[id].filter(function (pid) { return graph.byId[pid]; });
      var result;
      if (!parents.length) {
        var spouseId = graph.spouseOf[id];
        var names = [graph.byId[id].name];
        if (spouseId && graph.byId[spouseId]) { names.push(graph.byId[spouseId].name); }
        result = names.sort()[0];
      } else {
        var parentKeys = parents.map(keyFor).sort();
        result = parentKeys[0];
      }
      visiting[id] = false;
      key[id] = result;
      return result;
    }

    people.forEach(function (p) { keyFor(p.id); });
    return key;
  }

  function groupIntoHouseholds(people, gen, graph) {
    var clusterKey = computeClusterKeys(people, graph);
    var byGen = {};
    people.forEach(function (p) {
      var g = gen[p.id];
      if (!byGen[g]) { byGen[g] = []; }
      byGen[g].push(p);
    });

    var placed = {};
    var householdsByGen = {};

    Object.keys(byGen).forEach(function (g) {
      var rowPeople = byGen[g].slice().sort(function (a, b) {
        var ck = clusterKey[a.id].localeCompare(clusterKey[b.id]);
        return ck !== 0 ? ck : a.name.localeCompare(b.name);
      });
      var households = [];
      rowPeople.forEach(function (p) {
        if (placed[p.id]) { return; }
        var spouseId = graph.spouseOf[p.id];
        var spouse = spouseId && graph.byId[spouseId] && gen[spouseId] === gen[p.id] ? graph.byId[spouseId] : null;
        placed[p.id] = true;
        var members = [p];
        if (spouse && !placed[spouse.id]) {
          placed[spouse.id] = true;
          members.push(spouse);
        }
        households.push({ members: members });
      });
      householdsByGen[g] = households;
    });

    return householdsByGen;
  }

  function personNode(person, opts) {
    opts = opts || {};
    var node = makeEl("div", "tn-person" + (opts.hero ? " tn-hero" : ""));
    var size = opts.hero ? "large" : (person.is_kid ? "small" : "med");
    var avatar = makeEl("div", "avatar " + size + " " + TINTS[person.side], initialsFor(person.name));
    avatar.setAttribute("aria-hidden", "true");
    node.appendChild(avatar);
    var name = makeEl("p", opts.hero ? "tn-name tn-name-hero" : "tn-name", person.name);
    if (person.is_kid) {
      var star = makeEl("span", "kid-star", "✦");
      star.setAttribute("aria-hidden", "true");
      name.appendChild(star);
    }
    if (opts.tag) {
      var t = makeEl("span", "tag", opts.tag);
      name.appendChild(t);
    }
    node.appendChild(name);
    if (opts.caption) {
      node.appendChild(makeEl("p", "tn-caption", opts.caption));
    }
    node.dataset.personId = person.id;
    return node;
  }

  function heartIcon(sizeClass) {
    var heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    heart.setAttribute("class", "tn-heart" + (sizeClass ? " " + sizeClass : ""));
    heart.setAttribute("viewBox", "0 0 24 24");
    heart.setAttribute("fill", "currentColor");
    heart.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#heart-shape");
    heart.appendChild(use);
    return heart;
  }

  function renderColumn(colEl, sidePeople, sideRelationships, personOpts, householdEls) {
    var graph = buildGraph(sidePeople, sideRelationships);
    var gen = assignGenerations(sidePeople, graph);
    var householdsByGen = groupIntoHouseholds(sidePeople, gen, graph);
    var gens = Object.keys(householdsByGen).map(Number).sort(function (a, b) { return a - b; });

    var rowsWrap = makeEl("div", "tn-rows");
    colEl.appendChild(rowsWrap);

    gens.forEach(function (g) {
      var row = makeEl("div", "tn-row");
      householdsByGen[g].forEach(function (household) {
        var isHero = household.members.some(function (p) {
          return personOpts && personOpts[p.id] && personOpts[p.id].hero;
        });
        var hh = makeEl("div", "tn-household" + (isHero ? " tn-household-hero" : ""));
        household.members.forEach(function (person) {
          var opts = (personOpts && personOpts[person.id]) || {};
          var node = personNode(person, opts);
          hh.appendChild(node);
          householdEls[person.id] = hh;
        });
        if (household.members.length === 2) {
          var heartWrap = makeEl("span", "tn-heart-wrap");
          heartWrap.appendChild(heartIcon());
          hh.insertBefore(heartWrap, hh.children[1]);
        }
        row.appendChild(hh);
      });
      rowsWrap.appendChild(row);
    });

    return { graph: graph, people: sidePeople };
  }

  function render(container, data, personOpts) {
    container.textContent = "";

    if (!data.people.length) {
      container.appendChild(makeEl("p", "status", "the tree is just getting started…"));
      return;
    }

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tn-links");
    svg.setAttribute("aria-hidden", "true");
    container.appendChild(svg);

    var cols = makeEl("div", "tn-cols");
    container.appendChild(cols);

    var saifPeople = data.people.filter(function (p) { return p.side === "saif"; });
    var rumaisahPeople = data.people.filter(function (p) { return p.side === "rumaisah"; });

    function sameSideRels(people) {
      var ids = {};
      people.forEach(function (p) { ids[p.id] = true; });
      return data.relationships.filter(function (r) { return ids[r.from_person] && ids[r.to_person]; });
    }

    var householdEls = {};

    var saifCol = makeEl("div", "tn-col");
    var saifLabel = makeEl("h3", "tn-col-label", "Saif's side");
    saifCol.appendChild(saifLabel);
    renderColumn(saifCol, saifPeople, sameSideRels(saifPeople), personOpts, householdEls);

    var rumaisahCol = makeEl("div", "tn-col");
    var rumaisahLabel = makeEl("h3", "tn-col-label", "Rumaisah's side");
    rumaisahCol.appendChild(rumaisahLabel);
    renderColumn(rumaisahCol, rumaisahPeople, sameSideRels(rumaisahPeople), personOpts, householdEls);

    cols.appendChild(saifCol);
    cols.appendChild(rumaisahCol);

    var fullGraph = buildGraph(data.people, data.relationships);

    function drawConnectors() {
      var containerRect = container.getBoundingClientRect();
      svg.setAttribute("width", containerRect.width);
      svg.setAttribute("height", container.scrollHeight);
      svg.setAttribute("viewBox", "0 0 " + containerRect.width + " " + container.scrollHeight);
      while (svg.firstChild) { svg.removeChild(svg.firstChild); }

      function rectOf(personId) {
        var hh = householdEls[personId];
        if (!hh) { return null; }
        var r = hh.getBoundingClientRect();
        return {
          cx: r.left + r.width / 2 - containerRect.left,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
          left: r.left - containerRect.left,
          right: r.right - containerRect.left
        };
      }

      data.people.forEach(function (child) {
        var parentIds = fullGraph.parentsOf[child.id].filter(function (id) { return householdEls[id]; });
        if (!parentIds.length) { return; }
        var childPt = rectOf(child.id);
        if (!childPt) { return; }
        var startX, startY;
        if (parentIds.length >= 2) {
          var a = rectOf(parentIds[0]);
          var b = rectOf(parentIds[1]);
          if (!a || !b) { return; }
          startX = (a.cx + b.cx) / 2;
          startY = Math.max(a.bottom, b.bottom);
        } else {
          var p = rectOf(parentIds[0]);
          if (!p) { return; }
          startX = p.cx;
          startY = p.bottom;
        }
        var endX = childPt.cx, endY = childPt.top;
        var midY = startY + (endY - startY) * 0.55;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M " + startX + " " + startY + " C " + startX + " " + midY + ", " + endX + " " + midY + ", " + endX + " " + endY);
        path.setAttribute("class", "tn-link");
        svg.appendChild(path);
      });
    }

    requestAnimationFrame(function () { requestAnimationFrame(drawConnectors); });
    window.addEventListener("resize", debounce(drawConnectors, 150));
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  root.FamilyTree = { render: render, buildGraph: buildGraph, assignGenerations: assignGenerations };
})(typeof self !== "undefined" ? self : this);
