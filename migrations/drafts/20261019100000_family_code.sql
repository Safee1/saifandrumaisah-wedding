-- =====================================================================
-- 20261019100000_family_code.sql
--
-- DRAFT. NOT applied anywhere. Needs the owner's review: it adds a table and two
-- functions that decide who may see children's real names. Written without a
-- running database, so it is UNTESTED: try it on a scratch copy first.
--
-- WHY (owner choice "B", 19 Oct 2026)
--   public_tree() shows "Little one" for every child, to everyone. The owners
--   want family to be able to see the real names, without making them public.
--   So: a shared FAMILY CODE, stored only as a bcrypt hash. Someone who types the
--   right code on the site gets family_tree(code), which is public_tree() with
--   the children's real names and relation labels put back. Without the code
--   nothing changes: the public tree stays exactly as it is today.
--
-- WHAT THIS ADDS
--   public.family_access            one row holding the bcrypt hash of the code (no
--                                   policies: nobody can read it over the REST API)
--   family_tree(code)               same JSON shape as public_tree(); raises
--                                   'wrong code' (after a 1 second pause) if the code
--                                   does not match
--   admin_set_family_code(pw, code) admin-only; sets or changes the code (min 8
--                                   characters). The admin page calls this.
--
-- HONEST LIMITS
--   * A shared code is only as private as the people you give it to. If it leaks,
--     change it (admin page) and tell the family the new one.
--   * There is no lockout: each wrong guess just waits 1 second. Use a long code
--     (10+ characters, not a word) so guessing is hopeless.
--   * Anyone with the code sees all the children's names. It is not per person.
--
-- ROLLBACK
--   drop function if exists public.family_tree(text);
--   drop function if exists public.admin_set_family_code(text, text);
--   drop table if exists public.family_access;
-- =====================================================================

create table if not exists public.family_access (
  id integer primary key default 1 check (id = 1),
  code_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.family_access enable row level security;
-- Intentionally no policies: RLS default-denies all REST access. Only the
-- SECURITY DEFINER functions below (running as owner) can read it.
revoke all on public.family_access from anon, authenticated;

create or replace function public.admin_set_family_code(pw text, new_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_code is null or length(btrim(new_code)) < 8 then
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
begin
  select exists (
    select 1 from family_access where code_hash = crypt(btrim(coalesce(code, '')), code_hash)
  ) into v_ok;
  if not v_ok then
    perform pg_sleep(1);          -- slows down guessing
    raise exception 'wrong code';
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

-- After applying, check it (run in the SQL editor; replace the password and pick a code):
--   select public.admin_set_family_code('YOUR-ADMIN-PASSWORD', 'a-long-family-code');
--   select public.family_tree('a-long-family-code');   -> expect the tree, with children's real names
--   select public.family_tree('wrong');                -> expect: ERROR wrong code (after about 1 second)
--   select public.public_tree();                       -> expect: children still "Little one"
