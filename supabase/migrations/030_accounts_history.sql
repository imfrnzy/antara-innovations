-- Accounts, plans and saved scan history (Soundings, Sentinel, Keel, HALO, Bearing, Squall, Ensign).
-- Run once in Supabase: SQL Editor > New query > paste > Run.
--
-- How it works
--  * A visitor signs in with an email link. Anonymous visitors cannot save anything.
--  * Free account: up to 3 saved scans per tool, and can compare any two of them.
--  * Pro: up to 200 saved scans per tool, plus the timeline view in the page.
--  * Pro is switched on by hand, by you, after someone emails and agrees terms:
--        select public.grant_plan('person@company.com', 'pro', 365, 'invoice 2026-001');
--    Switch off:  select public.revoke_plan('person@company.com');
--    See who has it:  select * from public.plan_grants order by granted_at desc;
--  * The limit is enforced here in the database, so the page cannot be tricked into saving more.
--  * A snapshot holds tool names, categories, counts and capability labels only. Never file rows,
--    never secret values. A size check below stops anything large being stored.

create table if not exists public.plan_grants (
  email text primary key check (email = lower(email)),
  plan text not null check (plan in ('pro')),
  expires_at timestamptz,
  note text not null default '',
  granted_at timestamptz not null default now()
);
alter table public.plan_grants enable row level security;
-- No policies on purpose: nobody reads or writes this table from the browser.
revoke all on public.plan_grants from anon, authenticated;

create table if not exists public.scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null check (tool in ('soundings','sentinel','keel','halo','bearing','squall','ensign')),
  label text not null default '' check (char_length(label) <= 80),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists scan_history_user_idx on public.scan_history(user_id, tool, created_at desc);
alter table public.scan_history enable row level security;

drop policy if exists scan_history_select on public.scan_history;
create policy scan_history_select on public.scan_history for select to authenticated using (user_id = auth.uid());
drop policy if exists scan_history_insert on public.scan_history;
create policy scan_history_insert on public.scan_history for insert to authenticated with check (user_id = auth.uid());
drop policy if exists scan_history_delete on public.scan_history;
create policy scan_history_delete on public.scan_history for delete to authenticated using (user_id = auth.uid());
-- No update policy: a saved scan is a record. Delete it and save again if it was wrong.

grant select, insert, delete on public.scan_history to authenticated;

-- Which plan does the signed-in person have? Reads the confirmed email in their login token.
create or replace function public.my_plan() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select g.plan from public.plan_grants g
      where g.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (g.expires_at is null or g.expires_at > now())
      limit 1),
    'free');
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Enforce who may save, how much, and how big.
create or replace function public.scan_history_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  plan text;
  n int;
  cap int;
begin
  if coalesce((claims ->> 'is_anonymous')::boolean, false) or coalesce(claims ->> 'email', '') = '' then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  -- Check ownership first, so a refusal never reveals how many scans someone else has.
  if new.user_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if pg_column_size(new.snapshot) > 60000 then
    raise exception 'snapshot_too_large' using errcode = 'P0001';
  end if;
  plan := public.my_plan();
  cap := case when plan = 'pro' then 200 else 3 end;
  select count(*) into n from public.scan_history where user_id = new.user_id and tool = new.tool;
  if n >= cap then
    raise exception '%', case when plan = 'pro' then 'pro_limit' else 'free_limit' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists scan_history_guard_trg on public.scan_history;
create trigger scan_history_guard_trg before insert on public.scan_history
  for each row execute function public.scan_history_guard();

-- You run these two by hand in the SQL editor. They are not reachable from the browser.
create or replace function public.grant_plan(p_email text, p_plan text, p_days int default null, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.plan_grants(email, plan, expires_at, note)
  values (lower(trim(p_email)), p_plan, case when p_days is null then null else now() + make_interval(days => p_days) end, coalesce(p_note, ''))
  on conflict (email) do update
    set plan = excluded.plan, expires_at = excluded.expires_at, note = excluded.note, granted_at = now();
end;
$$;
create or replace function public.revoke_plan(p_email text) returns void
language sql security definer set search_path = public as $$
  delete from public.plan_grants where email = lower(trim(p_email));
$$;
revoke all on function public.grant_plan(text, text, int, text) from public, anon, authenticated;
revoke all on function public.revoke_plan(text) from public, anon, authenticated;
