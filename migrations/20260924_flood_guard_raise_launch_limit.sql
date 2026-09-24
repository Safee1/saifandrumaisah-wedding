-- Launch-day headroom: the global flood guard allowed only 30 submissions per
-- table per 10 minutes, which ~100-200 invited guests could hit legitimately.
-- Raised to 300. Applied live 2026-09-24.
CREATE OR REPLACE FUNCTION public.flood_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_recent_count integer;
begin
  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''10 minutes''',
    TG_TABLE_NAME
  ) into v_recent_count;

  if v_recent_count >= 300 then
    raise exception 'Too many submissions — please try again later';
  end if;

  return new;
end;
$function$;
