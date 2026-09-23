-- Soundings v1 schema. Run once in Supabase: SQL Editor > New query > paste > Run.
-- Structured from day one so dashboards, reassessments, Keel and Sentinel can sit on top later.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  size_band text,
  country text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  role_category text,
  organisation_id uuid references public.organisations(id) on delete set null,
  marketing_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  tier text not null default 'free',            -- free | report | full
  status text not null default 'in_progress',   -- in_progress | complete
  turn_count int not null default 0,
  engine_version text,
  summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.use_cases (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  facts jsonb not null default '{}'::jsonb,         -- field -> {value, status, evidence}
  classification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every fact change, kept. This is the evidence trail for the paid report.
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  use_case_id uuid not null references public.use_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  value text not null check (value in ('yes','no','unknown')),
  status text not null check (status in ('confirmed','unknown','contradiction')),
  quote text,
  created_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('assistant','user')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Demand signal before Stripe exists, and the order record once it does.
create table if not exists public.report_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('detailed_report','full_soundings')),
  status text not null default 'requested',     -- requested | paid | delivered
  note text,
  created_at timestamptz not null default now()
);

create index if not exists use_cases_assessment_idx on public.use_cases(assessment_id);
create index if not exists interactions_assessment_idx on public.interactions(assessment_id, id);
create index if not exists evidence_use_case_idx on public.evidence(use_case_id);

-- Row-level security: people see only their own rows.
-- Use cases, evidence and interactions are written only by the edge function (service role),
-- so a user cannot hand-edit their own classifications from the browser.
alter table public.organisations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.assessments     enable row level security;
alter table public.use_cases       enable row level security;
alter table public.evidence        enable row level security;
alter table public.interactions    enable row level security;
alter table public.report_requests enable row level security;

create policy org_select on public.organisations for select using (created_by = auth.uid());
create policy org_insert on public.organisations for insert with check (created_by = auth.uid());
create policy org_update on public.organisations for update using (created_by = auth.uid());

create policy prof_select on public.profiles for select using (user_id = auth.uid());
create policy prof_insert on public.profiles for insert with check (user_id = auth.uid());
create policy prof_update on public.profiles for update using (user_id = auth.uid());

create policy asmt_select on public.assessments for select using (user_id = auth.uid());
create policy asmt_insert on public.assessments for insert
  with check (user_id = auth.uid() and tier = 'free' and status = 'in_progress' and turn_count = 0);

create policy uc_select  on public.use_cases    for select using (user_id = auth.uid());
create policy ev_select  on public.evidence     for select using (user_id = auth.uid());
create policy int_select on public.interactions for select using (user_id = auth.uid());

create policy rr_select on public.report_requests for select using (user_id = auth.uid());
create policy rr_insert on public.report_requests for insert
  with check (user_id = auth.uid() and status = 'requested'
    and exists (select 1 from public.assessments a where a.id = assessment_id and a.user_id = auth.uid()));

-- Handy view for you (not exposed to users): every lead with their headline result.
create or replace view public.admin_leads with (security_invoker = true) as
select p.first_name, p.last_name, p.work_email, p.job_title, p.role_category,
       o.name as organisation, o.industry, o.size_band, o.country,
       a.id as assessment_id, a.status, a.turn_count, a.summary, a.created_at,
       (select string_agg(r.kind, ', ') from public.report_requests r where r.assessment_id = a.id) as requested
from public.assessments a
left join public.profiles p on p.user_id = a.user_id
left join public.organisations o on o.id = a.organisation_id
order by a.created_at desc;
revoke all on public.admin_leads from anon, authenticated;
