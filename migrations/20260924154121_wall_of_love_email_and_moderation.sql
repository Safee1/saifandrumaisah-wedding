-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Matches live migration 20260924154121_wall_of_love_email_and_moderation.
-- Adds an optional contact email plus a theme tag to blessings, and a
-- moderation trigger that auto-flags links/phone numbers/emails/profanity/
-- spam patterns to 'pending' instead of auto-approving.

alter table public.blessings add column if not exists email text;
alter table public.blessings add column if not exists theme text;
alter table public.blessings add column if not exists moderation_reason text;

create or replace function public.blessing_moderate()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
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

  if v_lower ~ '(fuck|shit|bitch|asshole|bastard|cunt|whore|slut|nigger|faggot|rape|kill yourself|kys|randi|kutt[ei]|chutiya|harami|madarchod|behenchod|bhosdi|gandu|kanjar|haram ?zada|sharmuta|kalb|ahbal)' then
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
$function$;

create or replace function public.blessing_after_insert_log()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status = 'pending' then
    perform public.activity_log_write('blessing_submitted', 'A blessing from ' || coalesce(new.name, 'Someone') || ' is awaiting approval', new.id);
  else
    perform public.activity_log_write('blessing_submitted', 'New blessing from ' || coalesce(new.name, 'Someone') || ' (auto-approved)', new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists blessing_moderate_trg on public.blessings;
create trigger blessing_moderate_trg before insert on public.blessings for each row execute function public.blessing_moderate();

drop trigger if exists blessing_after_insert_log_trg on public.blessings;
create trigger blessing_after_insert_log_trg after insert on public.blessings for each row execute function public.blessing_after_insert_log();
