-- Mental fatigue: run once in Supabase › SQL Editor › New query › Run. Safe to re-run.
alter table checkins add column if not exists mental_fatigue    smallint;
alter table checkins add column if not exists am_mental_fatigue smallint;
