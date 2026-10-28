-- =====================================================================
-- 20261022100000_family_code_hardening.sql
-- APPLIED to prod 2026-10-23 as ONE transaction (this file then the race/admin file); tested on real Postgres (20 parallel connections, rollbacks); do not re-run.
--
-- Hardens the live family-code functions from 20261019100000_family_code.sql.
--   (a) admin_set_family_code: minimum length 8 -> 16 (bcrypt hash only, no logging
--       of the code anywhere).
--   (b) family_tree: GLOBAL failure throttle. After 5 wrong guesses in 15 minutes
--       (across all callers) it refuses every guess, right or wrong, until the
--       window clears. Global because per-IP is unreliable on anon Supabase.
--   (c) A correct code returns exactly the same JSON as before.
--
-- WHY IT RETURNS INSTEAD OF RAISING
--   A RAISE EXCEPTION rolls back the whole call, including the failure row we just
--   inserted, so a counter fed only on the raise path never counts (the weakness
--   in admin_check). So a wrong or throttled guess RETURNS a small JSON status and
--   the insert commits:
--     {"error":"wrong_code"}   wrong guess (after a 1 second pause)
--     {"error":"locked"}       throttled; try again in 15 minutes
--   js/tree-data.js turns these into err.status 400 / 429.
--
-- HONEST LIMITS
--   * Global throttle = an attacker can lock the family out for 15 minutes by
--     spending 5 guesses (denial of service). That is the trade for stopping
--     brute force. The window clears by itself.
--   * Only failures are stored: a timestamp, never the guess.
--   * Existing codes of 8-15 characters keep working; only NEW codes need 16.
-- ROLLBACK: rollbacks/20261022100000_family_code_hardening_rollback.sql
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

create or replace function public.admin_set_family_code(pw text, new_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_code is null or length(btrim(new_code)) < 16 then
    raise exception 'code too short';
  end if;
  insert into family_access (id, code_hash, updated_at)
  values (1, crypt(btrim(new_code), gen_salt('bf', 10)), now())
  on conflict (id) do update set code_hash = excluded.code_hash, updated_at = now();
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
  delete from family_code_attempts where created_at < now() - interval '1 day';

  select count(*) into v_recent
  from family_code_attempts
  where created_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    return json_build_object('error', 'locked');
  end if;

  select exists (
    select 1 from family_access where code_hash = crypt(btrim(coalesce(code, '')), code_hash)
  ) into v_ok;
  if not v_ok then
    insert into family_code_attempts default values;   -- commits: we return, not raise
    perform pg_sleep(1);
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
revoke all on function public.family_tree(text) from public;
grant execute on function public.admin_set_family_code(text, text) to anon, authenticated;
grant execute on function public.family_tree(text) to anon, authenticated;
