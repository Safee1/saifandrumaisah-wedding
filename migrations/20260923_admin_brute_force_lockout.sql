-- Security review finding 2: admin_check (and every admin_* RPC, which all
-- call it) had no brute-force limit. anon has no reliable per-caller
-- identity over REST, so the lockout is global and simple: after 5 failed
-- password checks in the last 15 minutes (across everyone), admin_check
-- refuses ALL checks — including correct ones — for that window. A
-- successful check does not reset the failure count. bcrypt (crypt/pgcrypto)
-- verification itself is unchanged.

create table if not exists public.admin_login_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  success boolean not null
);

alter table public.admin_login_attempts enable row level security;
-- Intentionally no policies: RLS default-denies all access via the
-- REST/anon and authenticated roles. Only the SECURITY DEFINER
-- admin_check() function (running as its owner) can read/write this table.

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
    raise exception 'Too many attempts — try again in 15 minutes';
  end if;

  select exists (
    select 1 from admin_config where password_hash = crypt(pw, password_hash)
  ) into v_ok;

  insert into admin_login_attempts (success) values (v_ok);

  return v_ok;
end;
$function$;

grant execute on function public.admin_check(text) to anon;
