(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Countdown = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function remaining(nowMs, targetMs) {
    var diff = targetMs - nowMs;
    if (diff <= 0) {
      return { past: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
    var s = Math.floor(diff / 1000);
    return {
      past: false,
      days: Math.floor(s / 86400),
      hours: Math.floor((s % 86400) / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60
    };
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // deps: {
  //   getNow: () => ms epoch,
  //   setIntervalFn: (fn, ms) => id,
  //   pastText: string shown once the date has passed,
  //   elements: { wrap, fallback, days, hours, minutes, seconds }
  // }
  // Returns the interval id, or null when targetIso is empty/invalid
  // (in which case nothing is touched and the fallback stays visible).
  function attach(targetIso, deps) {
    if (!targetIso) { return null; }
    var targetMs = Date.parse(targetIso);
    if (isNaN(targetMs)) { return null; }
    var els = deps.elements;

    function tick() {
      var r = remaining(deps.getNow(), targetMs);
      if (r.past) {
        els.wrap.hidden = true;
        els.fallback.hidden = false;
        els.fallback.textContent = deps.pastText || "just married";
        return false;
      }
      els.days.textContent = String(r.days);
      els.hours.textContent = pad(r.hours);
      els.minutes.textContent = pad(r.minutes);
      els.seconds.textContent = pad(r.seconds);
      return true;
    }

    els.fallback.hidden = true;
    els.wrap.hidden = false;
    tick();
    return deps.setIntervalFn(tick, 1000);
  }

  return { remaining: remaining, pad: pad, attach: attach };
});
