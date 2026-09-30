-- Applied live 26 Sep 2026 (read-only sync of the current definitions).
-- 1. blessing_moderate: abusive-word check matches WHOLE words only, so
--    "Scunthorpe", "Kalbi", "assassin" no longer get held for review.
-- 2. submit_to_tree: a new entry may only link to an already-APPROVED person
--    (the dropdown only offers those); linking to pending/rejected is refused.

create or replace function public.blessing_moderate() returns trigger
language plpgsql set search_path to 'public' as $$
declare
  v_text text;
  v_lower text;
  v_flag boolean := false;
  v_reason text := '';
  v_theme text;
begin
  v_text := coalesce(new.name, '') || ' ' || coalesce(new.message, '');
  v_lower := lower(v_text);

  if new.message ~* '(https?://|www\.|\.com|\.co\.uk|\.net\b)' then
    v_flag := true; v_reason := v_reason || 'link; ';
  end if;
  if new.message ~ '[0-9][0-9 \-\(\)]{7,}[0-9]' then
    v_flag := true; v_reason := v_reason || 'phone-like number; ';
  end if;
  if new.message ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then
    v_flag := true; v_reason := v_reason || 'email address; ';
  end if;

  -- whole words only: "Scunthorpe", "Kalbi", "assassin" no longer trip it
  if v_lower ~ '\m(fuck|shit|bitch|asshole|bastard|cunt|whore|slut|nigger|faggot|rape|kill yourself|kys|randi|kutt[ei]|chutiya|harami|madarchod|behenchod|bhosdi|gandu|kanjar|haram ?zada|sharmuta|kalb|ahbal)\M' then
    v_flag := true; v_reason := v_reason || 'profanity/abusive term; ';
  end if;

  if char_length(new.message) >= 12
     and new.message = upper(new.message)
     and new.message ~ '[A-Za-z]' then
    v_flag := true; v_reason := v_reason || 'all-caps; ';
  end if;

  if new.message ~* '(.)\1{5,}' then
    v_flag := true; v_reason := v_reason || 'repeated characters; ';
  end if;
  if new.message ~* '\y(\w{2,})\y(\s+\y\1\y){3,}' then
    v_flag := true; v_reason := v_reason || 'repeated word spam; ';
  end if;

  new.status := case when v_flag then 'pending' else 'approved' end;
  new.moderation_reason := nullif(trim(v_reason), '');

  if v_lower ~ '(congrat|mubarak|masha ?allah|mashallah)' then
    v_theme := 'congratulations';
  elsif v_lower ~ '(can''?t wait|cannot wait|so excited|counting down|so ready)' then
    v_theme := 'cant_wait';
  elsif v_lower ~ '(will be there|see you there|can''?t make it|wish(ing)? (i|we) could|sadly|unfortunately)' then
    v_theme := 'will_be_there';
  elsif v_lower ~ '(dua|pray|ameen|amin|allah|barakah|barakat|blessing)' then
    v_theme := 'duas';
  else
    v_theme := 'love';
  end if;
  new.theme := v_theme;

  return new;
end;
$$;

create or replace function public.submit_to_tree(person jsonb, rel jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
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
    -- may only link to someone already approved (the dropdown only offers those)
    if v_other = v_pid or not exists (select 1 from people p where p.id = v_other and p.status = 'approved') then
      raise exception 'invalid relationship';
    end if;
    insert into relationships (from_person, to_person, type, status)
    values (v_from, v_to, v_type, 'pending')
    returning id into v_rid;
  end if;

  return jsonb_build_object('person_id', v_pid, 'relationship_id', v_rid);
end;
$$;
