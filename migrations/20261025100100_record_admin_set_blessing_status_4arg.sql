-- RECORD ONLY - already live in production, written from the live definition on 25 Oct 2026; do not run.
-- The 4-argument admin_set_blessing_status(pw, target, new_status, new_theme) as it exists live.
-- The repo's earlier definition could not reproduce this exact body.
CREATE OR REPLACE FUNCTION public.admin_set_blessing_status(pw text, target uuid, new_status text, new_theme text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_status not in ('approved', 'hidden', 'pending') then
    raise exception 'invalid status';
  end if;
  if new_theme is not null and new_theme not in ('congratulations','cant_wait','will_be_there','duas','love') then
    raise exception 'invalid theme';
  end if;
  select name into v_name from blessings where id = target;
  update blessings
    set status = new_status,
        theme = coalesce(new_theme, theme)
    where id = target;
  perform activity_log_write(
    case new_status when 'approved' then 'blessing_approved' else 'blessing_hidden' end,
    'Blessing from ' || coalesce(v_name, 'Someone') || ' set to ' || new_status,
    target
  );
end;
$function$;
