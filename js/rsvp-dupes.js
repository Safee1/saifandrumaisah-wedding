// Duplicate-RSVP detection for rsvp-admin.html. Pure logic, no DOM, so it
// can be tested in node; rsvp-admin.html applies the result to render badges,
// totals and the CSV.
//
// The rule (a too-low headcount means too few rooms, so it leans to counting):
//  - a reply is a RE-SEND, left out of the totals, only when BOTH its name and
//    its contact match a newer reply;
//  - a match on the name alone or the contact alone (two cousins with one
//    name, one relative replying for two households on their own phone) is
//    only FLAGGED as a possible duplicate and is STILL COUNTED.
// Known limits, all leaning to counting: a re-send with a different contact
// or a corrected name spelling counts twice (flagged when the name matches);
// a non-UK number typed once with its country code and once in local form is
// not matched. And one that leans the other way: someone replying twice
// under their OWN name and contact for two households is read as a re-send,
// so "Earlier reply, not counted" rows deserve a glance.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.RsvpDupes = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var has = Object.prototype.hasOwnProperty;

  // Case-, whitespace- and punctuation-insensitive name key: lowercase,
  // strip anything that isn't a letter, a digit or a combining mark, collapse
  // to single spaces. Marks are kept because in Devanagari, Bengali and
  // Arabic scripts they carry the vowels: dropping them would turn two
  // different names into the same bare consonants. NFC first so the same
  // name typed with composed or decomposed accents compares equal.
  function normalizeName(name) {
    if (!name) { return ""; }
    return String(name)
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeEmail(s) {
    return String(s).trim().toLowerCase();
  }

  // Digits only, then strip the international prefix (00), the UK country
  // code (44) and the trunk 0, so "+447911123456", "00447911123456",
  // "447911123456", "+44 (0)7911 123456" and "07911123456" all collapse to
  // the same key.
  function normalizePhone(s) {
    var digits = String(s).replace(/\D/g, "");
    if (!digits) { return ""; }
    if (digits.indexOf("00") === 0) { digits = digits.slice(2); }
    if (digits.indexOf("44") === 0 && digits.length > 10) {
      digits = digits.slice(2);
      if (digits.indexOf("0") === 0) { digits = digits.slice(1); }
    } else if (digits.indexOf("0") === 0) {
      digits = digits.slice(1);
    }
    return digits;
  }

  // Digits typed in another script (Arabic-Indic, Persian/Urdu, Devanagari,
  // Bengali, Gurmukhi, Gujarati, full-width) become 0-9, so the same number
  // typed on two keyboards gives the same key. The RSVP form accepts these.
  // Keep this list the same as the translate() in the headcount SQL.
  var DIGIT_ZEROS = [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0xFF10];
  var OTHER_DIGITS = /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\uFF10-\uFF19]/g;
  function asciiDigits(s) {
    return String(s).replace(OTHER_DIGITS, function (c) {
      var cp = c.charCodeAt(0);
      for (var i = 0; i < DIGIT_ZEROS.length; i++) {
        if (cp >= DIGIT_ZEROS[i] && cp <= DIGIT_ZEROS[i] + 9) { return String(cp - DIGIT_ZEROS[i]); }
      }
      return c;
    });
  }

  function digitCount(s) { return s.replace(/\D/g, "").length; }

  // No phone number has more than 15 digits, so a longer run is two or more
  // numbers typed with only spaces between them. Cut it at a space where the
  // number so far is already 7+ digits and the next piece starts with 0, or
  // would take it past 15 digits. A run of 15 digits or fewer is left whole.
  function splitLongRun(run) {
    if (digitCount(run) <= 15) { return [run]; }
    var out = [], cur = "", curDigits = 0;
    run.split(/\s+/).forEach(function (piece) {
      var d = digitCount(piece);
      if (curDigits >= 7 && (/^\(?0/.test(piece) || curDigits + d > 15)) {
        out.push(cur); cur = ""; curDigits = 0;
      }
      cur += (cur ? " " : "") + piece;
      curDigits += d;
    });
    if (cur) { out.push(cur); }
    return out;
  }

  // Every matchable key in a free-text "email or phone" field, as
  // "email:..." / "phone:..." strings. The field can hold both, or a number
  // with a word after it ("07... (mum)"), so each email and each run of
  // 7+ digits is picked out on its own.
  function contactKeys(contact) {
    if (!contact) { return []; }
    var s = asciiDigits(contact);
    var keys = [];
    function add(k) { if (keys.indexOf(k) === -1) { keys.push(k); } }
    var rest = s.replace(/[^\s@<>(),;:]+@[^\s@<>(),;:]+/g, function (m) {
      var email = normalizeEmail(m).replace(/[.]+$/, "");
      if (email) { add("email:" + email); }
      return " ";
    });
    (rest.match(/\+?\d[\d\s().\-]*\d/g) || []).forEach(function (run) {
      splitLongRun(run).forEach(function (m) {
        if (digitCount(m) < 7) { return; }
        var phone = normalizePhone(m);
        if (phone) { add("phone:" + phone); }
      });
    });
    return keys;
  }

  // Classifies a contact field into its first matchable key, or null when
  // there is nothing usable in it.
  function classifyContact(contact) {
    if (!contact) { return null; }
    var s = String(contact).trim();
    if (!s) { return null; }
    var keys = contactKeys(s);
    if (!keys.length) { return null; }
    var i = keys[0].indexOf(":");
    return { type: keys[0].slice(0, i), key: keys[0].slice(i + 1) };
  }

  function time(row) {
    var t = new Date(row.created_at).getTime();
    return isNaN(t) ? -Infinity : t;
  }

  // Returns an array parallel to `rows`, each entry:
  //   { row, isKeeper, duplicateOf, groupSize, possibleDuplicateOf }
  // isKeeper false = an earlier re-send (same name AND same contact as a
  //   newer reply): left out of the totals. duplicateOf is then
  //   { name, created_at } of the newest reply in that group, else null.
  // groupSize = how many replies are in the re-send group (1 = none).
  // possibleDuplicateOf = for COUNTED rows only, the other counted rows that
  //   share just the name or just the contact:
  //   [{ name, created_at, sameName, sameContact }]. These stay in the totals.
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

    var nameKeys = rows.map(function (row) { return normalizeName(row.name); });
    var ckeys = rows.map(function (row) { return contactKeys(row.contact); });

    // re-sends: same name AND a shared contact key
    var pairToIdx = {};
    rows.forEach(function (row, idx) {
      if (!nameKeys[idx]) { return; }
      ckeys[idx].forEach(function (ck) {
        var pk = nameKeys[idx] + "\n" + ck;
        if (has.call(pairToIdx, pk)) { union(idx, pairToIdx[pk]); }
        else { pairToIdx[pk] = idx; }
      });
    });

    var groups = {};
    rows.forEach(function (row, idx) {
      var r = find(idx);
      if (!groups[r]) { groups[r] = []; }
      groups[r].push(idx);
    });

    var result = rows.map(function (row) {
      return { row: row, isKeeper: true, duplicateOf: null, groupSize: 1, possibleDuplicateOf: [] };
    });

    Object.keys(groups).forEach(function (rootKey) {
      var idxs = groups[rootKey];
      if (idxs.length <= 1) { return; }
      var keeperIdx = idxs[0];
      idxs.forEach(function (idx) {
        if (time(rows[idx]) > time(rows[keeperIdx])) { keeperIdx = idx; }
      });
      idxs.forEach(function (idx) {
        result[idx].groupSize = idxs.length;
        if (idx !== keeperIdx) {
          result[idx].isKeeper = false;
          result[idx].duplicateOf = { name: rows[keeperIdx].name, created_at: rows[keeperIdx].created_at };
        }
      });
    });

    // possible duplicates among the counted rows: name-only or contact-only
    var byName = {}, byContact = {};
    function bucket(map, key, idx) {
      if (!has.call(map, key)) { map[key] = []; }
      map[key].push(idx);
    }
    rows.forEach(function (row, idx) {
      if (!result[idx].isKeeper) { return; }
      if (nameKeys[idx]) { bucket(byName, nameKeys[idx], idx); }
      ckeys[idx].forEach(function (ck) { bucket(byContact, ck, idx); });
    });
    rows.forEach(function (row, idx) {
      if (!result[idx].isKeeper) { return; }
      var others = {};
      var order = [];
      function note(j, field) {
        if (j === idx) { return; }
        if (!has.call(others, j)) { others[j] = { sameName: false, sameContact: false }; order.push(j); }
        others[j][field] = true;
      }
      if (nameKeys[idx]) { byName[nameKeys[idx]].forEach(function (j) { note(j, "sameName"); }); }
      ckeys[idx].forEach(function (ck) { byContact[ck].forEach(function (j) { note(j, "sameContact"); }); });
      order.sort(function (a, b) { return a - b; });
      result[idx].possibleDuplicateOf = order.map(function (j) {
        return {
          name: rows[j].name, created_at: rows[j].created_at,
          sameName: others[j].sameName, sameContact: others[j].sameContact
        };
      });
    });

    return result;
  }

  // Counts for the admin page: how many replies are left out as re-sends and
  // how many are flagged as possible duplicates but still counted.
  function summarize(entries) {
    var out = { counted: 0, excluded: 0, flagged: 0 };
    entries.forEach(function (e) {
      if (!e.isKeeper) { out.excluded += 1; return; }
      out.counted += 1;
      if (e.possibleDuplicateOf && e.possibleDuplicateOf.length) { out.flagged += 1; }
    });
    return out;
  }

  // The plain-English line under the totals. "" when there is nothing to say.
  function summaryText(entries) {
    var s = summarize(entries);
    if (!s.excluded && !s.flagged) { return ""; }
    var a = s.excluded === 0 ? "No replies are left out of the totals."
      : s.excluded === 1 ? "1 earlier reply is left out of the totals because the same person sent a newer one (same name and same contact)."
      : s.excluded + " earlier replies are left out of the totals because the same person sent a newer one (same name and same contact).";
    var b = s.flagged === 0 ? "No other replies look like duplicates."
      : s.flagged === 1 ? "1 reply shares a name or a contact with another reply: it is flagged below and still counted."
      : s.flagged + " replies share a name or a contact with another reply: they are flagged below and still counted. Delete one only if it really is the same people twice.";
    return a + " " + b;
  }

  // "same name as X; same contact as Y" for a flagged row's note and the CSV.
  function flagText(entry) {
    return (entry.possibleDuplicateOf || []).map(function (o) {
      var why = o.sameName && o.sameContact ? "same name and contact as "
        : o.sameName ? "same name as " : "same contact as ";
      return why + o.name;
    }).join("; ");
  }

  return {
    normalizeName: normalizeName,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    contactKeys: contactKeys,
    classifyContact: classifyContact,
    groupDuplicates: groupDuplicates,
    summarize: summarize,
    summaryText: summaryText,
    flagText: flagText
  };
}));
