-- Sentinel v1 schema. Fully separate from the Soundings tables, by design.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

create table if not exists public.sentinel_organisations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  size_band text,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  role_category text,
  organisation_id uuid references public.sentinel_organisations(id) on delete set null,
  marketing_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sentinel_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid references public.sentinel_organisations(id) on delete set null,
  tier text not null default 'free',            -- free | report | full
  status text not null default 'in_progress',   -- in_progress | complete
  turn_count int not null default 0,
  engine_version text,
  summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- One row per agent found (Sentinel's equivalent of Soundings' use_cases).
create table if not exists public.sentinel_agents (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.sentinel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  facts jsonb not null default '{}'::jsonb,         -- field -> {value, status, quote}
  classification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every fact change, kept. The evidence trail behind the paid report.
create table if not exists public.sentinel_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.sentinel_assessments(id) on delete cascade,
  agent_id uuid not null references public.sentinel_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  value text not null check (value in ('yes','no','unknown')),
  status text not null check (status in ('confirmed','unknown','contradiction')),
  quote text,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_interactions (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.sentinel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('assistant','user')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_report_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.sentinel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('detailed_report','full_sentinel')),
  status text not null default 'requested',     -- requested | paid | delivered
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sentinel_agents_assessment_idx on public.sentinel_agents(assessment_id);
create index if not exists sentinel_interactions_assessment_idx on public.sentinel_interactions(assessment_id, id);
create index if not exists sentinel_evidence_agent_idx on public.sentinel_evidence(agent_id);

-- Row-level security: people see only their own rows.
-- Agents, evidence and interactions are written only by the edge function (service role),
-- so a visitor cannot hand-edit their own classifications from the browser.
alter table public.sentinel_organisations   enable row level security;
alter table public.sentinel_profiles        enable row level security;
alter table public.sentinel_assessments     enable row level security;
alter table public.sentinel_agents          enable row level security;
alter table public.sentinel_evidence        enable row level security;
alter table public.sentinel_interactions    enable row level security;
alter table public.sentinel_report_requests enable row level security;

create policy sentinel_org_select on public.sentinel_organisations for select using (created_by = auth.uid());
create policy sentinel_org_insert on public.sentinel_organisations for insert with check (created_by = auth.uid());
create policy sentinel_org_update on public.sentinel_organisations for update using (created_by = auth.uid());

create policy sentinel_prof_select on public.sentinel_profiles for select using (user_id = auth.uid());
create policy sentinel_prof_insert on public.sentinel_profiles for insert with check (user_id = auth.uid());
create policy sentinel_prof_update on public.sentinel_profiles for update using (user_id = auth.uid());

create policy sentinel_asmt_select on public.sentinel_assessments for select using (user_id = auth.uid());
create policy sentinel_asmt_insert on public.sentinel_assessments for insert
  with check (user_id = auth.uid() and tier = 'free' and status = 'in_progress' and turn_count = 0);

create policy sentinel_agents_select    on public.sentinel_agents       for select using (user_id = auth.uid());
create policy sentinel_evidence_select  on public.sentinel_evidence     for select using (user_id = auth.uid());
create policy sentinel_int_select       on public.sentinel_interactions for select using (user_id = auth.uid());

create policy sentinel_rr_select on public.sentinel_report_requests for select using (user_id = auth.uid());
create policy sentinel_rr_insert on public.sentinel_report_requests for insert
  with check (user_id = auth.uid() and status = 'requested'
    and exists (select 1 from public.sentinel_assessments a where a.id = assessment_id and a.user_id = auth.uid()));

-- Handy view for you (not exposed to visitors): every lead with their headline result.
create or replace view public.sentinel_admin_leads with (security_invoker = true) as
select p.first_name, p.last_name, p.work_email, p.job_title, p.role_category,
       o.name as organisation, o.industry, o.size_band,
       a.id as assessment_id, a.status, a.turn_count, a.summary, a.created_at,
       (select string_agg(r.kind, ', ') from public.sentinel_report_requests r where r.assessment_id = a.id) as requested
from public.sentinel_assessments a
left join public.sentinel_profiles p on p.user_id = a.user_id
left join public.sentinel_organisations o on o.id = a.organisation_id
order by a.created_at desc;
revoke all on public.sentinel_admin_leads from anon, authenticated;
