// Shared Playwright helpers: Supabase route mocking + leak/console guards.
// NEVER let any of these hit the live network — every Supabase call in
// every spec must be routed through mockSupabase() or an explicit route().

export const SUPABASE_URL = "https://rfopieelzxvnmfhdvqqf.supabase.co";

// Strings that must never appear in any page this site serves — the venue,
// city, resort and exact day are meant to stay sealed until REVEAL.show
// flips to true (js/config.js). Keep this list in sync with what's actually
// still secret; it is deliberately case-insensitive substring matching.
export const LEAK_STRINGS = [
  "Rixos", "Seagate", "Nabq Bay", "Sharm El Sheikh", "Sharm el-Sheikh",
  "Regnum", "Carya", "Belek", "Hurghada", "Sahl Hasheesh", "Albatros",
  "Sunrise Mamlouk"
];

export function assertNoLeaks(text) {
  const lower = text.toLowerCase();
  for (const s of LEAK_STRINGS) {
    if (lower.includes(s.toLowerCase())) {
      throw new Error("Leak guard tripped: page text contains '" + s + "'");
    }
  }
}

// Collects console errors/pageerrors for a page; call .assertClean() at the
// end of a test. Filters out the handful of expected noise sources (network
// failures we deliberately trigger, favicon 404s under file://-style serving).
export function watchConsole(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // ignore expected failed-fetch noise from intentional failure/timeout mocks
      if (/Failed to load resource/i.test(text)) return;
      errors.push("console.error: " + text);
    }
  });
  return {
    errors,
    assertClean() {
      if (errors.length) {
        throw new Error("Unexpected console errors:\n" + errors.join("\n"));
      }
    }
  };
}

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

/**
 * Mocks every Supabase REST/RPC call the site makes. `handlers` is a map of
 * "METHOD path-substring" -> either a static response object, or a function
 * (route, request) => void that fulfils/aborts the route itself, for tests
 * that need to inspect the payload or simulate slow/failed responses.
 *
 * Anything not matched falls back to a generic empty-array/null success so
 * pages that fetch data we don't care about in a given test don't hang.
 */
export async function mockSupabase(page, handlers = {}) {
  await page.route(SUPABASE_URL + "/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + " " + url.pathname;

    for (const pattern in handlers) {
      const [method, pathSub] = pattern.split(" ", 2);
      if (req.method() !== method) continue;
      if (!url.pathname.includes(pathSub)) continue;
      const handler = handlers[pattern];
      if (typeof handler === "function") {
        return handler(route, req);
      }
      return route.fulfill(json(handler));
    }

    // sane defaults so untested endpoints don't block the page
    if (url.pathname.includes("/rest/v1/rpc/")) {
      return route.fulfill(json(null));
    }
    return route.fulfill(json([]));
  });
}

export function rpcBody(request) {
  return request.postDataJSON();
}

// Approved tree fixture: two crown-couple-ish families, one long name, one
// side with a fold-able sibling group (Arisha & Tayyibah), used across
// index.html family-tree specs.
export const TREE_PEOPLE = [
  { id: "p-saif", name: "Saif", side: "saif", is_kid: false, relation: "self" },
  { id: "p-rumaisah", name: "Rumaisah", side: "rumaisah", is_kid: false, relation: "self" },
  { id: "p-abu", name: "Abu (Saif's Father)", side: "saif", is_kid: false, relation: "parent" },
  { id: "p-ammi", name: "Ammi (Saif's Mother)", side: "saif", is_kid: false, relation: "parent" },
  { id: "p-arisha", name: "Arisha", side: "saif", is_kid: false, relation: "sibling" },
  { id: "p-arisha-h", name: "Arisha's Husband", side: "saif", is_kid: false, relation: "sibling-in-law" },
  { id: "p-tayyibah", name: "Tayyibah", side: "saif", is_kid: false, relation: "sibling" },
  { id: "p-tayyibah-h", name: "Tayyibah's Husband", side: "saif", is_kid: false, relation: "sibling-in-law" },
  { id: "p-longname", name: "Muhammad Abdur-Rahman Al-Husseini-Chowdhury", side: "rumaisah", is_kid: false, relation: "sibling" },
  { id: "p-kid", name: "Little One", side: "rumaisah", is_kid: true, relation: "child" },
  { id: "p-cousin", name: "Cousin Zahra", side: "saif", is_kid: false, relation: "sibling" },
  { id: "p-cousin-h", name: "Zahra's Husband", side: "saif", is_kid: false, relation: "sibling-in-law" }
];

export const TREE_RELATIONSHIPS = [
  { id: "r1", from_person: "p-abu", to_person: "p-saif", type: "parent_of" },
  { id: "r2", from_person: "p-ammi", to_person: "p-saif", type: "parent_of" },
  { id: "r3", from_person: "p-abu", to_person: "p-ammi", type: "spouse_of" },
  { id: "r4", from_person: "p-abu", to_person: "p-arisha", type: "parent_of" },
  { id: "r5", from_person: "p-abu", to_person: "p-tayyibah", type: "parent_of" },
  { id: "r6", from_person: "p-saif", to_person: "p-rumaisah", type: "spouse_of" },
  { id: "r7", from_person: "p-rumaisah", to_person: "p-kid", type: "parent_of" },
  { id: "r8", from_person: "p-arisha", to_person: "p-arisha-h", type: "spouse_of" },
  { id: "r9", from_person: "p-tayyibah", to_person: "p-tayyibah-h", type: "spouse_of" },
  { id: "r12", from_person: "p-abu", to_person: "p-cousin", type: "parent_of" },
  { id: "r13", from_person: "p-cousin", to_person: "p-cousin-h", type: "spouse_of" }
];

export async function mockTreeFetch(page, extraHandlers = {}) {
  await mockSupabase(page, {
    "GET /rest/v1/people": TREE_PEOPLE,
    "GET /rest/v1/relationships": TREE_RELATIONSHIPS,
    "POST /rest/v1/rpc/rsvp_headcount": 12,
    "GET /rest/v1/blessings": [],
    ...extraHandlers
  });
}
