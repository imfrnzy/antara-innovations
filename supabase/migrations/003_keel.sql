-- Keel v1 schema. Fully separate tables, same pattern as Soundings and Sentinel.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

create table if not exists public.keel_organisations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  size_band text,
  created_at timestamptz not null default now()
);

create table if not exists public.keel_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  role_category text,
  organisation_id uuid references public.keel_organisations(id) on delete set null,
  marketing_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One assessment per organisation visit. Unlike Soundings' use_cases or
-- Sentinel's agents, Keel scores the organisation itself, once, so the facts
-- live directly on the assessment rather than on a child table.
create table if not exists public.keel_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid references public.keel_organisations(id) on delete set null,
  tier text not null default 'free',            -- free | report | full
  status text not null default 'in_progress',   -- in_progress | complete
  turn_count int not null default 0,
  engine_version text,
  facts jsonb not null default '{}'::jsonb,      -- field -> {value, status, quote}
  classification jsonb,
  report_md text,                                -- the generated free-tier narrative report
  report_generated_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Every fact change, kept, same evidence-trail principle as the other two.
create table if not exists public.keel_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.keel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  value text not null,
  status text not null check (status in ('confirmed','unknown','contradiction')),
  quote text,
  created_at timestamptz not null default now()
);

create table if not exists public.keel_interactions (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.keel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('assistant','user')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.keel_report_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.keel_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('detailed_report','full_keel')),
  status text not null default 'requested',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists keel_interactions_assessment_idx on public.keel_interactions(assessment_id, id);
create index if not exists keel_evidence_assessment_idx on public.keel_evidence(assessment_id);

alter table public.keel_organisations   enable row level security;
alter table public.keel_profiles        enable row level security;
alter table public.keel_assessments     enable row level security;
alter table public.keel_evidence        enable row level security;
alter table public.keel_interactions    enable row level security;
alter table public.keel_report_requests enable row level security;

create policy keel_org_select on public.keel_organisations for select using (created_by = auth.uid());
create policy keel_org_insert on public.keel_organisations for insert with check (created_by = auth.uid());
create policy keel_org_update on public.keel_organisations for update using (created_by = auth.uid());

create policy keel_prof_select on public.keel_profiles for select using (user_id = auth.uid());
create policy keel_prof_insert on public.keel_profiles for insert with check (user_id = auth.uid());
create policy keel_prof_update on public.keel_profiles for update using (user_id = auth.uid());

create policy keel_asmt_select on public.keel_assessments for select using (user_id = auth.uid());
create policy keel_asmt_insert on public.keel_assessments for insert
  with check (user_id = auth.uid() and tier = 'free' and status = 'in_progress' and turn_count = 0);

create policy keel_evidence_select on public.keel_evidence     for select using (user_id = auth.uid());
create policy keel_int_select      on public.keel_interactions for select using (user_id = auth.uid());

create policy keel_rr_select on public.keel_report_requests for select using (user_id = auth.uid());
create policy keel_rr_insert on public.keel_report_requests for insert
  with check (user_id = auth.uid() and status = 'requested'
    and exists (select 1 from public.keel_assessments a where a.id = assessment_id and a.user_id = auth.uid()));

create or replace view public.keel_admin_leads with (security_invoker = true) as
select p.first_name, p.last_name, p.work_email, p.job_title, p.role_category,
       o.name as organisation, o.industry, o.size_band,
       a.id as assessment_id, a.status, a.turn_count, a.classification, a.created_at,
       (select string_agg(r.kind, ', ') from public.keel_report_requests r where r.assessment_id = a.id) as requested
from public.keel_assessments a
left join public.keel_profiles p on p.user_id = a.user_id
left join public.keel_organisations o on o.id = a.organisation_id
order by a.created_at desc;
revoke all on public.keel_admin_leads from anon, authenticated;
