# Privacy page: working copy (kept in sync with the live `privacy.html`)

This file mirrors the live `privacy.html` (corrected in PR #107). The live page is the source
of truth; if they disagree, the page wins. It is not legal advice. Edit the page in a normal
PR, then update this file to match.

## Saif to confirm

- **Retention:** about 3 months after the wedding for RSVPs, blessings, email logs; whether the tree / blessings wall stay as a keepsake.
- **Activity-log retention:** the page says it is deleted with the RSVPs. Confirm.
- **Transfers wording:** "some providers are US-based; we rely on their standard contractual protections". Confirm the wording and the London region.
- **Update emails:** confirm "email about the wedding and nothing else".
- **Venue dietary data:** confirm the venue receives dietary details where needed.
- **Contact:** no shared mailbox exists yet; page says message Saif or Rumaisah directly. Update when one exists.

---

## Privacy: what we do with your information

This is a small family website, not a company, but we still want to be clear and fair about
the little bit of information we ask for.

### Who collects it
Saif and Rumaisah, for our own wedding planning. A few services handle the information on our
behalf, only to run the site:

- Supabase: database hosting, in London.
- GitHub Pages: website hosting.
- Typefaces are hosted on the site itself, so visiting it does not send anything to Google.
- Resend: email delivery, only once we switch it on.
- Namecheap: a shared mailbox, only once we set one up.

The venue receives headcounts and, where needed for catering, dietary requirements, nothing
else. The website's code is public on GitHub, but it contains no guest data.

### What we collect
- RSVP: name, an email or phone number, whether you can come, how many adults and children,
  children's ages if given (we do not ask for children's names), dietary requirements or
  allergies, and an optional note.
- Adding someone to the family tree: their name, who they connect to, relationship, side of the
  family, whether a child, and optionally your own name.
- A blessing: your name, your message and, only if you choose, your email for a thank-you.
- Technical logs: hosting providers keep standard logs including IP addresses.
- Activity log: private log of admin and system events; can include guest names and headcounts.

### Adding other people to the tree
Anyone can add a name, including relatives and children who haven't been asked. Entries wait
for approval. People named can ask for removal or correction (see Your choices).

### Children
On the public family tree, children appear only as "Little one". Family members who enter the
shared family code can see children's real names. The code is stored only as a hashed value,
never as plain text.

### Dietary and allergy details
These can be health-related, so we keep them only if you tick the consent box when you RSVP
(the tick and its timestamp are recorded). You can withdraw consent at any time and we will
delete them.

### Services and transfers
Supabase hosts the database in London; GitHub Pages hosts the site; Resend and Namecheap only
once switched on. Some providers are US-based; where data leaves the UK we rely on their
standard contractual protections. Hosting providers keep technical logs incl. IP addresses.

### Why
Only to plan the wedding (numbers, catering for allergies, the family tree) and, where you've
given an email address, to contact you about the wedding. No marketing, no selling, no sharing
outside the wedding planning.

### Where it's stored
In Supabase, behind access controls only we can unlock. RSVP details and pending tree
submissions aren't public; only approved names appear on the tree and only approved blessings
on the wall. Blessings are checked automatically: a database trigger sends flagged
(suspicious) ones to pending, held for approval before they appear. The email on a blessing
is stored but never shown publicly.

### Emails
We may email you about the wedding and nothing else. If we send email it goes through Resend.
Sent emails are logged (recipient, kind, delivery status), never the message content. The page
does not claim emails are live.

### How long we keep it
Nothing is deleted automatically. About three months after the wedding we will manually purge
all RSVPs, blessings, email logs and the activity log (the wedding date isn't fixed, so timing may move).
Family-tree entries are removed separately, on request. You can ask us to delete anything at
any time.

### Your choices
Ask us to correct or remove anything you've submitted, including opting out of email, by
messaging Saif or Rumaisah directly. Requests to see, correct or delete are answered within
one month. Complaints can go to the ICO (ico.org.uk).
