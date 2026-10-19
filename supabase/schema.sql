-- Progress: run this once in Supabase → SQL Editor → New query → Run.
-- All access goes through the app's /api functions using the service-role key,
-- so Row Level Security is switched on with no policies (nothing is publicly readable).

create table if not exists daily_metrics (
  date        date not null,
  metric      text not null,          -- rhr, hrv, hr, steps, energy, exercise, sleep_min, deep_min ...
  value       double precision not null,
  updated_at  timestamptz not null default now(),
  primary key (date, metric)
);

create table if not exists sleep_samples (
  start_at  timestamptz not null,
  end_at    timestamptz not null,
  stage     text not null,            -- core, deep, rem, asleep, awake, inbed
  primary key (start_at, end_at, stage)
);
create index if not exists sleep_samples_end_idx on sleep_samples (end_at);

create table if not exists checkins (
  date          date primary key,
  fatigue       smallint,
  brain_fog     smallint,
  breath        smallint,
  aches         smallint,
  heart         smallint,
  pem           boolean not null default false,
  screen_hours  numeric(4,1),         -- total (kept for older check-ins)
  phone_hours   numeric(4,1),
  laptop_hours  numeric(4,1),
  social        smallint,             -- 0 none, 1 light, 2 moderate, 3 heavy
  mental        smallint,             -- 0 low .. 3 very high
  stress        smallint,             -- 0 low .. 3 very high
  rests         smallint,             -- rest breaks: 0 none, 1 '1-2', 2 '3-4', 3 '5+'
  notes         text,
  updated_at    timestamptz not null default now()
);

-- (safe to re-run) add rest breaks to an existing table
alter table checkins add column if not exists rests smallint;
alter table checkins add column if not exists phone_hours numeric(4,1);
alter table checkins add column if not exists laptop_hours numeric(4,1);

create table if not exists quick_logs (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  date    date not null,
  energy  smallint,
  note    text
);
create index if not exists quick_logs_date_idx on quick_logs (date);

create table if not exists syncs (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  source   text,
  lines    integer,
  metrics  text
);

create table if not exists research_updates (
  id               bigint generated always as identity primary key,
  checked_at       timestamptz not null default now(),
  title            text not null,
  source           text,
  published        text,
  url              text,
  summary          text,
  relevance        text,
  suggests_change  boolean not null default false,
  change           text,
  reviewed         boolean not null default false,
  is_marker        boolean not null default false
);

-- Screen sessions: phone (app opened/closed automations) and laptop / work (Focus or toggle).
create table if not exists screen_sessions (
  id        bigint generated always as identity primary key,
  kind      text not null,            -- phone | laptop
  app       text,
  start_at  timestamptz not null,
  end_at    timestamptz
);
create index if not exists screen_sessions_idx on screen_sessions (kind, start_at);

-- Raw heart-rate readings (kept 45 days) and detected spikes you can tag.
create table if not exists hr_samples (
  at   timestamptz primary key,
  bpm  smallint not null
);

create table if not exists hr_events (
  id         bigint generated always as identity primary key,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  peak       smallint,
  avg        smallint,
  minutes    smallint,
  ceiling    smallint,
  source     text not null default 'auto',   -- auto (detected) or manual (tagged from the watch)
  tag        text,
  note       text,
  tagged_at  timestamptz
);
create index if not exists hr_events_start_idx on hr_events (start_at);

alter table daily_metrics enable row level security;
alter table sleep_samples enable row level security;
alter table checkins      enable row level security;
alter table quick_logs    enable row level security;
alter table syncs         enable row level security;
alter table research_updates enable row level security;
alter table hr_samples enable row level security;
alter table hr_events enable row level security;
alter table screen_sessions enable row level security;
