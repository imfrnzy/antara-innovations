-- Verified sessions only. Run after 030 and 031. Safe to run twice.
--
-- Why: with "Confirm email" switched off in Supabase, adding an email to a visitor takes effect at once,
-- with no link and no proof they own the address. Anyone could type a paying customer's email and
-- be treated as that customer. So the database now trusts an email only when the login came through
-- a real email link (or password), never from an anonymous visitor who simply typed one in.
-- A session counts as verified when: it is not anonymous, it has an email, and it was signed in by
-- some method other than "anonymous" (Supabase records this in the login token as "amr").

create or replace function public.verified_session() returns boolean
language sql stable set search_path = public as $$
  select coalesce(not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false), false)
     and coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from jsonb_array_elements(
         case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
       ) a where coalesce(a ->> 'method', '') not in ('', 'anonymous'));
$$;
revoke all on function public.verified_session() from public, anon;
grant execute on function public.verified_session() to authenticated;

create or replace function public.my_plan() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select g.plan from public.plan_grants g
      where public.verified_session()
        and g.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (g.expires_at is null or g.expires_at > now())
      limit 1),
    'free');
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

create or replace function public.scan_history_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  plan text;
  n int;
  cap int;
begin
  if not public.verified_session() then
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

create or replace function public.bearing_controls_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  plan text;
  n int;
  cap int;
begin
  if not public.verified_session() then
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
