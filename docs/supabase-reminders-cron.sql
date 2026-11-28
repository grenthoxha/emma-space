create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('emma-private-reminders','* * * * *',$schedule$
 select net.http_post(
   url:='https://roexzfpbvbmvhwzsycsw.supabase.co/functions/v1/emma-reminders',
   headers:=jsonb_build_object('Content-Type','application/json','X-Emma-Scheduler-Secret',(select scheduler_secret from public.emma_push_settings where id)),
   body:='{}'::jsonb
 ) where exists(select 1 from public.emma_push_jobs where due_at<=now() and expires_at>now() and (status='queued' or status='sending' and lease_until<now()));
$schedule$);
