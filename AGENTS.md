# AGENTS.md

Operating contract for AI coding assistants and human contributors on this repo.
Read this **before** making any change. If a change would break a rule here, stop and ask.

## Project

A small wedding website for Saif & Rumaisah.
- **Domain:** saifandrumaisah.com (Namecheap; DNS points at GitHub Pages)
- **Repo:** github.com/Safee1/saifandrumaisah-wedding (**public** — never commit secrets or passwords; admin passwords live only in Supabase RPCs)
- **Hosting:** GitHub Pages, deployed from `main` (static site, no build step)
- **Live pages:** `/` (invitation story + box-chart family tree, locked behind an "unlock our families" gate + blessings wall), `add-to-tree.html` (open submit form: anyone can add family, still pending approval), `tree-admin.html` (password-gated approvals for people/relationships **and** blessings moderation), `rsvp.html` (public RSVP), `rsvp-admin.html` (password-gated RSVP list + CSV), `404.html`
- **Data source:** Supabase (project `rfopieelzxvnmfhdvqqf`), reached from the browser with the public anon key via REST — see `js/tree-data.js`, `js/rsvp-data.js`, `js/blessings-data.js`

## Data model (Supabase)

- `people` — id, name, side (`saif`/`rumaisah`), is_kid, status (`pending`/`approved`), sort_order, submitted_note. **The tree is open to everyone**: the page calls the `submit_to_tree` RPC, which inserts rows as `pending`; nothing is public until an admin approves it. Public SELECT is revoked; the tree loads through `public_tree()` (kids shown as "Little one") and, once unlocked, `family_tree(code)`.
- `relationships` — id, from_person, to_person, type (`parent_of`/`spouse_of`/`sibling_of`), status. Same shape: no direct reads or writes from the browser; everything goes through the RPCs above.
- `invite_codes` — legacy. The invite-code path (`submit_with_invite`, `admin_create_invite`, `admin_list_invites`, `admin_revoke_invite`) still exists in the DB but is **unused** since the tree opened (PR #44). Do not build on it.
- Family code (unlocks the full tree): `admin_set_family_code` stores a **bcrypt hash only** (`family_access`), never the code, and enforces a **16-character minimum**. `family_tree(code)` has a **global lockout: 5 wrong guesses in 15 minutes, across all callers**; while locked it refuses every guess, right or wrong (`family_code_attempts`). The admin password has the same 5-in-15 lockout via `admin_check`.
- **Return-instead-of-raise pattern.** A `RAISE EXCEPTION` rolls back the whole call, including the failure row just inserted, so a counter fed only on the raise path never counts. Functions that must count failures (`family_tree`, `admin_set_family_code`, `admin_purge_guest_data`) therefore RETURN a small status (`wrong_code`, `locked`, or an error column) and let the insert commit. `js/tree-data.js` turns these into err.status 400/429. Use this pattern for any new failure counter.
- Flood caps: the `flood_guard` trigger limits inserts per table per 10 minutes, across all users: **40 for `rsvps`**, **300 for the others** (`blessings`, `people`).
- `admin_purge_guest_data(pw, confirm)` (SQL editor only) deletes all rsvps, blessings and email_log rows. It leaves people, relationships and activity_log (whose text can hold names); see `docs/RUNBOOKS.md` R6.
- `blessings` — guest messages for the blessings wall. Public INSERT forced to pending by RLS; public SELECT only where approved.
- `rsvps` — public INSERT (flood-capped), admin-only read.
- Admin actions go through `SECURITY DEFINER` RPCs that take the password as an argument (`admin_list_pending`, `admin_set_person_status`, `admin_set_relationship_status`, `admin_list_blessings`, `admin_set_blessing_status`, `admin_list_rsvps`, `admin_delete_rsvp`, `admin_data_counts`, plus the activity and email-log lists). `admin_list_all` and `admin_check` are not called from any page directly. Passwords are **not** in the repo.
- **Apply and deploy rules.** An AI assistant never calls the live database and never applies SQL. Saif applies SQL himself in the Supabase dashboard SQL editor. New migrations stay in `migrations/drafts/` until Saif has applied them, then are promoted to `migrations/` with an "APPLIED ... do not re-run" header. Rollback files live in `migrations/rollbacks/`. The October changes were applied via the SQL editor, outside the migration tracker (see `migrations/SCHEMA_SNAPSHOT.md`); do not run `supabase db push`. Describe every schema change in the PR body.
- **Email is dormant.** The `notify` and `resend-webhook` Edge Functions do nothing until the Resend key and secrets exist (`docs/OPERATIONS.md`). The LIVE `resend-webhook` is OLDER than the repo version: redeploy it from `main` before setting `RESEND_WEBHOOK_SECRET`.
- **The repo is public.** Never commit sealed information (venue, exact date, guest names or emails), passwords, the family code, tokens or keys, in files, commit messages, branch names or PR text. A CI guard blocks sealed terms.

## Stack & structure

- Static HTML + vanilla ES5-style JS + plain CSS. No dependencies, no build.
- **Shared logic** lives in `js/` as UMD modules so the same file works in a browser `<script>` tag and in node tests:
  - `js/family-plan.js` — pure tree planning (graph, crown couple, side layout). No DOM.
  - `js/family-tree.js` — DOM rendering of the box-chart tree + the fold/full-view interaction (attachFoldToggle, buildMiniFold/buildSiblingFold, exports setFullView); depends on FamilyPlan. The unlock gate itself (`.unlock-btn` styles + inline script) lives in `index.html`, not here.
  - `js/family-lines.js` — draws the SVG connector lines (marriage/spine/children bar) between rendered boxes. Pure DOM measurement, no data knowledge.
  - `js/tree-data.js`, `js/rsvp-data.js`, `js/blessings-data.js` — Supabase REST access.
  - `js/countdown.js` — countdown logic.
  - `js/config.js` — **the site's settings**: wedding `date` and the abroad `travel` switch (`show`, `destination`, `country`). Read by index.html and rsvp.html; never hard-code them in a page (`tests/config.test.js` enforces this).
  - `js/travel.js` — travel checklist logic (reply-by = date − 3 months, passport-until = date + 2 weeks + 6 months, checklist copy, localStorage ticks). Guests book and pay their own travel — no copy may imply otherwise (tested).
  - `js/addressee.js` — cleans the `?to=` envelope name and picks its size.
  - `css/envelope.css` — the intro envelope, its liner and the wax seal (moved out of `index.html`'s inline `<style>`; the rest of the intro's CSS is still inline). Decorative textures are inline SVG data URIs, no image files.
- **No files over ~400 lines.** Approaching that → split (pure logic module + DOM sibling, like family-plan/family-tree). `js/family-tree.js` is already past this (~520 lines, box-chart rendering + fold interaction) — next non-trivial change to it should split out a piece rather than grow it further. `index.html` is also well past this (~1,380 lines: ~840 of inline `<style>`, ~215 of inline `<script>`, the rest markup) — next non-trivial change to it should start pulling the inline CSS/JS into their own files instead of growing the inline blocks.
- Remote data is always inserted into the DOM via `textContent`, never `innerHTML`.

## Cache-stamp convention (IMPORTANT)

GitHub Pages caches each file for 10 minutes independently, so a deploy can serve new HTML with old JS (or vice-versa) — this has broken the live site before. Therefore:
- Every `<script src="js/...">` and `<link href="css/...">` carries a `?v=N` stamp.
- **Any change to a `js/` or `css/` file bumps `N` on every page that references it** (keep the number uniform across pages — `tests/index-page.test.js` fails if the stamps on `index.html` differ).

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
   PR titles, PR bodies and commit messages never contain sealed words (the venue or other undisclosed details): say "the leak list". Reveal day, restore, password change, takedown and guest-data deletion steps are in `docs/RUNBOOKS.md`.
5. After merge, the OneDrive approved snapshot is refreshed (see the household's ops conventions).

## Out of scope for now

- Real photos in the tree avatars (design supports it, not wired up)
- Guest-specific RSVP links, meal choices, plus-one handling
- Updates feed, gift registry, photo gallery
