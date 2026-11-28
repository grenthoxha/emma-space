-- Private, opt-in reminder scheduling. No diary text or task titles are uploaded.
begin;
create or replace function emma_private.can_use_reminders() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.emma_access_requests r join auth.users u on u.id=r.user_id where r.user_id=auth.uid() and r.status='approved' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false));
$$;
revoke all on function emma_private.can_use_reminders() from public,anon;
grant execute on function emma_private.can_use_reminders() to authenticated;
create table public.emma_push_devices (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<4096 and endpoint ~ '^https://[^/@:]+/'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22}$'),
 timezone text not null check(length(timezone)<80),quiet_start time not null default '22:00',quiet_end time not null default '08:00',
 enabled boolean not null default true,created_at timestamptz not null default now(),unique(id,user_id)
);
alter table public.emma_push_devices enable row level security;
revoke all on public.emma_push_devices from public,anon,authenticated;
grant select,insert,update,delete on public.emma_push_devices to authenticated;
grant all on public.emma_push_devices to service_role;
create policy emma_own_push_devices on public.emma_push_devices for all to authenticated
 using(user_id=(select auth.uid()) and (select emma_private.can_use_reminders()))
 with check(user_id=(select auth.uid()) and (select emma_private.can_use_reminders()));
create table public.emma_push_jobs (
 id uuid primary key default gen_random_uuid(),device_id uuid not null,user_id uuid not null,
 event_key text not null check(length(event_key)<240),kind text not null check(kind in ('task','exam','lesson')),
 due_at timestamptz not null check(due_at<now()+interval '8 days'),expires_at timestamptz not null check(expires_at>due_at and expires_at<=due_at+interval '1 hour'),
 status text not null default 'queued' check(status in ('queued','sending','sent','skipped','failed','expired')),
 attempts integer not null default 0,lease_until timestamptz,created_at timestamptz not null default now(),
 foreign key(device_id,user_id) references public.emma_push_devices(id,user_id) on delete cascade,
 unique(device_id,event_key)
);
create index emma_push_due_jobs on public.emma_push_jobs(due_at) where status in ('queued','sending');
alter table public.emma_push_jobs enable row level security;
revoke all on public.emma_push_jobs from public,anon,authenticated;
grant select,delete on public.emma_push_jobs to authenticated;
grant insert(device_id,user_id,event_key,kind,due_at,expires_at) on public.emma_push_jobs to authenticated;
grant all on public.emma_push_jobs to service_role;
create policy emma_read_own_jobs on public.emma_push_jobs for select to authenticated using(user_id=(select auth.uid()) and (select emma_private.can_use_reminders()));
create policy emma_queue_own_jobs on public.emma_push_jobs for insert to authenticated with check(user_id=(select auth.uid()) and status='queued' and (select emma_private.can_use_reminders()));
create policy emma_cancel_own_jobs on public.emma_push_jobs for delete to authenticated using(user_id=(select auth.uid()) and status='queued' and (select emma_private.can_use_reminders()));
create or replace function public.emma_replace_push_jobs(p_device_id uuid,p_jobs jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare item jsonb; due timestamptz; inserted integer:=0; changed integer;
begin
 if auth.uid() is null or not emma_private.can_use_reminders() or not exists(select 1 from public.emma_push_devices where id=p_device_id and user_id=auth.uid() and enabled) then raise exception 'Approved device required' using errcode='42501'; end if;
 if jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>200 then raise exception 'Invalid reminder batch'; end if;
 delete from public.emma_push_jobs where device_id=p_device_id and status='queued' and event_key not in(select value->>'event_key' from jsonb_array_elements(p_jobs));
 for item in select value from jsonb_array_elements(p_jobs) loop
  due=(item->>'due_at')::timestamptz;
  if due>now() and due<now()+interval '8 days' then
   insert into public.emma_push_jobs(device_id,user_id,event_key,kind,due_at,expires_at) values(p_device_id,auth.uid(),item->>'event_key',item->>'kind',due,due+interval '1 hour') on conflict(device_id,event_key) do nothing;
   get diagnostics changed=row_count; inserted=inserted+changed;
  end if;
 end loop;
 return inserted;
end $$;
revoke all on function public.emma_replace_push_jobs(uuid,jsonb) from public,anon;
grant execute on function public.emma_replace_push_jobs(uuid,jsonb) to authenticated;

-- Server-only signing material; no client table privileges or policies.
create table public.emma_push_settings(id boolean primary key default true check(id),scheduler_secret text not null default gen_random_uuid()::text||gen_random_uuid()::text,public_key text,private_key text);
alter table public.emma_push_settings enable row level security;
revoke all on public.emma_push_settings from public,anon,authenticated;
grant all on public.emma_push_settings to service_role;
insert into public.emma_push_settings(id) values(true);
create or replace function public.emma_claim_push_jobs() returns setof public.emma_push_jobs
language plpgsql security invoker set search_path='' as $$
begin
 update public.emma_push_jobs set status='expired' where expires_at<now() and status in ('queued','sending');
 delete from public.emma_push_jobs where expires_at<now()-interval '14 days';
 return query update public.emma_push_jobs j set status='sending',attempts=j.attempts+1,lease_until=now()+interval '2 minutes'
 where j.id in(select q.id from public.emma_push_jobs q where q.due_at<=now() and q.expires_at>now() and q.attempts<3 and (q.status='queued' or q.status='sending' and q.lease_until<now()) order by q.due_at limit 12 for update skip locked) returning j.*;
end $$;
revoke all on function public.emma_claim_push_jobs() from public,anon,authenticated;
grant execute on function public.emma_claim_push_jobs() to service_role;
commit;

-- Create the dispatcher schedule after deploying the Edge Function.
-- Run docs/supabase-reminders-cron.sql once the function health check passes.
