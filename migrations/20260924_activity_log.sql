-- Ops activity log: a lightweight audit trail of what happens on the site,
-- for the couple to glance at without digging through tables. No contact
-- details or dietary info ever go in `summary` — just short, safe text.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in (
    'rsvp_submitted', 'tree_submitted', 'blessing_submitted',
    'person_approved', 'person_rejected', 'person_restored',
    'blessing_approved', 'blessing_hidden',
    'admin_login_ok', 'admin_login_failed', 'admin_lockout'
  )),
  summary text not null check (char_length(summary) <= 300),
  ref_id uuid
);

alter table public.activity_log enable row level security;
-- Intentionally no policies: RLS default-denies anon/authenticated access.
-- Only SECURITY DEFINER functions (running as owner) can read/write it.

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_kind_idx on public.activity_log (kind);

-- Every logging insert is wrapped so a logging failure can never break the
-- guest-facing action it's attached to.
create or replace function public.activity_log_write(p_kind text, p_summary text, p_ref_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into activity_log (kind, summary, ref_id) values (p_kind, p_summary, p_ref_id);
exception when others then
  null;
end;
$function$;

-- ----- triggers on guest-facing tables -----

create or replace function public.trg_log_rsvp_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform activity_log_write(
    'rsvp_submitted',
    coalesce(new.name, 'Someone') || ' RSVP''d (' ||
      coalesce(new.adults::text, '?') || ' adult' || case when coalesce(new.adults,1) = 1 then '' else 's' end ||
      case when coalesce(new.children,0) > 0 then ', ' || new.children::text || ' child' || case when new.children = 1 then '' else 'ren' end else '' end ||
      case when new.likelihood is not null then ', ' || new.likelihood else '' end || ')',
    new.id
  );
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists activity_log_rsvp on public.rsvps;
create trigger activity_log_rsvp after insert on public.rsvps
  for each row execute function public.trg_log_rsvp_submitted();

create or replace function public.trg_log_person_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'pending' then
    perform activity_log_write(
      'tree_submitted',
      coalesce(new.name, 'Someone') || ' added to the tree (' || coalesce(new.side, '?') || ' side) — awaiting approval',
      new.id
    );
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists activity_log_person on public.people;
create trigger activity_log_person after insert on public.people
  for each row execute function public.trg_log_person_submitted();

create or replace function public.trg_log_blessing_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform activity_log_write(
    'blessing_submitted',
    'New blessing from ' || coalesce(new.name, 'Someone') || ' — awaiting approval',
    new.id
  );
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists activity_log_blessing on public.blessings;
create trigger activity_log_blessing after insert on public.blessings
  for each row execute function public.trg_log_blessing_submitted();

-- ----- admin_check: log login outcomes / lockouts -----
-- Recreated with the same signature and password/lockout logic; only the
-- logging calls at the end of each branch are new.

create or replace function public.admin_check(pw text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recent_failures integer;
  v_ok boolean;
begin
  select count(*) into v_recent_failures
  from admin_login_attempts
  where success = false
    and created_at > now() - interval '15 minutes';

  if v_recent_failures >= 5 then
    perform activity_log_write('admin_lockout', 'Admin login blocked — too many recent failures');
    raise exception 'Too many attempts — try again in 15 minutes';
  end if;

  select exists (
    select 1 from admin_config where password_hash = crypt(pw, password_hash)
  ) into v_ok;

  insert into admin_login_attempts (success) values (v_ok);

  if v_ok then
    perform activity_log_write('admin_login_ok', 'Admin login succeeded');
  else
    perform activity_log_write('admin_login_failed', 'Admin login attempt failed');
  end if;

  return v_ok;
end;
$function$;

grant execute on function public.admin_check(text) to anon;

-- ----- admin RPCs: log approvals/rejections/restores -----

create or replace function public.admin_set_person_status(pw text, target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;
  select name into v_name from people where id = target;
  update people set status = new_status where id = target;
  perform activity_log_write(
    case when new_status = 'approved' then 'person_approved' else 'person_rejected' end,
    coalesce(v_name, 'Someone') || ' was ' || new_status,
    target
  );
end;
$function$;

create or replace function public.admin_restore_person(pw text, target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  select name into v_name from people where id = target;
  update people set status = 'pending' where id = target and status = 'rejected';
  perform activity_log_write('person_restored', coalesce(v_name, 'Someone') || ' restored to pending', target);
end;
$function$;

create or replace function public.admin_set_blessing_status(pw text, target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  select name into v_name from blessings where id = target;
  if new_status = 'approved' then
    update blessings set status = 'approved' where id = target;
    perform activity_log_write('blessing_approved', 'Blessing from ' || coalesce(v_name, 'Someone') || ' approved', target);
  else
    delete from blessings where id = target;
    perform activity_log_write('blessing_hidden', 'Blessing from ' || coalesce(v_name, 'Someone') || ' hidden', target);
  end if;
end;
$function$;

-- ----- admin_list_activity: paginated read for the ops page -----

create or replace function public.admin_list_activity(pw text, p_limit integer default 200)
returns table(id uuid, created_at timestamptz, kind text, summary text, ref_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query
    select a.id, a.created_at, a.kind, a.summary, a.ref_id
    from activity_log a
    order by a.created_at desc
    limit least(coalesce(p_limit, 200), 1000);
end;
$function$;

grant execute on function public.admin_list_activity(text, integer) to anon;
