(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FamilyData = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(value) {
    return (value || "").trim().toLowerCase();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    var c;
    text = text || "";
    while (i < text.length) {
      c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i += 1;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i += 1;
        continue;
      }
      if (c === "\r") {
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
    row.push(field);
    rows.push(row);
    while (rows.length && rows[rows.length - 1].every(function (f) { return f.trim() === ""; })) {
      rows.pop();
    }
    return rows;
  }

  function findHeaderRow(rows) {
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (normalize(rows[r][c]) === "guest name") {
          return r;
        }
      }
    }
    return -1;
  }

  function mapColumns(headerRow) {
    var cols = {};
    headerRow.forEach(function (heading, idx) {
      var key = normalize(heading);
      if (key === "guest name") {
        cols.name = idx;
      } else if (key === "family") {
        cols.family = idx;
      } else if (key === "relationship") {
        cols.relationship = idx;
      } else if (key.indexOf("kid") !== -1) {
        cols.kid = idx;
      } else if (key === "tree row") {
        cols.treeRow = idx;
      }
    });
    return cols;
  }

  function rowsToGuests(rows) {
    var headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) {
      return [];
    }
    var cols = mapColumns(rows[headerIdx]);
    if (cols.name == null) {
      return [];
    }
    var guests = [];
    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r];
      var name = (row[cols.name] || "").trim();
      if (!name) {
        continue;
      }
      guests.push({
        name: name,
        family: cols.family != null ? (row[cols.family] || "").trim() : "",
        relationship: cols.relationship != null ? (row[cols.relationship] || "").trim() : "",
        isKid: cols.kid != null ? normalize(row[cols.kid]) === "yes" : false,
        treeRow: cols.treeRow != null ? normalize(row[cols.treeRow]) : ""
      });
    }
    return guests;
  }

  function groupByFamily(guests) {
    var order = [];
    var byName = {};
    guests.forEach(function (guest) {
      if (!guest.family) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(byName, guest.family)) {
        byName[guest.family] = [];
        order.push(guest.family);
      }
      byName[guest.family].push(guest);
    });
    return order.map(function (family) {
      return { family: family, members: byName[family] };
    });
  }

  function splitRows(members) {
    var parents = members.filter(function (m) {
      return m.treeRow === "p" || m.treeRow.indexOf("parent") === 0;
    });
    if (!parents.length) {
      return { parents: [], children: members.slice() };
    }
    var children = members.filter(function (m) {
      return parents.indexOf(m) === -1;
    });
    return { parents: parents, children: children };
  }

  return {
    parseCsv: parseCsv,
    findHeaderRow: findHeaderRow,
    rowsToGuests: rowsToGuests,
    groupByFamily: groupByFamily,
    splitRows: splitRows
  };
});
