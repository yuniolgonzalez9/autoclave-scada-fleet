-- Read-only audit. Repeated addresses are the intended shared contact mailbox.
-- This query never returns email values.
SELECT
  "user" AS username,
  CASE
    WHEN email IS NULL OR btrim(email) = '' THEN 'MISSING_CONTACT_EMAIL'
    WHEN lower(split_part(btrim(email), '@', 2)) IN ('gmail.com', 'googlemail.com')
      THEN 'GMAIL_PLUS_ALIAS_AVAILABLE'
    ELSE 'SET_UNIQUE_AUTH_EMAIL_OR_CONFIGURE_PROVIDER_ALIAS'
  END AS auth_migration_action
FROM public.usuarios_scada
ORDER BY "user";
