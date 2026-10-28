-- UNTESTED against Supabase — not applied. Rollback for flood_guard_rsvps_cap_40.
-- Restores the live definition read 2026-10-23 (all tables 300 / 10 min).
CREATE OR REPLACE FUNCTION public.flood_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recent_count integer;
  v_patch jsonb := jsonb_build_object('created_at', now());
begin
  -- DEFINER so the count sees every row (anon can't SELECT rsvps, and only
  -- approved blessings). Timestamps are set here so they can't be backdated.
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
