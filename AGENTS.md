# AGENTS.md

Operating contract for AI coding assistants and human contributors on this repo.
Read this **before** making any change. If a change would break a rule here, stop and ask.

## Project

A small wedding website for Saif & Rumaisah.
- **Domain:** saifandrumaisah.com (registered with Namecheap)
- **Repo:** github.com/Safee1/saifandrumaisah-wedding (private)
- **Data source:** Google Sheet (ID stored in `SHEET_ID` env var, not committed)
- **Hosting:** Render (free tier)
- **v1 scope:** public landing page, RSVP (unique link per guest), updates feed

## Stack

- **Backend:** Node.js + Express
- **Frontend:** server-rendered HTML + minimal vanilla JS, plain CSS
- **Sheets access:** Google Sheets API v4 via a service account
- **Tests:** node:test with a mocked Sheets client — no real network in tests
- **Run tests:** `npm test`
- **Run dev server:** `npm run dev`

## What needs the owner's explicit review before merge

Any change that:
- Touches Google Sheets read/write logic (`src/services/sheets.js`)
- Adds, renames, or changes the meaning of a Sheet column
- Adds a new external integration (email, analytics, error tracker, etc.)
- Modifies handling of guest personal data
- Changes any user-facing copy
- Adds a dependency to `package.json`

## What must be preserved (do not change without explicit approval)

- **Public URLs:** `/`, `/rsvp/:token`, `/updates`. Do not rename.
- **Sheet tab names:** `Dashboard`, `Venue`, `Budget`, `Guests`, `Vendors`, `Checklist`, `Seating`, `Updates`.
- **Guests tab — headers on row 4, data from row 5:**
  - B: `#`
  - C: `Guest name`
  - D: `Side`
  - E: `Relationship`
  - F: `Address`
  - G: `RSVP`
  - H: `Meal choice`
  - I: `Dietary needs`
  - J: `Plus-one`
  - K: `Notes`
  - L: `Invite token` *(added by this project)*
- **Updates tab — headers on row 1, data from row 2:**
  - A: `Date`
  - B: `Title`
  - C: `Body`
  - D: `Published` (TRUE/FALSE)
- **User-facing copy** — only the owner edits text guests will read.

## Code structure rules

- Small modules, one job each. Folders by role: `services/`, `handlers/`, `validators/`, `utils/`.
- **Dependency injection.** Every module takes its dependencies as parameters. Business logic never imports a stateful client at the top of the file — it receives one. This makes testing trivial.
- **No files over ~400 lines.** Approaching that → split.
- Configuration comes from `src/config/index.js`. No `process.env.X` scattered around the codebase.

## Testing standards

- Every change ships with tests. Bug fixes ship with a test that fails before and passes after.
- Tests run **offline**. The Sheets client is mocked.
- Tests live in `tests/`, mirroring `src/`.
- `npm test` must pass before opening a PR.
- Test behaviour, not implementation detail.

## Workflow

1. Every change starts on a new branch (`feat/...`, `fix/...`, `chore/...`).
2. Branch off `main`. Never push directly to `main`.
3. Write the change + tests. Run `npm test`. Make sure it passes.
4. Open a PR. Description must include:
   - **What changed** — one paragraph.
   - **Assumptions** — what was assumed about anything ambiguous.
   - **What to verify** — the specific things the owner should check before merging.
5. Owner reviews and merges. AI assistants never merge their own PRs.

## Secrets

- `.env` is gitignored. Never committed.
- `.env.example` lists required variables with placeholder values and is committed.
- The Google service-account JSON lives in an env var on the host, not in the repo.

## Out of scope for v1

- Family tree (likely a static image, later)
- Plus-one handling beyond yes/no
- Editing an RSVP after submission
- Photo gallery, gift registry, accommodation booking
- Admin UI for updates — updates are edited directly in the Sheet
