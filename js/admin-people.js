// Admin helper: the "people" list with a child / adult switch for each person.
// Pure data helpers (sort, filter, labels) live here so node tests can run them;
// the DOM part only uses textContent.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.AdminPeople = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // alphabetical, ignoring case; people with the same name keep a stable order by id
  function sortPeople(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var an = String(a.name || "").toLowerCase(), bn = String(b.name || "").toLowerCase();
      if (an < bn) { return -1; }
      if (an > bn) { return 1; }
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function filterPeople(rows, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) { return rows; }
    return rows.filter(function (r) { return String(r.name || "").toLowerCase().indexOf(q) !== -1; });
  }

  function sideLabel(side) { return side === "saif" ? "Saif's side" : "Rumaisah's side"; }

  function buttonLabel(row) { return row.is_kid ? "Mark as adult" : "Mark as child"; }

  // Builds the list into `container`. onToggle(row, nextIsKid, button) does the saving.
  function render(container, rows, onToggle) {
    container.textContent = "";
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No one to show.";
      container.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "item";
      var info = document.createElement("div");
      info.className = "item-info";
      var kind = document.createElement("p");
      kind.className = "item-kind" + (row.is_kid ? " yes" : "");
      kind.textContent = sideLabel(row.side) + (row.is_kid ? " · shown as “Little one”" : " · shown by name");
      var main = document.createElement("p");
      main.className = "item-main";
      main.textContent = row.name;
      info.appendChild(kind);
      info.appendChild(main);
      var actions = document.createElement("div");
      actions.className = "item-actions";
      var btn = document.createElement("button");
      btn.className = row.is_kid ? "btn-delete" : "btn-approve";
      btn.textContent = buttonLabel(row);
      btn.setAttribute("aria-label", buttonLabel(row) + ": " + row.name);
      btn.addEventListener("click", function () { onToggle(row, !row.is_kid, btn); });
      actions.appendChild(btn);
      item.appendChild(info);
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  return { sortPeople: sortPeople, filterPeople: filterPeople, sideLabel: sideLabel, buttonLabel: buttonLabel, render: render };
}));
