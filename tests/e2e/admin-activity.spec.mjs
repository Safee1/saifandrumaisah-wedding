import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

test.describe("admin-activity.html", () => {
  test("wrong password shows an error and does not unlock", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_activity": (route) =>
        route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "bad pw" }) })
    });
    await page.goto("/admin-activity.html");
    await page.locator("#pw").fill("wrongpassword");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Wrong password.");
    await expect(page.locator("#app")).not.toHaveClass(/show/);
  });

  test("lockout message from admin_check is surfaced verbatim", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_activity": (route) =>
        route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Too many attempts — try again in 15 minutes" }) })
    });
    await page.goto("/admin-activity.html");
    await page.locator("#pw").fill("whatever");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Too many attempts");
  });

  test("correct password renders timeline, stats and kind filter", async ({ page }) => {
    const now = new Date();
    const rows = [
      { id: "1", created_at: now.toISOString(), kind: "rsvp_submitted", summary: "Alice RSVP'd (2 adults)", ref_id: "r1" },
      { id: "2", created_at: now.toISOString(), kind: "tree_submitted", summary: "Bob added to the tree (saif side) — awaiting approval", ref_id: "r2" },
      { id: "3", created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), kind: "admin_login_failed", summary: "Admin login attempt failed", ref_id: null }
    ];
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_activity": rows });
    await page.goto("/admin-activity.html");
    await page.locator("#pw").fill("correct-password");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);

    // both recent rows show today, the 10-day-old failed login does not count today
    await expect(page.locator("#stats")).toContainText("2");
    await expect(page.locator(".row")).toHaveCount(3);

    await page.locator("#kindFilter").selectOption("rsvp_submitted");
    await expect(page.locator(".row")).toHaveCount(1);
    await expect(page.locator(".row")).toContainText("Alice RSVP'd");
  });

  test("CSV export triggers a download", async ({ page }) => {
    const rows = [
      { id: "1", created_at: new Date().toISOString(), kind: "rsvp_submitted", summary: "Alice RSVP'd", ref_id: "r1" }
    ];
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_activity": rows });
    await page.goto("/admin-activity.html");
    await page.locator("#pw").fill("correct-password");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#csvBtn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^activity-log-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
