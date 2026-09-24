-- Children's names must never appear in any public network response.
-- Replace the direct anon SELECT on people/relationships with a single
-- SECURITY DEFINER function that redacts kid names, and lock down the
-- underlying tables so a direct REST read returns nothing.

create or replace function public.public_tree()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'people', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'name', case when p.is_kid then 'Little one' else p.name end,
        'side', p.side,
        'is_kid', p.is_kid,
        'relation', case when p.is_kid then null else p.relation end
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
$$;

grant execute on function public.public_tree() to anon, authenticated;

-- Lock down direct reads: the anon SELECT policies let raw REST calls
-- return full rows, including real kid names. INSERT paths (submit_to_tree,
-- submit_with_invite — both SECURITY DEFINER RPCs) are unaffected; no
-- client code inserts into people/relationships directly.
drop policy if exists people_select_approved on public.people;
drop policy if exists rel_select_approved on public.relationships;
