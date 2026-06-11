# AGENTS.md

Operating contract for AI coding assistants and human contributors on this repo.
Read this **before** making any change. If a change would break a rule here, stop and ask.

## Project

A small wedding website for Saif & Rumaisah.
- **Domain:** saifandrumaisah.com (registered with Namecheap; DNS points at GitHub Pages — done)
- **Repo:** github.com/Safee1/saifandrumaisah-wedding (public)
- **Hosting:** GitHub Pages, deployed from the `main` branch (static site)
- **Live now:** one page (`/`) — landing hero with the family tree below it
- **Data source:** the couple's private Google Sheet. The family page reads two *published mirror tabs* — see Sheet rules below. (When a backend exists later, the full Sheet ID lives in a `SHEET_ID` env var, never committed.)
- **Planned later:** RSVP (unique link per guest) and an updates feed, which will need a small Node backend

## Stack

- **Current:** static HTML + vanilla JS + plain CSS on GitHub Pages
- **Shared logic** lives in `js/` as UMD modules so the same file works in a browser `<script>` tag and in node tests
- **Tests:** built-in `node:test`, fully offline (no network, feeds mocked as strings); run with `npm test`
- **CI:** `.github/workflows/test.yml` runs `npm test` on every pull request
- **Future backend (not built):** Node.js + Express on Render, Google Sheets API v4 via a service account

## What needs the owner's explicit review before merge

Any change that:
- Touches how the site reads Sheet data (mirror tabs, published CSV links, column-name mapping)
- Adds, renames, or changes the meaning of a Sheet column or tab
- Adds a new external integration (email, analytics, error tracker, etc.)
- Modifies handling of guest personal data
- Changes any user-facing copy
- Adds a dependency to `package.json`

## What must be preserved (do not change without explicit approval)

- **Public URLs:** `/` and the `#family` anchor on it (later: `/rsvp/:token`, `/updates`). Do not rename.
- **Sheet tabs:** `Dashboard`, `Venue`, `Budget`, `Saifs Guests`, `Rurus Guests`, `Vendors`, `Checklist`, `Seating`, plus mirrors `Tree Saif`, `Tree Ruru`.
- **Guest tab layout** (`Saifs Guests`, `Rurus Guests`):
  - A KEY/legend block sits around rows 2–5 — code must tolerate junk above the headers
  - **Headers are on row 8, data starts row 9** (this changed from the old row-4 layout)
  - Column A is blank; columns C–F are `Guest name`, `Family`, `Relationship`, `Are they a Kid?`
  - Further columns (`Important`, `Address`, `RSVP`, `Meal choice`, `Dietary needs`, `Plus-one`, `Notes`) are private and vary between the two tabs
- **Code finds columns by header NAME, never by position or letter.** Headers may move; names are the contract.
- **Mirror tabs:** `Tree Saif` cell A1 = `={'Saifs Guests'!C8:F}`; `Tree Ruru` cell A1 = `={'Rurus Guests'!C8:F}`. These two mirrors are the ONLY tabs ever published to the web (as CSV). Never publish any other tab.
- **PRIVACY RULE:** columns C–F of the guest tabs flow to a public link via the mirrors. Addresses, RSVPs, phone numbers, or any private data must NEVER be placed in columns C–F. Private data lives in column G and rightward only.
- The published CSV links are embedded in `index.html` (the sources passed to `FamilyRender.run`).
- **Optional `Tree row` column** (values `parents` / `children`): when added to the guest tabs *and* the mirror formulas are widened to include it, the family page automatically splits each family into a parents row above a children row. The code for this already exists and is dormant.
- **User-facing copy** — only the owner edits text guests will read.

## Code structure rules

- Small modules, one job each. Pure logic in `js/` as UMD modules (`family-data.js`); DOM rendering in sibling `js/` files (`family-render.js`) that take their dependencies as parameters.
- **No files over ~400 lines.** Approaching that → split.
- Sheet data is always inserted into the DOM via `textContent`, never `innerHTML`.

## Testing standards

- Every change ships with tests. Bug fixes ship with a test that fails before and passes after.
- Tests run **offline**. Sheet feeds are mocked as CSV strings inside the test file.
- Tests live in `tests/`, named `*.test.js`, discovered automatically by `node --test`.
- `npm test` must pass before opening a PR (CI enforces this on the PR).
- Test behaviour, not implementation detail.

## Workflow

1. Every change starts on a new branch (`feat/...`, `fix/...`, `chore/...`).
2. Branch off `main`. Never push directly to `main`.
3. Write the change + tests. Make sure `npm test` passes (CI runs it on the PR too).
4. Open a PR. Description must include:
   - **What changed** — one paragraph.
   - **Assumptions** — what was assumed about anything ambiguous.
   - **What to verify** — the specific things the owner should check before merging.
5. Owner reviews and merges. AI assistants never merge their own PRs.

## Secrets

- The static site holds no secrets. The published CSV links in `family.html` are public by design and expose only columns C–F of the guest tabs.
- When the backend arrives: `.env` is gitignored, `.env.example` is committed with placeholders, and the Google service-account JSON lives in an env var on the host, never in the repo.

## Out of scope for now

- RSVP (unique link per guest) — next major feature, needs the backend
- Updates feed
- Generations on the family page (dormant until the `Tree row` column is added)
- Real photos in the family tree avatars (supported by the design, not wired up)
- Plus-one handling, RSVP editing, photo gallery, gift registry, admin UI
