import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockTreeFetch, mockSupabase } from "./helpers.mjs";

// Pages guests actually land on, in their normal (logged-out) state.
// Admin pages are checked pre-login only — the gate screen is what a
// stray/curious visitor would see, and that's what needs to be accessible.
const PAGES = ["/index.html#family", "/rsvp.html", "/add-to-tree.html", "/privacy.html", "/404.html", "/tree-admin.html", "/rsvp-admin.html"];

test.describe("accessibility (axe-core)", () => {
  for (const url of PAGES) {
    test(`${url} has no serious/critical axe violations`, async ({ page }) => {
      if (url.includes("index.html") || url.includes("add-to-tree")) {
        await mockTreeFetch(page);
      }
      if (url.includes("admin")) {
        await mockSupabase(page, {});
      }
      await page.goto(url);
      await page.waitForTimeout(300); // let async tree/content render before scanning

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      if (serious.length) {
        const details = serious
          .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
          .join("\n");
        throw new Error(`Serious/critical axe violations on ${url}:\n${details}`);
      }
    });
  }
});
