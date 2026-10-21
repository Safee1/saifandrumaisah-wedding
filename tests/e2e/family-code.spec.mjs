// The family code: strangers see "Little one"; someone with the code sees real names.
import { test, expect } from "@playwright/test";
import { mockSupabase, TREE_PEOPLE, TREE_RELATIONSHIPS, watchConsole } from "./helpers.mjs";

const PUBLIC = TREE_PEOPLE.map((p) => (p.id === "p-saif" ? p : p));
const withKid = (name) => PUBLIC.concat([{ id: "p-kid", name, side: "saif", is_kid: true }]);
const rels = TREE_RELATIONSHIPS.concat([{ id: "rk", from_person: "p-abu", to_person: "p-kid", type: "parent_of" }]);

async function open(page, extra = {}) {
  await mockSupabase(page, {
    "POST /rest/v1/rpc/public_tree": { people: withKid("Little one"), relationships: rels },
    "POST /rest/v1/rpc/rsvp_headcount": 12,
    "GET /rest/v1/blessings": [],
    ...extra
  });
  await page.goto("/index.html#family");
  await page.locator("#unlockFamily").click();
  await expect(page.locator("#treeContainer .sides")).toBeVisible();
}

test("without a code the tree shows Little one and offers the code box", async ({ page }) => {
  const con = watchConsole(page);
  await open(page);
  await expect(page.locator("#treeContainer")).toContainText("Little one");
  await expect(page.locator("#treeContainer")).not.toContainText("Armani");
  await expect(page.locator("#familyCode")).toBeVisible();
  await expect(page.locator("#familyCodeForm")).toBeHidden();
  con.assertClean();
});

test("a wrong code shows a plain message and nothing changes", async ({ page }) => {
  await open(page, {
    "POST /rest/v1/rpc/family_tree": (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "wrong code" }) })
  });
  await page.locator("#familyCodeOpen").click();
  await page.locator("#familyCodeInput").fill("not the code");
  await page.locator("#familyCodeGo").click();
  await expect(page.locator("#familyCodeStatus")).toContainText("isn’t right");
  await expect(page.locator("#treeContainer")).toContainText("Little one");
  await expect(page.locator("#treeContainer")).not.toContainText("Armani");
});

test("the right code redraws the tree with real names and sends the code", async ({ page }) => {
  let body = null;
  await open(page, {
    "POST /rest/v1/rpc/family_tree": (route) => {
      body = route.request().postDataJSON();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ people: withKid("Armani"), relationships: rels }) });
    }
  });
  await page.locator("#familyCodeOpen").click();
  await page.locator("#familyCodeInput").fill("  the family code ");
  await page.locator("#familyCodeGo").click();
  await expect(page.locator("#treeContainer")).toContainText("Armani");
  expect(body).toEqual({ code: "the family code" });
  await expect(page.locator("#familyCodeStatus")).toContainText("Showing everyone");
  await expect(page.locator("#familyCodeForm")).toBeHidden();
});

test("an empty code asks for one and sends nothing", async ({ page }) => {
  let called = false;
  await open(page, { "POST /rest/v1/rpc/family_tree": (route) => { called = true; route.fulfill({ status: 400, body: "{}" }); } });
  await page.locator("#familyCodeOpen").click();
  await page.locator("#familyCodeGo").click();
  await expect(page.locator("#familyCodeStatus")).toContainText("type the family code");
  expect(called).toBe(false);
});
