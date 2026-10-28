# Schema snapshot — live DB, updated 25 Oct 2026 (first written 2026-09-24)

Supabase project `rfopieelzxvnmfhdvqqf`. This is a point-in-time record so
future drift between `migrations/` and the live DB is visible at a glance.

**Read this first: migration history is NOT clean.** The October changes
(family code, admin purge, hardening, flood cap 40, and the two record-only
functions) were applied by Saif in the Supabase SQL editor, outside the
migration tracker. `supabase_migrations.schema_migrations` stops at 26 Sep
2026, so the files in `migrations/` from `20261019100000` onward are not in the
tracker. Nobody should run `supabase db push` expecting a clean history; it
would try to re-apply them. Treat these files as the written record, and
re-read the live definitions (`pg_get_functiondef`) before trusting any file.
Rollback SQL lives in `migrations/rollbacks/`; unapplied proposals in
`migrations/drafts/`.

## Tables (public schema, RLS on for all)

| Table | RLS | Policies | anon/authenticated grants |
|---|---|---|---|
| people | on | none (writes go through `submit_to_tree`/admin RPCs) | direct reads revoked in October; the tree reads via `public_tree()` / `family_tree(code)` |
| relationships | on | none | direct reads revoked in October; same RPCs as people |
| rsvps | on | `rsvps_insert_public` (insert, true) | full table grants |
| blessings | on | `blessings_public_insert` (insert, true), `blessings_public_read` (select, status='approved') | full table grants |
| admin_config | on | none (deny-all by design) | full table grants (protection is RLS, not GRANT) |
| admin_login_attempts | on | none (deny-all; only `admin_check()` touches it) | full table grants |
| activity_log | on | none (deny-all; only `activity_log_write()` and admin RPCs touch it) | full table grants |
| email_log | on | none (deny-all; only `admin_list_email_log()` reads it) | full table grants |
| invite_codes | on | none (deny-all; legacy, unused since the tree opened) | **no** anon/authenticated table grants |
| family_access | on | none (deny-all; holds the bcrypt hash of the family code only) | revoked from anon/authenticated |
| family_code_attempts | on | none (deny-all; failed guesses for the global 5-in-15-minute lockout) | revoked from anon/authenticated |

Columns of note: `blessings.email`, `blessings.theme`, `blessings.moderation_reason`
(wall-of-love); `rsvps.adults`/`children`/`likelihood` (interest + headcount);
`people.sort_order`/`relation` (kinship labels).

## Public functions and their EXECUTE grantees

All `admin_*` functions require a live table-driven password check
(`admin_check`) plus a 5-failure/15-minute global lockout — see
`20260923_admin_brute_force_lockout.sql`.

| Function | EXECUTE grantees (live) | Defined in |
|---|---|---|
| admin_check | anon, authenticated | 20260923_admin_brute_force_lockout.sql |
| admin_create_invite | anon, authenticated | 20260902000617_invite_codes_gate.sql |
| admin_delete_rsvp | anon, authenticated | 20260819000000_baseline_admin_and_core_tables.sql |
| admin_list_activity | anon, authenticated | 20260924_activity_log.sql |
| admin_list_all | anon, authenticated | 20260819000000_baseline_admin_and_core_tables.sql |
| admin_list_blessings | anon, authenticated | 20260819000000_baseline_admin_and_core_tables.sql |
| admin_list_blessings_full | anon, authenticated | 20260924155137_admin_list_blessings_full_rpc.sql |
| admin_list_email_log | anon, authenticated | 20260924160000_email_log_and_admin_email_rpcs.sql |
| admin_list_invites | anon, authenticated | 20260902000617_invite_codes_gate.sql |
| admin_list_pending | anon, authenticated | 20260819000000_baseline_admin_and_core_tables.sql |
| admin_list_rejected | anon, authenticated | 20260923_soft_delete_rejected_person.sql |
| admin_list_rsvp_emails | anon, authenticated | 20260924160000_email_log_and_admin_email_rpcs.sql |
| admin_list_rsvps | anon, authenticated | 20260923_admin_list_rsvps_interest_fields.sql |
| admin_restore_person | anon, authenticated | 20260923_soft_delete_rejected_person.sql |
| admin_revoke_invite | anon, authenticated | 20260902000617_invite_codes_gate.sql |
| admin_set_blessing_status | anon, authenticated | 20261025100100_record_admin_set_blessing_status_4arg.sql (RECORD ONLY; the live 4-argument form) |
| admin_set_person_status | anon, authenticated | 20260923_soft_delete_rejected_person.sql |
| admin_set_relationship_status | anon, authenticated | 20260819000000_baseline_admin_and_core_tables.sql |
| flood_guard | anon, authenticated (trigger fn) | 20261023100000_flood_guard_rsvps_cap_40.sql (rsvps 40, others 300 per 10 minutes; earlier 20260925150000_flood_guard_definer_and_admin_delay.sql) |
| public_tree | anon, authenticated | 20260924_public_tree_hide_kid_names.sql |
| rsvp_headcount | anon, authenticated | 20260923_rsvp_interest_and_headcount.sql |
| submit_to_tree | anon, authenticated | 20260923_submit_to_tree_open.sql |
| submit_with_invite | anon, authenticated | 20260902000617_invite_codes_gate.sql |
| admin_data_counts | anon, authenticated | 20261025100000_record_admin_data_counts.sql (RECORD ONLY, applied in the SQL editor) |
| admin_set_family_code | anon, authenticated | 20261022110000_family_code_race_admin_lockout.sql (min 16 chars, hash only, returns an error column instead of raising) |
| admin_purge_guest_data | anon, authenticated | 20261022110000_family_code_race_admin_lockout.sql (SQL editor only; deletes rsvps, blessings, email_log; not activity_log, people, relationships) |
| family_tree | anon, authenticated | 20261022110000_family_code_race_admin_lockout.sql (advisory lock; global 5-wrong-in-15-minutes lockout; returns {"error":"wrong_code"} / {"error":"locked"}) |
| activity_log_write | **postgres, service_role only** (revoked from anon/authenticated/public) | 20260924_activity_log_lock_down_internal_functions.sql |
| trg_log_person_submitted | postgres, service_role only | 20260924_activity_log_lock_down_internal_functions.sql |
| trg_log_blessing_submitted | postgres, service_role only (trigger fn) | see live DB; no separate repo file |
| trg_log_rsvp_submitted | postgres, service_role only | 20260924_activity_log_lock_down_internal_functions.sql |
| blessing_moderate | postgres, service_role only (trigger fn, never called via RPC) | 20260924154121_wall_of_love_email_and_moderation.sql |
| blessing_after_insert_log | postgres, service_role only (trigger fn) | 20260924154121_wall_of_love_email_and_moderation.sql |

## Triggers

| Trigger | Table | Function | Defined in |
|---|---|---|---|
| blessing_moderate_trg | blessings | blessing_moderate | 20260924154121_wall_of_love_email_and_moderation.sql |
| blessing_after_insert_log_trg | blessings | blessing_after_insert_log | 20260924154121_wall_of_love_email_and_moderation.sql |
| blessings_flood_guard | blessings | flood_guard | 20260923_rsvp_length_checks_and_flood_guard.sql |
| activity_log_person | people | trg_log_person_submitted | 20260924_activity_log.sql |
| people_flood_guard | people | flood_guard | 20260923_rsvp_length_checks_and_flood_guard.sql |
| activity_log_rsvp | rsvps | trg_log_rsvp_submitted | 20260924_activity_log.sql |
| rsvps_flood_guard | rsvps | flood_guard | 20260923_rsvp_length_checks_and_flood_guard.sql |

## October 2026 changes (all applied in the SQL editor, outside the tracker)

| File | What |
|---|---|
| 20260925140000_revoke_anon_internal_tables.sql, 20260925141000_blessings_hide_email_column.sql, 20260926110000_rsvps_revoke_public_select.sql | grant clean-ups (25-26 Sep) |
| 20261019100000_family_code.sql | family code: hash-only storage, `family_tree` RPC |
| 20261021100000_admin_purge_guest_data.sql | guest-data purge (SQL editor only) |
| 20261022100000_family_code_hardening.sql, 20261022110000_family_code_race_admin_lockout.sql | 16-char minimum, global lockout, return-instead-of-raise, advisory lock; applied together |
| 20261023100000_flood_guard_rsvps_cap_40.sql | rsvps cap 300 to 40 per 10 minutes |
| 20261025100000_record_admin_data_counts.sql, 20261025100100_record_admin_set_blessing_status_4arg.sql | RECORD ONLY: written from the live definitions on 25 Oct |

## Completeness — every live migration mapped to a repo file

| Live version | Live name | Repo file |
|---|---|---|
| 20260819232734 | add_sibling_type_and_sort_order | 20260819232734_add_sibling_type_and_sort_order.sql (data-only stub; `sort_order` reconstructed in baseline) |
| 20260819232849 | seed_saif_extended_family | 20260819232849_seed_saif_extended_family.sql (data-only stub) |
| 20260820100210 | add_amar_arisha_spouse | 20260820100210_add_amar_arisha_spouse.sql (data-only stub) |
| 20260820165953 | blessings_wall | 20260820165953_blessings_wall.sql |
| 20260820170517 | temp_qa_blessings | 20260820170517_temp_qa_blessings.sql (data-only stub) |
| 20260820170725 | cleanup_qa_blessings | 20260820170725_cleanup_qa_blessings.sql (data-only stub) |
| 20260820172044 | cleanup_e2e_probe_blessing | 20260820172044_cleanup_e2e_probe_blessing.sql (data-only stub) |
| 20260820172450 | cleanup_e2e_probe_blessing_2 | 20260820172450_cleanup_e2e_probe_blessing_2.sql (data-only stub) |
| 20260821020724 | seed_kashif_siblings | 20260821020724_seed_kashif_siblings.sql (data-only stub) |
| 20260821085620 | merge_asma_cross_marriage | 20260821085620_merge_asma_cross_marriage.sql (data-only stub) |
| 20260821111009 | kinship_relation_labels | 20260821111009_kinship_relation_labels.sql (data-only stub; `people.relation` column reconstructed in baseline) |
| 20260826134708 | inclusive_kinship_labels | 20260826134708_inclusive_kinship_labels.sql (data-only stub) |
| 20260826141018 | normalise_relation_apostrophes | 20260826141018_normalise_relation_apostrophes.sql (data-only stub) |
| 20260826141646 | child_kinship_labels | 20260826141646_child_kinship_labels.sql (data-only stub) |
| 20260826143551 | koukub_birth_order | 20260826143551_koukub_birth_order.sql (data-only stub) |
| 20260902000617 | invite_codes_gate | 20260902000617_invite_codes_gate.sql |
| 20260923141933 | rsvp_interest_and_headcount | 20260923_rsvp_interest_and_headcount.sql |
| 20260923141939 | submit_to_tree_open | 20260923_submit_to_tree_open.sql |
| 20260923142622 | admin_list_rsvps_interest_fields | 20260923_admin_list_rsvps_interest_fields.sql |
| 20260923151426 | reset_admin_password | 20260923151426_reset_admin_password.sql (data-only stub; rotated `admin_config.password_hash`) |
| 20260923224214 | soft_delete_rejected_person | 20260923_soft_delete_rejected_person.sql |
| 20260923224218 | admin_brute_force_lockout | 20260923_admin_brute_force_lockout.sql |
| 20260923224223 | rsvp_length_checks_and_flood_guard | 20260923_rsvp_length_checks_and_flood_guard.sql |
| 20260923224812 | flood_guard_search_path | 20260923_rsvp_length_checks_and_flood_guard.sql (search_path hardening included inline) |
| 20260924143957 | public_tree_hide_kid_names | 20260924_public_tree_hide_kid_names.sql |
| 20260924151649 | flood_guard_raise_launch_limit | 20260924_flood_guard_raise_launch_limit.sql |
| 20260924152329 | activity_log | 20260924_activity_log.sql |
| 20260924152417 | cleanup_activity_log_smoke_test | 20260924152417_cleanup_activity_log_smoke_test.sql (data-only stub) |
| 20260924153511 | activity_log_lock_down_internal_functions | 20260924_activity_log_lock_down_internal_functions.sql |
| 20260924153545 | activity_log_lock_down_internal_functions_v2 | 20260924153545_activity_log_lock_down_internal_functions_v2.sql (data-only stub; idempotent re-run of the same revokes) |
| 20260924153606 | cleanup_second_smoke_test | 20260924153606_cleanup_second_smoke_test.sql (data-only stub) |
| 20260924154121 | wall_of_love_email_and_moderation | 20260924154121_wall_of_love_email_and_moderation.sql |
| 20260924154154 | wall_of_love_cleanup_search_path_and_old_overload | 20260924154154_wall_of_love_cleanup_search_path_and_old_overload.sql |
| 20260924155137 | admin_list_blessings_full_rpc | 20260924155137_admin_list_blessings_full_rpc.sql |
| n/a — untracked | email_log table, admin_list_email_log, admin_list_rsvp_emails | 20260924160000_email_log_and_admin_email_rpcs.sql (no live migration record exists for this object set; applied directly, not through migration history) |
| n/a — pre-tracking baseline | people, relationships, rsvps, blessings (base), admin_config, admin_check, admin_list_all, admin_list_pending, admin_set_relationship_status, admin_delete_rsvp, admin_list_blessings | 20260819000000_baseline_admin_and_core_tables.sql (predates the earliest tracked migration, 20260819232734) |

The table above covers the tracked history up to 26 Sep. Some entries are
data-only stubs or reconstructions and may not reproduce the live objects
byte for byte. Anything after 26 Sep is untracked (see the top of this file).
No claim is made that every live object maps to a file; `admin_list_all` /
`admin_check` style legacy functions and pgcrypto helpers should be checked
against the live DB when it matters.
