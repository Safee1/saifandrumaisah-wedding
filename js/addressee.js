// The name on the envelope (?to=Ammi+%26+Abu). Pure logic, no DOM, so it
// can be tested in node; index.html applies the result.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Addressee = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  var MAX = 40;
  var CONTROL = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]", "g");

  // Trim, collapse runs of whitespace, drop control characters; null when
  // nothing usable is left or the result is too long to fit an envelope.
  function clean(raw) {
    if (typeof raw !== "string") { return null; }
    // whitespace first (a tab is a control character too) so "a\tb" keeps its gap
    var s = raw.replace(/\s+/g, " ").replace(CONTROL, "").trim();
    if (!s || s.length > MAX) { return null; }
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
