-- Team runs v1. One generic mechanism for HALO, Squall and Ensign.
-- A leader creates a run and gets a join code. People answer anonymously with the code.
-- The leader sees results only when at least 3 people have answered (k-anonymity), and only
-- as averages and counts per question. No names, no free text, no way to see one person's answers.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

create table if not exists public.team_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tool text not null check (tool in ('halo','squall','ensign')),
  module text not null default '',
  label text not null default '',
  join_code text not null unique,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.team_run_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.team_runs(id) on delete cascade,
  token_hash text not null,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, token_hash)
);

create index if not exists team_runs_owner_idx on public.team_runs(owner_id, created_at desc);

alter table public.team_runs enable row level security;
alter table public.team_run_results enable row level security;

-- Owners can see their own runs. Nobody can read results rows directly, only through the summary function.
drop policy if exists team_runs_owner_select on public.team_runs;
create policy team_runs_owner_select on public.team_runs for select using (owner_id = auth.uid());
revoke all on public.team_run_results from anon, authenticated;
grant select on public.team_runs to authenticated;
revoke insert, update, delete on public.team_runs from anon, authenticated;

create or replace function public.create_team_run(p_tool text, p_module text, p_label text)
returns table (run_id uuid, join_code text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  code text;
  rid uuid;
  n int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_tool not in ('halo','squall','ensign') then raise exception 'unknown tool'; end if;
  select count(*) into n from public.team_runs where owner_id = uid and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'too many runs today'; end if;
  loop
    code := upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=OIl01', 'XYZQWRT'), 1, 8));
    exit when not exists (select 1 from public.team_runs t where t.join_code = code);
  end loop;
  insert into public.team_runs(owner_id, tool, module, label, join_code)
  values (uid, p_tool, left(coalesce(p_module,''), 60), left(coalesce(p_label,''), 80), code)
  returning id into rid;
  return query select rid, code;
end $$;

-- What a person sees before answering: tool and module only. Never the owner, never the label's owner.
create or replace function public.team_run_public(p_code text)
returns table (tool text, module text, label text, status text)
language sql security definer set search_path = public as $$
  select t.tool, t.module, t.label, t.status from public.team_runs t where t.join_code = upper(trim(p_code));
$$;

create or replace function public.submit_team_result(p_code text, p_token text, p_answers jsonb)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.team_runs;
  k text;
  v jsonb;
  cnt int;
  total int;
begin
  select * into r from public.team_runs t where t.join_code = upper(trim(coalesce(p_code,'')));
  if not found then return 'unknown_code'; end if;
  if r.status <> 'open' then return 'closed'; end if;
  if p_token is null or length(p_token) < 16 or length(p_token) > 128 then return 'bad_token'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then return 'bad_answers'; end if;
  select count(*) into cnt from jsonb_object_keys(p_answers);
  if cnt < 1 or cnt > 60 then return 'bad_answers'; end if;
  for k, v in select * from jsonb_each(p_answers) loop
    if k !~ '^[A-Za-z0-9_]{1,40}$' then return 'bad_answers'; end if;
    if jsonb_typeof(v) <> 'number' then return 'bad_answers'; end if;
    if (v::text)::numeric not between 0 and 10 or (v::text)::numeric <> floor((v::text)::numeric) then return 'bad_answers'; end if;
  end loop;
  select count(*) into total from public.team_run_results where run_id = r.id;
  if total >= 500 then return 'full'; end if;
  insert into public.team_run_results(run_id, token_hash, answers)
  values (r.id, encode(digest(p_token, 'sha256'), 'hex'), p_answers)
  on conflict (run_id, token_hash) do update set answers = excluded.answers;
  return 'ok';
end $$;

-- Owner only. Below 3 responses it returns the count and nothing else.
create or replace function public.team_run_summary(p_run uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.team_runs;
  n int;
  out jsonb;
begin
  select * into r from public.team_runs t where t.id = p_run and t.owner_id = auth.uid();
  if not found then return null; end if;
  select count(*) into n from public.team_run_results where run_id = r.id;
  if n < 3 then
    return jsonb_build_object('tool', r.tool, 'module', r.module, 'label', r.label, 'status', r.status,
      'join_code', r.join_code, 'n', n, 'visible', false, 'min', 3);
  end if;
  with vals as (
    select e.key as k, (e.value)::text as v
    from public.team_run_results x, jsonb_each(x.answers) e
    where x.run_id = r.id
  ), counted as (
    select k, v, count(*) as c from vals group by k, v
  ), per_q as (
    select k,
           jsonb_build_object(
             'avg', round((sum(v::numeric * c) / sum(c))::numeric, 2),
             'n', sum(c)::int,
             'counts', jsonb_object_agg(v, c)) as obj
    from counted group by k
  )
  select jsonb_object_agg(k, obj) into out from per_q;
  return jsonb_build_object('tool', r.tool, 'module', r.module, 'label', r.label, 'status', r.status,
    'join_code', r.join_code, 'n', n, 'visible', true, 'min', 3, 'questions', coalesce(out, '{}'::jsonb));
end $$;

create or replace function public.close_team_run(p_run uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.team_runs set status = 'closed', closed_at = now() where id = p_run and owner_id = auth.uid() and status = 'open';
  return found;
end $$;

create or replace function public.list_team_runs(p_tool text)
returns table (id uuid, module text, label text, status text, join_code text, created_at timestamptz, n int)
language sql security definer set search_path = public as $$
  select t.id, t.module, t.label, t.status, t.join_code, t.created_at,
         (select count(*)::int from public.team_run_results r where r.run_id = t.id)
  from public.team_runs t where t.owner_id = auth.uid() and t.tool = p_tool order by t.created_at desc limit 20;
$$;

revoke all on function public.create_team_run(text,text,text) from public;
revoke all on function public.team_run_public(text) from public;
revoke all on function public.submit_team_result(text,text,jsonb) from public;
revoke all on function public.team_run_summary(uuid) from public;
revoke all on function public.close_team_run(uuid) from public;
revoke all on function public.list_team_runs(text) from public;
grant execute on function public.create_team_run(text,text,text) to authenticated;
grant execute on function public.team_run_public(text) to anon, authenticated;
grant execute on function public.submit_team_result(text,text,jsonb) to anon, authenticated;
grant execute on function public.team_run_summary(uuid) to authenticated;
grant execute on function public.close_team_run(uuid) to authenticated;
grant execute on function public.list_team_runs(text) to authenticated;
