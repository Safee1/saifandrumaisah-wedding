-- Opens the family tree submission to everyone (no personal invite code
-- required). Submissions still land as 'pending' under the existing RLS —
-- nothing here bypasses moderation. The invite-code table/RPCs are left
-- untouched (admin panel keeps working); this just adds an alternate,
-- uncoded entry point.
-- Additive only: no drops, no changes to existing tables/policies/RPCs.

create or replace function public.submit_to_tree(person jsonb, rel jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
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

  return jsonb_build_object('person_id', v_pid, 'relationship_id', v_rid);
end;
$function$;

grant execute on function public.submit_to_tree(jsonb, jsonb) to anon;
