// tree-admin.html: the Reject button on a held blessing must send a status the
// database function accepts, and the "rejected (restore)" and "people" lists
// must refresh after a person is approved or rejected.
// Runs the page's own inline script against a tiny fake DOM. Offline, fake data only.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "tree-admin.html"), "utf8");
const scripts = html.match(/<script>[\s\S]*?<\/script>/g);
const pageScript = scripts[scripts.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

function FakeEl(tag) {
  this.tagName = tag; this.children = []; this.parent = null; this.listeners = {};
  this.style = {}; this.value = ""; this.disabled = false; this.className = "";
  this._text = ""; this._html = "";
  var self = this;
  this.classList = { add: function (c) { self.className += " " + c; } };
}
FakeEl.prototype.appendChild = function (c) { c.parent = this; this.children.push(c); return c; };
FakeEl.prototype.remove = function () {
  if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
};
FakeEl.prototype.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
FakeEl.prototype.click = function () { (this.listeners.click || []).forEach(function (fn) { fn({}); }); };
Object.defineProperty(FakeEl.prototype, "textContent", {
  get: function () { return this._text + this.children.map(function (c) { return c.textContent; }).join(" "); },
  set: function (v) { this.children = []; this._text = String(v); this._html = ""; }
});
Object.defineProperty(FakeEl.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this.children = []; this._text = ""; this._html = String(v); }
});
function walk(el, out) { out.push(el); el.children.forEach(function (c) { walk(c, out); }); return out; }
function itemWith(container, text) {
  return container.children.filter(function (c) { return c.textContent.indexOf(text) !== -1; })[0];
}
function button(item, label) {
  return walk(item, []).filter(function (e) { return e.tagName === "button" && e.textContent === label; })[0];
}
function flush() {
  return new Promise(function (r) { setImmediate(function () { setImmediate(function () { setImmediate(r); }); }); });
}

// A stand-in backend that follows the recorded SQL: admin_set_blessing_status
// raises 'invalid status' for anything outside approved / hidden / pending.
function boot() {
  var els = {}, calls = [], alerts = [];
  var people = [
    { id: "p1", kind: "person", name: "Test Person One", side: "saif", is_kid: false, status: "pending" },
    { id: "p2", kind: "person", name: "Test Person Two", side: "rumaisah", is_kid: true, status: "pending" },
    { id: "p0", kind: "person", name: "Test Person Zero", side: "saif", is_kid: false, status: "approved" }
  ];
  var blessings = [{ id: "b1", name: "Test Guest", message: "A made-up blessing", status: "pending" }];
  function by(status) { return people.filter(function (p) { return p.status === status; }); }
  var handlers = {
    admin_list_pending: function () { return by("pending"); },
    admin_list_rejected: function () { return by("rejected"); },
    admin_list_all: function () { return by("approved"); },
    admin_list_invites: function () { return []; },
    admin_list_blessings: function () { return blessings.filter(function (b) { return b.status === "pending"; }); },
    admin_set_person_status: function (a) {
      people.filter(function (p) { return p.id === a.target; })[0].status = a.new_status;
    },
    admin_set_blessing_status: function (a) {
      if (["approved", "hidden", "pending"].indexOf(a.new_status) === -1) {
        var e = new Error("invalid status"); e.status = 400; throw e;
      }
      blessings.filter(function (b) { return b.id === a.target; })[0].status = a.new_status;
    }
  };
  var sandbox = {
    document: {
      getElementById: function (id) { return els[id] || (els[id] = new FakeEl("div")); },
      createElement: function (tag) { return new FakeEl(tag); }
    },
    TreeData: {
      rpc: function (fn, args) {
        calls.push({ fn: fn, args: args });
        try { return Promise.resolve(handlers[fn](args)); } catch (e) { return Promise.reject(e); }
      }
    },
    AdminPeople: {
      sortPeople: function (r) { return r; },
      filterPeople: function (r) { return r; },
      render: function (container, rows) {
        container.innerHTML = "";
        rows.forEach(function (r) { var d = new FakeEl("div"); d.textContent = r.name; container.appendChild(d); });
      }
    },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    alert: function (m) { alerts.push(m); }
  };
  vm.runInNewContext(pageScript, sandbox);
  els.pw.value = "not-a-real-password";
  els.pwSubmit.click();
  return flush().then(function () { return { els: els, calls: calls, alerts: alerts, blessings: blessings }; });
}

test("Reject on a held blessing sends a status the database accepts and clears the card", async function () {
  var page = await boot();
  var card = itemWith(page.els.list, "A made-up blessing");
  assert.ok(card, "the pending blessing is listed");
  button(card, "Reject").click();
  await flush();
  var sent = page.calls.filter(function (c) { return c.fn === "admin_set_blessing_status"; });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].args.new_status, "hidden");
  assert.deepStrictEqual(Object.keys(sent[0].args).sort(), ["new_status", "pw", "target"]);
  assert.deepStrictEqual(page.alerts, [], "no error alert");
  assert.strictEqual(itemWith(page.els.list, "A made-up blessing"), undefined, "card is gone");
  assert.strictEqual(page.blessings[0].status, "hidden");
});

test("Approve on a held blessing still works", async function () {
  var page = await boot();
  button(itemWith(page.els.list, "A made-up blessing"), "Approve").click();
  await flush();
  assert.deepStrictEqual(page.alerts, []);
  assert.strictEqual(page.blessings[0].status, "approved");
});

test("a rejected person appears under rejected (restore) without pressing Refresh", async function () {
  var page = await boot();
  assert.match(page.els.rejectedList.innerHTML, /Nothing rejected/);
  button(itemWith(page.els.list, "Test Person One"), "Reject").click();
  await flush();
  var row = itemWith(page.els.rejectedList, "Test Person One");
  assert.ok(row, "rejected person is listed for restore");
  assert.ok(button(row, "Restore"), "with a Restore button");
});

test("an approved person appears in the people list without pressing Refresh", async function () {
  var page = await boot();
  assert.strictEqual(itemWith(page.els.peopleList, "Test Person Two"), undefined);
  button(itemWith(page.els.list, "Test Person Two"), "Approve").click();
  await flush();
  assert.ok(itemWith(page.els.peopleList, "Test Person Two"), "approved person can now be marked child or adult");
});
