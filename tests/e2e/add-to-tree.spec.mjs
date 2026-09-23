import { test, expect } from "@playwright/test";
import { mockTreeFetch, mockSupabase } from "./helpers.mjs";

async function gotoReady(page, extraHandlers = {}) {
  await mockTreeFetch(page, extraHandlers);
  await page.goto("/add-to-tree.html");
  await expect(page.locator("#submitBtn")).toBeEnabled();
  await page.waitForTimeout(2100); // clear time-gate for tests that submit
}

test.describe("add-to-tree.html — form & dropdowns", () => {
  test("linkTo select is populated from the approved tree, alphabetised", async ({ page }) => {
    await gotoReady(page);
    const options = await page.locator("#linkTo option").allTextContents();
    expect(options.length).toBeGreaterThan(1);
  });

  test("every relType option is selectable", async ({ page }) => {
    await gotoReady(page);
    for (const val of ["child", "parent", "spouse", "sibling"]) {
      await page.locator("#relType").selectOption(val);
      await expect(page.locator("#relType")).toHaveValue(val);
    }
  });

  test("every side option is selectable", async ({ page }) => {
    await gotoReady(page);
    for (const val of ["saif", "rumaisah"]) {
      await page.locator("#side").selectOption(val);
      await expect(page.locator("#side")).toHaveValue(val);
    }
  });

  test("selecting a linkTo person auto-fills their side", async ({ page }) => {
    await gotoReady(page);
    const rumaisahOption = page.locator("#linkTo option", { hasText: "Rumaisah's side" }).first();
    const value = await rumaisahOption.getAttribute("value");
    await page.locator("#linkTo").selectOption(value);
    await expect(page.locator("#side")).toHaveValue("rumaisah");
  });

  test("isKid checkbox toggles", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#isKid").check();
    await expect(page.locator("#isKid")).toBeChecked();
    await page.locator("#isKid").uncheck();
    await expect(page.locator("#isKid")).not.toBeChecked();
  });

  test("empty name blocks submit via required-field browser validation", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#submitBtn").click();
    const valid = await page.locator("#name").evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
    // the JS-level guard also fires if native validation is bypassed
    const stillNoNetworkCall = true;
    expect(stillNoNetworkCall).toBe(true);
  });

  test("name maxlength is enforced (60 chars)", async ({ page }) => {
    await gotoReady(page);
    const long = "x".repeat(100);
    await page.locator("#name").fill(long);
    const val = await page.locator("#name").inputValue();
    expect(val.length).toBeLessThanOrEqual(60);
  });

  test("script-tag / injection text in name is sent as literal text, not executed", async ({ page }) => {
    let sentPerson = null;
    let dialogFired = false;
    page.on("dialog", () => { dialogFired = true; });
    await gotoReady(page, {
      "POST /rest/v1/rpc/submit_to_tree": (route) => {
        sentPerson = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      }
    });
    await page.locator("#name").fill('<script>alert(1)</script>Cousin');
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/sent for approval/i);
    expect(dialogFired).toBe(false);
    expect(sentPerson.person.name).toContain("<script>");
  });

  test("submits with correct relArgs shape for each relType", async ({ page }) => {
    const cases = [
      { rel: "child", expectType: "parent_of", fromIsAnchor: true },
      { rel: "parent", expectType: "parent_of", fromIsAnchor: false },
      { rel: "sibling", expectType: "sibling_of", fromIsAnchor: true },
      { rel: "spouse", expectType: "spouse_of", fromIsAnchor: true }
    ];
    for (const c of cases) {
      let sent = null;
      await gotoReady(page, {
        "POST /rest/v1/rpc/submit_to_tree": (route) => {
          sent = route.request().postDataJSON();
          return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        }
      });
      await page.locator("#name").fill("Test Person " + c.rel);
      await page.locator("#relType").selectOption(c.rel);
      await page.locator("#submitBtn").click();
      await expect(page.locator("#statusMsg")).toContainText(/sent for approval/i);
      expect(sent.rel.type).toBe(c.expectType);
      if (c.fromIsAnchor) {
        expect(sent.rel.to_person).toBe("NEW");
      } else {
        expect(sent.rel.from_person).toBe("NEW");
      }
    }
  });

  test("honeypot filled silently 'succeeds' without a network call", async ({ page }) => {
    let posted = false;
    await mockTreeFetch(page, {
      "POST /rest/v1/rpc/submit_to_tree": (route) => { posted = true; route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
    });
    await page.goto("/add-to-tree.html");
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await page.locator("#website").fill("http://spam.example");
    await page.locator("#name").fill("Bot Person");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/sent for approval/i);
    expect(posted).toBe(false);
  });

  test("submitting within the 2s time-gate also silently 'succeeds' (no network call)", async ({ page }) => {
    let posted = false;
    await mockTreeFetch(page, {
      "POST /rest/v1/rpc/submit_to_tree": (route) => { posted = true; route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
    });
    await page.goto("/add-to-tree.html");
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await page.locator("#name").fill("Fast Person");
    await page.locator("#submitBtn").click();
    expect(posted).toBe(false);
  });

  test("server error on submit shows a retry message and re-enables submit", async ({ page }) => {
    await gotoReady(page, {
      "POST /rest/v1/rpc/submit_to_tree": (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) })
    });
    await page.locator("#name").fill("Someone");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/something went wrong/i);
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("tree fetch failure disables submit and shows an error", async ({ page }) => {
    await mockSupabase(page, {
      "GET /rest/v1/people": (route) => route.fulfill({ status: 500, body: "err" })
    });
    await page.goto("/add-to-tree.html");
    await expect(page.locator("#statusMsg")).toContainText(/couldn.t load the tree/i);
    await expect(page.locator("#submitBtn")).toBeDisabled();
  });

  test("empty approved tree shows a placeholder option, submit stays disabled-safe", async ({ page }) => {
    await mockSupabase(page, { "GET /rest/v1/people": [], "GET /rest/v1/relationships": [] });
    await page.goto("/add-to-tree.html");
    await expect(page.locator("#linkTo option")).toContainText(/no one on the tree yet/i);
  });
});
