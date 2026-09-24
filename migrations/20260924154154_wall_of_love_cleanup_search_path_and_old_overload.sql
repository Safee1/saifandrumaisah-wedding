-- Reconstructed from live DB on 2026-09-24 — idempotent
-- Matches live migration 20260924154154_wall_of_love_cleanup_search_path_and_old_overload.
-- Drops the pre-moderation trigger function this replaced (trg_log_blessing_submitted,
-- which posted to activity_log directly on insert with no moderation awareness)
-- and confirms every blessings trigger function has an explicit search_path.

drop trigger if exists activity_log_blessing on public.blessings;
drop function if exists public.trg_log_blessing_submitted() cascade;

-- search_path hardening is already present on blessing_moderate() and
-- blessing_after_insert_log() as created in
-- 20260924154121_wall_of_love_email_and_moderation.sql (SET search_path TO
-- 'public'); re-asserting here is a no-op but keeps this file a faithful,
-- idempotent record of what the live migration did.
alter function public.blessing_moderate() set search_path to 'public';
alter function public.blessing_after_insert_log() set search_path to 'public';
