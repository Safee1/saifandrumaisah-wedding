// The invitation card in each reveal state, in a real browser, with a
// made-up js/config.js (never a real date or venue) and a mocked backend.
import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

function configJs(cfg) {
  return "window.WeddingConfig = " + JSON.stringify(cfg) + ";";
}

async function open(page, cfg, url) {
  await mockSupabase(page, { "POST /rest/v1/rpc/rsvp_headcount": 5, "GET /rest/v1/blessings": [] });
  await page.route("**/js/config.js*", (route) =>
    route.fulfill({ contentType: "application/javascript", body: configJs(cfg) }));
  await page.addInitScript(() => { try { sessionStorage.setItem("introSeen", "1"); } catch (e) {} });
  await page.goto(url || "/index.html");
}

const TEASER = {
  date: "",
  travel: { show: false, destination: "", country: "" },
  reveal: { at: null, show: false, country: "Dummyland", month: "January 2099", day: null, venue: null }
};
const REVEALED = {
  date: "2099-01-15T12:00:00Z",
  travel: { show: true, destination: "Dummytown", country: "Dummyland" },
  reveal: { at: null, show: true, country: "Dummyland", month: "January 2099", day: "15", venue: "Dummy Hall" }
};

test("teaser: country and month show, day and venue sealed, RSVP button visible", async ({ page }) => {
  await open(page, TEASER);
  const card = page.locator("#invite .card, .card").first();
  await expect(page.locator("#revealCountry")).toHaveText("Dummyland");
  await expect(page.locator("#revealMonthText")).toHaveText("January 2099");
  await expect(page.locator("#revealDay")).toHaveText("2?");
  await expect(page.locator("#revealVenue")).toHaveText("");
  await expect(page.locator("#revealText")).toBeVisible();
  await expect(page.locator("a.rsvp-cta")).toBeVisible();
  await expect(page.locator("#countdown")).toBeHidden();
  await expect(page.locator("#travel")).toBeHidden();
  await expect(card).toBeVisible();
});

test("countdown: a future reveal moment counts down, still sealed", async ({ page }) => {
  await open(page, { ...TEASER, reveal: { ...TEASER.reveal, at: "2098-12-01T00:00:00Z" } });
  await expect(page.locator("#revealCountdown")).toBeVisible();
  await expect(page.locator("#revealText")).toBeHidden();
  await expect(page.locator("#revealVenue")).toHaveText("");
  await expect(page.locator("a.rsvp-cta")).toBeVisible();
});

test("revealed: full date, venue, wedding countdown and the RSVP button are all visible", async ({ page }) => {
  await open(page, REVEALED);
  await expect(page.locator("#revealCountry")).toBeVisible();
  await expect(page.locator("#revealCountry")).toHaveText("Dummyland");
  await expect(page.locator("#revealMonthLine")).toBeVisible();
  await expect(page.locator("#revealMonthLine")).toHaveText(/15\s*January 2099/);
  await expect(page.locator("#revealVenue")).toBeVisible();
  await expect(page.locator("#revealVenue")).toHaveText("Dummy Hall");
  await expect(page.locator("#countdown")).toBeVisible();
  await expect(page.locator("a.rsvp-cta")).toBeVisible();
  await expect(page.locator("#revealText")).toBeHidden();
  await expect(page.locator("#revealTeaser")).toBeHidden();
  await expect(page.locator("#revealCountdown")).toBeHidden();
  await expect(page.locator("#whereLine")).toBeHidden();
  await expect(page.locator("#travel")).toBeVisible();
  // the countdown sits above the RSVP button, and nothing widens the page
  const cd = await page.locator("#countdown").boundingBox();
  const btn = await page.locator("a.rsvp-cta").boundingBox();
  expect(cd.y).toBeLessThan(btn.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("travel preview: the private link shows the checklist before the reveal, with nothing sealed in it", async ({ page }) => {
  await open(page, { ...REVEALED, reveal: { ...REVEALED.reveal, show: false, day: null, venue: null } },
    "/index.html?travel=preview#travel");
  await expect(page.locator("#travel")).toBeVisible();
  await expect(page.locator("#travelList li")).not.toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/Dummytown|Dummy Hall|2098|15 January/);
  await expect(page.locator("#countdown")).toBeHidden();
  await expect(page.locator("#travel")).toBeInViewport();
});

test("travel preview: without the link the checklist stays hidden before the reveal", async ({ page }) => {
  await open(page, { ...REVEALED, reveal: { ...REVEALED.reveal, show: false, day: null, venue: null } });
  await expect(page.locator("#travel")).toBeHidden();
});
