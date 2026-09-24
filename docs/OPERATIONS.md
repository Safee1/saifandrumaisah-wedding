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

## Notifications (dormant until Saif adds keys)

Edge Function `notify` (deployed, `supabase/functions/notify/index.ts`) is
called two ways:

1. **Fire-and-forget from the guest's own browser**, right after an RSVP,
   tree submission or blessing succeeds (see `TreeData.notify` /
   `RsvpData` / `BlessingsData` in `js/*.js`). It never blocks or can fail
   the guest's own action — it's a bare `fetch(...).catch(() => {})`.
2. **A daily digest**, triggered by POSTing `{"digest": true}` with header
   `X-Digest-Secret: <DIGEST_SECRET>` — reads the last 24h of
   `activity_log` (via the function's own service-role credentials, which
   Supabase provides automatically) and emails a summary.

**Right now, with no secrets set, every call returns
`{"ok": true, "sent": false, "reason": "notifications not configured"}`
and does nothing else.** This was verified live after deploy.

### To switch email on, Saif needs to:

1. **Create a Resend account** (resend.com) and add the domain
   `saifandrumaisah.com`. Resend will show a set of DNS records (SPF,
   DKIM, and it will ask for a `Return-Path`/tracking subdomain — Resend's
   own onboarding gives the exact current records; don't copy them from
   memory, they change).
2. **Add those DNS records in Namecheap → Advanced DNS.** This needs to
   coexist with whatever inbound mail setup the household picks for
   `23082026@saifandrumaisah.com` (Namecheap Private Email, per the
   Saif&Ruru brain file) — Resend's records are for *sending* mail from a
   subdomain or the apex, inbound mail (MX) is separate. If both use the
   apex domain, check for MX/record conflicts before adding either; when
   in doubt, send from a subdomain (e.g. a `mail.` or `notifications.`
   subdomain) so the two never collide. Get the exact final record set
   from Resend's own domain-verify screen at the time, not from this doc.
3. **Set two Supabase secrets** for the `notify` function: `RESEND_API_KEY`
   (from Resend) and `NOTIFY_TO` (comma-separated email address(es) that
   should get alerts — e.g. both Saif and Rumaisah's own addresses).
   Optionally set `DIGEST_SECRET` (any random string) to enable the daily
   digest, and set up something to call it once a day — a GitHub Action on
   a cron schedule, POSTing to
   `https://rfopieelzxvnmfhdvqqf.supabase.co/functions/v1/notify` with
   `{"digest": true}` and the `X-Digest-Secret` header, is the simplest
   option (`pg_cron`/`pg_net` are not currently enabled on this project).
4. That's it — no code changes needed. The function checks for the secrets
   on every call and only sends once they exist.

### What each notification event means

| `kind` | When |
|---|---|
| `rsvp_submitted` | Someone submits the RSVP/interest form |
| `tree_submitted` | Someone adds themselves/a relative to the tree |
| `blessing_submitted` | Someone leaves a blessing (before approval) |
| `admin_lockout` | 5 failed admin password attempts in 15 minutes |

No contact details, dietary notes or free-text messages ever go in a
summary or email — just names and counts.

## Mailbox plan (separate from the above)

Per the Saif&Ruru brain file, the household mailbox
`23082026@saifandrumaisah.com` is going on **Namecheap Private Email**
(paid, IMAP) — that's for the couple to receive real mail, and is
unrelated to the `notify` function above (which only *sends*, via Resend).
Buying/creating that mailbox needs Saif's Namecheap login.

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
