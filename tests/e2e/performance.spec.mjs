import { test, expect } from "@playwright/test";
import { mockTreeFetch } from "./helpers.mjs";

// Lightweight budget checks, not a full Lighthouse run: total bytes
// transferred for a first load, and a simulated slow-4G timing sanity
// check, on the pages guests will actually open on their phones.

test.describe("performance budgets", () => {
  test("index.html transfers under 600KB on first load", async ({ page }) => {
    await mockTreeFetch(page);
    let totalBytes = 0;
    page.on("response", async (res) => {
      try {
        const headers = res.headers();
        const len = headers["content-length"];
        if (len) totalBytes += parseInt(len, 10);
      } catch (e) { /* ignore */ }
    });
    await page.goto("/index.html");
    await page.waitForLoadState("networkidle");
    expect(totalBytes).toBeLessThan(600 * 1024);
  });

  test("index.html renders the hero on a throttled connection within a reasonable time", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP throttling is Chromium-only");
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // ~1.6Mbps, typical slow-4G
      uploadThroughput: (750 * 1024) / 8,
      latency: 150
    });
    await mockTreeFetch(page);
    const start = Date.now();
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1.names")).toBeVisible();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
  });
});
