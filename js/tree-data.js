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

  function restGet(path) {
    return guarded(function (signal) {
      return fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: restHeaders(), signal: signal })
        .then(function (r) {
          if (!r.ok) { throw new Error("Request failed (" + r.status + ")"); }
          return r.json();
        });
    });
  }

  // Pending rows aren't visible under the public SELECT policy, so an
  // INSERT ... RETURNING (Prefer: return=representation) would itself get
  // rejected by RLS. We generate the id client-side and skip RETURNING.
  // A saved row answers 201 (or 204); any other 2xx is not a save.
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
        return failure(r);
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
        // void-returning functions (the approve/reject RPCs) send an empty body
        return r.text().then(function (text) { return text ? JSON.parse(text) : null; });
      });
    });
  }

  // Public tree data now comes from a single SECURITY DEFINER RPC. Direct
  // REST reads of people/relationships are blocked at the DB (no more
  // public SELECT policy) so kids' real names never appear in a network
  // response — public_tree() returns "Little one" for is_kid rows instead.
  // The shape is checked here so a proxy page or a changed function answers
  // with one plain error the page already handles, not a crash inside the
  // renderer.
  function fetchApprovedTree() {
    return rpc("public_tree", {}).then(function (data) {
      if (!data || !Array.isArray(data.people) || !Array.isArray(data.relationships)) {
        throw new Error("Unexpected response from the tree");
      }
      return data;
    });
  }

  function newId() {
    if (root.crypto && root.crypto.randomUUID) { return root.crypto.randomUUID(); }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function submitPerson(row) {
    // status is forced server-side by RLS regardless of what we send
    var id = newId();
    return restInsert("people", {
      id: id,
      name: row.name,
      side: row.side,
      is_kid: !!row.is_kid,
      submitted_note: row.note || null
    }).then(function () { return { id: id }; });
  }

  function submitRelationship(row) {
    var id = newId();
    return restInsert("relationships", {
      id: id,
      from_person: row.from_person,
      to_person: row.to_person,
      type: row.type
    }).then(function () { return { id: id }; });
  }

  // The gated door onto the tree: person + optional relationship in a
  // single RPC that checks the invite code server-side. Direct table
  // inserts (submitPerson/submitRelationship) are refused by the DB now.
  function submitWithInvite(code, person, rel) {
    return rpc("submit_with_invite", { code: code, person: person, rel: rel || null });
  }

  // The open door: same person + relationship shape, no invite code. Still
  // lands as 'pending' under RLS — Saif/Rumaisah approve it in tree-admin
  // same as anything else. The invite-code path above still works too.
  function submitOpen(person, rel) {
    return rpc("submit_to_tree", { person: person, rel: rel || null });
  }

  // Fire-and-forget ops notification. The activity_log row is already
  // written server-side by a DB trigger regardless of this call — this
  // just tries to also email the couple if notifications are configured.
  // Never awaited by callers, never allowed to affect their own flow.
  function notify(kind, summary) {
    try {
      guarded(function (signal) {
        return fetch(SUPABASE_URL + "/functions/v1/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: kind, summary: String(summary || "").slice(0, 300) }),
          signal: signal
        });
      }, 10000).catch(function () { /* best-effort only */ });
    } catch (e) { /* best-effort only */ }
  }

  root.TreeData = {
    fetchApprovedTree: fetchApprovedTree,
    submitPerson: submitPerson,
    submitRelationship: submitRelationship,
    submitWithInvite: submitWithInvite,
    submitOpen: submitOpen,
    notify: notify,
    rpc: rpc,
    restGet: restGet
  };
})(typeof self !== "undefined" ? self : this);
