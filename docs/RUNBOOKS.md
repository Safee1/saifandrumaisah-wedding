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
5. If there is no Restore button, go to R3 and restore from your last CSV backup.

## R2. Change the admin password

One password covers `tree-admin.html`, `rsvp-admin.html` and `admin-activity.html`.
Use 20 or more random characters from the password manager.
1. Supabase, SQL editor. Check there is one row: `select id from public.admin_config;`
2. Run: `update public.admin_config set password_hash = crypt('NEW-PASSWORD', gen_salt('bf', 12)) where id = 1;`
3. Open an admin page in a private window and sign in with the new password.
4. Clear the SQL editor history afterwards: the new password was typed there.

## R3. Back up the RSVPs and the family tree

Supabase Free has no automatic backups. Do this by hand:
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

## R6. A guest asks for their data to be deleted

1. RSVP: `rsvp-admin.html`, find the row, **Delete**.
2. Blessing, email log and activity entries: Supabase SQL editor, `select` the rows for that
   person first, then `delete` those exact rows. Check `email_log` and `blessings` both.
3. Reply to the guest once it is done. Keep a short note of what was removed, without their data.

## R7. Switch guest email on (do not skip steps)

1. Merge and deploy the notify hardening first, and keep `RESEND_API_KEY` unset until then.
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
