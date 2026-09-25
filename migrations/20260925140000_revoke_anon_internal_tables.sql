-- Second layer on back-office tables (applied live 25 Sep 2026).
-- RLS with no policies already denied anon; this also removes the table
-- grants so one policy mistake can't expose them. All access goes through
-- SECURITY DEFINER functions (admin_check, activity_log_write, admin_* RPCs)
-- or service_role (edge functions).
revoke all on table public.admin_config, public.admin_login_attempts, public.email_log, public.activity_log
  from anon, authenticated;

-- pgcrypto stays in public (advisor WARN accepted): admin_check and the
-- password functions run with search_path=public and call crypt()/gen_salt()
-- unqualified. Moving the extension would break admin login.
