# Runbooks

What to do when something is wrong, in plain steps. This folder is not published by GitHub Pages.
Rules for this file: placeholders only. Never write a password, key, recovery code, guest detail
or any sealed term here. Where a step runs SQL, run the `select` first and check what it returns.

Print R0 and keep it somewhere both of you can find it.

## R0. Break-glass sheet (fill in on paper, keep two copies)

- Who owns each account (which email): GitHub, Supabase, Namecheap, Resend
- Where the shared password manager is, and who can open it
- Where the 2FA recovery codes are
- Supabase project: `rfopieelzxvnmfhdvqqf` (also visible in the page source)
- Repo: https://github.com/Safee1/saifandrumaisah-wedding
- Domain renewal date: note it from Namecheap and turn on auto-renew
- A second person who can act (Rumaisah, plus one trusted helper)

Goal: nothing important lives only in one person's head or one person's login.

## R1. The site says "couldn't load" or RSVP says "Something went wrong"

Likely cause: the free Supabase project paused.
1. Sign in at supabase.com with the account that owns the project.
2. Open the project, press **Restore project**, wait 2 to 5 minutes.
3. GitHub, Actions, **keep-db-awake**, **Run workflow**. It must go green.
4. Open the site, unlock the family tree, open `rsvp.html`. Do not submit test data.
5. If there is no Restore button, the free plan has no automatic backups and no point-in-time recovery: a project paused for more than about 90 days cannot be restored from the dashboard. Rebuild from the repo (`migrations/`, `migrations/SCHEMA_SNAPSHOT.md`) and re-enter data from your last CSV and notes (R3). Only what you exported yourself can be recovered.

## R2. Change the admin password

One password covers `tree-admin.html`, `rsvp-admin.html` and `admin-activity.html`.
Use 20 or more random characters from the password manager. Five wrong attempts in 15 minutes lock all admin sign-in for 15 minutes (the lockout is global, not per person).
1. Supabase, SQL editor. Check there is one row: `select id from public.admin_config;`
2. Run: `update public.admin_config set password_hash = crypt('NEW-PASSWORD', gen_salt('bf', 12)) where id = 1;`
3. Open an admin page in a private window and sign in with the new password.
4. Clear the SQL editor history afterwards: the new password was typed there.

## R3. Back up the RSVPs and the family tree

Supabase Free has no automatic backups and no point-in-time recovery, so anything you have not exported cannot be brought back. Do this by hand:
- Every week, and before any bulk admin action: `rsvp-admin.html`, **Export CSV**, save as
  `rsvps-YYYY-MM-DD.csv` in a folder both of you can open.
- Also after the RSVP deadline and the day before the wedding.
- The tree and blessings are not in that CSV. Until a full export exists, copy them from the
  admin pages into a note when you change a lot.

## R4. Reveal day (the surprise goes public)

Do this in one change, never in pieces, and do not push early.
1. A week before: rehearse on a local copy with dummy values. Run `npm test`. Do not push.
2. In `js/config.js` set the date and switch the reveal on in the same edit.
3. Update the three meta descriptions in `index.html` (they say the rest is sealed).
4. Update the sealed sentence in the email templates, and redeploy the notify function.
5. If the share picture changes, give it a new file name and update every tag that uses it.
6. The leak-guard tests are meant to go red when sealed words appear in code. Update them in the
   same change (and the `LEAK_TERMS` repo secret) and say so in the PR.
7. After it is live, re-share the link in the Facebook Sharing Debugger so previews refresh.

## R5. Emergency takedown

1. GitHub, repo, Settings, Pages, **Unpublish site**. The site disappears within minutes.
2. Fix the problem on a branch, open a PR, merge it, then publish again.
3. To remove a bad guest message: admin-activity, Blessings, mark it rejected.

## R6. A guest asks for their data to be deleted, or the post-wedding clear-out

One guest:
1. RSVP: `rsvp-admin.html`, find the row, **Delete**.
2. Blessing, email log and activity entries: Supabase SQL editor, `select` the rows for that
   person first, then `delete` those exact rows. Check `email_log`, `blessings` and `activity_log`
   (activity text can contain a guest's name).
3. Reply to the guest once it is done. Keep a short note of what was removed, without their data.

Everything, about three months after the wedding (as the privacy page promises):
1. Export a final CSV first (R3) if you want to keep a private copy.
2. SQL editor: `select count(*) from public.rsvps;` and the same for `blessings` and `email_log`. Check the numbers look right.
3. Run `select * from public.admin_purge_guest_data('ADMIN-PASSWORD', 'DELETE');` (type the password only here, then clear the editor history). This deletes ALL rsvps, blessings and email_log rows. It does NOT touch the activity log, people or relationships.
4. Clear the activity log by hand: `select count(*) from public.activity_log;` then `delete from public.activity_log;`. Check the count is 0 afterwards.
5. Family-tree entries (`people`, `relationships`) are NOT removed by the above. Delete them separately, only on request, after a `select` of the exact rows.
## R7. Switch guest email on (do not skip steps)

1. Merge and deploy the notify hardening first, and keep `RESEND_API_KEY` unset until then. The LIVE `resend-webhook` function is older than the repo version: redeploy it from `main` BEFORE setting `RESEND_WEBHOOK_SECRET`.
2. In Resend add the domain used in the From address and copy exactly the DNS records it shows
   into Namecheap. Wait for **Verified**.
3. Send one test mail to yourself. Check the "reply" really reaches the inbox.
4. Update `privacy.html` so it says what is emailed, before any guest mail goes out.
5. Set the DMARC policy to quarantine only after a week or two of clean reports.
6. Only then set the key on production and send a test from the Message-all tab.

## R8. Domain and certificate health

- About 30 Nov 2026: check the site's certificate expiry has moved forward.
- Turn on auto-renew for the domain, and note the renewal date on R0.
- After any DNS change at the registrar, open the site and `www` and confirm both load.

## R9. Personal-data breach plan

Use this if guest data (RSVPs, blessings, emails, family-tree entries) may have been seen by someone who should not have it, or an admin password, family code or key has leaked. Write the times down as you go.

1. Contain, straight away:
   - [ ] Rotate the admin password (R2).
   - [ ] Change the family code in `tree-admin.html` (16 characters or more).
   - [ ] Revoke any exposed key: Supabase API keys, Resend key, GitHub tokens. Set the new values and redeploy where needed.
   - [ ] If the site itself is leaking, take it down (R5).
2. Assess what was exposed:
   - [ ] Which tables or files: [rsvps / blessings / email_log / activity_log / people / other]
   - [ ] Roughly how many people: [number]
   - [ ] Which details: [names / emails / dietary or health info / other]
   - [ ] When it started and when it was contained: [date and time]
   - [ ] Who could have seen it: [public / one person / unknown]
3. Tell the couple (both of you) the same day: [who found it, what is known, what is done].
4. Decide whether to report:
   - [ ] Is there a risk to the people affected (for example emails plus dietary or health details, or misuse likely)? If yes, tell the ICO within 72 hours of becoming aware: [ICO report reference].
   - [ ] If the risk to people is high, tell the affected guests directly, in plain words: what happened, what it means for them, what you have done, who to contact.
   - [ ] If you decide not to report, write down why and the date.
5. After:
   - [ ] Fix the cause on a branch and merge it (never include real data in the PR).
   - [ ] Note what changed in this file if a step was missing.
