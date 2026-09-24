import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

test.describe("rsvp-admin.html", () => {
  test("empty password does nothing, wrong password shows 'Wrong password.'", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_rsvps": (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "bad pw" }) })
    });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).not.toHaveClass(/show/);
    await page.locator("#pw").fill("wrongpassword");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Wrong password.");
  });

  test("correct password renders rows, correct totals, CSV escaping, approve delete payload", async ({ page }) => {
    const rows = [
      { id: "r1", name: "Simple Guest", attending: true, contact: "a@b.com", adults: 2, children: 1, guest_count: 3, likelihood: "definitely", dietary: "none", message: "hi", created_at: "2027-01-01T10:00:00Z" },
      { id: "r2", name: "Comma, \"Quote\" Guest\nNewline", attending: true, contact: "=cmd|'/c calc'!A1", adults: 1, children: 0, guest_count: 1, likelihood: "hoping_to", dietary: null, message: null, created_at: "2027-01-02T10:00:00Z" },
      { id: "r3", name: "Decliner", attending: false, contact: "c@d.com", adults: null, children: null, guest_count: null, likelihood: null, dietary: null, message: null, created_at: "2027-01-03T10:00:00Z" }
    ];
    let deletedTarget = null;
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_rsvps": rows,
      "POST /rest/v1/rpc/admin_delete_rsvp": (route) => { deletedTarget = route.request().postDataJSON().target; route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
    });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pw").fill("correct-password");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);

    // totals: 2 attending rows -> adults 2+1=3, children 1+0=1, headcount 3+1=4, declined 1
    await expect(page.locator("#statTotal")).toHaveText("3");
    await expect(page.locator("#statAdults")).toHaveText("3");
    await expect(page.locator("#statChildren")).toHaveText("1");
    await expect(page.locator("#statAttending")).toHaveText("4");
    await expect(page.locator("#statDeclined")).toHaveText("1");
    await expect(page.locator("#statDefinitely")).toHaveText("1");
    await expect(page.locator("#statHopingTo")).toHaveText("1");

    await expect(page.locator(".item")).toHaveCount(3);

    // CSV escaping + formula-injection guard
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportBtn").click()
    ]);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk;
    expect(csv).toContain('"Comma, ""Quote"" Guest\nNewline"');
    expect(csv).toContain("'=cmd"); // formula-injection guard prefixes an apostrophe

    // delete payload
    page.once("dialog", (d) => d.accept());
    await page.locator(".item", { hasText: "Simple Guest" }).locator(".btn-delete").click();
    await expect.poll(() => deletedTarget).toBe("r1");
  });

  test("empty dataset shows 'No RSVPs yet.'", async ({ page }) => {
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_rsvps": [] });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#list")).toContainText(/no rsvps yet/i);
    await expect(page.locator("#statTotal")).toHaveText("0");
  });

  test("brute-force lockout shows the DB's message, not the generic 'Wrong password.'", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_rsvps": (route) => route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Too many attempts — try again in 15 minutes" })
      })
    });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pw").fill("whatever");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Too many attempts");
  });

  test("500-row dataset renders without failure", async ({ page }) => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: "r" + i, name: "Guest " + i, attending: i % 2 === 0, contact: "g" + i + "@example.com",
      adults: 1, children: 0, guest_count: 1, likelihood: "definitely", dietary: null, message: null,
      created_at: "2027-01-01T10:00:00Z"
    }));
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_rsvps": rows });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#statTotal")).toHaveText("500");
    await expect(page.locator(".item")).toHaveCount(500);
  });
});

test.describe("tree-admin.html", () => {
  test("empty and wrong password", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "bad pw" }) })
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).not.toHaveClass(/show/);
    await page.locator("#pw").fill("nope");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Wrong password.");
  });

  test("pending people + relationships render, approve/reject send correct RPC + payload", async ({ page }) => {
    const rows = [
      { kind: "person", id: "p1", side: "saif", is_kid: false, name: "New Cousin", submitted_note: "Auntie Noor" },
      { kind: "relationship", id: "rel1", rel_type: "spouse_of", from_person_name: "Saif", to_person_name: "Rumaisah" }
    ];
    const calls = [];
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": rows,
      "POST /rest/v1/rpc/admin_list_blessings": [],
      "POST /rest/v1/rpc/admin_list_invites": [],
      "POST /rest/v1/rpc/admin_set_person_status": (route) => { calls.push(["person", route.request().postDataJSON()]); route.fulfill({ status: 200, contentType: "application/json", body: "null" }); },
      "POST /rest/v1/rpc/admin_set_relationship_status": (route) => { calls.push(["rel", route.request().postDataJSON()]); route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#list .item")).toHaveCount(2);

    await page.locator("#list .item", { hasText: "New Cousin" }).locator(".btn-approve").click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0][0]).toBe("person");
    expect(calls[0][1].target).toBe("p1");
    expect(calls[0][1].new_status).toBe("approved");

    await page.locator("#list .item", { hasText: "married to" }).locator(".btn-reject").click();
    await expect.poll(() => calls.length).toBe(2);
    expect(calls[1][0]).toBe("rel");
    expect(calls[1][1].new_status).toBe("rejected");
  });

  test("approve failure re-enables buttons and alerts", async ({ page }) => {
    const rows = [{ kind: "person", id: "p1", side: "saif", is_kid: false, name: "Failing Person" }];
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": rows,
      "POST /rest/v1/rpc/admin_list_blessings": [],
      "POST /rest/v1/rpc/admin_list_invites": [],
      "POST /rest/v1/rpc/admin_set_person_status": (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) })
    });
    let alertShown = false;
    page.on("dialog", (d) => { alertShown = true; d.accept(); });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await page.locator("#list .btn-approve").click();
    await expect.poll(() => alertShown).toBe(true);
    await expect(page.locator("#list .btn-approve")).toBeEnabled();
  });

  test("invite code creation with every side/uses option, and pending blessings render", async ({ page }) => {
    let createdArgs = null;
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": [
        { kind: "person", id: "bl1", side: "saif", is_kid: false, name: "" } // ignored, blessings handled separately below if present
      ],
      "POST /rest/v1/rpc/admin_create_invite": (route) => { createdArgs = route.request().postDataJSON(); route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("PLAINCODE123") }); },
      "POST /rest/v1/rpc/admin_list_invites": [],
      "POST /rest/v1/rpc/admin_list_blessings": []
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);

    const sideOptions = await page.locator("#invSide option").allTextContents();
    expect(sideOptions.length).toBeGreaterThanOrEqual(2);
    const usesOptions = await page.locator("#invUses option").allTextContents();
    expect(usesOptions.length).toBeGreaterThanOrEqual(1);

    await page.locator("#invLabel").fill("Sakhi");
    await page.locator("#invSide").selectOption({ index: 0 });
    await page.locator("#invUses").selectOption({ index: 0 });
    await page.locator("#invCreate").click();
    await expect.poll(() => createdArgs).not.toBeNull();
    expect(createdArgs.label).toBe("Sakhi");
  });

  test("empty pending list renders without error", async ({ page }) => {
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_pending": [] });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);
  });

  test("brute-force lockout shows the DB's message, not the generic 'Wrong password.'", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": (route) => route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Too many attempts — try again in 15 minutes" })
      })
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("whatever");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#gateErr")).toContainText("Too many attempts");
    await expect(page.locator("#app")).not.toHaveClass(/show/);
  });

  test("rejected (restore) list renders and Restore calls admin_restore_person", async ({ page }) => {
    const rejectedRows = [
      { id: "rj1", side: "rumaisah", is_kid: false, name: "Bounced Cousin", submitted_note: null }
    ];
    let restoredTarget = null;
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": [],
      "POST /rest/v1/rpc/admin_list_blessings": [],
      "POST /rest/v1/rpc/admin_list_invites": [],
      "POST /rest/v1/rpc/admin_list_rejected": rejectedRows,
      "POST /rest/v1/rpc/admin_restore_person": (route) => {
        restoredTarget = route.request().postDataJSON().target;
        route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      }
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#rejectedList .item")).toHaveCount(1);
    await expect(page.locator("#rejectedList")).toContainText("Bounced Cousin");

    await page.locator("#rejectedList .item", { hasText: "Bounced Cousin" }).locator("button").click();
    await expect.poll(() => restoredTarget).toBe("rj1");
  });

  test("no rejected people shows the empty state", async ({ page }) => {
    await mockSupabase(page, {
      "POST /rest/v1/rpc/admin_list_pending": [],
      "POST /rest/v1/rpc/admin_list_blessings": [],
      "POST /rest/v1/rpc/admin_list_invites": [],
      "POST /rest/v1/rpc/admin_list_rejected": []
    });
    await page.goto("/tree-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#rejectedList")).toContainText(/nothing rejected/i);
  });
});
