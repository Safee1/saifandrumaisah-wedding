-- Extends the RSVP flow into an "are you coming?" expression of interest
-- (adults/children/likelihood/contact) and adds a SECURITY DEFINER function
-- that returns only the public running headcount — no names, no contacts.
-- Additive only: no drops, no changes to existing columns/policies.

alter table public.rsvps
  add column if not exists contact text,
  add column if not exists adults integer,
  add column if not exists children integer default 0,
  add column if not exists likelihood text;

alter table public.rsvps
  add constraint rsvps_adults_check check (adults is null or (adults >= 0 and adults <= 20));

alter table public.rsvps
  add constraint rsvps_children_check check (children is null or (children >= 0 and children <= 20));

alter table public.rsvps
  add constraint rsvps_likelihood_check
    check (likelihood is null or likelihood in ('definitely', 'very_likely', 'hoping_to'));

-- Public running headcount: sum of adults+children across submissions marked
-- as attending. No RLS change needed — this is a function, not a table grant,
-- and it returns a single integer, never rows.
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
