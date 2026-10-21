-- 20261021100000_admin_purge_guest_data.sql
-- Applied to prod 2026-10-21; matches live; reviewed-for-existence.
-- Recorded from pg_get_functiondef of the live function. Deletes ALL rsvps,
-- blessings and email_log rows (not people/relationships/activity_log).
-- Needs admin password AND confirm = 'DELETE'.

CREATE OR REPLACE FUNCTION public.admin_purge_guest_data(pw text, confirm text)
 RETURNS TABLE(rsvps_deleted integer, blessings_deleted integer, email_log_deleted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rsvps integer;
  v_blessings integer;
  v_emails integer;
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if confirm is distinct from 'DELETE' then
    raise exception 'confirmation text must be DELETE';
  end if;

  delete from rsvps;
  get diagnostics v_rsvps = row_count;
  delete from blessings;
  get diagnostics v_blessings = row_count;
  delete from email_log;
  get diagnostics v_emails = row_count;

  perform activity_log_write(
    'guest_data_purged',
    'Guest data purged: ' || v_rsvps || ' rsvps, ' || v_blessings || ' blessings, ' || v_emails || ' email_log rows'
  );

  return query select v_rsvps, v_blessings, v_emails;
end;
$function$;
