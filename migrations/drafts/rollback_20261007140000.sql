-- rollback_20261007140000.sql
-- Undoes 20261007140000_admin_lockout_counts_all_attempts.sql (design only, never applied).
-- Restores admin_check() to the 25 Sep 2026 definition (migrations/20260925150000_...)
-- and removes everything the new file added. The two added columns
-- (admin_config.recovery_digest, admin_login_attempts.fail_total) are left in
-- place: they are nullable and harmless, and dropping columns is not reversible.
-- NOTE: if you rotated the admin password with admin_set_password(), the new
-- bcrypt hash stays valid after the rollback (crypt() verifies any cost).

drop trigger  if exists admin_config_guard_trg on public.admin_config;
drop function if exists public.admin_config_guard();
drop function if exists public.admin_rotate_recovery_key(text);
drop function if exists public.admin_force_set_password(text);
drop function if exists public.admin_set_password(text, text);
drop function if exists public.admin_password_problem(text);

-- exact copy of the live definition from migrations/20260925150000_flood_guard_definer_and_admin_delay.sql
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

drop sequence if exists public.admin_fail_window;
drop sequence if exists public.admin_fail_total;

notify pgrst, 'reload schema';
