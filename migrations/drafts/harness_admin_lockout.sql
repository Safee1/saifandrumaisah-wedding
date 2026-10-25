-- harness_admin_lockout.sql
--
-- Reproduces the admin-lockout bug on the CURRENT admin_check() (the 25 Sep
-- definition), then applies 20261007140000_admin_lockout_counts_all_attempts.sql
-- and checks that the fix does what it claims.
--
-- RUN ONLY AGAINST AN EMPTY SCRATCH DATABASE. It creates tables and roles and
-- sets a known password. Never run it on the live Supabase project.
-- Needs: psql, PostgreSQL 15+ with the pgcrypto extension available.
-- From this folder:   psql -X -d scratch -f harness_admin_lockout.sql
-- Takes about 30 s (the OLD function sleeps 1.5 s per wrong guess).
--
-- STATUS: UNTESTED. It was written without a database to hand. The EXPECT
-- comments say what each statement should print; if something differs, the
-- harness or the migration has a bug, so fix it before trusting either.
--
-- Each wrong guess is run as its own autocommit statement (\gexec), which is
-- what PostgREST does: one transaction per request, rolled back on error.

\set ON_ERROR_STOP off
\pset pager off

\echo
\echo '=== SETUP (scratch database only) ==='
create extension if not exists pgcrypto;   -- lands in public, like the live project

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin; end if;
end $$;

drop table if exists admin_login_attempts cascade;
drop table if exists admin_config cascade;
drop table if exists activity_log cascade;

create table admin_config (id integer primary key default 1, password_hash text not null);
create table admin_login_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  success boolean not null
);
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  summary text not null,
  ref_id uuid
);

create or replace function activity_log_write(p_kind text, p_summary text, p_ref_id uuid default null)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into activity_log (kind, summary, ref_id) values (p_kind, p_summary, p_ref_id);
exception when others then
  null;
end $$;

-- a legacy low-cost hash, as gen_salt('bf') would have produced
insert into admin_config (id, password_hash)
values (1, crypt('correct horse battery staple', gen_salt('bf', 6)));
select substring(password_hash from 1 for 7) as legacy_hash_prefix from admin_config;   -- EXPECT $2a$06$

-- exact copy of the CURRENT admin_check (migrations/20260925150000_...)
CREATE OR REPLACE FUNCTION public.admin_check(pw text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    perform pg_sleep(1.5);
    perform activity_log_write('admin_login_failed', 'Admin login attempt failed');
  end if;
  return v_ok;
end;
$function$;

-- stand-in for any admin_* RPC: same two-line pattern as every real one
create or replace function admin_list_pending(pw text)
 returns table(result text)
 language plpgsql security definer set search_path to 'public'
as $$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select 'ok'::text;
end $$;

\echo
\echo '=== PART 1: THE BUG, on the current admin_check ==='
\echo '12 wrong guesses through an admin_* RPC (12 errors are expected below):'
select format('select * from admin_list_pending(%L);', 'wrong-guess-' || g)
  from generate_series(1, 12) g \gexec

select count(*) as rows_in_admin_login_attempts,
       count(*) filter (where not success) as failures_counted
  from admin_login_attempts;
\echo 'EXPECT 0 and 0: every failed attempt was rolled back together with the exception.'

select count(*) as failed_logins_in_activity_log
  from activity_log where kind in ('admin_login_failed', 'admin_lockout');
\echo 'EXPECT 0: the owners see nothing in admin-activity either.'

select * from admin_list_pending('correct horse battery staple');
\echo 'EXPECT one row "ok": 12 wrong guesses later the lockout has never engaged.'

\echo
\echo '5 wrong guesses straight at admin_check (same as 5 x POST /rest/v1/rpc/admin_check):'
select admin_check('wrong-direct-' || g) from generate_series(1, 5) g;
select * from admin_list_pending('correct horse battery staple');
\echo 'EXPECT ERROR "Too many attempts": the RIGHT password is now refused for everybody (anonymous lockout DoS).'

truncate admin_login_attempts;
truncate activity_log;

\echo
\echo '=== PART 2: apply the proposed migration ==='
\i 20261007140000_admin_lockout_counts_all_attempts.sql

\echo
\echo '=== PART 3: the fix ==='
\echo '--- 3a. first successful login upgrades the legacy hash; create the recovery key'
select admin_rotate_recovery_key('correct horse battery staple') as rk \gset
select substring(password_hash from 1 for 7) as hash_prefix_now from admin_config;
\echo 'EXPECT $2a$12$'
select :'rk' ~ '^rk_[0-9a-f]{32}$' as recovery_key_has_expected_shape;
\echo 'EXPECT t'

\echo
\echo '--- 3b. 12 wrong guesses through an admin_* RPC (errors expected)'
select format('select * from admin_list_pending(%L);', 'wrong-guess-' || g)
  from generate_series(1, 12) g \gexec

select case when last_value / 1000000 = floor(extract(epoch from now()) / 900)
            then last_value % 1000000 else 0 end as wrong_counted_this_window
  from admin_fail_window;
\echo 'EXPECT 5 (counting stops once the lock is on). If the clock crosses a 15-minute boundary mid-run it can read lower.'

select count(*) as failure_rows_in_table from admin_login_attempts where not success;
\echo 'EXPECT 0: the rows still roll back; the sequence is what counts.'

select * from admin_list_pending('correct horse battery staple');
\echo 'EXPECT ERROR "Too many attempts": right password refused during the lockout.'

select * from admin_list_pending(:'rk');
\echo 'EXPECT one row "ok": the recovery key works during the lockout.'

\echo
\echo '--- 3c. after the window ends, the next success reports the wrong guesses (a committed activity_log row)'
select setval('admin_fail_window', 0, true);   -- stands in for the window rolling over
select * from admin_list_pending('correct horse battery staple');
\echo 'EXPECT one row "ok"'
select kind, summary from activity_log order by created_at desc, id limit 4;
\echo 'EXPECT a line like "5 wrong-password attempt(s) since the last successful login"'

\echo
\echo '--- 3d. password rules (SQL-editor style calls)'
select admin_set_password('correct horse battery staple', 'short');
\echo 'EXPECT ERROR: at least 14 characters'
select admin_set_password('correct horse battery staple', 'saif-and-rumaisah-2027');
\echo 'EXPECT ERROR: must not contain a name ...'
select admin_set_password('correct horse battery staple', 'tulip-granite-lantern-91');
\echo 'EXPECT success (empty result)'
select substring(password_hash from 1 for 7) as hash_prefix from admin_config;
\echo 'EXPECT $2a$12$'
select * from admin_list_pending('correct horse battery staple');
\echo 'EXPECT ERROR invalid password (the old one is gone; counts as 1 wrong guess)'
select * from admin_list_pending('tulip-granite-lantern-91');
\echo 'EXPECT one row "ok"'

\echo
\echo '--- 3e. raw password updates are refused'
update admin_config set password_hash = crypt('x', gen_salt('bf')) where id = 1;
\echo 'EXPECT ERROR: change the admin password with public.admin_force_set_password(...)'

\echo
\echo '--- 3f. owner reset from the SQL editor also clears a lockout'
select admin_force_set_password('another-long-passphrase-47');
select * from admin_list_pending('another-long-passphrase-47');
\echo 'EXPECT one row "ok"'

\echo
\echo '=== done. Drop the scratch database. ==='
