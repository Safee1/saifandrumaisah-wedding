-- =====================================================================
-- 20261018100000_admin_set_person_kid.sql
--
-- DRAFT. NOT applied anywhere. Needs the owner's review (it adds an admin RPC).
-- Written without a running database, so it is UNTESTED: read it, then try it
-- on a scratch copy before running it on the live project.
--
-- WHY
--   public_tree() shows "Little one" instead of the real name for every person
--   with is_kid = true, so children's names never reach the public site. Until
--   now the only way to flag (or unflag) someone was a hand-written SQL update.
--   This adds one admin RPC, in the same style as the other admin_* functions,
--   so the admin page can do it behind the admin password.
--
-- WHAT IT DOES
--   admin_set_person_kid(pw, target, new_kid) sets people.is_kid for one person.
--   - wrong password: raises 'invalid password' (same as every admin RPC)
--   - unknown person: raises 'no such person'
--   - changes nothing else. No activity_log row is written, on purpose: the
--     activity_log kind list is not visible from this file and a rejected kind
--     would make the whole call fail.
--
-- ROLLBACK
--   drop function if exists public.admin_set_person_kid(text, uuid, boolean);
-- =====================================================================

create or replace function public.admin_set_person_kid(pw text, target uuid, new_kid boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_kid is null then raise exception 'new_kid must be true or false'; end if;
  update people set is_kid = new_kid where id = target;
  if not found then raise exception 'no such person'; end if;
end;
$function$;

revoke all on function public.admin_set_person_kid(text, uuid, boolean) from public;
grant execute on function public.admin_set_person_kid(text, uuid, boolean) to anon, authenticated;

-- After applying, check it works (replace the id and the password; run in the SQL editor):
--   select public.admin_set_person_kid('YOUR-ADMIN-PASSWORD', '00000000-0000-0000-0000-000000000000', false);
--   -> expect: ERROR no such person   (proves the password check passed and nothing was changed)
