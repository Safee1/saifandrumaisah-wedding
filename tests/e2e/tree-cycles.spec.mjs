// One contradictory approved row must never blank the family tree for every
// visitor (a loop used to crash the renderer, so guests saw "couldn't load
// the tree" until someone found and rejected the row).
import { test, expect } from "@playwright/test";
import { mockSupabase, TREE_PEOPLE, TREE_RELATIONSHIPS, watchConsole } from "./helpers.mjs";

async function openTree(page, relationships) {
  await mockSupabase(page, {
    "POST /rest/v1/rpc/public_tree": { people: TREE_PEOPLE, relationships: relationships },
    "POST /rest/v1/rpc/rsvp_headcount": 12,
    "GET /rest/v1/blessings": []
  });
  await page.goto("/index.html#family");
  await page.locator("#unlockFamily").click();
}

const LOOPS = {
  "a child recorded as their own parent's parent": [{ id: "x1", from_person: "p-saif", to_person: "p-abu", type: "parent_of" }],
  "a parent recorded as their child's spouse": [{ id: "x2", from_person: "p-abu", to_person: "p-saif", type: "spouse_of" }],
  "a three-person parent loop": [
    { id: "x3", from_person: "p-arisha", to_person: "p-tayyibah", type: "parent_of" },
    { id: "x4", from_person: "p-tayyibah", to_person: "p-cousin", type: "parent_of" },
    { id: "x5", from_person: "p-cousin", to_person: "p-arisha", type: "parent_of" }
  ],
  "a person who is their own parent": [{ id: "x6", from_person: "p-saif", to_person: "p-saif", type: "parent_of" }]
};

for (const name of Object.keys(LOOPS)) {
  test("tree still draws with " + name, async ({ page }) => {
    const con = watchConsole(page);
    await openTree(page, TREE_RELATIONSHIPS.concat(LOOPS[name]));
    await expect(page.locator("#treeContainer .sides")).toBeVisible();
    await expect(page.locator("#treeContainer")).not.toContainText("couldn’t load the tree");
    // the people everyone expects to see are still there
    await expect(page.locator("#treeContainer")).toContainText("Arisha");
    await expect(page.locator("#treeContainer")).toContainText("Rumaisah");
    con.assertClean();
  });
}

test("a very long unbroken name does not widen the page on a phone", async ({ page }) => {
  const people = TREE_PEOPLE.concat([{ id: "p-long", name: "Muhammadabdulrahmanibnabdullahalkhaliji", side: "saif", is_kid: false }]);
  const rels = TREE_RELATIONSHIPS.concat([{ id: "xl", from_person: "p-abu", to_person: "p-long", type: "parent_of" }]);
  await mockSupabase(page, {
    "POST /rest/v1/rpc/public_tree": { people: people, relationships: rels },
    "POST /rest/v1/rpc/rsvp_headcount": 12,
    "GET /rest/v1/blessings": []
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/index.html#family");
  await page.locator("#unlockFamily").click();
  await expect(page.locator("#treeContainer")).toContainText("Muhammad");
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.iw);
});
