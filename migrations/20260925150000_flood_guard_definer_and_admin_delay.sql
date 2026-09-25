-- Applied live 25 Sep 2026.
-- flood_guard ran as the guest, who can't SELECT rsvps (and only approved
-- blessings), so it always counted ~0. Now DEFINER, and it sets created_at
-- (and rsvps.dietary_consent_at) server-side so they can't be backdated.
CREATE OR REPLACE FUNCTION public.flood_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recent_count integer;
  v_patch jsonb := jsonb_build_object('created_at', now());
begin
  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''10 minutes''',
    TG_TABLE_NAME
  ) into v_recent_count;
  if v_recent_count >= 300 then
    raise exception 'Too many submissions — please try again later';
  end if;
  if TG_TABLE_NAME = 'rsvps' then
    v_patch := v_patch || jsonb_build_object('dietary_consent_at',
      case when (to_jsonb(new)->>'dietary_consent')::boolean then now() else null end);
  end if;
  new := jsonb_populate_record(new, v_patch);
  return new;
end;
$function$;

-- admin_check: wrong passwords now wait 1.5s. admin_* callers raise on false,
-- which rolls back the attempt row, so the 5-strike lockout can't count those.
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
