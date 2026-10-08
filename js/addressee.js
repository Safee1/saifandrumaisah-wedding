// The name on the envelope (?to=Ammi+%26+Abu). Pure logic, no DOM, so it
// can be tested in node; index.html applies the result.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Addressee = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  var MAX = 40;
  var CONTROL = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]", "g");
  // Invisible characters that flip text direction or hide text (right-to-left
  // override, isolates, the byte-order mark) plus the C1 control block.
  var HIDDEN = /[‎‏‪-‮⁦-⁩﻿\u0080-\u009F­]/g;
  // What a name on an envelope may be made of: letters (any script), their
  // combining marks, the joiners Urdu and Hindi need, spaces, and the
  // punctuation of "Ammi & Abu", "Dr. Khan", "O'Brien", "Al-Fahad".
  // Anything else (digits, links, markup, emoji) is not a name, so the
  // envelope falls back to its default instead of showing it. Older
  // browsers that cannot compile this pattern keep the permissive rule.
  var ALLOWED = null;
  try { ALLOWED = new RegExp("^[\\p{L}\\p{M}\\u200C\\u200D '\\u2019&.,\\-]+$", "u"); } catch (e) { ALLOWED = null; }

  // Trim, collapse runs of whitespace, drop control and direction-changing
  // characters; null when nothing usable is left, the result is too long to
  // fit an envelope, or it is not shaped like a name.
  function clean(raw) {
    if (typeof raw !== "string") { return null; }
    // whitespace first (a tab is a control character too) so "a\tb" keeps its gap
    var s = raw.replace(/\s+/g, " ").replace(CONTROL, "").replace(HIDDEN, "").replace(/\s+/g, " ").trim();
    if (!s || s.length > MAX) { return null; }
    if (ALLOWED && !ALLOWED.test(s)) { return null; }
    if (/\.\S/.test(s)) { return null; }   // "free.gift.example" is a link, not a name
    return s;
  }

  // Which size the script line needs so "for <name>" clears the wax seal:
  // "" for a short name, "long" for a longer one, "xlong" for the longest.
  function sizeClass(name) {
    var n = ("for " + (name || "")).length;
    if (n <= 18) { return ""; }
    if (n <= 28) { return "long"; }
    return "xlong";
  }

  return { clean: clean, sizeClass: sizeClass, MAX: MAX };
}));
