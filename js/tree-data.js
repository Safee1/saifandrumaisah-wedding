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

  function restGet(path) {
    return fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: restHeaders() })
      .then(function (r) {
        if (!r.ok) { throw new Error("Request failed (" + r.status + ")"); }
        return r.json();
      });
  }

  // Pending rows aren't visible under the public SELECT policy, so an
  // INSERT ... RETURNING (Prefer: return=representation) would itself get
  // rejected by RLS. We generate the id client-side and skip RETURNING.
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
      // void-returning functions (the approve/reject RPCs) send an empty body
      return r.text().then(function (text) { return text ? JSON.parse(text) : null; });
    });
  }

  function fetchApprovedTree() {
    return Promise.all([
      restGet("people?select=id,name,side,is_kid&status=eq.approved&order=sort_order.asc,name.asc"),
      restGet("relationships?select=id,from_person,to_person,type&status=eq.approved")
    ]).then(function (results) {
      return { people: results[0], relationships: results[1] };
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

  root.TreeData = {
    fetchApprovedTree: fetchApprovedTree,
    submitPerson: submitPerson,
    submitRelationship: submitRelationship,
    rpc: rpc,
    restGet: restGet
  };
})(typeof self !== "undefined" ? self : this);
