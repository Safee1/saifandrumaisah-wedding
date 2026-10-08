// A guest who can't come must always be able to say so, even if the Adults
// box holds junk.
import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

async function gotoReady(page, handlers) {
  await mockSupabase(page, { "POST /rest/v1/rpc/rsvp_headcount": 5, ...handlers });
  await page.goto("/rsvp.html");
  await page.waitForTimeout(2100);
}

test("declining sends even when Adults is invalid", async ({ page }) => {
  let body = null;
  await gotoReady(page, {
    "POST /rest/v1/rsvps": (route) => { body = route.request().postDataJSON(); route.fulfill({ status: 201, body: "" }); }
  });
  await page.locator("#name").fill("Sana Ali");
  await page.locator("#contact").fill("sana@example.com");
  await page.locator("#adults").fill("99");
  await page.locator('label[for="likNo"]').click();
  await page.locator("#submitBtn").click();
  await expect(page.locator("#confirmBox")).toBeVisible();
  expect(body.attending).toBe(false);
});
