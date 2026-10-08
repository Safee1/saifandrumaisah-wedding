(function (root) {
  "use strict";

  var SUPABASE_URL = "https://rfopieelzxvnmfhdvqqf.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmb3BpZWVsenh2bm1maGR2cXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDA4MDcsImV4cCI6MjEwMjMxNjgwN30.B7QgmJbG4CC457U4KP3OtCjrveJ7kpFjk2y2GtL5b24";

  // Every network call gets a time limit (js/net.js). If a page has not
  // loaded net.js, fall back to the plain call so nothing breaks.
  var Net = root.Net || (typeof require === "function" ? require("./net.js") : null);
  function guarded(run, ms) {
    return Net ? Net.withTimeout(run, ms) : Promise.resolve().then(function () { return run(undefined); });
  }

  function restHeaders(extra) {
    var h = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
  }

  function failure(r) {
    return r.json().catch(function () { return null; }).then(function (body) {
      var msg = (body && (body.message || body.hint)) || ("Request failed (" + r.status + ")");
      var err = new Error(msg);
      err.status = r.status;
      err.code = body && body.code;
      throw err;
    });
  }

  // No public SELECT policy on rsvps at all (unlike the tree's pending/approved
  // split) — nobody's RSVP is ever shown back to any visitor. So, same as
  // tree-data.js, we generate the id client-side and skip RETURNING entirely.
  // A saved row answers 201 (or 204). Any other 2xx (a hotel Wi-Fi page, a
  // proxy) is not a save, so it must not read as "thank you".
  // 409 + code 23505 means this very id is already stored: an earlier try
  // got through before the answer was lost, so a retry is a success.
  function restInsert(table, row) {
    return guarded(function (signal) {
      return fetch(SUPABASE_URL + "/rest/v1/" + table, {
        method: "POST",
        headers: restHeaders({ "Prefer": "return=minimal" }),
        body: JSON.stringify(row),
        signal: signal
      }).then(function (r) {
        if (r.status === 201 || r.status === 204) { return row; }
        if (r.ok) { throw new Error("Unexpected response (" + r.status + ")"); }
        return failure(r).catch(function (err) {
          if (err.status === 409 && err.code === "23505") { return row; }
          throw err;
        });
      });
    });
  }

  function rpc(fn, args) {
    return guarded(function (signal) {
      return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: restHeaders(),
        body: JSON.stringify(args || {}),
        signal: signal
      }).then(function (r) {
        if (!r.ok) { return failure(r); }
        // void-returning functions (admin_delete_rsvp) send an empty body
        return r.text().then(function (text) { return text ? JSON.parse(text) : null; });
      });
    });
  }

  function newId() {
    if (root.crypto && root.crypto.randomUUID) { return root.crypto.randomUUID(); }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // A retry after a timeout reuses the id of the try that may already have
  // been saved, so the database can tell it is the same RSVP (a 409 on that
  // id then counts as saved). A different form content gets a new id. The id
  // is forgotten once a save succeeds, so a deliberate second RSVP is new.
  var pending = null;
  function idFor(row) {
    var key = JSON.stringify(row);
    if (!pending || pending.key !== key) { pending = { key: key, id: newId() }; }
    return pending.id;
  }

  function submitRsvp(row) {
    var id = idFor(row);
    return restInsert("rsvps", {
      id: id,
      name: row.name,
      attending: !!row.attending,
      guest_count: row.attending ? row.guest_count : null,
      dietary: row.dietary || null,
      message: row.message || null
    }).then(function () { pending = null; return { id: id }; });
  }

  // "Are you coming?" expression of interest: name, contact, adult/child
  // counts, how likely, dietary needs, optional note. attending is always
  // true here — every likelihood tier is still "planning to come" in some
  // form, so it counts toward the public headcount. guest_count is kept in
  // sync (adults + children) so rsvp-admin's existing total column still adds up.
  function submitInterest(row) {
    var id = idFor(row);
    var declined = row.likelihood === "no";
    var adults = declined ? 0 : (row.adults || 0);
    var children = declined ? 0 : (row.children || 0);
    var consent = !declined && !!row.dietary && !!row.dietaryConsent;
    return restInsert("rsvps", {
      id: id,
      name: row.name,
      attending: !declined,
      guest_count: declined ? null : adults + children,
      dietary: row.dietary || null,
      message: row.note || null,
      contact: row.contact || null,
      adults: adults,
      children: children,
      likelihood: declined ? null : row.likelihood,
      children_ages: declined ? null : (row.childrenAges || null),
      dietary_consent: consent,
      dietary_consent_at: consent ? new Date().toISOString() : null
    }).then(function () {
      pending = null;
      var summary = declined ? row.name + " can't make it" : row.name + " RSVP'd (" + adults + " adult" + (adults === 1 ? "" : "s") +
        (children > 0 ? ", " + children + " child" + (children === 1 ? "" : "ren") : "") +
        (row.likelihood ? ", " + row.likelihood : "") + ")";
      notify({ kind: "rsvp_submitted", summary: summary, adminPath: "rsvp-admin.html" });
      var email = (row.contact || "").trim();
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        notify({ kind: "rsvp_confirmation", email: email, name: row.name, summary: summary });
      }
      return { id: id };
    });
  }

  // Fire-and-forget email calls; activity_log is already written server-side
  // by a DB trigger regardless of this call, so a failure here is harmless
  // and never blocks or fails the guest's own RSVP.
  function notify(payload) {
    try {
      guarded(function (signal) {
        return fetch(SUPABASE_URL + "/functions/v1/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: signal
        });
      }, 10000).catch(function () {});
    } catch (e) {}
  }

  // Public running headcount only — a single integer via a SECURITY DEFINER
  // RPC, no names or contact details ever come back.
  function headcount() {
    return rpc("rsvp_headcount", {});
  }

  root.RsvpData = {
    submitRsvp: submitRsvp,
    submitInterest: submitInterest,
    headcount: headcount,
    rpc: rpc
  };
})(typeof self !== "undefined" ? self : this);
