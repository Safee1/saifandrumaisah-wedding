# Privacy page: proposed rewrite (DRAFT, not published)

This is a proposal for `privacy.html`, written for Saif and Rumaisah to edit. It is not legal
advice. It is kept here, not on the site, so a half-finished version can never go live.
Every line marked **[CONFIRM]** needs your decision or a fact only you know. Do not publish
until each one is settled, then copy the text into `privacy.html` in a normal PR.

Why a rewrite: the current page says things the site cannot yet do or that are no longer true
(see "What the current page gets wrong" at the bottom).

---

## Privacy: what we do with your information

*Last updated: [CONFIRM: date of publishing]*

This is a small family website, not a company. We still want to be clear and fair about the
little information we ask for.

### Who we are
Saif Ullah and Rumaisah [CONFIRM: full names as you want them shown] run this site for our own
wedding. Contact us at hello@saifandrumaisah.com **[CONFIRM: this mailbox receives and is read]**,
or message either of us directly.

### What we collect, and why
| What | Why | Who sees it |
|---|---|---|
| RSVP: name, an email or phone number, number of adults and children, **[CONFIRM: children's ages]**, how likely you are to come | To plan numbers and keep in touch about the wedding | Only us |
| Dietary needs or allergies (only if you tick the box to let us keep them) | To tell the venue so we can cater for you | Only us, and the venue **[CONFIRM: once chosen; names the venue only after the reveal]** |
| A name added to the family tree, and how the person is related | To build the family tree | Approved names appear on the tree; children appear only as "Little one" |
| A blessing message, and an email address if you choose to give one | To show on the blessings wall, and to say thank you | Approved blessings are public; your email is never shown |
| Technical details your browser sends (IP address, device type) | Needed for the pages to load | The hosting and font providers below |

Please note: relatives can be added to the tree by other family members. If you or your child
appear and you would rather not, tell us and we will remove it.

Blessings are checked automatically before they appear. [CONFIRM: if you decide to hold every
blessing for approval, say so here instead.]

We do not set cookies, and we do not use advertising or analytics.

### Who else handles it
- Supabase: stores the data. [CONFIRM: region of the project; unverified.]
- GitHub Pages: hosts the website.
- Google Fonts: the pages load fonts from Google, which receives your IP address and browser
  details. [CONFIRM: delete this line if the fonts are moved onto our own server.]
- Resend: sends email for us, **only once email is switched on** [CONFIRM: say "we do not
  currently send email" until it is].
- Namecheap: forwards mail sent to hello@saifandrumaisah.com.
- The venue or hotel, once chosen, for numbers and dietary needs. [CONFIRM]

Some of these providers are outside the UK [CONFIRM: wording on international transfers].
We do not sell your information or use it for marketing.

### Emails
[CONFIRM: pick one]
- *Not switched on yet:* "We do not currently send email from this site."
- *Switched on:* "If you give an email address we may send a confirmation or thank-you, and
  we may email everyone who RSVP'd with wedding updates (the reveal, travel, practical details).
  Every email says who we are and how to stop them."

### How long we keep it
[CONFIRM: your decision. Do not say "deleted automatically": today nobody's deletion runs by
itself.] Suggested honest wording: "We plan to review and delete RSVP details, email logs and
blessing email addresses about [CONFIRM: three] months after the wedding. We do this by hand.
[CONFIRM: say whether the family tree and blessings wall stay as a keepsake.]"

### Your rights
You can ask to see, correct, or delete what we hold about you, to withdraw consent for dietary
information, or to stop emails. Tell us at the address above. We will answer within one month.
If you are unhappy, you can complain to the Information Commissioner's Office (ico.org.uk).

---

## What the current page gets wrong (so the rewrite fixes it)

- It says data is deleted about three months after the wedding. Nothing does that automatically.
- It says emails are only a confirmation or thank-you, but the admin page has a "Message all
  guests" broadcast and the invitation promises a reveal.
- It does not mention that other people can add relatives (including children) to the tree.
- It does not name the providers (Supabase, GitHub, Google Fonts, Resend), the lawful reasons,
  the contact details, the right to complain, or a last-updated date.
- The wedding date is not set yet, so "three months after the wedding" has no date.

## Related changes that need your review (separate PRs)
- Self-host the two fonts so Google is not contacted (or keep the Google line above).
- A single "delete everything for this guest" admin tool (needs a database change).
- An unticked "email me wedding updates" box on the RSVP form (needs a database change).
