-- Launch-day RSVP fixes (24 Sep 2026).
-- 1. children_ages: hotels price children by age, so ask for them.
-- 2. guest_count cap 10 -> 40 (adults<=20 + children<=20 could exceed 10 and fail).
-- 3. admin_list_rsvps returns children_ages.
alter table public.rsvps add column if not exists children_ages text;
alter table public.rsvps drop constraint if exists rsvps_children_ages_len;
alter table public.rsvps add constraint rsvps_children_ages_len
  check (children_ages is null or char_length(children_ages) <= 200);

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.rsvps'::regclass
     and pg_get_constraintdef(oid) like '%guest_count <= 10%';
  if c is not null then execute format('alter table public.rsvps drop constraint %I', c); end if;
end $$;
alter table public.rsvps drop constraint if exists rsvps_guest_count_range;
alter table public.rsvps add constraint rsvps_guest_count_range
  check ((attending = false and guest_count is null)
      or (attending = true and guest_count between 1 and 40));

drop function if exists public.admin_list_rsvps(text);
create function public.admin_list_rsvps(pw text)
 returns table(id uuid, name text, attending boolean, guest_count integer, dietary text, message text,
   created_at timestamptz, contact text, adults integer, children integer, likelihood text,
   dietary_consent boolean, dietary_consent_at timestamptz, children_ages text)
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select r.id, r.name, r.attending, r.guest_count, r.dietary, r.message, r.created_at,
    r.contact, r.adults, r.children, r.likelihood, r.dietary_consent, r.dietary_consent_at, r.children_ages
    from rsvps r order by r.created_at desc;
end;
$function$;
revoke all on function public.admin_list_rsvps(text) from public;
grant execute on function public.admin_list_rsvps(text) to anon, authenticated, service_role;
