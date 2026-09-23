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

    // Partial "revealing soon" teaser (home page): country + month/year can
    // be shown now, the exact day and venue stay sealed until later.
    // at: an ISO timestamp to count down to the full reveal moment, or null
    // for no countdown.
    // country/month: safe to announce now — set them and they show on the
    // home page teaser. day/venue: leave null until confirmed; setting
    // `day` (e.g. "23") and `venue` (e.g. "Some Resort") completes that
    // piece of the reveal without needing a code change.
    // show: false keeps the FULL reveal (this `reveal` block entirely,
    // including country/month) behind the wax-seal teaser copy. Flip to
    // true only once `date` and `travel` above are filled in — that's what
    // actually makes the real details replace the teaser everywhere.
    reveal: {
      at: null,
      show: false,
      country: "Egypt",
      month: "July 2027",
      day: null,
      venue: null
    }
  };
}));
