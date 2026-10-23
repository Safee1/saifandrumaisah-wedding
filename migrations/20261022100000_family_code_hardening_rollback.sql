-- UNTESTED — not applied. Rollback for 20261022100000_family_code_hardening.sql:
-- restores admin_set_family_code (min 8) and family_tree (raises 'wrong code', no
-- throttle) exactly as in 20261019100000_family_code.sql, then drops the attempts table.
-- The front-end handles both behaviours, so it need not be rolled back.

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

drop table if exists public.family_code_attempts;
