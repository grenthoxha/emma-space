-- OWNER-ONLY one-time setup in Supabase SQL Editor, never in the public app.
-- First register/verify your owner account at admin.html. Then replace the value
-- below with its actual email. This verifies a real Auth user before granting.
do $$
declare owner_email text := 'VENDOSE_EMAILIN_TEND_KETU'; owner_id uuid;
begin
  select id into owner_id from auth.users
    where lower(email)=lower(trim(owner_email)) and email_confirmed_at is not null
      and not coalesce(is_anonymous,false);
  if owner_id is null then raise exception 'Register and verify this email first'; end if;
  if exists(select 1 from emma_private.administrators where enabled and user_id<>owner_id) then
    raise exception 'An administrator already exists. Review it privately before changing ownership.';
  end if;
  insert into emma_private.administrators(user_id,enabled) values(owner_id,true)
    on conflict(user_id) do update set enabled=true;
end $$;
