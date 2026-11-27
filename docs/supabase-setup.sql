-- Emma's Space: execute once in the project's SQL Editor as its owner.
-- No passwords, email allow-list or service keys belong in this file.
begin;
create schema if not exists emma_private;
revoke all on schema emma_private from public, anon, authenticated;

create table public.emma_access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  photo_path text not null check (photo_path = user_id::text || '/capture.jpg'),
  captured_at timestamptz not null,
  photo_consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index emma_one_approved_account on public.emma_access_requests ((status)) where status='approved';
alter table public.emma_access_requests enable row level security;
revoke all on public.emma_access_requests from public, anon, authenticated;
grant select on public.emma_access_requests to authenticated;
grant insert (user_id,photo_path,captured_at) on public.emma_access_requests to authenticated;
grant update (photo_path,captured_at) on public.emma_access_requests to authenticated;

create policy emma_read_own_request on public.emma_access_requests for select to authenticated
  using (user_id=(select auth.uid()));
create policy emma_submit_own_request on public.emma_access_requests for insert to authenticated
  with check (user_id=(select auth.uid()) and status='pending'
    and coalesce((select auth.jwt()->>'email'),'')<>''
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy emma_update_pending_photo on public.emma_access_requests for update to authenticated
  using (user_id=(select auth.uid()) and status='pending')
  with check (user_id=(select auth.uid()) and status='pending');

-- A private trigger checks real Auth/Storage rows, never user-editable metadata.
-- It is not a callable Data API function. The owner alone can set status.
create function emma_private.check_access_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) in ('authenticated','anon')
     and (auth.uid() is null or auth.uid()<>new.user_id) then
    raise exception 'Request owner mismatch' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null and email is not null and not coalesce(is_anonymous,false)) then
    raise exception 'Verify email before submitting a photo' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='emma-registration' and name=new.photo_path) then
    raise exception 'A private registration photograph is required' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status then new.reviewed_at=now(); end if;
  return new;
end $$;
revoke all on function emma_private.check_access_request() from public,anon,authenticated;
create trigger emma_check_access_request before insert or update on public.emma_access_requests
  for each row execute function emma_private.check_access_request();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('emma-registration','emma-registration',false,1048576,array['image/jpeg']);
create policy emma_upload_own_capture on storage.objects for insert to authenticated
  with check (bucket_id='emma-registration' and name=(select auth.uid())::text || '/capture.jpg'
    and coalesce((select auth.jwt()->>'email'),'')<>''
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
    and not exists(select 1 from public.emma_access_requests r where r.user_id=(select auth.uid()) and r.status<>'pending'));
create policy emma_read_own_capture on storage.objects for select to authenticated
  using (bucket_id='emma-registration' and name=(select auth.uid())::text || '/capture.jpg');
create policy emma_replace_pending_capture on storage.objects for update to authenticated
  using (bucket_id='emma-registration' and name=(select auth.uid())::text || '/capture.jpg'
    and not exists(select 1 from public.emma_access_requests r where r.user_id=(select auth.uid()) and r.status<>'pending'))
  with check (bucket_id='emma-registration' and name=(select auth.uid())::text || '/capture.jpg'
    and not exists(select 1 from public.emma_access_requests r where r.user_id=(select auth.uid()) and r.status<>'pending'));
commit;

-- Supabase's optional automatic-RLS event trigger must not be an app RPC.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
