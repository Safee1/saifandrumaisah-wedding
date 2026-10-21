// tree-admin.html "people" section: find someone, mark them as a child or an adult.
import { test, expect } from "@playwright/test";
import { mockSupabase } from "./helpers.mjs";

const PEOPLE = [
  { id: "p1", name: "Syed", side: "saif", is_kid: false },
  { id: "p2", name: "Armani", side: "saif", is_kid: false },
  { id: "p3", name: "Kinza", side: "saif", is_kid: true }
];

async function openAdmin(page, extra = {}) {
  await mockSupabase(page, {
    "POST /rest/v1/rpc/admin_list_pending": [],
    "POST /rest/v1/rpc/admin_list_rejected": [],
    "POST /rest/v1/rpc/admin_list_invites": [],
    "POST /rest/v1/rpc/admin_list_blessings": [],
    "POST /rest/v1/rpc/admin_list_all": PEOPLE,
    ...extra
  });
  await page.goto("/tree-admin.html");
  await page.locator("#pw").fill("correct-password");
  await page.locator("#pwSubmit").click();
  await expect(page.locator("#app")).toHaveClass(/show/);
}

test("people list shows everyone alphabetically, with the right button for each", async ({ page }) => {
  await openAdmin(page);
  const items = page.locator("#peopleList .item");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Armani");
  await expect(items.nth(0).locator("button")).toHaveText("Mark as child");
  await expect(items.nth(1)).toContainText("Kinza");
  await expect(items.nth(1).locator("button")).toHaveText("Mark as adult");
  await expect(items.nth(2)).toContainText("Syed");
});

test("the filter narrows the list", async ({ page }) => {
  await openAdmin(page);
  await page.locator("#peopleFilter").fill("sy");
  await expect(page.locator("#peopleList .item")).toHaveCount(1);
  await expect(page.locator("#peopleList .item")).toContainText("Syed");
});

test("Mark as child sends the right request and flips the button", async ({ page }) => {
  let body = null;
  await openAdmin(page, {
    "POST /rest/v1/rpc/admin_set_person_kid": (route) => { body = route.request().postDataJSON(); route.fulfill({ status: 200, contentType: "application/json", body: "" }); }
  });
  await page.locator("#peopleList .item", { hasText: "Armani" }).locator("button").click();
  await expect(page.locator("#peopleStatus")).toContainText("Little one");
  expect(body).toEqual({ pw: "correct-password", target: "p2", new_kid: true });
  await expect(page.locator("#peopleList .item", { hasText: "Armani" }).locator("button")).toHaveText("Mark as adult");
});

test("if the database update isn't installed yet, it says so and nothing changes", async ({ page }) => {
  await openAdmin(page, {
    "POST /rest/v1/rpc/admin_set_person_kid": (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "not found" }) })
  });
  await page.locator("#peopleList .item", { hasText: "Syed" }).locator("button").click();
  await expect(page.locator("#peopleStatus")).toContainText("Not installed yet");
  await expect(page.locator("#peopleList .item", { hasText: "Syed" }).locator("button")).toHaveText("Mark as child");
  await expect(page.locator("#peopleList .item", { hasText: "Syed" }).locator("button")).toBeEnabled();
});
