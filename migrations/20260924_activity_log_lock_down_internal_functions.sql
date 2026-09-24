-- Follow-up to 20260924_activity_log.sql: Supabase auto-grants EXECUTE on
-- every new public-schema function to anon/authenticated by default
-- privilege. activity_log_write() and the trg_log_* trigger functions are
-- internal helpers only (never meant to be called directly over
-- PostgREST) — confirmed live that anon could call
-- /rest/v1/rpc/activity_log_write directly to forge arbitrary log entries.
-- Revoke that default grant; the DB triggers (which run as the function
-- owner regardless of caller privileges) are unaffected.
revoke execute on function public.activity_log_write(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.trg_log_rsvp_submitted() from public, anon, authenticated;
revoke execute on function public.trg_log_person_submitted() from public, anon, authenticated;
revoke execute on function public.trg_log_blessing_submitted() from public, anon, authenticated;
