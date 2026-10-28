-- APPLIED to production on 23 Oct 2026 by Saif in the Supabase SQL editor (outside the migration tracker). Do NOT re-run.
-- (Tested on a throwaway local Postgres before it was applied; see tests/flood-guard-cap.test.js.)
-- Audit finding: flood_guard() allowed 300 rows / 10 min / table across ALL users,
-- so a bot could fill rsvps with junk and block real guests (~100 guests expected).
-- Change: rsvps cap 300 -> 40 per 10 minutes. blessings and people stay at 300.
-- Only the threshold changes; name, signature, DEFINER, search_path and the
-- created_at / dietary_consent_at server-side stamping are identical to live.
-- Rollback: rollbacks/20261023100000_flood_guard_rsvps_cap_40_rollback.sql
CREATE OR REPLACE FUNCTION public.flood_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recent_count integer;
  v_limit integer := case TG_TABLE_NAME when 'rsvps' then 40 else 300 end;
  v_patch jsonb := jsonb_build_object('created_at', now());
begin
  -- DEFINER so the count sees every row (anon can't SELECT rsvps, and only
  -- approved blessings). Timestamps are set here so they can't be backdated.
  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''10 minutes''',
    TG_TABLE_NAME
  ) into v_recent_count;

  if v_recent_count >= v_limit then
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
