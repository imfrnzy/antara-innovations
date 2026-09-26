-- Ensign v1 schema. The six rounds score in the browser; the written
-- question is graded by the ensign-score edge function. Run once in
-- Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

create table if not exists public.ensign_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  work_email text,
  job_title text,
  company text,
  marketing_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ensign_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  responses jsonb not null default '[]'::jsonb,
  written jsonb,
  result jsonb,
  engine_version text,
  tier text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists public.ensign_report_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.ensign_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('detailed_report','consulting')),
  status text not null default 'requested',
  note text,
  created_at timestamptz not null default now()
);

alter table public.ensign_profiles        enable row level security;
alter table public.ensign_assessments     enable row level security;
alter table public.ensign_report_requests enable row level security;

create policy ensign_prof_select on public.ensign_profiles for select using (user_id = auth.uid());
create policy ensign_prof_insert on public.ensign_profiles for insert with check (user_id = auth.uid());
create policy ensign_prof_update on public.ensign_profiles for update using (user_id = auth.uid());

create policy ensign_asmt_select on public.ensign_assessments for select using (user_id = auth.uid());
create policy ensign_asmt_insert on public.ensign_assessments for insert
  with check (user_id = auth.uid() and tier = 'free');

create policy ensign_rr_select on public.ensign_report_requests for select using (user_id = auth.uid());
create policy ensign_rr_insert on public.ensign_report_requests for insert
  with check (user_id = auth.uid() and status = 'requested'
    and exists (select 1 from public.ensign_assessments a where a.id = assessment_id and a.user_id = auth.uid()));

create or replace view public.ensign_admin_leads with (security_invoker = true) as
select p.first_name, p.last_name, p.work_email, p.job_title, p.company, p.marketing_ok,
       a.id as assessment_id, a.created_at,
       a.result ->> 'percent' as percent, a.result ->> 'band' as band,
       (select string_agg(r.kind, ', ') from public.ensign_report_requests r where r.assessment_id = a.id) as requested
from public.ensign_assessments a
left join public.ensign_profiles p on p.user_id = a.user_id
order by a.created_at desc;
revoke all on public.ensign_admin_leads from anon, authenticated;
