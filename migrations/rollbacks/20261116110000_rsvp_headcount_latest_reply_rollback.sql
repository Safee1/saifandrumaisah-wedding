-- UNTESTED against Supabase — not applied. Rollback for
-- drafts/20261116110000_rsvp_headcount_latest_reply.sql.
--
-- WHAT IT DOES
--   Puts rsvp_headcount() back to the definition in
--   20260923_rsvp_interest_and_headcount.sql (adds up every reply marked as
--   coming, so re-sent replies are counted again) and removes the two helpers.
--   If you saved the live definition with pg_get_functiondef before applying
--   the draft, paste THAT back instead: it is the true "before".
--
-- HOW TO CHECK
--   select public.rsvp_headcount();   -- back to the old, higher number

begin;

create or replace function public.rsvp_headcount()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(adults, 0) + coalesce(children, 0)), 0)::integer
  from public.rsvps
  where attending = true;
$$;

grant execute on function public.rsvp_headcount() to anon;

drop function if exists public.rsvp_name_key(text);
drop function if exists public.rsvp_contact_keys(text);

commit;

notify pgrst, 'reload schema';
