-- Privacy (applied live 25 Sep 2026): the public key could read blessings.email
-- and moderation_reason on approved rows. Guests were promised emails are never
-- public. Public reads are now limited to the columns the Wall of Love uses.
revoke select on public.blessings from anon, authenticated;
grant select (id, name, message, status, created_at, theme) on public.blessings to anon, authenticated;
