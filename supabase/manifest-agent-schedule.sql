-- Run ONCE in the Supabase SQL Editor, after the manifest-agent function is
-- deployed and its secrets are set. Schedules the agent for 07:00 UTC every day.
-- Before running: replace BOTH placeholders below.
--   YOUR-PROJECT-REF  -> oxmoenclvifxhgwsxfop
--   YOUR-CRON-SECRET  -> the same value you saved as the CRON_SECRET function secret
-- Uses only pg_cron and pg_net, the standard Supabase scheduler. Does not touch
-- any other schedule, table or app, Pulse included.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the old schedule rather than doubling it.
select cron.unschedule('manifest-agent-nightly')
where exists (select 1 from cron.job where jobname = 'manifest-agent-nightly');

select cron.schedule(
  'manifest-agent-nightly',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/manifest-agent',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- To check it later:   select * from cron.job where jobname = 'manifest-agent-nightly';
-- To stop it:          select cron.unschedule('manifest-agent-nightly');
