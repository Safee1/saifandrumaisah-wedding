"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Email = require("../js/email-templates.js");

test("escapeHtml: escapes the five dangerous characters", () => {
  assert.equal(Email.escapeHtml(`<script>&"'</script>`), "&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;");
});

test("escapeHtml: null/undefined become empty string", () => {
  assert.equal(Email.escapeHtml(null), "");
  assert.equal(Email.escapeHtml(undefined), "");
});

test("firstName: takes the first word, falls back gracefully", () => {
  assert.equal(Email.firstName("Auntie Asma Khan"), "Auntie");
  assert.equal(Email.firstName("  Kashif  "), "Kashif");
  assert.equal(Email.firstName(""), "there");
  assert.equal(Email.firstName(null), "there");
});

test("blessingThanksEmail: matches the exact required subject and body copy", () => {
  const { subject, text, html } = Email.blessingThanksEmail("Auntie Asma", "May Allah bless your union.");
  assert.equal(subject, "Your words found their way to us, Auntie");
  assert.match(text, /^Dear Auntie,/);
  assert.match(text, /Your blessing arrived — and we read it together, slowly, twice\./);
  assert.match(text, /"May Allah bless your union\."/);
  assert.match(text, /With all our love and gratitude,\nSaif & Rumaisah/);
  assert.match(text, /— two families, one story —\nsaifandrumaisah\.com/);
  assert.match(html, /May Allah bless your union\./);
});

test("blessingThanksEmail: escapes a malicious message before embedding in HTML", () => {
  const { html } = Email.blessingThanksEmail("Bad Actor", `<img src=x onerror=alert(1)>`);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("blessingThanksEmail: escapes the name too", () => {
  const { html } = Email.blessingThanksEmail(`<b>Name</b>`, "hi");
  assert.doesNotMatch(html, /<b>Name<\/b>/);
});

test("rsvpConfirmationEmail: names the reveal state and never books travel for the guest", () => {
  const { text } = Email.rsvpConfirmationEmail("Zainab", "2 adults, 1 child — definitely coming");
  assert.match(text, /Egypt · July 2027 — the rest is still sealed\./);
  assert.match(text, /everyone books and pays for their own flights and rooms/);
  assert.doesNotMatch(text, /we('| )ve booked/i);
});

test("coupleAlertEmail: links only to an admin page", () => {
  const { text, html } = Email.coupleAlertEmail("blessing", "From Auntie Asma", "https://saifandrumaisah.com/admin-activity.html");
  assert.match(text, /admin-activity\.html/);
  assert.match(html, /admin-activity\.html/);
});

test("classifyTheme: keyword buckets", () => {
  assert.equal(Email.classifyTheme("Congratulations to you both!"), "congratulations");
  assert.equal(Email.classifyTheme("Can't wait to see you there"), "cant_wait");
  assert.equal(Email.classifyTheme("So sorry, we can't make it but wishing you the best"), "will_be_there");
  assert.equal(Email.classifyTheme("Ameen, may Allah bless you"), "duas");
  assert.equal(Email.classifyTheme("You two are perfect together"), "love");
});

test("moderationFlags: catches links, emails, phone numbers, profanity, shouting", () => {
  assert.equal(Email.moderationFlags("A", "check out my site www.spam.com").held, true);
  assert.equal(Email.moderationFlags("A", "call me on 07911 123456").held, true);
  assert.equal(Email.moderationFlags("A", "reach me at spam@example.com").held, true);
  assert.equal(Email.moderationFlags("A", "you are such an asshole").held, true);
  assert.equal(Email.moderationFlags("A", "SO HAPPY FOR YOU BOTH TODAY").held, true);
  assert.equal(Email.moderationFlags("Auntie Asma", "Wishing you a lifetime of happiness").held, false);
});

test("dedupeEmails: case-insensitive dedupe, trims, drops blanks", () => {
  const out = Email.dedupeEmails(["A@x.com", "a@x.com ", "", null, "b@x.com"]);
  assert.deepEqual(out, ["a@x.com", "b@x.com"]);
});
