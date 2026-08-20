(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BlessingsData = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
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

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) { return crypto.randomUUID(); }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Pure validation, shared with tests: returns null when fine,
  // or a human sentence naming the problem.
  function validate(row) {
    var name = (row.name || "").trim();
    var message = (row.message || "").trim();
    if (!name) { return "Please tell us your name."; }
    if (name.length > 60) { return "That name is a little long — 60 letters at most."; }
    if (!message) { return "Please write a few words first."; }
    if (message.length > 280) { return "Please keep it under 280 letters — short and sweet."; }
    return null;
  }

  function fetchApproved() {
    return fetch(SUPABASE_URL + "/rest/v1/blessings?select=id,name,message,created_at&status=eq.approved&order=created_at.desc&limit=60", {
      headers: restHeaders()
    }).then(function (r) {
      if (!r.ok) { throw new Error("Request failed (" + r.status + ")"); }
      return r.json();
    });
  }

  // Pending rows aren't visible under the public SELECT policy, so we
  // generate the id client-side and skip RETURNING (same pattern as
  // tree-data.js).
  function submit(row) {
    var problem = validate(row);
    if (problem) { return Promise.reject(new Error(problem)); }
    var id = newId();
    return fetch(SUPABASE_URL + "/rest/v1/blessings", {
      method: "POST",
      headers: restHeaders({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ id: id, name: row.name.trim(), message: row.message.trim() })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return null; }).then(function (body) {
          var msg = (body && (body.message || body.hint)) || ("Request failed (" + r.status + ")");
          throw new Error(msg);
        });
      }
      return { id: id };
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
      return r.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }

  return { validate: validate, fetchApproved: fetchApproved, submit: submit, rpc: rpc };
});
