-- live_verification_queries.sql
--
-- READ-ONLY. For the owner (or the lead) to paste into the Supabase SQL editor.
-- The DBSEC audit was not allowed to touch the live database, so these queries
-- settle the points it could only infer from migrations/. Nothing here writes,
-- and none of it prints a password or a hash (Q1 shows only the 7-character
-- algorithm/cost prefix).

-- Q1. Cost factor of the live admin password hash.
--   $2a$06$ = pgcrypto default (weak: 64 iterations). $2a$10$ or higher is fine.
--   More than one row = more than one valid admin password.
select substring(password_hash from 1 for 7) as bcrypt_prefix, count(*) as rows
  from public.admin_config
 group by 1;

-- Q2. Every function in public, who can execute it, SECURITY DEFINER or not,
--     and whether search_path is pinned (config column). Extension functions
--     (pgcrypto) are listed separately in Q3.
select p.oid::regprocedure                                     as fn,
       p.prosecdef                                             as security_definer,
       coalesce(array_to_string(p.proconfig, ' '), '')         as config,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       pg_get_userbyid(p.proowner)                             as owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
 order by 1;
-- Expect anon_can_execute = false for: activity_log_write, trg_log_*, blessing_moderate,
-- blessing_after_insert_log (and ideally flood_guard). Anything else that is true should be
-- one of the admin_* RPCs, public_tree, rsvp_headcount, submit_to_tree, submit_with_invite.

-- Q3. pgcrypto functions installed in public and whether anon can execute them.
select p.oid::regprocedure as fn,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p
  join pg_depend d on d.objid = p.oid and d.deptype = 'e'
  join pg_extension e on e.oid = d.refobjid and e.extname = 'pgcrypto'
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 order by 1;

-- Q4. Live bodies the repo cannot show. migrations/ has only the 3-argument
--     admin_set_blessing_status; admin-activity.html calls a 4-argument one.
select p.oid::regprocedure as fn, pg_get_functiondef(p.oid) as definition
  from pg_proc p
 where p.proname = 'admin_set_blessing_status'
   and p.pronamespace = 'public'::regnamespace;

-- Q5. Effective table privileges of anon and authenticated on public tables.
select c.relname,
       has_table_privilege('anon', c.oid, 'SELECT')   as anon_select,
       has_table_privilege('anon', c.oid, 'INSERT')   as anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE')   as anon_update,
       has_table_privilege('anon', c.oid, 'DELETE')   as anon_delete,
       has_table_privilege('anon', c.oid, 'TRUNCATE') as anon_truncate,
       has_table_privilege('authenticated', c.oid, 'SELECT')   as auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT')   as auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE')   as auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE')   as auth_delete,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE') as auth_truncate
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
 order by 1;

-- Q6. Column-level read access on blessings (email and moderation_reason must be false).
select a.attname as col, has_column_privilege('anon', c.oid, a.attnum, 'SELECT') as anon_can_select
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
 where c.oid = 'public.blessings'::regclass and a.attnum > 0 and not a.attisdropped
 order by a.attnum;

-- Q7. Row level security: on / forced per table, then every policy.
select c.relname, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by 1;

select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
 order by 1, 2;

-- Q8. CHECK and FOREIGN KEY constraints actually present (the repo omits several
--     that code comments say exist: blessings name/message/email, people name, ...).
select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where connamespace = 'public'::regnamespace and contype in ('c', 'f')
 order by 1, 2;

-- Q9. Foreign keys with no index starting on the FK column.
select c.conrelid::regclass as tbl, c.conname, a.attname as fk_column
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
 where c.contype = 'f' and c.connamespace = 'public'::regnamespace
   and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);

-- Q10. Extensions and the schema each lives in.
select e.extname, n.nspname as schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 order by 1;

-- Q11. Triggers on the guest-facing tables, in firing order (BEFORE triggers fire alphabetically).
select event_object_table as tbl, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public'
 order by 1, 3, 2;

-- Q12. Size and row counts (flood / growth check).
select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) as total_size
  from pg_stat_user_tables
 order by pg_total_relation_size(relid) desc;
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Q13. Default privileges: what every NEW object gets handed to anon/authenticated.
select defaclrole::regrole as creator, defaclnamespace::regnamespace as schema,
       defaclobjtype as objtype, defaclacl
  from pg_default_acl
 order by 1, 2, 3;

-- Q14. How much admin traffic has the lockout actually seen? (direct admin_check calls only:
--      attempts made through admin_* RPCs are rolled back and never appear here.)
select success, count(*), min(created_at), max(created_at)
  from public.admin_login_attempts
 group by success;
select kind, count(*), max(created_at)
  from public.activity_log
 where kind like 'admin_%'
 group by kind;
