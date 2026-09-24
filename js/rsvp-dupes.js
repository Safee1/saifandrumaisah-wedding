// Duplicate-RSVP detection for rsvp-admin.html. Pure logic, no DOM, so it
// can be tested in node; rsvp-admin.html applies the result to render badges
// and exclude non-keeper rows from the headcount totals / CSV.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.RsvpDupes = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Case-, whitespace- and punctuation-insensitive name key: lowercase,
  // strip anything that isn't a letter or digit, collapse to single spaces.
  function normalizeName(name) {
    if (!name) { return ""; }
    return String(name)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeEmail(s) {
    return s.trim().toLowerCase();
  }

  // Digits only, then strip a leading UK country/trunk prefix (44 or 0) so
  // "+447911123456", "07911123456" and "447911123456" all collapse to the
  // same key.
  function normalizePhone(s) {
    var digits = String(s).replace(/\D/g, "");
    if (!digits) { return ""; }
    if (digits.indexOf("44") === 0 && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.indexOf("0") === 0) {
      digits = digits.slice(1);
    }
    return digits;
  }

  // Classifies a free-text "email or phone" contact field into a matchable
  // key, or null when there's nothing usable in it.
  function classifyContact(contact) {
    if (!contact) { return null; }
    var s = String(contact).trim();
    if (!s) { return null; }
    if (s.indexOf("@") !== -1) {
      var email = normalizeEmail(s);
      return email ? { type: "email", key: email } : null;
    }
    var phone = normalizePhone(s);
    return phone ? { type: "phone", key: phone } : null;
  }

  // Groups rows that share a normalized name OR a normalized contact
  // (email/phone), transitively, via union-find. Returns an array parallel
  // to `rows`, each entry: { row, isKeeper, duplicateOf, groupSize }.
  // duplicateOf is null for keepers/unique rows, else { name, created_at }
  // of the keeper. The keeper of a group is the row with the latest
  // created_at.
  function groupDuplicates(rows) {
    var n = rows.length;
    var parent = new Array(n);
    for (var i = 0; i < n; i++) { parent[i] = i; }

    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      var ra = find(a), rb = find(b);
      if (ra !== rb) { parent[ra] = rb; }
    }

    var nameKeyToIdx = {};
    var contactKeyToIdx = {};
    rows.forEach(function (row, idx) {
      var nameKey = normalizeName(row.name);
      if (nameKey) {
        if (Object.prototype.hasOwnProperty.call(nameKeyToIdx, nameKey)) {
          union(idx, nameKeyToIdx[nameKey]);
        } else {
          nameKeyToIdx[nameKey] = idx;
        }
      }
      var c = classifyContact(row.contact);
      if (c) {
        var ck = c.type + ":" + c.key;
        if (Object.prototype.hasOwnProperty.call(contactKeyToIdx, ck)) {
          union(idx, contactKeyToIdx[ck]);
        } else {
          contactKeyToIdx[ck] = idx;
        }
      }
    });

    var groups = {};
    rows.forEach(function (row, idx) {
      var root = find(idx);
      if (!groups[root]) { groups[root] = []; }
      groups[root].push(idx);
    });

    var result = rows.map(function (row) {
      return { row: row, isKeeper: true, duplicateOf: null, groupSize: 1 };
    });

    Object.keys(groups).forEach(function (rootKey) {
      var idxs = groups[rootKey];
      if (idxs.length <= 1) { return; }
      var keeperIdx = idxs[0];
      idxs.forEach(function (idx) {
        if (new Date(rows[idx].created_at).getTime() > new Date(rows[keeperIdx].created_at).getTime()) {
          keeperIdx = idx;
        }
      });
      idxs.forEach(function (idx) {
        result[idx].groupSize = idxs.length;
        if (idx !== keeperIdx) {
          result[idx].isKeeper = false;
          result[idx].duplicateOf = { name: rows[keeperIdx].name, created_at: rows[keeperIdx].created_at };
        }
      });
    });

    return result;
  }

  return {
    normalizeName: normalizeName,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    classifyContact: classifyContact,
    groupDuplicates: groupDuplicates
  };
}));
