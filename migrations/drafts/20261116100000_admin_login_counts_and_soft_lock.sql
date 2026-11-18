-- =====================================================================
-- 20261116100000_admin_login_counts_and_soft_lock.sql
--
-- DRAFT. NOT applied anywhere. Needs the owner's review (it changes an RPC).
-- Written without a running database, so it is UNTESTED: read it, try it on
-- a scratch copy if you can, then run it on the live project yourself.
-- The scratch copy must be a spare Supabase project (or a local Supabase
-- stack), NOT bare Postgres: the file names the roles anon, authenticated
-- and service_role, and needs admin_config, admin_login_attempts,
-- activity_log, activity_log_write and pgcrypto. On plain Postgres it stops
-- with "role does not exist" and nothing is applied.
-- Until you have run it, the admin lockout still behaves as it did.
--
-- DO THIS FIRST (it is your only true undo)
--   1. In the SQL editor run:
--        select pg_get_functiondef('public.admin_check(text)'::regprocedure);
--   2. Save the result in a file outside this repo. The rollback file holds
--      only the repo's record of admin_check, which may not be what is live.
--   3. Check the admin password is 20 or more random characters from a
--      password manager (docs/RUNBOOKS.md). If it is not, change it before
--      running this file, or choose HARD below. See THE TRADE-OFF CHOSEN.
--
-- WHAT IT CHANGES (plain English)
--   1. Every wrong admin password is now counted, whichever admin page or
--      function it was typed into. Today almost none are.
--   2. Wrong admin passwords now show in the activity log, so the
--      "Failed logins (7 days)" card and the daily digest stop showing 0.
--   3. The CORRECT password always works. Nobody can lock you out of the
--      admin pages by typing wrong passwords on purpose.
--
-- WHY
--   (a) admin_check() writes a "failed attempt" row and returns false. Each
--       admin page function then does  raise exception 'invalid password'.
--       A raise undoes everything the call did, including that row and its
--       activity-log line. So wrong guesses at the three login gates were
--       never counted and never logged; the 5-strike lockout never fired
--       for them.
--   (b) The few paths that DO keep the row (calling admin_check directly
--       with the public key, admin_set_family_code, the notify function's
--       "message_all") are open to anyone. Five wrong calls there locked
--       out the right password for 15 minutes, and could be repeated for
--       ever. So the lockout stopped you, not an attacker.
--
-- HOW IT WORKS
--   * Counting uses four SEQUENCES. A sequence keeps its value even when
--     the call that bumped it is undone, so the count survives the raise.
--     No other admin function has to change, and no page has to change.
--       admin_fail_window   current 15-minute slot and wrong guesses in it,
--                           packed as  slot_number * 1000000 + wrong_guesses
--       admin_fail_total    wrong passwords ever (never reset). This is the
--                           TRUE count.
--       admin_fail_last_at  time of the latest wrong password (epoch seconds)
--       admin_fail_alarm    the latest 15-minute slot that reached 5 wrong
--                           guesses (slot number)
--   * Logging: an activity-log line cannot survive the raise, so it is
--     written a little later instead. The next admin call that is NOT undone
--     (any successful login, including opening admin-activity.html) writes
--     the lines for wrong guesses made since last time.
--     The small table admin_login_ledger remembers how many are written.
--   * The log is CAPPED so a stranger cannot fill it: in any 15-minute slot
--     at most 3 'admin_login_failed' lines are written one by one, then one
--     line saying "Plus N more failed admin login attempts". Anything after
--     that waits and is rolled into the next slot's lines. No guess is ever
--     dropped from the numbers: the lines plus the N's add up to the count.
--   * A slot with five or more wrong guesses also gets one 'admin_lockout'
--     line. Read it as "someone was guessing". It is remembered in its own
--     sequence at the moment the fifth guess lands, so a later quiet slot
--     cannot hide it.
--   * Wrong guesses no longer add rows to admin_login_attempts (the
--     sequences hold the count). Only successful logins are recorded there.
--   So the most a stranger can make this file write, however fast they
--   send wrong passwords, is 5 activity-log lines per 15 minutes (3 + 1
--   summary + 1 alarm), about 480 a day, and no other rows.
--
-- THE TRADE-OFF CHOSEN (please read)
--   The database cannot tell callers apart: every visitor uses the same
--   public key, so a lock can only be "for everyone". That leaves two
--   choices, and you cannot have both:
--     SOFT (this file's default): the right password always works. A
--       stranger cannot lock you out. But SOFT DOES NOT LIMIT HOW FAST
--       SOMEONE CAN GUESS. Each wrong guess is held for 1.5 seconds, but a
--       guesser can send many at once, so they can try tens of passwords a
--       second for as long as they like. (This is already true today
--       through the admin pages, because those guesses were never counted.)
--       The ONLY protection is the password itself. 20+ random characters
--       cannot be guessed this way; a short password or a real word can.
--     HARD: after 5 wrong guesses in a 15-minute slot, every password is
--       refused, right or wrong, until the slot ends. Guessing is slowed
--       to a crawl, but any stranger can keep you out for as long as they
--       like with 5 requests every 15 minutes. HARD is not exact either:
--       guesses sent at the same instant are all checked before any of
--       them is counted, so one burst of parallel requests gets more than
--       5 tries per slot (the function that is live today has the same
--       gap).
--   If the admin password is short or a real word, change it first
--   (RUNBOOKS, password change), or pick HARD: set  c_hard_lock  to true in
--   admin_check below before running. To clear a hard lock by hand:
--       select setval('public.admin_fail_window', 0, true);
--   The family code keeps its own separate hard lock; this file does not
--   touch it.
--
-- WHAT THE REPO CANNOT TELL ME
--   The October changes were run in the SQL editor outside the migration
--   tracker. The newest admin_check in the repo is
--   20260925150000_flood_guard_definer_and_admin_delay.sql, and the repo's
--   notes say the later "sequence" draft (PR #94) was never applied. I could
--   not look at the live database. This file is safe either way: it only
--   uses "create or replace" and "if not exists", keeps the same function
--   name, argument and return type, and can be run twice. If PR #94 had
--   been applied after all, its two sequences use the same packing and are
--   reused as they are.
--   That is why DO THIS FIRST, above, matters.
--
-- LIMITS (honest list)
--   * Wrong guesses at a login gate appear in the activity log only after
--     the next successful admin login (or another call that is not undone).
--     If nobody logs in for a day, that day's digest still shows 0 and the
--     lines appear later. They are all stamped with the time of the latest
--     wrong guess, not each guess's own time, so guesses from last week can
--     be dated today.
--   * The "Failed logins" card and the digest COUNT LINES, and a "Plus N
--     more" line counts as one. After a burst the card is therefore lower
--     than the real number. The true total is admin_fail_total (query 1
--     below, wrong_ever).
--   * If several slots reached 5 wrong guesses before anyone logged in, one
--     'admin_lockout' line is written, for the latest of them.
--   * The 15-minute slots are fixed clock slots (xx:00, xx:15, xx:30,
--     xx:45), not "the last 15 minutes".
--   * The 1.5 second pause for a wrong password is kept as it is today. It
--     slows one connection, not a guesser who opens many (see SOFT above).
--   * A stranger can still add up to about 480 activity-log lines a day.
--     The daily digest reads the newest 500 lines, so a day-long flood of
--     wrong passwords can still crowd its other counts.
--
-- HOW TO CHECK IT WORKED (SQL editor, after running this file)
--   1. Counters before:
--        select last_value % 1000000 as wrong_this_slot,
--               (select last_value from public.admin_fail_total) as wrong_ever
--          from public.admin_fail_window;
--   2. A wrong password through a page function (expect the error
--      "invalid password" after about 1.5 seconds):
--        select * from public.admin_list_rsvps('not-the-real-password');
--   3. Run query 1 again: wrong_ever has gone up by 1. Before this file it
--      would not have moved.
--   4. Open admin-activity.html and log in with the real password. The
--      timeline now shows "Admin login attempt failed" for step 2.
--   5. Optional, proves nobody can lock you out: run step 2 six times, then
--      log in on any admin page with the real password. It still works, and
--      the timeline shows three single lines, one "Plus 3 more" line and one
--      "Five or more wrong admin passwords" line.
--
-- HOW TO UNDO
--   Run migrations/rollbacks/20261116100000_admin_login_counts_and_soft_lock_rollback.sql
--   (or, better, paste back the definition you saved in DO THIS FIRST).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rollback-proof counters. Created at "last_value = 0, is_called = true"
--    so the first nextval() returns 1. Left alone if they already exist.
-- ---------------------------------------------------------------------
do $seq$
begin
  if to_regclass('public.admin_fail_window') is null then
    create sequence public.admin_fail_window as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_window', 0, true);
  end if;
  if to_regclass('public.admin_fail_total') is null then
    create sequence public.admin_fail_total as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_total', 0, true);
  end if;
  if to_regclass('public.admin_fail_last_at') is null then
    create sequence public.admin_fail_last_at as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_last_at', 0, true);
  end if;
  if to_regclass('public.admin_fail_alarm') is null then
    create sequence public.admin_fail_alarm as bigint minvalue 0 start with 0 increment by 1 no cycle;
    perform setval('public.admin_fail_alarm', 0, true);
  end if;
end
$seq$;

-- Supabase's default privileges hand new objects to anon/authenticated.
revoke all on sequence public.admin_fail_window, public.admin_fail_total, public.admin_fail_last_at,
  public.admin_fail_alarm
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Ledger: how many wrong guesses already have an activity-log line, the
--    last 15-minute slot that already has its 'admin_lockout' line, and how
--    many lines the current slot has used of its allowance.
--    One row only. Deny-all, like the other admin tables.
-- ---------------------------------------------------------------------
create table if not exists public.admin_login_ledger (
  id integer primary key check (id = 1),
  logged_total bigint not null default 0,
  alarm_window bigint not null default 0,
  log_slot bigint not null default 0,
  log_slot_lines integer not null default 0
);
-- (for a second run over an earlier version of this draft)
alter table public.admin_login_ledger add column if not exists log_slot bigint not null default 0;
alter table public.admin_login_ledger add column if not exists log_slot_lines integer not null default 0;
alter table public.admin_login_ledger enable row level security;
-- No policies: only the SECURITY DEFINER functions below can touch it.
revoke all on public.admin_login_ledger from public, anon, authenticated;

-- Start from the current total, so old guesses are not all logged at once.
insert into public.admin_login_ledger (id, logged_total)
select 1, (select last_value from public.admin_fail_total)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Catch-up logger. Writes the activity-log lines for wrong guesses that
--    have been counted but not yet logged. Its work only stays if the
--    calling transaction commits; if the caller raises, nothing is lost,
--    the same lines are written by the next call.
--    CAPPED per 15-minute slot: c_lines_per_slot single lines, then one
--    "Plus N more" line, then nothing until the next slot (the rest waits
--    in the counters and is rolled into the next slot's lines).
--    Any error in here is swallowed: logging must never break a login.
-- ---------------------------------------------------------------------
create or replace function public.admin_login_log_flush()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_lines_per_slot constant integer := 3;
  v_logged bigint;
  v_alarm bigint;
  v_log_slot bigint;
  v_lines integer;
  v_total bigint;
  v_last bigint;
  v_alarm_slot bigint;
  v_slot bigint;
  v_write integer;
  v_at timestamptz;
begin
  select logged_total, alarm_window, log_slot, log_slot_lines
    into v_logged, v_alarm, v_log_slot, v_lines
  from admin_login_ledger
  where id = 1
  for update;
  if not found then
    return;
  end if;

  v_slot := floor(extract(epoch from clock_timestamp()) / 900)::bigint;
  if v_log_slot <> v_slot then
    v_lines := 0;  -- a new slot: a fresh allowance
  end if;

  select last_value into v_total from public.admin_fail_total;
  select last_value into v_last from public.admin_fail_last_at;
  select last_value into v_alarm_slot from public.admin_fail_alarm;
  v_at := case when v_last > 0 then to_timestamp(v_last) else now() end;

  if v_total < v_logged then
    v_logged := v_total;  -- the counter was reset by hand
  elsif v_total > v_logged and v_lines <= c_lines_per_slot then
    v_write := least(v_total - v_logged, c_lines_per_slot - v_lines)::integer;
    if v_write > 0 then
      insert into activity_log (created_at, kind, summary)
      select v_at, 'admin_login_failed', 'Admin login attempt failed'
      from generate_series(1, v_write);
      v_lines := v_lines + v_write;
      v_logged := v_logged + v_write;
    end if;
    if v_total > v_logged then
      -- allowance used up: one line for everything else, then silence
      insert into activity_log (created_at, kind, summary)
      values (v_at, 'admin_login_failed',
              'Plus ' || (v_total - v_logged)::text || ' more failed admin login attempts (not listed one by one)');
      v_lines := c_lines_per_slot + 1;
      v_logged := v_total;
    end if;
  end if;

  if v_alarm_slot > v_alarm then
    insert into activity_log (created_at, kind, summary)
    values (v_at, 'admin_lockout', 'Five or more wrong admin passwords within 15 minutes');
    v_alarm := v_alarm_slot;
  end if;

  update admin_login_ledger
     set logged_total = v_logged, alarm_window = v_alarm, log_slot = v_slot, log_slot_lines = v_lines
   where id = 1;
exception when others then
  null;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. admin_check. Same name, argument and return type as today, so every
--    admin_* function and all three admin pages keep working unchanged.
--    ORDER MATTERS on the wrong-password path: the pause comes BEFORE the
--    advisory lock (so waiting guessers never hold it), and the lock is
--    taken BEFORE the counter is read and written (so parallel guesses
--    cannot overwrite each other's count). The right-password path never
--    pauses and never takes the advisory lock.
-- ---------------------------------------------------------------------
create or replace function public.admin_check(pw text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  -- false = SOFT (right password always works). true = HARD (see header).
  c_hard_lock constant boolean := false;
  v_ok boolean;
  v_win bigint;
  v_packed bigint;
  v_count bigint;
begin
  if c_hard_lock then
    v_win := floor(extract(epoch from clock_timestamp()) / 900)::bigint;
    select last_value into v_packed from public.admin_fail_window;
    if v_packed / 1000000 = v_win and v_packed % 1000000 >= 5 then
      raise exception 'Too many attempts — try again in 15 minutes';
    end if;
  end if;

  select exists (
    select 1 from admin_config where password_hash = crypt(coalesce(pw, ''), password_hash)
  ) into v_ok;

  if not v_ok then
    perform pg_sleep(1.5);
    perform pg_advisory_xact_lock(hashtext('admin_login'));
    v_win := floor(extract(epoch from clock_timestamp()) / 900)::bigint;
    select last_value into v_packed from public.admin_fail_window;
    if v_packed / 1000000 = v_win then
      v_count := least(v_packed % 1000000 + 1, 999999);
    else
      v_count := 1;
    end if;
    -- setval / nextval are NOT undone when the caller raises 'invalid password'.
    perform setval('public.admin_fail_window', v_win * 1000000 + v_count, true);
    perform nextval('public.admin_fail_total');
    perform setval('public.admin_fail_last_at', floor(extract(epoch from clock_timestamp()))::bigint, true);
    if v_count >= 5 then
      -- remembered here, at the moment it happens, so a later slot cannot hide it
      perform setval('public.admin_fail_alarm', v_win, true);
    end if;
  end if;

  -- Successful logins only. A wrong guess must not add a table row: on the
  -- open paths that row is kept, and a stranger could add them without limit.
  if v_ok then
    begin
      insert into admin_login_attempts (success) values (true);
    exception when others then
      null;
    end;
  end if;

  perform public.admin_login_log_flush();

  if v_ok then
    perform activity_log_write('admin_login_ok', 'Admin login succeeded');
  end if;

  -- RETURN, never RAISE, for a wrong password: the callers decide what to do.
  return v_ok;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Grants. admin_check stays callable from the pages (as today). The
--    catch-up logger is internal: the server-side role only.
-- ---------------------------------------------------------------------
revoke all on function public.admin_login_log_flush() from public, anon, authenticated;
grant execute on function public.admin_login_log_flush() to service_role;
grant execute on function public.admin_check(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
