-- =====================================================================
-- 20261116110000_rsvp_headcount_latest_reply.sql
--
-- DRAFT. NOT applied anywhere. Needs the owner's review (it changes an RPC).
-- Written without a running database, so it is UNTESTED: read it, try it on
-- a scratch copy if you can, then run it on the live project yourself.
-- The scratch copy must be a spare Supabase project (or a local Supabase
-- stack), NOT bare Postgres: the file names the roles anon and authenticated
-- and needs the rsvps table, so on plain Postgres it stops with "role does
-- not exist" and nothing is applied. Until you have run it, the public
-- number on the RSVP page is still the old, too-high one.
--
-- DO THIS FIRST (it is your only true undo)
--   1. In the SQL editor run:
--        select pg_get_functiondef('public.rsvp_headcount()'::regprocedure);
--   2. Save the result in a file outside this repo.
--
-- WHAT IT CHANGES (plain English)
--   The public number on the RSVP page ("people planning to come so far")
--   now counts each guest ONCE, using their LATEST reply. If the latest
--   reply says they cannot come, they are not counted.
--
-- WHY
--   The RSVP page tells guests to send the form again if plans change.
--   Every re-send is a new row, and the old function added up every row
--   marked as coming. A family that corrected 4 people to 5 counted as 9,
--   and a family that later said "can't make it" stayed counted for ever.
--
-- WHO COUNTS AS "THE SAME GUEST"
--   An older reply is replaced by a newer one only when BOTH the name AND
--   the contact match after tidying. This is the rule the RSVP admin page
--   uses (js/rsvp-dupes.js: "same name AND a shared contact key"), so the
--   public number follows your admin total.
--     name:    lower case, accents put in one standard form, spaces and
--              common punctuation squeezed to one space
--              ("  Test  Guest " = "test guest")
--     contact: every email and every phone number found in the box.
--              emails: trimmed, lower case
--              digits typed in another script (Arabic, Urdu, Hindi, Bengali
--              and similar keyboards) are read as 0-9 first
--              phones: runs of 7+ digits, digits only, leading 00, 44 and 0
--              removed ("+44 (0)7700 900123" = "07700 900123 (mum)")
--              Two replies match on contact when they share at least one.
--   A reply with no usable name or no usable contact is never replaced and
--   never replaces anything; it counts on its own.
--
-- LIMITS (honest list)
--   * Same person, different contact the second time (phone first, email
--     later): counted twice. Deliberate: matching on the name alone would
--     merge two different guests who share a name.
--   * Two different guests with the same name AND the same contact: only
--     the latest counts. Needs one person to reply twice under exactly the
--     same name for two households.
--   * The admin page chains matches (A matches B, B matches C, so all three
--     are one guest even if A and C share nothing). This function does not
--     chain: a reply is dropped only when a NEWER reply matches it directly.
--     The two can differ by one reply only in an odd case: three replies
--     under one name where the OLDEST is the only one listing both contacts.
--   * Punctuation in names is tidied from a fixed list (below): Latin
--     punctuation, the common dashes and quotes, Arabic/Urdu and Hindi
--     punctuation, odd spaces and invisible zero-width characters. The
--     browser rule is still slightly broader (it also drops emoji and every
--     other symbol). A re-send where only an emoji or a rare symbol in the
--     name changed counts twice. Letters and vowel marks are never dropped.
--   * Capital letters with accents are lowered by the database's own
--     language setting, which I could not look at. Check step 2 below has a
--     line for this; if it says false, such names count twice on re-send.
--   * Two phone numbers typed in one box with only spaces between them:
--     the admin page splits them, this function reads them as one long
--     number that matches nothing, so that re-send counts twice here.
--   * A number written with a slash inside it (07700/900123) gives no
--     usable phone key, here or on the admin page.
--   * A non-UK number typed once with its country code and once in local
--     form is not matched, here or on the admin page.
--   * PRIVACY, your decision: because a newer reply replaces an older one
--     with the same name and contact, someone who already knows a guest's
--     exact name AND their phone or email could send a reply in that name
--     and watch how the public number moves. That tells them whether the
--     guest had replied and for how many people, and a made-up "cannot
--     come" in their name lowers the public number (on the admin page the
--     real reply then shows as "Earlier reply, not counted"). The old plain
--     sum did not give this away. Accept it, or ask for the public number
--     to be rounded or hidden below a threshold before applying. Either
--     way, an unexpected "cannot come" is worth a second look.
--   * If js/rsvp-dupes.js changes its rule again, change the two helper
--     functions here to match.
--   * It is still a soft "so far" number: nothing stops someone sending
--     made-up replies (the flood cap limits how many).
--
-- WHAT THE REPO CANNOT TELL ME
--   rsvp_headcount() is defined in one repo file only
--   (20260923_rsvp_interest_and_headcount.sql) and nothing later changes it,
--   but I could not look at the live database. Safe either way: "create or
--   replace", same name, no arguments, same return type, can be run twice.
--   To keep a true undo, save what is live first (DO THIS FIRST, above).
--
-- HOW TO CHECK IT WORKED (SQL editor, after running this file)
--   1. Old sum next to the new number. New must be the same or lower:
--        select (select coalesce(sum(coalesce(adults, 0) + coalesce(children, 0)), 0)
--                  from public.rsvps where attending = true) as old_number,
--               public.rsvp_headcount() as new_number;
--   2. The matching rule. Expect: true, true, {phone:7700900123}, true
--        select public.rsvp_name_key('  Test  Guest ') = public.rsvp_name_key('test guest');
--        select public.rsvp_contact_keys('+44 (0)7700 900123')
--            && public.rsvp_contact_keys('07700 900123 (mum)');
--        select public.rsvp_contact_keys('07700 900123');
--        select public.rsvp_name_key('TÉST GUEST') = public.rsvp_name_key('tést guest');
--   3. Which names sent more than one reply (shows names; SQL editor only):
--        select public.rsvp_name_key(name) as guest, count(*) as replies
--          from public.rsvps group by 1 having count(*) > 1;
--
-- HOW TO UNDO
--   Run migrations/rollbacks/20261116110000_rsvp_headcount_latest_reply_rollback.sql
-- =====================================================================

begin;

-- Name key. '' when there is nothing usable. Internal helper.
create or replace function public.rsvp_name_key(p_name text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select btrim(regexp_replace(
    lower(normalize(coalesce(p_name, ''), NFC)),
    '[\s\u00A0\u2000-\u200F\u2028-\u202F\u205F-\u2064\u3000-\u3002\uFEFF\u2010-\u2027\u2030-\u205E\u2212\u00A1\u00AB\u00B7\u00BB\u00BF\u060C\u061B\u061F\u066A-\u066D\u06D4\u0964\u0965.,;:!?''"`’‘“”()\[\]{}<>_/\\|*&#+~^=-]+', ' ', 'g'
  ))
$function$;

-- Contact keys: every email ('email:...') and phone ('phone:...') in the
-- free-text contact box. Empty array when there is nothing usable.
-- Mirrors contactKeys() / normalizePhone() in js/rsvp-dupes.js.
create or replace function public.rsvp_contact_keys(p_contact text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  with src as (
    -- digits typed in another script become 0-9 (same list as asciiDigits()
    -- in js/rsvp-dupes.js: Arabic-Indic, Persian/Urdu, Devanagari, Bengali,
    -- Gurmukhi, Gujarati, full-width)
    select translate(coalesce(p_contact, ''),
                     '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९০১২৩৪৫৬৭৮৯੦੧੨੩੪੫੬੭੮੯૦૧૨૩૪૫૬૭૮૯０１２３４５６７８９',
                     '0123456789012345678901234567890123456789012345678901234567890123456789') as s
  ),
  emails as (
    select 'email:' || regexp_replace(lower(btrim(m[1])), '[.]+$', '') as k
    from src,
         regexp_matches(src.s, '([^\s@<>(),;:]+@[^\s@<>(),;:]+)', 'g') as m
  ),
  phones as (
    select 'phone:' || c.d2 as k
    from src,
         regexp_matches(
           regexp_replace(src.s, '[^\s@<>(),;:]+@[^\s@<>(),;:]+', ' ', 'g'),
           '(\+?[0-9][0-9\s().-]*[0-9])', 'g'
         ) as m,
         lateral (select regexp_replace(m[1], '[^0-9]', '', 'g') as d0) a,
         lateral (select case when a.d0 like '00%' then substr(a.d0, 3) else a.d0 end as d1) b,
         lateral (select case
                           when b.d1 like '44%' and length(b.d1) > 10
                             then regexp_replace(substr(b.d1, 3), '^0', '')
                           when b.d1 like '0%' then substr(b.d1, 2)
                           else b.d1
                         end as d2) c
    where length(a.d0) >= 7
      and c.d2 <> ''
  )
  select coalesce(array_agg(distinct u.k), '{}'::text[])
  from (
    select k from emails where k <> 'email:'
    union all
    select k from phones
  ) u
$function$;

-- Public running headcount: add up adults + children over the replies that
-- say "coming" and have NOT been replaced by a newer reply from the same
-- guest (same name key AND at least one shared contact key).
-- Still returns a single integer, never rows, names or contacts.
create or replace function public.rsvp_headcount()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with keyed as (
    select r.id, r.attending, r.adults, r.children, r.created_at,
           public.rsvp_name_key(r.name) as name_key,
           public.rsvp_contact_keys(r.contact) as contact_keys
    from public.rsvps r
  )
  select coalesce(sum(coalesce(a.adults, 0) + coalesce(a.children, 0)), 0)::integer
  from keyed a
  where a.attending is true
    and not exists (
      select 1
      from keyed b
      where b.id <> a.id
        and a.name_key <> ''
        and b.name_key = a.name_key
        and b.contact_keys && a.contact_keys
        and (b.created_at, b.id) > (a.created_at, a.id)
    );
$function$;

revoke all on function public.rsvp_name_key(text) from public, anon, authenticated;
revoke all on function public.rsvp_contact_keys(text) from public, anon, authenticated;
grant execute on function public.rsvp_headcount() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
