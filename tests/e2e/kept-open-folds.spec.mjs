import { test, expect } from "@playwright/test";
import { mockTreeFetch } from "./helpers.mjs";

// PR fix: Arisha's and Tayyibah's folds (KEEP_OPEN in js/family-tree.js) are
// pinned open by default. Being absolutely-positioned popovers, they used to
// float OVER the "+ add someone to the tree" / "+ RSVP" buttons and the
// caption text beneath the tree. They must now render in flow, pushing that
// content down, exactly like the whole-family view already does for every
// fold. Ordinary (non-kept-open) folds keep their floating popover behaviour.

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

async function boxesFor(page, selector) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
      .filter((r) => r.w > 0 && r.h > 0)
  );
}

test.describe("kept-open folds render in flow, not as floating popovers", () => {
  for (const state of ["full-view-off", "full-view-on"]) {
    test(`kept-open fold boxes never overlap the buttons/caption below, or any card (${state})`, async ({ page }) => {
      await mockTreeFetch(page);
      await page.goto("/index.html#family");
      await page.locator("#unlockFamily").click();
      if (state === "full-view-on") {
        const toggle = page.locator("#viewToggle");
        if (await toggle.isVisible()) { await toggle.click(); }
      }
      await page.waitForTimeout(250);

      const keptOpenFolds = await boxesFor(page, '.fold[data-keep-open="1"]:not([hidden])');
      expect(keptOpenFolds.length).toBeGreaterThan(0);

      const belowSelectors = ["#unlockFamily", ".legend", ".tree-actions .add-link", ".tree-sub"];
      for (const sel of belowSelectors) {
        const belowBoxes = await boxesFor(page, sel);
        for (const kf of keptOpenFolds) {
          for (const bb of belowBoxes) {
            expect(rectsOverlap(kf, bb), `${sel} overlaps a kept-open fold`).toBe(false);
          }
        }
      }

      // and no card/box in the tree overlaps another
      const allBoxes = await boxesFor(page, "#treeContainer .box, #treeContainer .node, #treeContainer .fu-couple > *");
      let collisions = 0;
      for (let i = 0; i < allBoxes.length; i++) {
        for (let j = i + 1; j < allBoxes.length; j++) {
          if (rectsOverlap(allBoxes[i], allBoxes[j])) collisions++;
        }
      }
      expect(collisions).toBe(0);
    });
  }

  test("kept-open folds sit in normal document flow (push content down), not absolutely positioned", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html#family");
    await page.locator("#unlockFamily").click();
    await page.waitForTimeout(250);

    const positions = await page.locator('.fold[data-keep-open="1"]:not([hidden])').evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).position)
    );
    expect(positions.length).toBeGreaterThan(0);
    for (const pos of positions) { expect(pos).not.toBe("absolute"); }
  });

  test("the 'family & friends' loners caption never overlaps the row of cards beneath it (full view)", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html#family");
    await page.locator("#unlockFamily").click();
    const toggle = page.locator("#viewToggle");
    if (await toggle.isVisible()) { await toggle.click(); }
    await page.waitForTimeout(250);

    const caption = page.locator(".loners-cap");
    if (!(await caption.count())) { test.skip(); }
    const capBox = await caption.first().boundingBox();
    const cardBoxes = await boxesFor(page, ".kids-row.rv > *");
    for (const cb of cardBoxes) {
      expect(rectsOverlap(capBox, cb), "loners caption overlaps a card").toBe(false);
    }
  });

  test("repeated redraws (resize) never make a fitting kept-open fold falsely report overflow", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html#family");
    await page.locator("#unlockFamily").click();
    await page.waitForTimeout(250);
    // trigger several resize-driven redraws in a row (the old bug in
    // js/family-lines.js drew each chart's connector-SVG width from the
    // chart's own scrollWidth *without* first shrinking the SVG, so the
    // measured width could only ratchet upward across repeated redraws)
    for (const w of [1000, 900, 1000, 800, 1000]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(200);
    }
    const scrolls = page.locator('.fold[data-keep-open="1"]:not([hidden]) .chart-scroll');
    const count = await scrolls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const el = scrolls.nth(i);
      const overflowing = await el.evaluate((n) => n.scrollWidth > n.clientWidth + 2);
      // at 1000px wide a 2-card fold has plenty of room
      expect(overflowing).toBe(false);
    }
  });

  test("an ordinary (non-kept-open) fold still floats as a popover when opened", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html#family");
    await page.locator("#unlockFamily").click();
    const node = page.locator(".has-fold", { hasText: "Zahra" }).first();
    await node.evaluate((el) => el.click());
    await page.waitForTimeout(150);
    const fold = page.locator(".fold:not([hidden]):not([data-keep-open])").first();
    await expect(fold).toBeVisible();
    const pos = await fold.evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe("absolute");
  });

  test("the scroll hint / scroll track is hidden when a kept-open fold's content fits without overflow", async ({ page }) => {
    await mockTreeFetch(page);
    await page.goto("/index.html#family");
    await page.locator("#unlockFamily").click();
    await page.waitForTimeout(250);

    const scrolls = page.locator('.fold[data-keep-open="1"]:not([hidden]) .chart-scroll');
    const count = await scrolls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const el = scrolls.nth(i);
      const overflowing = await el.evaluate((n) => n.scrollWidth > n.clientWidth + 2);
      const hasCanScroll = await el.evaluate((n) => n.classList.contains("can-scroll"));
      expect(hasCanScroll).toBe(overflowing);
      if (!overflowing) {
        await expect(el).not.toHaveClass(/can-scroll/);
        const afterDisplay = await el.evaluate((n) => getComputedStyle(n, "::after").content);
        // "none" (no generated content) when can-scroll is absent, since the
        // hint text lives in the .can-scroll::after rule only
        expect(afterDisplay).toBe("none");
      }
    }
  });
});

test.describe("kept-open folds — mobile / small viewports", () => {
  const viewports = [
    { name: "iphone-se-320", width: 320, height: 568 },
    { name: "android-360", width: 360, height: 800 },
    { name: "android-412", width: 412, height: 915 },
    { name: "landscape-568x320", width: 568, height: 320 }
  ];

  for (const vp of viewports) {
    test(`no overlap and no page-level horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockTreeFetch(page);
      await page.goto("/index.html#family");
      await page.locator("#unlockFamily").click();
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);

      const keptOpenFolds = await boxesFor(page, '.fold[data-keep-open="1"]:not([hidden])');
      const belowBoxes = await boxesFor(page, "#unlockFamily, .legend, .tree-actions .add-link");
      for (const kf of keptOpenFolds) {
        for (const bb of belowBoxes) {
          expect(rectsOverlap(kf, bb)).toBe(false);
        }
      }

      // tap targets: the plus-toggle nodes and the tree-actions links must
      // be at least 44px in their smaller dimension
      const tapTargets = await boxesFor(page, ".has-fold, .tree-actions .add-link");
      for (const t of tapTargets) {
        expect(Math.min(t.w, t.h)).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
