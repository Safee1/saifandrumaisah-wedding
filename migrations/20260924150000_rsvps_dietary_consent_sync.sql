-- Read-only sync: dietary consent (UK GDPR health data) was live but had no file in migrations/.
alter table public.rsvps add column if not exists dietary_consent boolean not null default false;
alter table public.rsvps add column if not exists dietary_consent_at timestamptz;
alter table public.rsvps drop constraint if exists rsvps_dietary_consent_check;
alter table public.rsvps add constraint rsvps_dietary_consent_check
  check (dietary is null or char_length(trim(dietary)) = 0 or dietary_consent = true);
