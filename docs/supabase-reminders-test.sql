begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('33333333-eeee-4000-8000-000000000001','emma-push-test-1@example.invalid',now(),false),
 ('33333333-eeee-4000-8000-000000000002','emma-push-test-2@example.invalid',now(),false);
insert into storage.objects(bucket_id,name) values('emma-registration','33333333-eeee-4000-8000-000000000001/capture.jpg');
insert into public.emma_access_requests(user_id,status,photo_path,captured_at) values('33333333-eeee-4000-8000-000000000001','approved','33333333-eeee-4000-8000-000000000001/capture.jpg',now());
select set_config('request.jwt.claims','{"sub":"33333333-eeee-4000-8000-000000000001","email":"emma-push-test-1@example.invalid","role":"authenticated"}',true);
set local role authenticated;
insert into public.emma_push_devices(id,user_id,endpoint,p256dh,auth_key,timezone) values('33333333-dddd-4000-8000-000000000001',auth.uid(),'https://fcm.googleapis.com/test-only-never-send',repeat('A',87),repeat('A',22),'Europe/Warsaw');
select public.emma_replace_push_jobs('33333333-dddd-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('event_key','synthetic-job','kind','task','due_at',now()+interval '5 minutes')));
do $$ begin
 if (select count(*) from public.emma_push_jobs)<>1 then raise exception 'FAIL own job missing'; end if;
 begin perform * from public.emma_push_settings;raise exception 'FAIL signing material exposed';exception when insufficient_privilege then null;end;
 begin perform * from public.emma_claim_push_jobs();raise exception 'FAIL client can claim dispatcher jobs';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"33333333-eeee-4000-8000-000000000002","email":"emma-push-test-2@example.invalid","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.emma_push_devices) or exists(select 1 from public.emma_push_jobs) then raise exception 'FAIL other account visible';end if;
 begin insert into public.emma_push_devices(id,user_id,endpoint,p256dh,auth_key,timezone) values('33333333-dddd-4000-8000-000000000002',auth.uid(),'https://fcm.googleapis.com/test',repeat('A',87),repeat('A',22),'UTC');raise exception 'FAIL unapproved device accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.emma_push_jobs set due_at=now()-interval '1 minute',expires_at=now()+interval '30 minutes' where event_key='synthetic-job';
set local role service_role;
do $$ begin
 if (select count(*) from public.emma_claim_push_jobs())<>1 then raise exception 'FAIL job not claimed';end if;
 if (select count(*) from public.emma_claim_push_jobs())<>0 then raise exception 'FAIL duplicate claim';end if;
end $$;
reset role;
rollback;
select 'PASS: approved-only subscriptions, account isolation, private signing keys, client cannot dispatch, worker leases prevent duplicate claims. Test records rolled back.' as verification;
