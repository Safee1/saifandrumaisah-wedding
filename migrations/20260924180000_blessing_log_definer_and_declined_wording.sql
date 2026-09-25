-- Launch-day fixes applied live 24 Sep 2026.
-- 1. Every blessing insert failed "permission denied for function activity_log_write":
--    the log trigger ran as the guest (anon), who lost EXECUTE in the #61 lockdown.
alter function public.blessing_after_insert_log() security definer set search_path = public, pg_temp;

-- 2. A "can't make it" RSVP logs as "<name> can't make it", not "RSVP'd (0 adults)".
create or replace function public.trg_log_rsvp_submitted() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.attending = false then
    perform activity_log_write('rsvp_submitted', coalesce(new.name, 'Someone') || ' can''t make it', new.id);
    return new;
  end if;
  perform activity_log_write(
    'rsvp_submitted',
    coalesce(new.name, 'Someone') || ' RSVP''d (' ||
      coalesce(new.adults::text, '?') || ' adult' || case when coalesce(new.adults,1) = 1 then '' else 's' end ||
      case when coalesce(new.children,0) > 0 then ', ' || new.children::text || ' child' || case when new.children = 1 then '' else 'ren' end else '' end ||
      case when new.likelihood is not null then ', ' || new.likelihood else '' end || ')',
    new.id
  );
  return new;
exception when others then
  return new;
end;
$$;
