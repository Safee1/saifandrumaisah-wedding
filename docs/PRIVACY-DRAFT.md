# Privacy page: working copy (kept in sync with the live `privacy.html`)

This file mirrors the live `privacy.html` (corrected in PR #107). The live page is the source
of truth; if they disagree, the page wins. It is not legal advice. Edit the page in a normal
PR, then update this file to match.

## Saif to confirm

- **Retention:** about 3 months after the wedding, and whether the family tree / blessings
  wall stay as a keepsake (the page currently says tree entries are removed only on request).
- **Update emails:** the page says "we may email you about the wedding and nothing else".
  Confirm that means update emails only (no marketing, no newsletters).
- **Venue dietary data:** the page says the venue gets headcounts and, where needed for
  catering, dietary requirements. Confirm that is what you want to do.
- **Supabase region / international transfers:** unverified. The page does not mention
  transfers outside the UK. Check the project region and add wording if needed.

---

## Privacy: what we do with your information

This is a small family website, not a company, but we still want to be clear and fair about
the little bit of information we ask for.

### Who collects it
Saif and Rumaisah, for our own wedding planning. A few services handle the information on our
behalf, only to run the site:

- Supabase: database hosting.
- GitHub Pages: website hosting.
- Namecheap: the hello@ mailbox (a real shared mailbox, not forwarding).
- Google Fonts: the typefaces.
- Resend: email delivery, only once we switch it on (currently dormant).

The venue receives headcounts and, where needed for catering, dietary requirements, nothing
else. The website's code is public on GitHub, but it contains no guest data.

### What we collect
- RSVP: name, an email or phone number, how many adults and children are coming, children's
  names and ages if given (ages are stored), and any dietary requirements or allergies.
- Adding yourself to the family tree: your name, how you're related to the family, and any
  children you add.
- A blessing message on the wall if you choose to leave one, and, only if you choose to give
  it, your email address so we can send a short thank-you.

### Children
On the public family tree, children appear only as "Little one". Family members who enter the
shared family code can see children's real names. The code is stored only as a hashed value,
never as plain text.

### Dietary and allergy details
These can be health-related, so we keep them only if you tick the consent box when you RSVP
(the tick and its timestamp are recorded). You can withdraw consent at any time and we will
delete them.

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
all RSVPs, blessings and email logs (the wedding date isn't fixed, so timing may move).
Family-tree entries are removed separately, on request. You can ask us to delete anything at
any time.

### Your choices
Ask us to correct or remove anything you've submitted, including opting out of email, by
messaging Saif or Rumaisah directly.
