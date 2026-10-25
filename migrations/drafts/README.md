# Draft migrations (NOT applied)

Nothing in this folder is applied by anything. Files here are proposals for the
owner to read, test and apply by hand to the live Supabase project.

## 20261007140000_admin_lockout_counts_all_attempts.sql

Problem: a wrong admin password sent to any `admin_*` RPC is never counted,
because the exception that rejects it also rolls back the attempt row. The
5-strike lockout therefore never engages for those calls.

Fix: count wrong passwords in two sequences (sequences are not rolled back) and
add an unguessable recovery key so the lockout cannot be used to lock the owners out.

Status: written without a running database. UNTESTED. Before applying:
1. Run `harness_admin_lockout.sql` against an empty scratch Postgres 15+.
2. Review `rollback_20261007140000.sql`.
3. Apply to live, then run `live_verification_queries.sql`.
