// A time limit for network calls. Every form and the tree load used to wait
// for ever if the server never answered (a stalled phone connection, a
// paused database): the button stayed on "Sending..." until a reload lost the
// guest's typing. withTimeout() gives each call a ceiling and rejects with
// an error whose .timeout flag is true so the page can say something kind.
// Pure logic, no DOM, so it runs in node tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Net = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_MS = 15000;

  // run(signal) starts the request and returns a promise; the signal (or
  // undefined on very old browsers) lets the request itself be cancelled.
  // Anything that throws synchronously inside run() becomes a rejection.
  function withTimeout(run, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (ctl) { try { ctl.abort(); } catch (e) { /* already settled */ } }
        var err = new Error("This is taking longer than usual.");
        err.timeout = true;
        reject(err);
      }, ms || DEFAULT_MS);
      Promise.resolve().then(function () { return run(ctl ? ctl.signal : undefined); }).then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (error) { clearTimeout(timer); reject(error); }
      );
    });
  }

  function isTimeout(error) { return !!(error && error.timeout === true); }

  return { withTimeout: withTimeout, isTimeout: isTimeout, DEFAULT_MS: DEFAULT_MS };
}));
