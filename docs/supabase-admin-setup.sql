-- Run as project owner after supabase-setup.sql. Keeps exactly one approved user.
begin;
create table if not exists emma_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table emma_private.administrators enable row level security;
create unique index if not exists emma_one_enabled_administrator
  on emma_private.administrators ((enabled)) where enabled;
revoke all on emma_private.administrators from public,anon,authenticated;

create or replace function emma_private.is_administrator() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from emma_private.administrators a join auth.users u on u.id=a.user_id
    where a.user_id=auth.uid() and a.enabled and u.email_confirmed_at is not null
      and u.email is not null and not coalesce(u.is_anonymous,false)
  );
$$;
revoke all on function emma_private.is_administrator() from public,anon;
grant usage on schema emma_private to authenticated;
grant execute on function emma_private.is_administrator() to authenticated;

-- A narrow invoker wrapper exposes only the caller's administrator status.
create or replace function public.emma_am_i_administrator() returns boolean
language sql stable security invoker set search_path='' as $$
  select emma_private.is_administrator();
$$;
revoke all on function public.emma_am_i_administrator() from public,anon;
grant execute on function public.emma_am_i_administrator() to authenticated;

alter table public.emma_access_requests add column if not exists email text;
update public.emma_access_requests r set email=u.email from auth.users u where u.id=r.user_id;
alter table public.emma_access_requests add column if not exists reviewed_by uuid references auth.users(id);

create table if not exists public.emma_access_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_id uuid references auth.users(id),
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);
alter table public.emma_access_reviews enable row level security;
revoke all on public.emma_access_reviews from public,anon,authenticated;
grant select on public.emma_access_reviews to authenticated;
create policy emma_administrator_read_reviews on public.emma_access_reviews for select to authenticated
  using ((select emma_private.is_administrator()));

create or replace function emma_private.check_access_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
  if current_setting('role',true) in ('authenticated','anon') then
    if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
    if auth.uid()<>new.user_id then
      if not emma_private.is_administrator() then raise exception 'Administrator required' using errcode='42501'; end if;
      if tg_op<>'UPDATE' or new.user_id is distinct from old.user_id
        or new.photo_path is distinct from old.photo_path or new.captured_at is distinct from old.captured_at then
        raise exception 'Only review status may change' using errcode='42501';
      end if;
    elsif tg_op='UPDATE' and new.status is distinct from old.status then
      raise exception 'Self-approval is not allowed' using errcode='42501';
    end if;
  end if;
  select u.email into verified_email from auth.users u where u.id=new.user_id
    and u.email_confirmed_at is not null and u.email is not null and not coalesce(u.is_anonymous,false);
  if verified_email is null then raise exception 'Verify email first' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='emma-registration' and name=new.photo_path) then
    raise exception 'A private registration photograph is required' using errcode='23514';
  end if;
  new.email=verified_email;
  if tg_op='UPDATE' and new.status is distinct from old.status then
    new.reviewed_at=now(); new.reviewed_by=auth.uid();
    insert into public.emma_access_reviews(user_id,reviewer_id,previous_status,new_status)
      values(new.user_id,auth.uid(),old.status,new.status);
  end if;
  return new;
end $$;
revoke all on function emma_private.check_access_request() from public,anon,authenticated;

grant update(status) on public.emma_access_requests to authenticated;
create policy emma_administrator_read_requests on public.emma_access_requests for select to authenticated
  using ((select emma_private.is_administrator()));
create policy emma_administrator_review_requests on public.emma_access_requests for update to authenticated
  using ((select emma_private.is_administrator()) and user_id<>(select auth.uid()))
  with check ((select emma_private.is_administrator()) and user_id<>(select auth.uid()));
create policy emma_administrator_read_captures on storage.objects for select to authenticated
  using (bucket_id='emma-registration' and (select emma_private.is_administrator())
    and exists(select 1 from public.emma_access_requests r where r.photo_path=name));
commit;

-- No administrator is automatically created. The project owner must assign the
-- actual verified Auth user UUID privately after the owner registers.
