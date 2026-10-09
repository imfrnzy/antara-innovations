-- Bearing audit pack: who owns each obligation, when it is next reviewed, where the evidence is.
-- Run after 030 (it uses public.my_plan()). Safe to run twice.
--
--  * One row per person per obligation. The text is typed in by the person and is never checked by us.
--  * Free account (confirmed email): up to 5 obligations. Pro: up to 500. Enforced here, not in the page.
--  * Nobody can see anyone else's rows. Anonymous visitors cannot save.

create table if not exists public.bearing_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id text not null check (char_length(obligation_id) between 1 and 80),
  owner text not null default '' check (char_length(owner) <= 80),
  review_date date,
  evidence_note text not null default '' check (char_length(evidence_note) <= 300),
  updated_at timestamptz not null default now(),
  unique (user_id, obligation_id)
);
create index if not exists bearing_controls_user_idx on public.bearing_controls(user_id);
alter table public.bearing_controls enable row level security;

drop policy if exists bearing_controls_select on public.bearing_controls;
create policy bearing_controls_select on public.bearing_controls for select to authenticated using (user_id = auth.uid());
drop policy if exists bearing_controls_insert on public.bearing_controls;
create policy bearing_controls_insert on public.bearing_controls for insert to authenticated with check (user_id = auth.uid());
drop policy if exists bearing_controls_update on public.bearing_controls;
create policy bearing_controls_update on public.bearing_controls for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists bearing_controls_delete on public.bearing_controls;
create policy bearing_controls_delete on public.bearing_controls for delete to authenticated using (user_id = auth.uid());
revoke all on public.bearing_controls from anon;
grant select, insert, update, delete on public.bearing_controls to authenticated;

create or replace function public.bearing_controls_guard() returns trigger
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
  if new.user_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- Changing an obligation you already track never counts against the limit.
  if exists (select 1 from public.bearing_controls where user_id = new.user_id and obligation_id = new.obligation_id) then
    return new;
  end if;
  plan := public.my_plan();
  select count(*) into n from public.bearing_controls where user_id = new.user_id;
  cap := case when plan = 'pro' then 500 else 5 end;
  if n >= cap then
    raise exception '%', case when plan = 'pro' then 'controls_pro_limit' else 'controls_free_limit' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists bearing_controls_guard_trg on public.bearing_controls;
create trigger bearing_controls_guard_trg before insert on public.bearing_controls
  for each row execute function public.bearing_controls_guard();

create or replace function public.bearing_controls_touch() returns trigger
language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id or new.obligation_id is distinct from old.obligation_id then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bearing_controls_touch_trg on public.bearing_controls;
create trigger bearing_controls_touch_trg before update on public.bearing_controls
  for each row execute function public.bearing_controls_touch();
