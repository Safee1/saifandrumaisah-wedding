-- =====================================================================
-- 20261007140000_admin_lockout_counts_all_attempts.sql
--
-- DESIGN ONLY. Written by the DBSEC audit on 7 Oct 2026. NOT applied
-- anywhere. It was written WITHOUT a running database available to the
-- audit, so it is UNTESTED: read it, then run harness_admin_lockout.sql
-- (same folder) against an empty scratch Postgres 15+/17 before it goes
-- anywhere near the live project.
-- Needs the owner's review (it changes RPCs): see AGENTS.md.
--
-- PROBLEM (confirmed by reading the final SQL, 20260925150000)
--   admin_check() inserts a row into admin_login_attempts for a wrong
--   password and returns false. Every admin_* RPC then does
--       if not admin_check(pw) then raise exception 'invalid password'; end if;
--   The exception aborts the request's transaction, so the attempt row
--   (and the activity_log row) are rolled back with it. Wrong guesses
--   made through admin_list_* / admin_set_* / admin_delete_rsvp / ... are
--   therefore NEVER counted, the 5-strike lockout never engages for them,
--   and nothing shows up in activity_log. Only a direct rpc/admin_check
--   call (or notify "message_all") is counted, which is exactly the path
--   an attacker does not need, and which lets ANYONE lock the owners out.
--
-- WHAT IS NOT POSSIBLE
--   * Postgres has no autonomous transactions.
--   * dblink / pg_background: pg_background is not available on Supabase;
--     dblink needs a stored credential (or trust auth plus superuser) to
--     connect back to the same database. Fragile and a secret in the DB.
--   * pg_net / LISTEN-NOTIFY / pg_cron: all transactional or asynchronous,
--     so they vanish on rollback too.
--   * Returning an error indicator instead of raising (so the row commits)
--     means re-creating all 17 admin_* functions, and the live body of at
--     least one (admin_set_blessing_status, 4-argument form) is not in
--     migrations/. Void RPCs would also "succeed" on a wrong password
--     unless PostgREST's response.status GUC is used. Rejected.
--
-- WHAT THIS DOES INSTEAD
--   Sequence operations (nextval / setval) are NOT rolled back when the
--   calling transaction aborts (PostgreSQL docs: "sequences are
--   non-transactional"). Two sequences give a rollback-proof counter:
--     admin_fail_window  fixed 15-minute window packed as
--                        window_id * 1000000 + failures_in_window
--     admin_fail_total   running total of wrong passwords, never reset
--   admin_check() bumps them on every wrong password no matter which RPC
--   called it, and refuses everything (even the right password) once 5
--   wrong passwords have been seen in the current window. Same message
--   as today ("Too many attempts ..."), so the three admin pages need no
--   change. No front-end change, no change to any other function.
--
-- DENIAL-OF-SERVICE TRADE-OFF (global lockout)
--   anon has no per-caller identity in Postgres, so the lock is global:
--   a stranger can lock the owners out with 5 wrong guesses per window
--   (this is already true today via rpc/admin_check). To make that
--   harmless there is a RECOVERY KEY: 'rk_' + 32 hex chars (128 bits),
--   stored only as a SHA-256 digest. It is accepted as the "password" by
--   every admin page and RPC, never counted, and works during a lockout.
--   Being 128-bit random it cannot be guessed, so it needs no throttle.
--   Per-IP lockouts would need request.headers (cf-connecting-ip) which
--   cannot be verified offline, and a committed table (not possible on
--   the failure path), so they are left as phase 2.
--
-- ALSO IN HERE
--   * pg_sleep(1.5) removed from the failure path (it pinned a pooled
--     connection for 1.5 s per wrong guess; with a real counter it is not
--     needed). Set c_fail_delay_seconds below to bring a delay back.
--   * Minimum password length (14 chars, max 72 bytes because bcrypt
--     ignores the rest), a few obvious-word rules, and bcrypt cost 12,
--     enforced in admin_set_password() / admin_force_set_password().
--   * A trigger so admin_config.password_hash can ONLY change through
--     those functions (a raw "update ... crypt('x', gen_salt('bf'))" from
--     the SQL editor is refused with a message saying what to run).
--     It is a guard rail for the owner / AI assistants, not a barrier
--     against someone who already has SQL access.
--   * A legacy low-cost hash (cost 04-09, e.g. gen_salt('bf') = 6) is
--     re-hashed at cost 12 on the next successful login, automatically.
--   * Wrong passwords are written with RAISE WARNING, which reaches the
--     Postgres log (Dashboard > Logs > Postgres) even though the
--     transaction rolls back. After a successful login, activity_log gets
--     one line saying how many wrong guesses happened since the previous
--     successful login (that line IS committed, so the activity page and
--     the daily digest finally see an attack).
--
-- HOW TO APPLY (after review and a scratch-database run)
--   1. Supabase SQL editor > paste this whole file > Run. It is a single
--      all-or-nothing transaction.
--   2. Immediately create the recovery key (shown once, store it in the
--      password manager):
--          select public.admin_rotate_recovery_key('<current admin password>');
--   3. Replace the password with a 14+ character passphrase:
--          select public.admin_set_password('<old>', '<new passphrase>');
--      If the old one is lost:
--          select public.admin_force_set_password('<new passphrase>');
--   4. Check it: three wrong passwords on rsvp-admin.html, then the right
--      one (works); look at Dashboard > Logs > Postgres for the warnings.
--
-- IF THE OWNERS ARE LOCKED OUT AND HAVE NO RECOVERY KEY
--   select setval('public.admin_fail_window', 0, true);
--
-- COUNTERS, FOR A GLANCE (read-only)
--   select case when last_value / 1000000 = floor(extract(epoch from now()) / 900)
--               then last_value % 1000000 else 0 end as wrong_this_window,
--          (select last_value from public.admin_fail_total) as wrong_ever
--     from public.admin_fail_window;
--
-- ROLLBACK: rollback_20261007140000.sql (same folder).
--
-- NOTE: every UPDATE/DELETE below carries a WHERE clause because Supabase
-- can load pg-safeupdate for the REST role, which refuses unqualified ones
-- (it would refuse them inside these functions too).
-- NOTE: 'extensions' is in the functions' search_path so they keep working
-- if pgcrypto is later moved out of the public schema (a schema that does
-- not exist is simply skipped).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Refuse to overwrite same-named functions that this file did not
--    create (live may hold password helpers that are not in migrations/).
--    Every function created here carries the comment 'admin-lockout-v1',
--    so re-running this file is fine.
-- ---------------------------------------------------------------------
do $guard$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig,
           obj_description(p.oid, 'pg_proc') as cmt
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('admin_password_problem', 'admin_set_password',
                         'admin_force_set_password', 'admin_rotate_recovery_key',
                         'admin_config_guard')
  loop
    if r.cmt is distinct from 'admin-lockout-v1' then
      raise exception 'refusing to overwrite existing function % - it was not created by this migration', r.sig;
    end if;
  end loop;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. Rollback-proof counters.
--    Created at state "last_value = 0, is_called = true" so that the first
--    nextval() returns 1 on every Postgres version.
-- ---------------------------------------------------------------------
do $seq$
begin
  if to_regclass('public.admin_fail_window') is null then
    create sequence public.admin_fail_window as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_window', 0, true);
  end if;
  if to_regclass('public.admin_fail_total') is null then
    create sequence public.admin_fail_total as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_total', 0, true);
  end if;
end
$seq$;

-- Supabase's default privileges hand new objects to anon/authenticated.
revoke all on sequence public.admin_fail_window, public.admin_fail_total
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Columns. recovery_digest = sha256 of the recovery key (never the key).
--    fail_total remembers the running total at each login so the next
--    successful login can report "N wrong guesses since last time".
-- ---------------------------------------------------------------------
alter table public.admin_config         add column if not exists recovery_digest bytea;
alter table public.admin_login_attempts add column if not exists fail_total bigint;

-- ---------------------------------------------------------------------
-- 3. Guard rail on admin_config.password_hash.
--    Only fires when password_hash is inserted or changed (not when
--    recovery_digest changes), so an existing weak hash does not block
--    unrelated updates. Allowed only while app.admin_pw_gate = 'on', which
--    the functions below set (transaction-local) around their UPDATE.
-- ---------------------------------------------------------------------
create or replace function public.admin_config_guard()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.admin_config) then
      raise exception 'admin_config already has a row; change the password with public.admin_force_set_password()';
    end if;
  else
    if new.password_hash is not distinct from old.password_hash then
      return new;
    end if;
  end if;

  if coalesce(current_setting('app.admin_pw_gate', true), '') <> 'on' then
    raise exception 'change the admin password with public.admin_force_set_password(''<new passphrase>'') (min 14 characters), not with a raw UPDATE';
  end if;
  if new.password_hash is null
     or new.password_hash !~ '^\$2[aby]\$(1[0-9]|2[0-9]|3[01])\$[./A-Za-z0-9]{53}$' then
    raise exception 'password_hash must be a bcrypt hash with cost 10 or higher';
  end if;
  return new;
end;
$function$;

drop trigger if exists admin_config_guard_trg on public.admin_config;
create trigger admin_config_guard_trg
  before insert or update of password_hash on public.admin_config
  for each row execute function public.admin_config_guard();

-- ---------------------------------------------------------------------
-- 4. Password rules in one place.
--    Returns NULL when the password is acceptable, else a plain sentence.
-- ---------------------------------------------------------------------
create or replace function public.admin_password_problem(new_pw text)
 returns text
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lower text := lower(coalesce(new_pw, ''));
  v_word  text;
begin
  if new_pw is null or char_length(new_pw) < 14 then
    return 'The new password must be at least 14 characters long.';
  end if;
  if octet_length(new_pw) > 72 then
    return 'The new password must be at most 72 bytes (bcrypt ignores anything longer).';
  end if;
  if new_pw ~ '^rk_[0-9a-f]{32}$' then
    return 'The new password must not look like a recovery key.';
  end if;
  if (select count(distinct t.c) from regexp_split_to_table(new_pw, '') as t(c)) < 6 then
    return 'The new password needs at least 6 different characters.';
  end if;
  foreach v_word in array array['saif', 'rumaisah', 'ruru', 'wedding', 'password',
                                'passw0rd', 'qwerty', 'letmein', 'admin', '123456', 'abcdef']
  loop
    if position(v_word in v_lower) > 0 then
      return 'The new password must not contain a name, the word "password", or an obvious sequence ('
             || v_word || ').';
    end if;
  end loop;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. admin_check: the replacement. Same name, signature, return type and
--    grants (anon, authenticated) as before; CREATE OR REPLACE keeps the ACL.
-- ---------------------------------------------------------------------
create or replace function public.admin_check(pw text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  c_max_failures      constant integer := 5;        -- wrong passwords per window before lockout
  c_window_secs       constant integer := 900;      -- fixed 15-minute window
  c_pack              constant bigint  := 1000000;  -- window_id * c_pack + failure_count in one bigint
  c_bcrypt_cost       constant integer := 12;
  c_fail_delay_seconds constant numeric := 0;       -- the old 1.5 s sleep pinned a pooled connection; 0 = off
  v_win        bigint  := floor(extract(epoch from clock_timestamp()) / c_window_secs)::bigint;
  v_cur        bigint;
  v_n          bigint;
  v_count      bigint;
  v_total      bigint;
  v_prev_total bigint;
  v_ok         boolean := false;
  v_legacy     boolean := false;
begin
  -- 1. Recovery key: high entropy, never counted, works during a lockout.
  if pw is not null and pw ~ '^rk_[0-9a-f]{32}$' then
    if exists (select 1
                 from admin_config
                where recovery_digest is not null
                  and recovery_digest = digest(pw, 'sha256')) then
      perform activity_log_write('admin_login_ok', 'Admin login succeeded (recovery key)');
      return true;
    end if;
  end if;

  -- 2. Lockout: 5 wrong passwords seen (by ANY caller) in this window.
  --    The raise is fine here: nothing needs to persist on this path.
  select last_value into v_cur from public.admin_fail_window;
  if v_cur / c_pack = v_win and v_cur % c_pack >= c_max_failures then
    raise exception 'Too many attempts — try again in 15 minutes';
  end if;

  -- 3. Verify. One bcrypt computation; also notes whether the stored hash is a
  --    legacy low-cost one so it can be upgraded after a success.
  select true, (password_hash ~ '^\$2[aby]\$0[4-9]\$')
    into v_ok, v_legacy
    from admin_config
   where password_hash = crypt(pw, password_hash)
   limit 1;
  v_ok     := coalesce(v_ok, false);
  v_legacy := coalesce(v_legacy, false);

  if not v_ok then
    -- Rollback-proof bookkeeping: nextval/setval survive the caller's exception.
    v_total := nextval('public.admin_fail_total');
    v_n     := nextval('public.admin_fail_window');
    if v_n / c_pack <> v_win then
      -- first wrong password of a new window (or a stale value): restart at 1
      perform setval('public.admin_fail_window', v_win * c_pack + 1, true);
      v_count := 1;
    else
      v_count := v_n % c_pack;
    end if;

    -- Kept for direct callers (rpc/admin_check, notify message_all), where the
    -- transaction does commit. Rolled back, harmlessly, for admin_* callers.
    insert into admin_login_attempts (success, fail_total) values (false, v_total);

    -- Reaches the Postgres log regardless of rollback.
    raise warning 'admin_check: wrong password (% so far in this 15-minute window, % in total)', v_count, v_total;
    if v_count = c_max_failures then
      raise warning 'admin_check: lockout engaged for the rest of this 15-minute window';
    end if;

    perform activity_log_write('admin_login_failed', 'Admin login attempt failed');
    if c_fail_delay_seconds > 0 then
      perform pg_sleep(c_fail_delay_seconds);
    end if;
    return false;
  end if;

  -- 4. Success (this transaction commits, so these rows persist).
  select last_value into v_total from public.admin_fail_total;
  select coalesce(max(fail_total), 0) into v_prev_total
    from admin_login_attempts
   where success;
  insert into admin_login_attempts (success, fail_total) values (true, v_total);
  if v_total > v_prev_total then
    perform activity_log_write('admin_login_failed',
      (v_total - v_prev_total)::text || ' wrong-password attempt(s) since the last successful login');
  end if;
  perform activity_log_write('admin_login_ok', 'Admin login succeeded');

  -- Retention: the table only needs recent history.
  delete from admin_login_attempts where created_at < now() - interval '60 days';

  -- Upgrade a legacy low-cost hash while we hold the plaintext. Never allowed
  -- to break a login.
  if v_legacy then
    begin
      perform set_config('app.admin_pw_gate', 'on', true);
      update admin_config
         set password_hash = crypt(pw, gen_salt('bf', c_bcrypt_cost))
       where password_hash ~ '^\$2[aby]\$0[4-9]\$'
         and password_hash = crypt(pw, password_hash);
    exception when others then
      null;
    end;
    perform set_config('app.admin_pw_gate', 'off', true);
  end if;

  return true;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Setting / resetting the password, and the recovery key.
--    Owner-only on purpose: run them from the SQL editor (role postgres).
--    No grant to anon/authenticated, so there is no new public entry point.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_password(old_pw text, new_pw text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_problem text;
begin
  if not admin_check(old_pw) then
    raise exception 'invalid password';
  end if;
  v_problem := admin_password_problem(new_pw);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;
  if new_pw = old_pw then
    raise exception 'The new password must differ from the old one.';
  end if;

  perform set_config('app.admin_pw_gate', 'on', true);
  update admin_config
     set password_hash = crypt(new_pw, gen_salt('bf', 12))
   where id = (select min(id) from admin_config);
  if not found then
    perform set_config('app.admin_pw_gate', 'off', true);
    raise exception 'admin_config has no row to update';
  end if;
  perform set_config('app.admin_pw_gate', 'off', true);

  perform activity_log_write('admin_login_ok', 'Admin password was changed');
end;
$function$;

create or replace function public.admin_force_set_password(new_pw text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_problem text := admin_password_problem(new_pw);
begin
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  perform set_config('app.admin_pw_gate', 'on', true);
  if exists (select 1 from admin_config) then
    update admin_config
       set password_hash = crypt(new_pw, gen_salt('bf', 12))
     where id = (select min(id) from admin_config);
  else
    insert into admin_config (id, password_hash)
    values (1, crypt(new_pw, gen_salt('bf', 12)));
  end if;
  perform set_config('app.admin_pw_gate', 'off', true);

  -- a reset should also clear any lockout so the owners can get straight back in
  perform setval('public.admin_fail_window', 0, true);
  perform activity_log_write('admin_login_ok', 'Admin password was reset from the SQL editor');
end;
$function$;

create or replace function public.admin_rotate_recovery_key(pw text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_key text;
begin
  if not admin_check(pw) then
    raise exception 'invalid password';
  end if;
  v_key := 'rk_' || encode(gen_random_bytes(16), 'hex');
  update admin_config
     set recovery_digest = digest(v_key, 'sha256')
   where id = (select min(id) from admin_config);
  if not found then
    raise exception 'admin_config has no row to update';
  end if;
  perform activity_log_write('admin_login_ok', 'Admin recovery key was rotated');
  return v_key;   -- shown once; only the SHA-256 digest is stored
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Grants. New functions default to PUBLIC/anon/authenticated EXECUTE.
-- ---------------------------------------------------------------------
revoke all on function public.admin_config_guard()                  from public, anon, authenticated;
revoke all on function public.admin_password_problem(text)          from public, anon, authenticated;
revoke all on function public.admin_set_password(text, text)        from public, anon, authenticated;
revoke all on function public.admin_force_set_password(text)        from public, anon, authenticated;
revoke all on function public.admin_rotate_recovery_key(text)       from public, anon, authenticated;

comment on function public.admin_config_guard()                  is 'admin-lockout-v1';
comment on function public.admin_password_problem(text)          is 'admin-lockout-v1';
comment on function public.admin_set_password(text, text)        is 'admin-lockout-v1';
comment on function public.admin_force_set_password(text)        is 'admin-lockout-v1';
comment on function public.admin_rotate_recovery_key(text)       is 'admin-lockout-v1';

notify pgrst, 'reload schema';
