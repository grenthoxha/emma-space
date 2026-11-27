-- Hosted policy tests: all synthetic fixtures roll back, including admin grant.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('22222222-eeee-4000-8000-000000000001','emma-admin-test-owner@example.invalid',now(),false),
 ('22222222-eeee-4000-8000-000000000002','emma-admin-test-user1@example.invalid',now(),false),
 ('22222222-eeee-4000-8000-000000000003','emma-admin-test-user2@example.invalid',now(),false);
insert into storage.objects(bucket_id,name) values
 ('emma-registration','22222222-eeee-4000-8000-000000000002/capture.jpg'),
 ('emma-registration','22222222-eeee-4000-8000-000000000003/capture.jpg');
insert into public.emma_access_requests(user_id,photo_path,captured_at) values
 ('22222222-eeee-4000-8000-000000000002','22222222-eeee-4000-8000-000000000002/capture.jpg',now()),
 ('22222222-eeee-4000-8000-000000000003','22222222-eeee-4000-8000-000000000003/capture.jpg',now());
insert into emma_private.administrators(user_id) values('22222222-eeee-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"22222222-eeee-4000-8000-000000000002","email":"emma-admin-test-user1@example.invalid","role":"authenticated","user_metadata":{"role":"admin"}}',true);
set local role authenticated;
do $$ begin
 if public.emma_am_i_administrator() then raise exception 'FAIL: metadata grants admin'; end if;
 if (select count(*) from public.emma_access_requests)<>1 then raise exception 'FAIL: other users visible'; end if;
 if exists(select 1 from storage.objects where name='22222222-eeee-4000-8000-000000000003/capture.jpg') then raise exception 'FAIL: other photograph visible'; end if;
 begin update public.emma_access_requests set status='approved' where user_id='22222222-eeee-4000-8000-000000000002'; raise exception 'FAIL: self approval allowed'; exception when insufficient_privilege then null; end;
 begin insert into emma_private.administrators(user_id) values(auth.uid()); raise exception 'FAIL: self admin grant'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"22222222-eeee-4000-8000-000000000001","email":"emma-admin-test-owner@example.invalid","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if not public.emma_am_i_administrator() then raise exception 'FAIL: trusted owner not admin'; end if;
 if (select count(*) from public.emma_access_requests)<>2 then raise exception 'FAIL: admin cannot read requests'; end if;
 if (select count(*) from storage.objects where bucket_id='emma-registration')<>2 then raise exception 'FAIL: admin cannot review photographs'; end if;
end $$;
update public.emma_access_requests set status='approved' where user_id='22222222-eeee-4000-8000-000000000002';
do $$ begin
 begin update public.emma_access_requests set status='approved' where user_id='22222222-eeee-4000-8000-000000000003'; raise exception 'FAIL: second approved user'; exception when unique_violation then null; end;
 if (select count(*) from public.emma_access_reviews)<>1 then raise exception 'FAIL: missing review audit'; end if;
end $$;
update public.emma_access_requests set status='revoked' where user_id='22222222-eeee-4000-8000-000000000002';
update public.emma_access_requests set status='approved' where user_id='22222222-eeee-4000-8000-000000000003';
reset role;
update emma_private.administrators set enabled=false where user_id='22222222-eeee-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if public.emma_am_i_administrator() then raise exception 'FAIL: disabled admin allowed'; end if;
 if exists(select 1 from public.emma_access_requests) then raise exception 'FAIL: disabled admin reads requests'; end if;
end $$;
reset role;
rollback;
select 'PASS: trusted owner, no self-grant, no self-approval, private photos, one user, review audit and admin revocation. All test data rolled back.' as verification;
