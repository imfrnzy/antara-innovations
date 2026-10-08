-- Manifest migration 010: client files, session check-ins, and the agent's alert log.
-- Run once in the Supabase SQL Editor. Safe to run again.
-- Only adds new tables prefixed manifest_. Touches nothing that Pulse or the
-- other instruments use, and changes no existing table.
--
-- No client names anywhere: client_ref is the short code the clinician chooses,
-- exactly as in manifest_reports. Free text (goals, notes) is stored readable,
-- the same way manifest_reports already stores it.

create table if not exists manifest_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_ref text not null check (char_length(client_ref) between 1 and 40),
  insurer text not null check (insurer in ('axa','bupa','other')),
  -- Sessions the insurer has funded in total for the current approval, counted
  -- on the same basis as sessions_done_before (which is sessions already held
  -- before check-ins started being logged here).
  sessions_authorised int not null check (sessions_authorised between 1 and 300),
  sessions_done_before int not null default 0 check (sessions_done_before between 0 and 300),
  presenting_issue text,
  goals text,
  diagnosis text,
  modality text,
  session_frequency text,
  other_professionals text,
  phq9_baseline int check (phq9_baseline between 0 and 27),
  gad7_baseline int check (gad7_baseline between 0 and 21),
  reminders boolean not null default true,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manifest_clients_user_ref_uidx
  on manifest_clients (user_id, lower(client_ref));
create index if not exists manifest_clients_user_idx on manifest_clients (user_id);

create table if not exists manifest_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references manifest_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  phq9 int check (phq9 between 0 and 27),
  gad7 int check (gad7 between 0 and 21),
  note text check (note is null or char_length(note) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists manifest_checkins_client_idx on manifest_checkins (client_id, session_date);

-- One row per alert email actually sent, so the nightly agent never repeats itself.
create table if not exists manifest_alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references manifest_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique (client_id, kind, dedupe_key)
);

-- Cost guard for the insurer-reply drafter: one row per reply drafted.
create table if not exists manifest_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists manifest_replies_user_idx on manifest_replies (user_id, created_at);

alter table manifest_clients  enable row level security;
alter table manifest_checkins enable row level security;
alter table manifest_alerts   enable row level security;
alter table manifest_replies  enable row level security;

-- A clinician can only ever touch their own rows, and only from a verified
-- email session. Anonymous sessions (which anyone can mint for free) cannot.
drop policy if exists "own clients" on manifest_clients;
create policy "own clients" on manifest_clients
  for all
  using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  with check (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "own checkins" on manifest_checkins;
create policy "own checkins" on manifest_checkins
  for all
  using (auth.uid() = user_id and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  with check (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from manifest_clients c where c.id = client_id and c.user_id = auth.uid())
  );

-- Alerts: read-only for the clinician. Only the agent (service role) writes them.
drop policy if exists "own alerts read" on manifest_alerts;
create policy "own alerts read" on manifest_alerts
  for select using (auth.uid() = user_id);

-- manifest_replies: no policies on purpose. Only the edge function (service role) touches it.
