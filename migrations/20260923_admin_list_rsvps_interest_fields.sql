-- Extends admin_list_rsvps() to surface the expression-of-interest fields
-- added by 20260923_rsvp_interest_and_headcount.sql (contact, adults,
-- children, likelihood). Additive only: same function name/signature,
-- no drops, no policy changes — just more columns in the return table.

-- create or replace cannot change OUT-parameter row type, so the prior
-- signature is dropped and immediately recreated below (no window where
-- it is missing within this migration).
drop function if exists public.admin_list_rsvps(text);
create function public.admin_list_rsvps(pw text)
returns table (
  id uuid,
  name text,
  attending boolean,
  guest_count integer,
  dietary text,
  message text,
  created_at timestamp with time zone,
  contact text,
  adults integer,
  children integer,
  likelihood text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select r.id, r.name, r.attending, r.guest_count, r.dietary, r.message, r.created_at,
    r.contact, r.adults, r.children, r.likelihood
    from rsvps r order by r.created_at desc;
end;
$$;

grant execute on function public.admin_list_rsvps(text) to anon;
