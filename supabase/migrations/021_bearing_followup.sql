-- Bearing follow-up: keeps the results of the mock supervisor questions with the assessment.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.bearing_assessments add column if not exists supervisor jsonb;

create or replace function public.save_bearing_supervisor(p_assessment uuid, p_data jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then return false; end if;
  update public.bearing_assessments set supervisor = p_data where id = p_assessment and user_id = auth.uid();
  return found;
end $$;

revoke all on function public.save_bearing_supervisor(uuid, jsonb) from public;
grant execute on function public.save_bearing_supervisor(uuid, jsonb) to authenticated;
