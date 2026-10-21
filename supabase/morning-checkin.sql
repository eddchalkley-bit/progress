-- Morning check-in: run once in Supabase › SQL Editor. Safe to re-run.
alter table checkins add column if not exists am_fatigue   smallint;
alter table checkins add column if not exists am_brain_fog smallint;
alter table checkins add column if not exists am_breath    smallint;
alter table checkins add column if not exists am_aches     smallint;
alter table checkins add column if not exists am_heart     smallint;
alter table checkins add column if not exists am_rested    smallint;   -- 0 exhausted .. 3 refreshed
alter table checkins add column if not exists am_at        timestamptz;
