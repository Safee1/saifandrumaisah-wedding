// js/net.js: a time limit for network calls, so a request that never
// answers ends with a clear error instead of "Sending..." for ever.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Net = require("../js/net.js");

test("withTimeout: a fast answer passes straight through", async () => {
  assert.equal(await Net.withTimeout(() => Promise.resolve("ok"), 1000), "ok");
});

test("withTimeout: a rejection passes straight through, unchanged", async () => {
  const boom = new Error("boom");
  await assert.rejects(Net.withTimeout(() => Promise.reject(boom), 1000), (e) => e === boom && !Net.isTimeout(e));
});

test("withTimeout: a synchronous throw inside run() becomes a rejection, not a crash", async () => {
  await assert.rejects(Net.withTimeout(() => { throw new Error("fetch exploded"); }, 1000), /fetch exploded/);
});

test("withTimeout: a call that never answers rejects with a timeout error", async () => {
  const started = Date.now();
  const err = await Net.withTimeout(() => new Promise(() => {}), 30).catch((e) => e);
  assert.ok(Net.isTimeout(err), "the error carries timeout = true");
  assert.match(err.message, /longer than usual/);
  assert.ok(Date.now() - started < 1000);
});

test("withTimeout: the request is cancelled through its abort signal when time runs out", async () => {
  let aborted = false;
  await Net.withTimeout((signal) => {
    if (signal) { signal.addEventListener("abort", () => { aborted = true; }); }
    return new Promise(() => {});
  }, 20).catch(() => {});
  assert.equal(aborted, true);
});

test("withTimeout: an answer after the deadline changes nothing", async () => {
  const late = new Promise((resolve) => setTimeout(() => resolve("late"), 60));
  const err = await Net.withTimeout(() => late, 15).catch((e) => e);
  assert.ok(Net.isTimeout(err));
  await late; // settles quietly, no unhandled rejection
});

test("withTimeout: a finished call leaves no timer behind", async () => {
  // if the 15 s default timer survived, node would wait for it and this test file would hang
  await Net.withTimeout(() => Promise.resolve(1));
});

test("isTimeout: only real timeout errors count", () => {
  assert.equal(Net.isTimeout(null), false);
  assert.equal(Net.isTimeout(new Error("nope")), false);
  assert.equal(Net.isTimeout({ timeout: "yes" }), false);
  assert.equal(Net.isTimeout({ timeout: true }), true);
});

test("DEFAULT_MS is a sane ceiling for a guest on a poor phone connection", () => {
  assert.ok(Net.DEFAULT_MS >= 10000 && Net.DEFAULT_MS <= 30000);
});
