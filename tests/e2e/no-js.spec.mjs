// With JavaScript off the home page must still show the invitation and a way
// to RSVP, not a full-screen intro that never closes.
import { test, expect } from "@playwright/test";

test.describe("home page without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the invitation is visible and the RSVP link is reachable", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator(".story")).toBeHidden();
    await expect(page.locator(".names").first()).toBeVisible();
    await expect(page.locator('a[href^="rsvp.html"]').first()).toBeVisible();
  });
});
