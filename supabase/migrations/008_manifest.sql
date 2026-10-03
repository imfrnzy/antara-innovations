-- Manifest migration, v1. Run once in the Supabase SQL Editor.
-- Two tables: a lightweight profile (contact details for the rare case a
-- practitioner wants to be reached about the paid tier), and the reports
-- themselves. Deliberately no client name field anywhere, only a short
-- practitioner-chosen reference, since this tool is designed to hold the
-- minimum identifying detail necessary.

create table if not exists manifest_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  organisation text,
  created_at timestamptz not null default now()
);

create table if not exists manifest_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insurer text not null check (insurer in ('axa','bupa','other')),
  client_ref text not null,
  sessions_completed int not null,
  sessions_requested int not null,
  presenting_issue text,
  goals text,
  progress text,
  risk text,
  outcome_facts jsonb,
  draft_text text,
  status text not null default 'draft' check (status in ('draft','sent')),
  created_at timestamptz not null default now()
);

create index if not exists manifest_reports_user_id_idx on manifest_reports(user_id);

alter table manifest_profiles enable row level security;
alter table manifest_reports enable row level security;

-- Each practitioner can only ever read or write their own rows. The edge
-- function uses the service role key and bypasses these, this is the
-- boundary for any direct client access.
create policy "own profile" on manifest_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own reports read" on manifest_reports
  for select using (auth.uid() = user_id);

create policy "own reports insert" on manifest_reports
  for insert with check (auth.uid() = user_id);

create policy "own reports update" on manifest_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
