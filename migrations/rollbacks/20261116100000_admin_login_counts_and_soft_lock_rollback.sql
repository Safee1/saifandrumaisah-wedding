-- UNTESTED against Supabase — not applied. Rollback for
-- drafts/20261116100000_admin_login_counts_and_soft_lock.sql.
--
-- WHAT IT DOES
--   Puts admin_check() back to the newest definition in the repo
--   (20260925150000_flood_guard_definer_and_admin_delay.sql) and removes the
--   catch-up logger, its ledger table and the four counters.
--
-- READ BEFORE RUNNING
--   * If you saved the live definition with pg_get_functiondef before
--     applying the draft (its DO THIS FIRST step), paste THAT back instead
--     of the function below: it is the true "before". The function below is
--     only the repo's record. If what was live differed from it (for
--     example pgcrypto living outside the public schema), the function
--     below could make EVERY admin login fail; pasting your saved copy
--     fixes that.
--   * The four sequences are dropped whether or not the draft created
--     them. If admin_fail_window or admin_fail_last_at existed before the
--     draft (the PR #94 case), your saved definition may need them: delete
--     their two "drop sequence" lines below before running.
--
-- WHAT COMES BACK WITH IT
--   The old behaviour, faults included: wrong passwords at the login gates
--   are not counted or logged, and five wrong calls on the open paths lock
--   out the right password for 15 minutes.
--
-- HOW TO CHECK
--   select pg_get_functiondef('public.admin_check(text)'::regprocedure);
--   should no longer mention admin_fail_window.

begin;

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

grant execute on function public.admin_check(text) to anon, authenticated;

drop function if exists public.admin_login_log_flush();
drop table if exists public.admin_login_ledger;
drop sequence if exists public.admin_fail_window;
drop sequence if exists public.admin_fail_total;
drop sequence if exists public.admin_fail_last_at;
drop sequence if exists public.admin_fail_alarm;

commit;

notify pgrst, 'reload schema';
