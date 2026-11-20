-- Grants dashboard access to the site owner.
-- 1. In Supabase → Authentication → Users → "Add user", create the owner with
--    their email + a strong password (tick "Auto confirm user").
-- 2. Replace the email below and run this in Supabase → SQL Editor.
insert into public.admin_users (user_id)
select id from auth.users where email = 'owner@their-domain.com'
on conflict do nothing;

-- Check it worked (should return one row):
select u.email from public.admin_users a join auth.users u on u.id = a.user_id;
