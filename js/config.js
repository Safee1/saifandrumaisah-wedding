// The site's settings, in one place, read by every page that needs them.
// Change these here only (and bump ?v= on every page, as usual).
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.WeddingConfig = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  return {
    // The wedding date once confirmed, e.g. "2027-08-23T15:00:00+08:00".
    // Empty = "date to be confirmed" stays and no countdown shows.
    date: "",

    // Abroad-wedding travel checklist (home page) + reply-by note (RSVP page).
    // show: false hides both from guests; preview privately with ?travel=preview.
    // destination e.g. "Bali"; country = the name GOV.UK uses, e.g. "Indonesia".
    travel: { show: false, destination: "", country: "" },

    // "Save the date — coming soon" teaser (home page).
    // at: an ISO timestamp to count down to a reveal moment, or null for no
    // countdown (just the "revealing soon" line). Never the real wedding
    // date/venue — those only ever come from `date`/`travel` above, and
    // only once `show` is true.
    // show: false keeps the teaser up (no date, no venue, no country shown
    // anywhere). Flip to true only once `date` and `travel` are filled in —
    // that's what actually makes the real details appear.
    reveal: { at: null, show: false }
  };
}));
