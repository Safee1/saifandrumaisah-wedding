-- RECORD ONLY - already live in production, written from the live definition on 25 Oct 2026; do not run.
-- Public repo cannot otherwise reproduce this function (it was created in the SQL editor).
-- Returns row counts for the admin page; password-checked via admin_check.
CREATE OR REPLACE FUNCTION public.admin_data_counts(pw text)
 RETURNS TABLE(rsvps_count integer, blessings_count integer, email_log_count integer, activity_log_count integer, people_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select
    (select count(*)::integer from rsvps),
    (select count(*)::integer from blessings),
    (select count(*)::integer from email_log),
    (select count(*)::integer from activity_log),
    (select count(*)::integer from people);
end;
$function$;
