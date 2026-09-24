-- HALO v1 schema. No organisations table, unlike the other three, since
-- HALO assesses one leader's own practice, not an organisation's systems.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

create table if not exists public.halo_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  marketing_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.halo_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_size text,
  tenure text,
  tier text not null default 'free',
  status text not null default 'in_progress',
  turn_count int not null default 0,
  engine_version text,
  facts jsonb not null default '{}'::jsonb,
  classification jsonb,
  report_md text,
  report_generated_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.halo_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.halo_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  value text not null,
  status text not null check (status in ('confirmed','unknown','contradiction')),
  quote text,
  created_at timestamptz not null default now()
);

create table if not exists public.halo_interactions (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.halo_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('assistant','user')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.halo_report_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.halo_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('detailed_report','full_halo')),
  status text not null default 'requested',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists halo_interactions_assessment_idx on public.halo_interactions(assessment_id, id);
create index if not exists halo_evidence_assessment_idx on public.halo_evidence(assessment_id);

alter table public.halo_profiles        enable row level security;
alter table public.halo_assessments     enable row level security;
alter table public.halo_evidence        enable row level security;
alter table public.halo_interactions    enable row level security;
alter table public.halo_report_requests enable row level security;

create policy halo_prof_select on public.halo_profiles for select using (user_id = auth.uid());
create policy halo_prof_insert on public.halo_profiles for insert with check (user_id = auth.uid());
create policy halo_prof_update on public.halo_profiles for update using (user_id = auth.uid());

create policy halo_asmt_select on public.halo_assessments for select using (user_id = auth.uid());
create policy halo_asmt_insert on public.halo_assessments for insert
  with check (user_id = auth.uid() and tier = 'free' and status = 'in_progress' and turn_count = 0);

create policy halo_evidence_select on public.halo_evidence     for select using (user_id = auth.uid());
create policy halo_int_select      on public.halo_interactions for select using (user_id = auth.uid());

create policy halo_rr_select on public.halo_report_requests for select using (user_id = auth.uid());
create policy halo_rr_insert on public.halo_report_requests for insert
  with check (user_id = auth.uid() and status = 'requested'
    and exists (select 1 from public.halo_assessments a where a.id = assessment_id and a.user_id = auth.uid()));

create or replace view public.halo_admin_leads with (security_invoker = true) as
select p.first_name, p.last_name, p.work_email, p.job_title,
       a.id as assessment_id, a.team_size, a.tenure, a.status, a.turn_count, a.classification, a.created_at,
       (select string_agg(r.kind, ', ') from public.halo_report_requests r where r.assessment_id = a.id) as requested
from public.halo_assessments a
left join public.halo_profiles p on p.user_id = a.user_id
order by a.created_at desc;
revoke all on public.halo_admin_leads from anon, authenticated;
