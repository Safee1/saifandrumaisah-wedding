-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Matches live migration 20260902000617_invite_codes_gate. Personal invite
-- codes gate adding to the tree: Saif/Rumaisah mint codes in tree-admin,
-- guests redeem one via submit_with_invite() instead of the open
-- submit_to_tree() path.

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  side text not null,
  code_hash text not null,
  max_uses integer not null default 1,
  uses integer not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.invite_codes enable row level security;
-- Intentionally no policies and no anon/authenticated table grants:
-- invite_codes is only ever touched through the SECURITY DEFINER
-- admin_create_invite / admin_revoke_invite / admin_list_invites /
-- submit_with_invite functions running as their owner.

create or replace function public.admin_create_invite(pw text, label text, side text, max_uses integer default 1)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes    bytea := gen_random_bytes(8);
  v_code   text := '';
  i        int;
begin
  if not admin_check(pw) then
    raise exception 'invalid password';
  end if;
  if side is null or side not in ('saif', 'rumaisah') then
    raise exception 'invalid side';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into invite_codes (label, side, code_hash, max_uses)
  values (trim(label), side, crypt(v_code, gen_salt('bf')), coalesce(max_uses, 1));
  return v_code;
end;
$function$;

create or replace function public.admin_revoke_invite(pw text, target uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then
    raise exception 'invalid password';
  end if;
  update invite_codes set revoked = true where id = target;
end;
$function$;

create or replace function public.admin_list_invites(pw text)
 returns table(id uuid, label text, side text, max_uses integer, uses integer, revoked boolean, created_at timestamptz, last_used_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then
    raise exception 'invalid password';
  end if;
  return query
    select i.id, i.label, i.side, i.max_uses, i.uses, i.revoked, i.created_at, i.last_used_at
      from invite_codes i order by i.created_at desc;
end;
$function$;

create or replace function public.submit_with_invite(code text, person jsonb, rel jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_code   text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv    invite_codes%rowtype;
  v_name   text := trim(coalesce(person->>'name', ''));
  v_side   text := person->>'side';
  v_note   text := nullif(trim(coalesce(person->>'note', '')), '');
  v_pid    uuid;
  v_rid    uuid;
  v_type   text;
  v_from   uuid;
  v_to     uuid;
  v_other  uuid;
begin
  if char_length(v_code) <> 8 then
    raise exception 'invalid code';
  end if;
  select * into v_inv from invite_codes i
   where not i.revoked and i.uses < i.max_uses
     and i.code_hash = crypt(v_code, i.code_hash)
   limit 1 for update;
  if not found then
    raise exception 'invalid code';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'invalid name';
  end if;
  if v_side is null or v_side not in ('saif', 'rumaisah') then
    raise exception 'invalid side';
  end if;

  insert into people (name, side, is_kid, submitted_note, status)
  values (v_name, v_side, coalesce((person->>'is_kid')::boolean, false), left(v_note, 280), 'pending')
  returning id into v_pid;

  if rel is not null and rel->>'type' is not null then
    v_type := rel->>'type';
    if v_type not in ('parent_of', 'sibling_of', 'spouse_of') then
      raise exception 'invalid relationship';
    end if;
    v_from := case when rel->>'from_person' = 'NEW' then v_pid else (rel->>'from_person')::uuid end;
    v_to   := case when rel->>'to_person'   = 'NEW' then v_pid else (rel->>'to_person')::uuid end;
    v_other := case when v_from = v_pid then v_to else v_from end;
    if v_other = v_pid or not exists (select 1 from people p where p.id = v_other) then
      raise exception 'invalid relationship';
    end if;
    insert into relationships (from_person, to_person, type, status)
    values (v_from, v_to, v_type, 'pending')
    returning id into v_rid;
  end if;

  update invite_codes set uses = uses + 1, last_used_at = now() where id = v_inv.id;
  return jsonb_build_object('person_id', v_pid, 'relationship_id', v_rid);
end;
$function$;

revoke all on function public.admin_create_invite(text, text, text, integer) from public;
revoke all on function public.admin_revoke_invite(text, uuid) from public;
revoke all on function public.admin_list_invites(text) from public;
revoke all on function public.submit_with_invite(text, jsonb, jsonb) from public;
grant execute on function public.admin_create_invite(text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_revoke_invite(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_invites(text) to anon, authenticated;
grant execute on function public.submit_with_invite(text, jsonb, jsonb) to anon, authenticated;
