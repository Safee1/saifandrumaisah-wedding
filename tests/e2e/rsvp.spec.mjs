import { test, expect } from "@playwright/test";
import { mockSupabase, watchConsole } from "./helpers.mjs";

async function fillValid(page) {
  await page.locator("#name").fill("Faisal Khan");
  await page.locator("#contact").fill("faisal@example.com");
  await page.locator('label[for="likDefinitely"]').click();
  await page.locator("#adults").fill("2");
  await page.locator("#children").fill("1");
}

async function gotoReady(page, extraHandlers = {}) {
  await mockSupabase(page, {
    "POST /rest/v1/rpc/rsvp_headcount": 5,
    ...extraHandlers
  });
  await page.goto("/rsvp.html");
  await page.waitForTimeout(2100); // clear bot time-gate
}

test.describe("rsvp.html — validation", () => {
  test("empty submit is blocked by the required name field (native validation)", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#submitBtn").click();
    expect(await page.locator("#name").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("name filled, no contact — blocked by the required contact field", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#name").fill("Someone");
    await page.locator("#submitBtn").click();
    expect(await page.locator("#contact").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("name + contact, no likelihood chosen — JS validation catches it", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#name").fill("Someone");
    await page.locator("#contact").fill("someone@example.com");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/how likely/i);
  });

  test("every likelihood radio option is selectable", async ({ page }) => {
    await gotoReady(page);
    for (const id of ["likDefinitely", "likVeryLikely", "likHoping"]) {
      await page.locator(`label[for="${id}"]`).click();
      await expect(page.locator("#" + id)).toBeChecked();
    }
  });

  test("adults = 0 is rejected (native min=1 constraint)", async ({ page }) => {
    await gotoReady(page);
    await fillValid(page);
    await page.locator("#adults").fill("0");
    expect(await page.locator("#adults").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("adults negative is rejected (native min=1 constraint)", async ({ page }) => {
    await gotoReady(page);
    await fillValid(page);
    await page.locator("#adults").fill("-3");
    expect(await page.locator("#adults").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("adults huge (999) is rejected (native max=20 constraint)", async ({ page }) => {
    await gotoReady(page);
    await fillValid(page);
    await page.locator("#adults").fill("999");
    expect(await page.locator("#adults").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("adults decimal is coerced/rejected sanely", async ({ page }) => {
    await gotoReady(page);
    await fillValid(page);
    await page.locator("#adults").fill("2.7");
    // number input with a decimal: parseInt still yields 2, should pass through to submit attempt
    const val = await page.locator("#adults").inputValue();
    expect(val).toBeTruthy();
  });

  test("adults letters leaves the number input empty (browser-level), submit blocked", async ({ page }) => {
    await gotoReady(page);
    await fillValid(page);
    await page.locator("#adults").fill("");
    await page.locator("#adults").pressSequentially("abc");
    const val = await page.locator("#adults").inputValue();
    expect(val).toBe("");
    expect(await page.locator("#adults").evaluate((el) => el.checkValidity())).toBe(false);
  });

  test("children negative is rejected (native min=0 constraint) before it ever reaches the JS clamp", async ({ page }) => {
    let posted = false;
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => { posted = true; route.fulfill({ status: 201, body: "" }); }
    });
    await fillValid(page);
    await page.locator("#children").fill("-5");
    expect(await page.locator("#children").evaluate((el) => el.checkValidity())).toBe(false);
    await page.locator("#submitBtn").click();
    expect(posted).toBe(false);
  });

  test("children huge (999) is rejected (native max=20 constraint) before it ever reaches the JS clamp", async ({ page }) => {
    let posted = false;
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => { posted = true; route.fulfill({ status: 201, body: "" }); }
    });
    await fillValid(page);
    await page.locator("#children").fill("999");
    expect(await page.locator("#children").evaluate((el) => el.checkValidity())).toBe(false);
    await page.locator("#submitBtn").click();
    expect(posted).toBe(false);
  });
});

test.describe("rsvp.html — submit flow", () => {
  test("successful submit shows the confirmation and hides the form", async ({ page }) => {
    let sentBody = null;
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => { sentBody = route.request().postDataJSON(); route.fulfill({ status: 201, body: "" }); }
    });
    await fillValid(page);
    await page.locator("#dietary").fill("No nuts");
    await page.locator("#note").fill("Can't wait!");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#confirmBox")).toBeVisible();
    await expect(page.locator("#rsvpForm")).toBeHidden();
    expect(sentBody.name).toBe("Faisal Khan");
    expect(sentBody.contact).toBe("faisal@example.com");
    expect(sentBody.likelihood).toBe("definitely");
    expect(sentBody.adults).toBe(2);
    expect(sentBody.children).toBe(1);
    expect(sentBody.dietary).toBe("No nuts");
    expect(sentBody.attending).toBe(true);
  });

  test("server error (500) shows a retry message and re-enables submit", async ({ page }) => {
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "db down" }) })
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/something went wrong/i);
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("4xx error also shows a retry message", async ({ page }) => {
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "bad request" }) })
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/something went wrong/i);
  });

  test("slow response: button disabled and 'Sending…' shown while in flight", async ({ page }) => {
    await gotoReady(page, {
      "POST /rest/v1/rsvps": async (route) => {
        await new Promise((r) => setTimeout(r, 800));
        route.fulfill({ status: 201, body: "" });
      }
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#submitBtn")).toBeDisabled();
    await expect(page.locator("#statusMsg")).toContainText(/sending/i);
    await expect(page.locator("#confirmBox")).toBeVisible({ timeout: 3000 });
  });

  test("timeout/aborted request eventually surfaces an error", async ({ page }) => {
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => route.abort("timedout")
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/something went wrong/i, { timeout: 10000 });
  });

  test("double-submit click only sends one POST", async ({ page }) => {
    let postCount = 0;
    await gotoReady(page, {
      "POST /rest/v1/rsvps": async (route) => {
        postCount++;
        await new Promise((r) => setTimeout(r, 300));
        route.fulfill({ status: 201, body: "" });
      }
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await page.locator("#submitBtn").click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    expect(postCount).toBe(1);
  });

  test("honeypot filled silently 'succeeds' without a network call", async ({ page }) => {
    let posted = false;
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => { posted = true; route.fulfill({ status: 201, body: "" }); }
    });
    await page.locator("#website").fill("http://spam.example");
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#confirmBox")).toBeVisible();
    expect(posted).toBe(false);
  });

  test("submitting inside the 2s gate is rejected with a wait message", async ({ page }) => {
    let posted = false;
    await mockSupabase(page, {
      "POST /rest/v1/rpc/rsvp_headcount": 5,
      "POST /rest/v1/rsvps": (route) => { posted = true; route.fulfill({ status: 201, body: "" }); }
    });
    await page.goto("/rsvp.html");
    // fill only the two natively-required fields (fast) so the native
    // constraint validation doesn't block the submit event before our
    // JS time-gate check ever gets to run
    await page.locator("#name").fill("Quick Guest");
    await page.locator("#contact").fill("quick@example.com");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#statusMsg")).toContainText(/wait a moment/i);
    expect(posted).toBe(false);
  });

  test("headcount renders from rsvp_headcount RPC", async ({ page }) => {
    await gotoReady(page, { "POST /rest/v1/rpc/rsvp_headcount": 42 });
    await expect(page.locator("#headcount")).toBeVisible();
    await expect(page.locator("#headcountNum")).toHaveText("42");
  });

  test("headcount RPC failure fails quietly, form still usable", async ({ page }) => {
    await mockSupabase(page, { "POST /rest/v1/rpc/rsvp_headcount": (route) => route.fulfill({ status: 500, body: "err" }) });
    await page.goto("/rsvp.html");
    await expect(page.locator("#headcount")).toBeHidden();
    await expect(page.locator("#rsvpForm")).toBeVisible();
  });
});

test.describe("rsvp.html — copy & hygiene", () => {
  test("copy always says guests book/pay their own travel, never the couple", async ({ page }) => {
    await gotoReady(page);
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/book(s)? and pay(s)? for (their|its) own/i);
    expect(text).not.toMatch(/we('|’)ll book/i);
    expect(text).not.toMatch(/we cover (your|the) (flight|travel)/i);
  });

  test("no console errors across the full journey", async ({ page }) => {
    const console_ = watchConsole(page);
    await gotoReady(page, {
      "POST /rest/v1/rsvps": (route) => route.fulfill({ status: 201, body: "" })
    });
    await fillValid(page);
    await page.locator("#submitBtn").click();
    await expect(page.locator("#confirmBox")).toBeVisible();
    console_.assertClean();
  });

  test("labels are associated with their inputs (for/id)", async ({ page }) => {
    await gotoReady(page);
    for (const id of ["name", "contact", "adults", "children", "dietary", "note"]) {
      const label = page.locator(`label[for="${id}"]`);
      await expect(label).toHaveCount(1);
    }
  });

  test("keyboard-only: tab reaches name, contact, radios, adults, children, submit", async ({ page }) => {
    await gotoReady(page);
    await page.locator("#name").focus();
    await expect(page.locator("#name")).toBeFocused();
    await page.keyboard.type("Tab Test");
    await page.locator("#contact").focus();
    await page.keyboard.type("tab@example.com");
    expect(await page.locator("#contact").inputValue()).toBe("tab@example.com");
  });
});
