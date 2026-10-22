// If js/config.js fails to load, the home page must still show the teaser and the RSVP button.
import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

test("home page still shows the RSVP button when config.js is blocked", async ({ page }) => {
  await mockSupabase(page, { "POST /rest/v1/rpc/rsvp_headcount": 5, "GET /rest/v1/blessings": [] });
  await page.route("**/js/config.js*", (route) => route.abort());
  await page.goto("/index.html");
  await expect(page.locator("a.rsvp-cta")).toBeVisible();
});
