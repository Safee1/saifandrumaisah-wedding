(function (root) {
  "use strict";

  var TINTS = ["t1", "t2", "t3", "t4"];

  function initialsFor(name) {
    var words = name.trim().split(/\s+/);
    if (words.length > 1 && words[0] && words[1]) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return name.trim().charAt(0).toUpperCase();
  }

  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) { el.className = className; }
    if (text != null) { el.textContent = text; }
    return el;
  }

  function makeNode(member, tint) {
    var node = makeEl("div", "node");
    var size = member.isKid ? "small" : "med";
    var avatar = makeEl("div", "avatar " + size + " " + tint, initialsFor(member.name));
    avatar.setAttribute("aria-hidden", "true");
    node.appendChild(avatar);

    var nameEl = makeEl("p", "node-name", member.name);
    nameEl.style.margin = "5px 0 0";
    if (member.isKid) {
      var star = makeEl("span", "kid-star", "\u2726");
      star.setAttribute("aria-hidden", "true");
      nameEl.appendChild(star);
    }
    node.appendChild(nameEl);

    if (member.relationship) {
      var relEl = makeEl("p", "node-rel", member.relationship);
      relEl.style.margin = "0";
      node.appendChild(relEl);
    }
    return node;
  }

  function makeRow(members, tint) {
    var row = makeEl("div", "row");
    members.forEach(function (member) {
      row.appendChild(makeNode(member, tint));
    });
    return row;
  }

  function renderSide(familyData, targetId, guests) {
    var container = document.getElementById(targetId);
    container.textContent = "";
    var groups = familyData.groupByFamily(guests);
    if (!groups.length) {
      container.appendChild(makeEl("p", "status", "names coming soon\u2026"));
      return;
    }
    groups.forEach(function (group, index) {
      var tint = TINTS[index % TINTS.length];
      var familyEl = makeEl("div", "family");
      familyEl.appendChild(makeEl("h3", "family-name", group.family));

      var split = familyData.splitRows(group.members);
      if (split.parents.length) {
        familyEl.appendChild(makeRow(split.parents, tint));
        if (split.children.length) {
          var stub = makeEl("div", "fam-stub");
          stub.setAttribute("aria-hidden", "true");
          var bar = makeEl("div", "fam-bar");
          bar.setAttribute("aria-hidden", "true");
          familyEl.appendChild(stub);
          familyEl.appendChild(bar);
        }
      }
      if (split.children.length) {
        familyEl.appendChild(makeRow(split.children, tint));
      }
      container.appendChild(familyEl);
    });
  }

  function showError(targetId) {
    var container = document.getElementById(targetId);
    container.textContent = "";
    container.appendChild(
      makeEl("p", "status", "couldn\u2019t load this side right now \u2014 please try again in a few minutes")
    );
  }

  function run(familyData, sources) {
    sources.forEach(function (source) {
      fetch(source.url)
        .then(function (response) {
          if (!response.ok) { throw new Error("HTTP " + response.status); }
          return response.text();
        })
        .then(function (text) {
          var guests = familyData.rowsToGuests(familyData.parseCsv(text));
          renderSide(familyData, source.targetId, guests);
        })
        .catch(function () {
          showError(source.targetId);
        });
    });
  }

  root.FamilyRender = { run: run };
})(typeof self !== "undefined" ? self : this);
