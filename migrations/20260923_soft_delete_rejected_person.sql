-- Security review finding 1: admin_set_person_status hard-deleted a person
-- and all their relationships on rejection. Switch to a soft delete
-- (status = 'rejected') so rejected submissions can be restored, and so a
-- mistaken reject doesn't silently destroy relationship rows.
--
-- Safe because:
--   * people_select_approved only exposes status = 'approved' rows publicly.
--   * rel_select_approved requires BOTH endpoints to be status = 'approved',
--     so a relationship touching a rejected person is already invisible to
--     the public even though the row still exists.
--   * admin_list_pending only selects status = 'pending', so rejected rows
--     never show up in the pending queue.
-- Additive/behavioural only: no drops of existing columns/policies.

alter table public.people drop constraint if exists people_status_check;
alter table public.people add constraint people_status_check
  check (status = any (array['pending', 'approved', 'rejected']::text[]));

create or replace function public.admin_set_person_status(pw text, target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  if new_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;
  update people set status = new_status where id = target;
end;
$function$;

-- Undo a rejection: puts the person back into the pending queue.
create or replace function public.admin_restore_person(pw text, target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  update people set status = 'pending' where id = target and status = 'rejected';
end;
$function$;

-- Small "rejected (restore)" list for tree-admin.html.
create or replace function public.admin_list_rejected(pw text)
returns table(id uuid, name text, side text, is_kid boolean, submitted_note text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query
    select p.id, p.name, p.side, p.is_kid, p.submitted_note, p.created_at
    from people p
    where p.status = 'rejected'
    order by p.created_at desc;
end;
$function$;

grant execute on function public.admin_restore_person(text, uuid) to anon;
grant execute on function public.admin_list_rejected(text) to anon;
