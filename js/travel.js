// The travel checklist for an abroad wedding: pure date maths and the
// checklist copy, no DOM, so it runs in node tests. index.html renders it.
// Guests' ticks live only in their own browser (localStorage) — nothing
// is sent anywhere and no personal details are asked for.
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Travel = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  var REPLY_MONTHS_BEFORE = 3;   // "let us know 3 months in advance"
  var PASSPORT_MONTHS_AFTER = 6; // the common "6 months left" rule
  var TRIP_DAYS = 14;            // allow for a two-week trip after the day

  // "2027-08-23" or a full ISO timestamp -> a date at local midday (no DST edge)
  function parse(iso) {
    if (typeof iso !== "string") { return null; }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) { return null; }
    var d = new Date(+m[1], +m[2] - 1, +m[3], 12);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }

  // add whole months, clamping to the month's last day (31 Aug - 6 months = 28/29 Feb)
  function addMonths(date, n) {
    var y = date.getFullYear();
    var mo = date.getMonth() + n;
    var target = new Date(y, mo, 1, 12);
    var last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
    target.setDate(Math.min(date.getDate(), last));
    return target;
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function format(date) {
    return date.getDate() + " " + MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  // the reply-by date, or null while the wedding date is unset
  function replyBy(weddingIso) {
    var d = parse(weddingIso);
    return d ? addMonths(d, -REPLY_MONTHS_BEFORE) : null;
  }

  // the date a passport should still be valid on
  function passportUntil(weddingIso) {
    var d = parse(weddingIso);
    return d ? addMonths(addDays(d, TRIP_DAYS), PASSPORT_MONTHS_AFTER) : null;
  }

  // The checklist. `destination` is optional ("Bali"); `country` is the name
  // GOV.UK files it under ("Indonesia") and falls back to the destination.
  // Dates are filled in once the wedding date is set, general terms until then.
  function items(weddingIso, destination, country) {
    var reply = replyBy(weddingIso);
    var until = passportUntil(weddingIso);
    var where = country || destination || "the country";
    return [
      { id: "reply", title: "Tell us you're coming",
        text: reply
          ? "Please RSVP by " + format(reply) + " so we can plan the day around everyone coming."
          : "Please RSVP at least 3 months before the wedding so we can plan the day around everyone coming.",
        link: { href: "rsvp.html", label: "RSVP" } },
      { id: "booking", title: "Book your flights and stay",
        text: "Everyone books their own travel and accommodation. Booking early usually means better prices and more choice." },
      { id: "passport", title: "Passport in date",
        text: until
          ? "Make sure it's valid until at least " + format(until) + ". Many countries want 6 months left after you fly home."
          : "Many countries want 6 months left on it after you fly home — we'll show the exact date here once the wedding date is set." },
      { id: "europe", title: "Going via Europe?",
        text: "For EU countries your passport must also be less than 10 years old on the day you arrive." },
      { id: "renew", title: "Renewing? Start early",
        text: "Apply online at GOV.UK as soon as you know. It can take weeks, and longer in spring and summer.",
        link: { href: "https://www.gov.uk/renew-adult-passport", label: "Renew on GOV.UK" } },
      { id: "kids", title: "Children's passports too",
        text: "A child's passport only lasts 5 years, so check the little ones' dates as well." },
      { id: "entry", title: "Visa and entry rules",
        text: "Check " + where + "'s page on GOV.UK travel advice before you book anything.",
        link: { href: "https://www.gov.uk/foreign-travel-advice", label: "GOV.UK travel advice" } },
      { id: "names", title: "Names match",
        text: "The name on your flight booking must match your passport exactly." },
      { id: "insurance", title: "Travel insurance",
        text: "Take it out as soon as you book, so it covers you if plans change." },
      { id: "health", title: "Jabs and medicines",
        text: "Check travel vaccinations about 8 weeks before you go. Keep medicines in your hand luggage with a copy of the prescription.",
        link: { href: "https://travelhealthpro.org.uk/countries", label: "TravelHealthPro" } },
      { id: "copies", title: "A copy of your passport",
        text: "Keep a photo of the photo page on your phone, just in case." }
    ];
  }

  // ticks <-> storage, tolerant of junk and of storage being unavailable
  var KEY = "travelChecklist.v1";
  function load(storage) {
    try {
      var raw = storage && storage.getItem(KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    } catch (e) { return {}; }
  }
  function save(storage, ticks) {
    try { if (storage) { storage.setItem(KEY, JSON.stringify(ticks)); } } catch (e) {}
  }

  // show it when the flag is on, or for a private preview link (?travel=preview)
  function visible(flag, search) {
    if (flag === true) { return true; }
    return /(?:^|[?&])travel=preview(?:&|$)/.test(search || "");
  }

  return {
    parse: parse, addMonths: addMonths, format: format,
    replyBy: replyBy, passportUntil: passportUntil,
    items: items, load: load, save: save, visible: visible, KEY: KEY
  };
}));
