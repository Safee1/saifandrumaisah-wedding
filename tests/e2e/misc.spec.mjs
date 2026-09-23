import { test, expect } from "@playwright/test";
import { mockTreeFetch } from "./helpers.mjs";

test.describe("404 and site hygiene", () => {
  test("unknown path serves the styled 404 page", async ({ page }) => {
    const resp = await page.goto("/this-page-does-not-exist-xyz");
    // http-server -s falls back to 404.html for unknown paths with a 404 status
    const status = resp ? resp.status() : null;
    expect([404, 200]).toContain(status);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("index.html script/link stamps are uniform across all js/css refs", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html");
    const stamps = await page.evaluate(() => {
      const els = [...document.querySelectorAll('script[src^="js/"], link[href^="css/"]')];
      return els.map((el) => {
        const src = el.getAttribute("src") || el.getAttribute("href");
        const m = src.match(/[?&]v=(\d+)/);
        return m ? m[1] : null;
      });
    });
    const unique = new Set(stamps);
    expect(unique.size).toBe(1);
  });

  test("landscape viewport does not overflow horizontally", async ({ page }) => {
    await mockTreeFetch(page);
    await page.setViewportSize({ width: 812, height: 375 });
    await page.goto("/index.html#family");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("rsvp.html and add-to-tree.html have no horizontal overflow at phone width", async ({ page }) => {
    await mockTreeFetch(page);
    for (const url of ["/rsvp.html", "/add-to-tree.html"]) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
    }
  });
});
