(function (root) {
  "use strict";

  var SUPABASE_URL = "https://rfopieelzxvnmfhdvqqf.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmb3BpZWVsenh2bm1maGR2cXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDA4MDcsImV4cCI6MjEwMjMxNjgwN30.B7QgmJbG4CC457U4KP3OtCjrveJ7kpFjk2y2GtL5b24";

  function restHeaders(extra) {
    var h = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
  }

  // No public SELECT policy on rsvps at all (unlike the tree's pending/approved
  // split) — nobody's RSVP is ever shown back to any visitor. So, same as
  // tree-data.js, we generate the id client-side and skip RETURNING entirely.
  function restInsert(table, row) {
    return fetch(SUPABASE_URL + "/rest/v1/" + table, {
      method: "POST",
      headers: restHeaders({ "Prefer": "return=minimal" }),
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          var msg = (body && (body.message || body.hint)) || ("Request failed (" + r.status + ")");
          throw new Error(msg);
        });
      }
      return row;
    });
  }

  function rpc(fn, args) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: restHeaders(),
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          var msg = (body && (body.message || body.hint)) || ("Request failed (" + r.status + ")");
          throw new Error(msg);
        });
      }
      // void-returning functions (admin_delete_rsvp) send an empty body
      return r.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }

  function newId() {
    if (root.crypto && root.crypto.randomUUID) { return root.crypto.randomUUID(); }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function submitRsvp(row) {
    var id = newId();
    return restInsert("rsvps", {
      id: id,
      name: row.name,
      attending: !!row.attending,
      guest_count: row.attending ? row.guest_count : null,
      dietary: row.dietary || null,
      message: row.message || null
    }).then(function () { return { id: id }; });
  }

  // "Are you coming?" expression of interest: name, contact, adult/child
  // counts, how likely, dietary needs, optional note. attending is always
  // true here — every likelihood tier is still "planning to come" in some
  // form, so it counts toward the public headcount. guest_count is kept in
  // sync (adults + children) so rsvp-admin's existing total column still adds up.
  function submitInterest(row) {
    var id = newId();
    var adults = row.adults || 0;
    var children = row.children || 0;
    return restInsert("rsvps", {
      id: id,
      name: row.name,
      attending: true,
      guest_count: adults + children,
      dietary: row.dietary || null,
      message: row.note || null,
      contact: row.contact || null,
      adults: adults,
      children: children,
      likelihood: row.likelihood
    }).then(function () { return { id: id }; });
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
