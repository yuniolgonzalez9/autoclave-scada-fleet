-- Run only after the Auth/preference migration has been reviewed and applied,
-- and after the verified superadmin account has been created in Supabase Auth.
-- Replace the placeholder with that account's unique verified email.
-- This changes one profile row; verify the RETURNING result before proceeding.

update public.user_profiles as profile
set role = 'SUPERADMIN',
    status = 'ACTIVO',
    updated_at = now()
from auth.users as auth_user
where profile.user_id = auth_user.id
  and lower(auth_user.email) = lower('REPLACE_WITH_VERIFIED_SUPERADMIN_EMAIL')
returning profile.username, profile.email, profile.role, profile.status;
