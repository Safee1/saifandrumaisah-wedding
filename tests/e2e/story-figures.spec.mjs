import { test, expect } from "@playwright/test";
import { mockTreeFetch } from "./helpers.mjs";

// The intro's walking figures, measured in a real browser. The walk is pure
// CSS, so each test pauses every animation and seeks it to an exact time
// instead of waiting for the clock (the figures start at 900ms and arrive
// at 4300ms; see --walk and --walk-delay in css/story-figures.css).

const WALK_START = 900;
const WALK_END = 4300;
const MOVING = ".fig-bob, .figure .leg, .figure .shin, .figure .arm, .figure .step, " +
  ".figure .coat-sway, .figure .coat-tail, .figure .gown-sway, .figure .gown-train, .figure .veil-sway";

async function openStory(page) {
  await mockTreeFetch(page);
  await page.goto("/index.html");
  await expect(page.locator(".figure.fig-l svg")).toBeAttached();
}

async function seek(page, ms) {
  await page.evaluate((t) => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; });
  }, ms);
}

// evenly spaced times across the walk, ends included
function walkTimes(n) {
  return Array.from({ length: n + 1 }, (_, i) => WALK_START + ((WALK_END - WALK_START) * i) / n);
}

test.describe("intro story: the walking figures", () => {
  test("every limb and cloth group is moving mid-walk and back at rest once they have met", async ({ page }) => {
    await openStory(page);
    const transforms = () => page.locator(MOVING).evaluateAll((els) =>
      els.map((el) => {
        const t = getComputedStyle(el).transform;
        return t === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : t;
      }));

    await seek(page, 2000);
    const mid = await transforms();
    expect(mid.length).toBeGreaterThanOrEqual(16);
    expect(mid.filter((t) => t !== "matrix(1, 0, 0, 1, 0, 0)").length).toBeGreaterThanOrEqual(14);

    // the veil swings on for 1.5s after the walk, so look once it has settled
    await seek(page, WALK_END + 1600);
    const end = await transforms();
    for (const t of end) {
      const m = t.match(/^matrix\(([^)]+)\)$/);
      expect(m, "unexpected transform " + t).not.toBeNull();
      const [a, b, c, d, e, f] = m[1].split(",").map(Number);
      for (const [got, want] of [[a, 1], [b, 0], [c, 0], [d, 1], [e, 0], [f, 0]]) {
        expect(Math.abs(got - want)).toBeLessThan(1e-6);
      }
    }
  });

  test("the bride's ankle lines never cross or touch below the hem", async ({ page }) => {
    await openStory(page);
    for (const t of walkTimes(34)) {
      await seek(page, t);
      const [a, b] = await page.locator(".fig-r .step .thin").evaluateAll((els) =>
        els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
      const gap = Math.max(a.left - b.right, b.left - a.right);
      expect(gap, "ankle lines meet at " + Math.round(t) + "ms").toBeGreaterThan(2);
    }
  });

  test("the groom's planted foot does not slide backwards during his first step", async ({ page }) => {
    await openStory(page);
    // the leading shoe lands at the first foot contact (1/12 of the walk)
    // and stays down until the second (3/12)
    const from = WALK_START + (WALK_END - WALK_START) / 12;
    const to = WALK_START + (WALK_END - WALK_START) * 3 / 12;
    const xs = [];
    for (let i = 0; i <= 8; i++) {
      await seek(page, from + ((to - from) * i) / 8);
      xs.push(await page.locator(".fig-l .leg-lead .shoe").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      }));
    }
    const width = await page.locator(".figure.fig-l svg").evaluate((el) => el.getBoundingClientRect().width);
    const slip = xs[0] - Math.min(...xs);
    expect(slip / width, "shoe slid back " + slip.toFixed(1) + "px on a " + width + "px figure").toBeLessThan(0.1);
  });

  test("every engine resolves the same pivots (user units on the view box)", async ({ page }) => {
    await openStory(page);
    const got = await page.evaluate(() => {
      const pick = (sel) => {
        const s = getComputedStyle(document.querySelector(sel));
        // WebKit reports 34.8px as 34.799999px: round to a thousandth
        const xy = s.transformOrigin.split(" ").slice(0, 2).map((v) => Math.round(parseFloat(v) * 1000) / 1000 + "px");
        return s.transformBox + " | " + xy.join(" ");
      };
      return {
        coat: pick(".fig-l .coat-sway"),
        gown: pick(".fig-r .gown-sway"),
        hip: pick(".fig-l .leg-lead"),
        veil: pick(".fig-r .veil-sway")
      };
    });
    expect(got).toEqual({
      coat: "view-box | 33px 20px",
      gown: "view-box | 33.5px 18.4px",
      hip: "view-box | 34.8px 50px",
      veil: "view-box | 34px 3px"
    });
  });

  test("under reduced motion the story is hidden and nothing in it animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStory(page);
    await expect(page.locator(".story")).toBeHidden();
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest(".story")).length);
    expect(running).toBe(0);
  });
});
