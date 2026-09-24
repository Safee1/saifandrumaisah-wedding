-- Security review finding 3: rsvps has a wide-open insert policy and only
-- JS-side caps on length/volume. Add DB-level CHECK constraints (added
-- NOT VALID then VALIDATEd — table has 0 rows, so this is instant and safe)
-- and a shared flood-guard trigger applied to rsvps, blessings, and people
-- (the table submit_to_tree/submit_with_invite insert into).
--
-- adults/children 0-20 checks already exist (20260923_rsvp_interest_and_headcount.sql).
-- people.name (1-60) and blessings.name/message (1-60 / 1-280) already have
-- tighter checks than requested here, so they're left as-is.

alter table public.rsvps
  add constraint rsvps_name_len_check
    check (char_length(name) >= 1 and char_length(name) <= 120) not valid;
alter table public.rsvps
  add constraint rsvps_dietary_len_check
    check (dietary is null or char_length(dietary) <= 1000) not valid;
alter table public.rsvps
  add constraint rsvps_message_len_check
    check (message is null or char_length(message) <= 1000) not valid;
alter table public.rsvps
  add constraint rsvps_contact_len_check
    check (contact is null or char_length(contact) <= 200) not valid;

alter table public.rsvps validate constraint rsvps_name_len_check;
alter table public.rsvps validate constraint rsvps_dietary_len_check;
alter table public.rsvps validate constraint rsvps_message_len_check;
alter table public.rsvps validate constraint rsvps_contact_len_check;

-- Shared flood guard: reject an insert if the target table already has 30+
-- rows created in the last 10 minutes (i.e. caps a 10-minute window at 30
-- submissions). Uses TG_TABLE_NAME so one function serves all three tables.
create or replace function public.flood_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_recent_count integer;
begin
  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''10 minutes''',
    TG_TABLE_NAME
  ) into v_recent_count;

  if v_recent_count >= 30 then
    raise exception 'Too many submissions — please try again later';
  end if;

  return new;
end;
$function$;

drop trigger if exists rsvps_flood_guard on public.rsvps;
create trigger rsvps_flood_guard
  before insert on public.rsvps
  for each row execute function public.flood_guard();

drop trigger if exists blessings_flood_guard on public.blessings;
create trigger blessings_flood_guard
  before insert on public.blessings
  for each row execute function public.flood_guard();

drop trigger if exists people_flood_guard on public.people;
create trigger people_flood_guard
  before insert on public.people
  for each row execute function public.flood_guard();
