# AGENTS.md

Operating contract for AI coding assistants and human contributors on this repo.
Read this **before** making any change. If a change would break a rule here, stop and ask.

## Project

A small wedding website for Saif & Rumaisah.
- **Domain:** saifandrumaisah.com (Namecheap; DNS points at GitHub Pages)
- **Repo:** github.com/Safee1/saifandrumaisah-wedding (**public** — never commit secrets or passwords; admin passwords live only in Supabase RPCs)
- **Hosting:** GitHub Pages, deployed from `main` (static site, no build step)
- **Live pages:** `/` (invitation story + box-chart family tree, locked behind an "unlock our families" gate + blessings wall), `add-to-tree.html` (public submit form), `tree-admin.html` (password-gated approvals for people/relationships **and** blessings moderation), `rsvp.html` (public RSVP), `rsvp-admin.html` (password-gated RSVP list + CSV), `404.html`
- **Data source:** Supabase (project `rfopieelzxvnmfhdvqqf`), reached from the browser with the public anon key via REST — see `js/tree-data.js`, `js/rsvp-data.js`, `js/blessings-data.js`

## Data model (Supabase)

- `people` — id, name, side (`saif`/`rumaisah`), is_kid, status (`pending`/`approved`), sort_order, submitted_note. Public SELECT only where approved; public INSERT forced to pending by RLS.
- `relationships` — id, from_person, to_person, type (`parent_of`/`spouse_of`/`sibling_of`), status. Same RLS shape.
- `blessings` — guest messages for the blessings wall. Public INSERT forced to pending by RLS; public SELECT only where approved.
- `rsvps` — public INSERT, admin-only read.
- Admin actions go through `SECURITY DEFINER` RPCs that take the password as an argument: `admin_list_pending`, `admin_set_person_status`, `admin_set_relationship_status`, `admin_list_blessings`, `admin_set_blessing_status`, `admin_list_rsvps`, `admin_delete_rsvp` (also takes a `target` uuid), `admin_list_all`. `admin_check` also exists in the DB but is no longer called from any page in this repo — legacy, kept for now rather than dropped. Passwords are **not** in the repo.
- Schema changes are applied as Supabase migrations (via MCP/CLI), not tracked in this repo — describe them in the PR body.

## Stack & structure

- Static HTML + vanilla ES5-style JS + plain CSS. No dependencies, no build.
- **Shared logic** lives in `js/` as UMD modules so the same file works in a browser `<script>` tag and in node tests:
  - `js/family-plan.js` — pure tree planning (graph, crown couple, side layout). No DOM.
  - `js/family-tree.js` — DOM rendering of the box-chart tree + the unlock gate; depends on FamilyPlan.
  - `js/family-lines.js` — draws the SVG connector lines (marriage/spine/children bar) between rendered boxes. Pure DOM measurement, no data knowledge.
  - `js/tree-data.js`, `js/rsvp-data.js`, `js/blessings-data.js` — Supabase REST access.
  - `js/countdown.js` — countdown logic.
- **No files over ~400 lines.** Approaching that → split (pure logic module + DOM sibling, like family-plan/family-tree). `js/family-tree.js` is already past this (~520 lines, box-chart rendering + unlock gate) — next non-trivial change to it should split out a piece rather than grow it further. `index.html` is also well past this (~1,380 lines: ~840 of inline `<style>`, ~215 of inline `<script>`, the rest markup) — next non-trivial change to it should start pulling the inline CSS/JS into their own files instead of growing the inline blocks.
- Remote data is always inserted into the DOM via `textContent`, never `innerHTML`.

## Cache-stamp convention (IMPORTANT)

GitHub Pages caches each file for 10 minutes independently, so a deploy can serve new HTML with old JS (or vice-versa) — this has broken the live site before. Therefore:
- Every `<script src="js/...">` carries a `?v=N` stamp.
- **Any change to a `js/` file bumps `N` on every page that references it** (keep the number uniform across pages).

## What needs the owner's explicit review before merge

- Changes to the Supabase schema, RLS, or RPCs
- New external integrations (email, analytics, error tracking…)
- Changes to how guest personal data is handled or displayed
- User-facing copy changes (text guests will read)
- Adding a dependency

## Testing standards

- Every change ships with tests; bug fixes ship with a test that fails before and passes after.
- Tests run **offline** (`node:test`, no network). Live: `npm test`. CI runs it on every PR (`.github/workflows/test.yml`).
- Tests live in `tests/`, named `*.test.js`. Test behaviour, not implementation detail.
- Before opening a PR, also verify the rendered result (local static server + real browser/screenshots at 320px and desktop) — CI only proves logic, not layout.

## Workflow

1. Every change starts on a new branch (`feat/...`, `fix/...`, `chore/...`) off `main`. Never push to `main` (branch protection enforces PRs).
2. `npm test` green + visual check before opening the PR.
3. PR description: **What changed**, **Assumptions**, **What to verify**.
4. The owner reviews and merges. AI assistants do not merge their own PRs.
5. After merge, the OneDrive approved snapshot is refreshed (see the household's ops conventions).

## Out of scope for now

- Real photos in the tree avatars (design supports it, not wired up)
- Guest-specific RSVP links, meal choices, plus-one handling
- Updates feed, gift registry, photo gallery
