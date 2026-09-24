-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Baseline: this predates migration tracking in list_migrations (the
-- earliest tracked migration is 20260819232734). people, relationships,
-- rsvps, blessings (base columns), admin_config and the core admin RPCs
-- already existed live before the repo started tracking migrations. This
-- file makes that baseline reproducible; it does not change any live data.

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  side text not null,
  is_kid boolean not null default false,
  status text not null default 'pending',
  submitted_note text,
  created_at timestamptz not null default now(),
  sort_order integer not null default 100,
  relation text
);
alter table public.people enable row level security;

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  from_person uuid not null references public.people(id),
  to_person uuid not null references public.people(id),
  type text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.relationships enable row level security;

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  attending boolean not null,
  guest_count integer,
  dietary text,
  message text,
  created_at timestamptz not null default now(),
  contact text
);
alter table public.rsvps enable row level security;

create table if not exists public.blessings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.blessings enable row level security;

create table if not exists public.admin_config (
  id integer primary key default 1,
  password_hash text not null
);
alter table public.admin_config enable row level security;
-- Intentionally no policies: RLS default-denies all REST access. Only
-- SECURITY DEFINER admin_* functions running as owner can read this.

grant select, insert, update, delete on public.people to anon, authenticated;
grant select, insert, update, delete on public.relationships to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.rsvps to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.blessings to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.admin_config to anon, authenticated;

create or replace function public.admin_check(pw text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from admin_config where password_hash = crypt(pw, password_hash)
  ) into v_ok;
  return v_ok;
end;
$function$;
-- NOTE: this baseline shape of admin_check() is superseded by
-- 20260923_admin_brute_force_lockout.sql, which is the current live
-- definition (lockout counters + activity_log_write calls). That file
-- already runs after this one in migration order, so the final state is
-- correct; this CREATE OR REPLACE only documents the pre-lockout baseline.

create or replace function public.admin_list_all(pw text)
 returns table(id uuid, name text, side text, is_kid boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select p.id, p.name, p.side, p.is_kid from people p where p.status = 'approved' order by p.name;
end; $function$;

create or replace function public.admin_list_pending(pw text)
 returns table(kind text, id uuid, name text, side text, is_kid boolean, submitted_note text, from_person_name text, to_person_name text, rel_type text, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query
    select 'person', p.id, p.name, p.side, p.is_kid, p.submitted_note,
           null::text, null::text, null::text, p.created_at
    from people p where p.status = 'pending'
    union all
    select 'relationship', r.id, null, null, null, null,
           fp.name, tp.name, r.type, r.created_at
    from relationships r
    join people fp on fp.id = r.from_person
    join people tp on tp.id = r.to_person
    where r.status = 'pending'
    order by created_at asc;
end; $function$;

create or replace function public.admin_set_relationship_status(pw text, target uuid, new_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_status = 'approved' then
    update relationships set status = 'approved' where id = target;
  else
    delete from relationships where id = target;
  end if;
end; $function$;

create or replace function public.admin_delete_rsvp(pw text, target uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  delete from rsvps where id = target;
end;
$function$;

create or replace function public.admin_list_blessings(pw text)
 returns table(id uuid, name text, message text, status text, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query
    select b.id, b.name, b.message, b.status, b.created_at
    from blessings b where b.status = 'pending'
    order by b.created_at asc;
end; $function$;

revoke all on function public.admin_check(text) from public;
revoke all on function public.admin_list_all(text) from public;
revoke all on function public.admin_list_pending(text) from public;
revoke all on function public.admin_set_relationship_status(text, uuid, text) from public;
revoke all on function public.admin_delete_rsvp(text, uuid) from public;
revoke all on function public.admin_list_blessings(text) from public;
grant execute on function public.admin_check(text) to anon, authenticated;
grant execute on function public.admin_list_all(text) to anon, authenticated;
grant execute on function public.admin_list_pending(text) to anon, authenticated;
grant execute on function public.admin_set_relationship_status(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_rsvp(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_blessings(text) to anon, authenticated;
