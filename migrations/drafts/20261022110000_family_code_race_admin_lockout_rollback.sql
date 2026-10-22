-- UNTESTED against Supabase — not applied. Rollback for 20261022110000_family_code_race_admin_lockout.sql.
-- Restores the #109 family_tree (count+insert, no advisory lock), the void raising
-- admin_set_family_code (min 16) and the original raising admin_purge_guest_data
-- (as recorded in migrations/20261021100000_admin_purge_guest_data.sql). Keeps the attempts table
-- (owned by the #109 migration). The front-end handles both behaviours.

drop function if exists public.admin_set_family_code(text, text);
create function public.admin_set_family_code(pw text, new_code text)
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

drop function if exists public.admin_purge_guest_data(text, text);
create function public.admin_purge_guest_data(pw text, confirm text)
 returns table(rsvps_deleted integer, blessings_deleted integer, email_log_deleted integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

revoke all on function public.admin_set_family_code(text, text) from public;
revoke all on function public.admin_purge_guest_data(text, text) from public;
grant execute on function public.admin_set_family_code(text, text) to anon, authenticated;
grant execute on function public.admin_purge_guest_data(text, text) to anon, authenticated;

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

revoke all on function public.family_tree(text) from public;
grant execute on function public.family_tree(text) to anon, authenticated;
notify pgrst, 'reload schema';
