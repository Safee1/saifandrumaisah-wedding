-- =====================================================================
-- 20261022110000_family_code_race_admin_lockout.sql
-- APPLIED to prod 2026-10-23 as ONE transaction (this file then the race/admin file); tested on real Postgres (20 parallel connections, rollbacks); do not re-run.
-- Superset of 20261022100000_family_code_hardening.sql.
--
-- Fixes two problems found by running the #109 migration in a scratch Postgres:
--
-- (1) RACE in family_tree. The failure count and the failure insert were not atomic,
--     so N parallel wrong guesses could all read "4 recent failures" and all pass the
--     5-per-15-minutes limit. Fix: pg_advisory_xact_lock(hashtext('family_code')) is
--     taken BEFORE the count and held to the end of the transaction, so count+insert
--     are serialised. ORDERING (least-bad): the bcrypt check and the 1 s wrong-guess
--     pause both happen BEFORE the lock. Holding the lock through pg_sleep would make
--     every caller (including the family with the right code) queue behind each wrong
--     guess for 1 s. Sleeping first means wrong guesses wait in parallel, then take the
--     lock only for a few ms (count + insert); the correct-code path never sleeps and
--     holds the lock only for the count. Cost: the 1 s pause no longer throttles an
--     attacker's throughput (the 5-in-15-min limit does that), only each guess's latency.
--
-- (2) ADMIN LOCKOUT never counted via admin_set_family_code / admin_purge_guest_data.
--     Both called admin_check and then RAISEd 'invalid password'; the RAISE rolled back
--     admin_check's failure row. Now they RETURN an error and the row commits:
--       admin_set_family_code -> jsonb  {"ok":true} | {"error":"invalid_password"}
--       admin_purge_guest_data -> same 3 columns plus  error text  (null on success)
--     Return types change, so the old functions are DROPPED and recreated (grants redone).
--     tree-admin.html treats {"error":"invalid_password"} as a wrong password. Nothing in
--     the repo calls admin_purge_guest_data (SQL editor only).
--
-- RELATION TO PR #94 (20261007140000_admin_lockout_counts_all_attempts.sql, held/open):
--   Composes, does not conflict. #94 replaces admin_check() (counts via sequences, so
--   rollback-proof) and touches none of the functions here. Either order works: with #94
--   applied, my return-instead-of-raise is simply redundant for counting; the lockout
--   RAISE ('Too many attempts') still comes from admin_check and the page already shows it.
--   (#94 deliberately rejected re-creating admin_* functions to return errors; this does it
--   for only the two functions in question.)
--
-- ROLLBACK: rollbacks/20261022110000_family_code_race_admin_lockout_rollback.sql
-- =====================================================================

create table if not exists public.family_code_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now()
);
alter table public.family_code_attempts enable row level security;
-- No policies: only the SECURITY DEFINER functions below can touch it.
revoke all on public.family_code_attempts from anon, authenticated;
create index if not exists family_code_attempts_created_at_idx
  on public.family_code_attempts (created_at);

drop function if exists public.admin_set_family_code(text, text);
create function public.admin_set_family_code(pw text, new_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then
    -- RETURN, not RAISE: a raise would roll back admin_check's failure row.
    return jsonb_build_object('error', 'invalid_password');
  end if;
  if new_code is null or length(btrim(new_code)) < 16 then
    raise exception 'code too short';
  end if;
  insert into family_access (id, code_hash, updated_at)
  values (1, crypt(btrim(new_code), gen_salt('bf', 10)), now())
  on conflict (id) do update set code_hash = excluded.code_hash, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$function$;

drop function if exists public.admin_purge_guest_data(text, text);
create function public.admin_purge_guest_data(pw text, confirm text)
 returns table(rsvps_deleted integer, blessings_deleted integer, email_log_deleted integer, error text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rsvps integer;
  v_blessings integer;
  v_emails integer;
begin
  if not admin_check(pw) then
    return query select null::integer, null::integer, null::integer, 'invalid_password'::text;
    return;
  end if;
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

  return query select v_rsvps, v_blessings, v_emails, null::text;
end;
$function$;

create or replace function public.family_tree(code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ok boolean;
  v_recent integer;
begin
  -- 1. Verify first, with NO lock held (bcrypt is slow; keep the lock short).
  select exists (
    select 1 from family_access where code_hash = crypt(btrim(coalesce(code, '')), code_hash)
  ) into v_ok;

  -- 2. Wrong-guess pause BEFORE the lock, so waiting guessers don't hold it.
  if not v_ok then
    perform pg_sleep(1);
  end if;

  -- 3. Serialise count + insert. Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('family_code'));

  delete from family_code_attempts where created_at < now() - interval '1 day';

  select count(*) into v_recent
  from family_code_attempts
  where created_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    return json_build_object('error', 'locked');
  end if;

  if not v_ok then
    insert into family_code_attempts default values;   -- commits: we return, not raise
    return json_build_object('error', 'wrong_code');
  end if;
  return json_build_object(
    'people', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'name', p.name,
        'side', p.side,
        'is_kid', p.is_kid,
        'relation', p.relation
      ) order by p.sort_order asc nulls last, p.name asc)
      from public.people p
      where p.status = 'approved'
    ), '[]'::json),
    'relationships', coalesce((
      select json_agg(json_build_object(
        'id', r.id,
        'from_person', r.from_person,
        'to_person', r.to_person,
        'type', r.type
      ))
      from public.relationships r
      where r.status = 'approved'
        and exists (select 1 from public.people p where p.id = r.from_person and p.status = 'approved')
        and exists (select 1 from public.people p where p.id = r.to_person and p.status = 'approved')
    ), '[]'::json)
  );
end;
$function$;

revoke all on function public.admin_set_family_code(text, text) from public;
revoke all on function public.admin_purge_guest_data(text, text) from public;
revoke all on function public.family_tree(text) from public;
grant execute on function public.admin_set_family_code(text, text) to anon, authenticated;
grant execute on function public.admin_purge_guest_data(text, text) to anon, authenticated;
grant execute on function public.family_tree(text) to anon, authenticated;

notify pgrst, 'reload schema';
