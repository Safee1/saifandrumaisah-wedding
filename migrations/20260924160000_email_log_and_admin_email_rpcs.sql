-- Reconstructed from live DB on 2026-09-24 — idempotent
-- NOTE: this object set exists live (email_log table, admin_list_email_log,
-- admin_list_rsvp_emails) but has NO corresponding entry in
-- supabase list_migrations — it was applied directly against the database,
-- not through a tracked migration. There is no live "version timestamp" to
-- match, so this file is dated just after the last tracked migration
-- (20260924155137) to preserve chronological order. Backs Resend outbound
-- email (see docs/OPERATIONS.md) — a log of what was sent, and an admin
-- helper to pull RSVP contact emails for a mailing.

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  to_email text not null,
  kind text not null,
  status text not null default 'sent',
  provider_id text,
  error text,
  ref_id uuid
);
alter table public.email_log enable row level security;
-- Intentionally no policies: only the SECURITY DEFINER admin_list_email_log
-- function (running as owner) reads this; nothing writes to it over REST.

create or replace function public.admin_list_email_log(pw text, limit_n integer default 200)
 returns setof email_log
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query select * from email_log order by created_at desc limit greatest(1, least(limit_n, 1000));
end;
$function$;

create or replace function public.admin_list_rsvp_emails(pw text)
 returns table(contact text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not admin_check(pw) then raise exception 'invalid password'; end if;
  return query
    select distinct trim(contact) from rsvps
    where contact is not null and trim(contact) ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
end;
$function$;

revoke all on function public.admin_list_email_log(text, integer) from public;
revoke all on function public.admin_list_rsvp_emails(text) from public;
grant execute on function public.admin_list_email_log(text, integer) to anon, authenticated;
grant execute on function public.admin_list_rsvp_emails(text) to anon, authenticated;
