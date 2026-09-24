-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Matches live migration 20260924155137_admin_list_blessings_full_rpc.
-- Admin-facing blessings list that returns every status (not just
-- pending) plus theme + moderation_reason, for the wall-of-love admin view.

create or replace function public.admin_list_blessings_full(pw text, filter_status text default 'pending'::text)
 returns table(id uuid, name text, message text, status text, theme text, moderation_reason text, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if filter_status not in ('pending','approved','hidden') then
    raise exception 'invalid status';
  end if;
  return query
    select b.id, b.name, b.message, b.status, b.theme, b.moderation_reason, b.created_at
    from blessings b
    where b.status = filter_status
    order by b.created_at desc;
end;
$function$;

revoke all on function public.admin_list_blessings_full(text, text) from public;
grant execute on function public.admin_list_blessings_full(text, text) to anon, authenticated;
