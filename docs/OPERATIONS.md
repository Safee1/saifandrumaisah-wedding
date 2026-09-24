# Operations — activity log & notifications

## What this is

An audit trail of what happens on the site, plus optional email alerts,
built on top of the existing Supabase project (`rfopieelzxvnmfhdvqqf`).
Nothing here is guest-facing — it's for Saif & Rumaisah.

## The activity log

Table `activity_log` (RLS on, no policies — only readable via the admin RPC
below, same pattern as every other admin table). Written automatically by:

- `AFTER INSERT` triggers on `rsvps`, `people` (pending only) and
  `blessings` — every guest submission logs itself.
- The admin RPCs `admin_check` (login ok / failed / lockout),
  `admin_set_person_status`, `admin_restore_person`, and
  `admin_set_blessing_status` (approve/reject/restore actions).

All writes go through `activity_log_write()`, which swallows its own
errors — a logging bug can never break a guest's RSVP, tree submission or
blessing, or block an admin action.

**To read it:** open `admin-activity.html` (same password as
`tree-admin.html` / `rsvp-admin.html` — it's the same `admin_config` row
and the same brute-force lockout). It shows a filterable timeline, today/
7-day counts (new RSVPs, tree submissions pending, failed logins +
lockouts), and a CSV export button. Linked from the headers of
`tree-admin.html` and `rsvp-admin.html`. It's `noindex` and listed in
`robots.txt`, same as the other two admin pages — that's obscurity, not
real access control; the password is what actually protects it.

## Notifications & guest emails (dormant until Saif adds keys)

Edge Function `notify` (deployed, `supabase/functions/notify/index.ts`) now
sends real templated emails, not just ops alerts. It's called several ways:

1. **Fire-and-forget from the guest's own browser**, right after an RSVP,
   tree submission or blessing succeeds (see `TreeData.notify` /
   `RsvpData` / `BlessingsData` in `js/*.js`). It never blocks or can fail
   the guest's own action — it's a bare `fetch(...).catch(() => {})`.
   - `rsvp_submitted` / `tree_submitted` / `blessing_submitted` → a short
     ops alert to `NOTIFY_TO` (the couple), linking only to the relevant
     admin page.
   - `blessing_thanks` → sent only if the guest gave an email with their
     blessing; the exact thank-you copy in the spec; max once per email
     per 24h (checked against `email_log`).
   - `rsvp_confirmation` → sent only if the guest's RSVP has an
     email-shaped contact; a personal summary of what they told us.
2. **`message_all`**, called from admin-activity.html's "Message all
   guests" tab: `adminPw` is checked via `admin_check` (same as every
   other admin action) before anything happens. `test: true` sends only to
   `NOTIFY_TO`; a real send goes to every distinct email on file in
   `rsvps` (via `admin_list_rsvp_emails`), deduped, ~6-7/second, logged.
   Never auto-sends — the admin UI requires a successful test send first,
   then an explicit browser `confirm()`.
3. **A daily digest**, triggered by POSTing `{"digest": true}` with header
   `X-Digest-Secret: <DIGEST_SECRET>` — reads the last 24h of
   `activity_log` and emails a summary.

Edge Function `resend-webhook` (deployed,
`supabase/functions/resend-webhook/index.ts`) receives Resend's delivery
events (delivered/bounced/complained) and updates the matching `email_log`
row by `provider_id`. Dormant until `RESEND_WEBHOOK_SECRET` is set.

**Right now, with no secrets set, every call to `notify` returns
`{"ok": true, "sent": false, "reason": "notifications not configured"}`
and does nothing else.** This was verified live after deploy.

### Every email is logged

Table `email_log` (RLS on, no policies — read only via the admin RPC
`admin_list_email_log`, same pattern as `activity_log`). Every send/skip/
fail is written here: `to_email`, `kind`, `status`
(sent/skipped/failed/delivered/bounced/complained), `provider_id`, `error`.
Shown as the **Emails** tab on `admin-activity.html`.

### To switch email on, Saif needs to:

1. **Namecheap:** buy **Private Email** and create the shared mailbox
   `hello@saifandrumaisah.com` for Saif & Rumaisah (replaces the current
   `eforward1-5.registrar-servers.com` forwarding MX — that has to come
   off first). This is the reply-to address on every email the site sends.
2. **Resend:** create a **new Resend account for the wedding only**
   (never reuse a TestNow or RDS HUB account) and add the domain
   `saifandrumaisah.com`, sending from the subdomain
   `send.saifandrumaisah.com` (so it never collides with the Private
   Email MX on the apex domain).
3. **Namecheap → Advanced DNS**, final record set (get the exact current
   values from each provider's own dashboard at setup time — these move):
   - **MX** on the apex (`@`) → Namecheap Private Email's mail servers
     (for `hello@saifandrumaisah.com` inbound).
   - **SPF (TXT)** on the apex, covering Private Email
     (`include:spf.privateemail.com` or current equivalent).
   - **DKIM (TXT)**, **SPF (TXT)** and **MX** on `send.saifandrumaisah.com`
     → exactly what Resend's domain-verify screen shows for that
     subdomain (Resend needs its own MX on the sending subdomain for
     bounce handling; this does not touch the apex MX above).
   - **DMARC (TXT)** on `_dmarc.saifandrumaisah.com`:
     `v=DMARC1; p=quarantine; rua=mailto:hello@saifandrumaisah.com`.
4. **Supabase secrets** (Project Settings → Edge Functions → Secrets, or
   `supabase secrets set`) for both functions:
   - `RESEND_API_KEY` — from the wedding-only Resend account.
   - `NOTIFY_TO` — comma-separated address(es) for the couple's own alerts
     (e.g. both Saif's and Rumaisah's personal addresses, or
     `hello@saifandrumaisah.com` once it exists).
   - `RESEND_WEBHOOK_SECRET` — set this in Resend's webhook config
     (pointing at `.../functions/v1/resend-webhook`) and here, matching.
   - Optionally `DIGEST_SECRET` (any random string) for the daily digest,
     plus something to call it once a day — a GitHub Action on a cron
     schedule, POSTing `{"digest": true}` with the `X-Digest-Secret`
     header, is the simplest option.
5. **Test both directions**: send a blessing/RSVP with a real email and
   confirm the thank-you/confirmation arrives; use the "Send test to us"
   button on admin-activity.html's Message-all tab before ever sending to
   all guests; check the Emails tab shows `sent` (and later `delivered`
   once the webhook fires).

No code changes needed for any of this — every function already checks
for its secrets on each call and only sends once they exist.

### What each notification event means

| `kind` | When |
|---|---|
| `rsvp_submitted` | Someone submits the RSVP/interest form |
| `tree_submitted` | Someone adds themselves/a relative to the tree |
| `blessing_submitted` | Someone leaves a blessing (before approval) |
| `blessing_thanks` | Guest-facing thank-you, if they gave an email |
| `rsvp_confirmation` | Guest-facing RSVP confirmation, if they gave an email |
| `message_all` | Admin broadcast from admin-activity.html |
| `admin_lockout` | 5 failed admin password attempts in 15 minutes |

Ops alerts to the couple never include contact details or free-text
messages — just names and counts, and a link to the relevant admin page.

## Mailbox plan (separate from the above)

Per the Saif&Ruru brain file, the household mailbox now planned as
`hello@saifandrumaisah.com` is going on **Namecheap Private Email** (paid,
IMAP) — that's for the couple to receive real mail (including replies to
guest emails), and is the same mailbox the `notify` function sends *from*
and replies *to* via Resend. Buying/creating it needs Saif's Namecheap
login.

## Wall of Love (moderation, theming)

- New blessings run through the `blessing_moderate` trigger
  (`before insert on blessings`) before they're ever written: links,
  emails, phone numbers, profanity/abusive terms (English + common
  romanised Urdu/Punjabi/Arabic), ALL-CAPS shouting and repeated-character/
  word spam all hold a blessing at `status = 'pending'` with a
  `moderation_reason`; anything clean is auto-approved instantly. The
  guest always sees the same warm message either way — never told it was
  flagged.
- The same trigger runs a lightweight keyword classifier into a `theme`
  column (`congratulations` / `cant_wait` / `will_be_there` / `duas` /
  `love`) — admins can override it from the Blessings tab.
- `admin_set_blessing_status(pw, target, new_status, new_theme)` now
  supports `approved` / `hidden` / `pending`, and hiding no longer
  deletes the row — it's restorable from the Blessings tab.
- `email` and `moderation_reason` are never selectable by `anon`/
  `authenticated` (column-level `REVOKE`), even via an explicit
  `?select=email` — only through the admin RPCs.

## Security notes

- `activity_log`, like every other admin-only table in this project, has
  RLS enabled with **no policies** — the anon/authenticated roles get
  nothing; only `SECURITY DEFINER` functions (running as the table owner)
  can touch it.
- The `notify` Edge Function has `verify_jwt` disabled (it's called by the
  anon-key browser client and by a cron job, neither of which carries a
  user JWT) — its own protections are: the digest path requires a shared
  secret, and the event path only ever sends a fixed, short, pre-defined
  message shape (no guest-supplied HTML/links get emailed).
