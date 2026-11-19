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

  test("duplicates: a re-send (same name AND contact) is left out, name-only or contact-only matches are flagged but counted, CSV agrees", async ({ page }) => {
    const rows = [
      // re-send group: same name and same email three times, r2 is the latest and the only one counted
      { id: "r1", name: "Jane Doe", attending: true, contact: "jane@example.com", adults: 1, children: 0, guest_count: 1, likelihood: "definitely", dietary: null, message: null, created_at: "2027-01-01T10:00:00Z" },
      { id: "r2", name: "jane   doe", attending: true, contact: "JANE@example.com", adults: 1, children: 0, guest_count: 1, likelihood: "definitely", dietary: null, message: null, created_at: "2027-01-03T10:00:00Z" },
      { id: "r3", name: "JANE, DOE!", attending: true, contact: "jane@example.com", adults: 1, children: 0, guest_count: 1, likelihood: "definitely", dietary: null, message: null, created_at: "2027-01-02T10:00:00Z" },
      // same email, different names: flagged, both counted
      { id: "r4", name: "Alpha Guest", attending: true, contact: "SAME@Example.com", adults: 1, children: 0, guest_count: 1, likelihood: "hoping_to", dietary: null, message: null, created_at: "2027-02-01T10:00:00Z" },
      { id: "r5", name: "Beta Guest", attending: true, contact: "same@example.com", adults: 1, children: 0, guest_count: 1, likelihood: "hoping_to", dietary: null, message: null, created_at: "2027-02-02T10:00:00Z" },
      // same phone (UK variants incl. 0044), different names: flagged, both counted
      { id: "r6", name: "Gamma Guest", attending: true, contact: "0044 7911 123456", adults: 1, children: 0, guest_count: 1, likelihood: "very_likely", dietary: null, message: null, created_at: "2027-03-01T10:00:00Z" },
      { id: "r7", name: "Delta Guest", attending: true, contact: "+44 7911 123456", adults: 1, children: 0, guest_count: 1, likelihood: "very_likely", dietary: null, message: null, created_at: "2027-03-02T10:00:00Z" },
      // unique row, no dupes
      { id: "r8", name: "Solo Guest", attending: true, contact: "solo@example.com", adults: 2, children: 1, guest_count: 3, likelihood: "definitely", dietary: null, message: null, created_at: "2027-04-01T10:00:00Z" }
    ];
    await mockSupabase(page, { "POST /rest/v1/rpc/admin_list_rsvps": rows });
    await page.goto("/rsvp-admin.html");
    await page.locator("#pw").fill("pw");
    await page.locator("#pwSubmit").click();
    await expect(page.locator("#app")).toHaveClass(/show/);

    // counted: r2, r4, r5, r6, r7, r8 -> adults 1+1+1+1+1+2=7, children 1, total 8
    await expect(page.locator("#statTotal")).toHaveText("6");
    await expect(page.locator("#statAdults")).toHaveText("7");
    await expect(page.locator("#statChildren")).toHaveText("1");
    await expect(page.locator("#statAttending")).toHaveText("8");

    // the note gives both numbers: 2 left out as re-sends, 4 flagged but counted
    await expect(page.locator("#dupeNote")).toContainText("2 earlier replies are left out of the totals");
    await expect(page.locator("#dupeNote")).toContainText("4 replies share a name or a contact with another reply");
    await expect(page.locator("#dupeNote")).toContainText("still counted");

    const itemFor = (exactName) => page.locator(".item").filter({ has: page.locator(".item-main", { hasText: new RegExp("^" + exactName + "$") }) });

    await expect(page.locator(".item.is-dupe")).toHaveCount(2);
    await expect(itemFor("Jane Doe").locator(".dupe-badge")).toContainText("Earlier reply, not counted");
    await expect(itemFor("jane   doe").locator(".latest-badge")).toContainText("Latest reply, counted");
    await expect(itemFor("Solo Guest").locator(".latest-badge")).toHaveCount(0);
    await expect(page.locator(".flag-badge")).toHaveCount(4);
    await expect(itemFor("Alpha Guest").locator(".flag-badge")).toContainText("Possible duplicate, still counted");
    await expect(itemFor("Alpha Guest")).toContainText("same contact as Beta Guest");
    await expect(itemFor("Gamma Guest")).toContainText("same contact as Delta Guest");
    await expect(itemFor("Alpha Guest")).not.toHaveClass(/is-dupe/);

    // CSV: same story as the page, row by row
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportBtn").click()
    ]);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk;
    // minimal RFC4180-ish CSV row parser (handles quoted fields with embedded commas)
    function parseCsvLine(line) {
      const out = [];
      let field = "", inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
          else if (c === '"') { inQuotes = false; }
          else { field += c; }
        } else if (c === '"') { inQuotes = true; }
        else if (c === ",") { out.push(field); field = ""; }
        else { field += c; }
      }
      out.push(field);
      return out;
    }
    const lines = csv.trim().split("\r\n");
    const header = parseCsvLine(lines[0]);
    const countedIdx = header.indexOf("Counted in totals");
    const replacedIdx = header.indexOf("Replaced by newer reply");
    const flagIdx = header.indexOf("Possible duplicate (still counted)");
    expect(countedIdx).toBeGreaterThan(-1);
    expect(replacedIdx).toBeGreaterThan(-1);
    expect(flagIdx).toBeGreaterThan(-1);
    const byId = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      byId[cols[0]] = { counted: cols[countedIdx], replaced: cols[replacedIdx], flag: cols[flagIdx] };
    }
    expect(byId["Jane Doe"].counted).toBe("No");
    expect(byId["Jane Doe"].replaced).toContain("jane");
    expect(byId["jane   doe"].counted).toBe("Yes");
    expect(byId["Alpha Guest"]).toEqual({ counted: "Yes", replaced: "", flag: "same contact as Beta Guest" });
    expect(byId["Solo Guest"]).toEqual({ counted: "Yes", replaced: "", flag: "" });
    // the counted rows in the CSV match the "total responses" figure on the page
    expect(Object.values(byId).filter((r) => r.counted === "Yes").length).toBe(6);
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
