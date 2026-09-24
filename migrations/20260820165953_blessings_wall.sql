-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Matches live migration 20260820165953_blessings_wall. Public-facing
-- "wall of love": anyone can post a blessing, anyone can read approved
-- ones. RLS policies only — base blessings table + email/theme/
-- moderation_reason columns are reconstructed in
-- 20260819000000_baseline_admin_and_core_tables.sql and
-- 20260924154121_wall_of_love_email_and_moderation.sql respectively.

drop policy if exists blessings_public_insert on public.blessings;
create policy blessings_public_insert on public.blessings
  for insert to anon, authenticated
  with check (true);

drop policy if exists blessings_public_read on public.blessings;
create policy blessings_public_read on public.blessings
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists rsvps_insert_public on public.rsvps;
create policy rsvps_insert_public on public.rsvps
  for insert to anon, authenticated
  with check (true);
