-- Progress: accounts (one person's data kept apart from everyone else's).
-- Run once in Supabase › SQL Editor › New query › Run. Safe to re-run.
--
-- Existing rows keep user_id = NULL until you sign up in the app and tap
-- Settings › "Link my existing data", which moves them into your account.

-- 1. Who owns each row
alter table daily_metrics   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table sleep_samples   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table checkins        add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table quick_logs      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table syncs           add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table hr_samples      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table hr_events       add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table screen_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Keys now include the owner (so two people can both have a row for the same day)
alter table daily_metrics drop constraint if exists daily_metrics_pkey;
alter table daily_metrics drop constraint if exists daily_metrics_owner_key;
alter table daily_metrics add constraint daily_metrics_owner_key unique nulls not distinct (user_id, date, metric);

alter table sleep_samples drop constraint if exists sleep_samples_pkey;
alter table sleep_samples drop constraint if exists sleep_samples_owner_key;
alter table sleep_samples add constraint sleep_samples_owner_key unique nulls not distinct (user_id, start_at, end_at, stage);

alter table checkins drop constraint if exists checkins_pkey;
alter table checkins drop constraint if exists checkins_owner_key;
alter table checkins add constraint checkins_owner_key unique nulls not distinct (user_id, date);

alter table hr_samples drop constraint if exists hr_samples_pkey;
alter table hr_samples drop constraint if exists hr_samples_owner_key;
alter table hr_samples add constraint hr_samples_owner_key unique nulls not distinct (user_id, at);

create index if not exists daily_metrics_user_date   on daily_metrics (user_id, date);
create index if not exists sleep_samples_user_end    on sleep_samples (user_id, end_at);
create index if not exists quick_logs_user_date      on quick_logs (user_id, date);
create index if not exists syncs_user_at             on syncs (user_id, at);
create index if not exists hr_samples_user_at        on hr_samples (user_id, at);
create index if not exists hr_events_user_start      on hr_events (user_id, start_at);
create index if not exists screen_sessions_user_kind on screen_sessions (user_id, kind, start_at);

-- 3. Sync tokens for Shortcuts / the watch (stored hashed, never in plain text)
create table if not exists api_tokens (
  token_hash  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'shortcut',   -- shortcut | legacy
  created_at  timestamptz not null default now()
);
create index if not exists api_tokens_user on api_tokens (user_id);

-- All access goes through the app's server (service role), so RLS stays on with no policies.
alter table api_tokens enable row level security;
grant select, insert, update, delete on api_tokens to anon, authenticated, service_role;
