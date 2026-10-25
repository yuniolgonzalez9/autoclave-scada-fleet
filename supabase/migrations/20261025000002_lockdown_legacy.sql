-- Endurecimiento: la tabla heredada usuarios_scada guardaba contrasenas en
-- texto plano y era legible/editable por el rol anon. Tras migrar a Supabase
-- Auth ya no debe ser accesible desde el cliente.
-- config_ai_keys contenia API keys sin RLS; ahora solo admins pueden leerla.

begin;

-- 1) usuarios_scada: sin acceso para anon/authenticated (service_role conserva
--    acceso para el script de provision y respaldos).
alter table if exists public.usuarios_scada enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'usuarios_scada'
  loop
    execute format('drop policy if exists %I on public.usuarios_scada', pol.policyname);
  end loop;
end $$;

revoke all on table public.usuarios_scada from anon, authenticated, public;

-- 2) config_ai_keys: solo administradores activos.
alter table if exists public.config_ai_keys enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'config_ai_keys'
  loop
    execute format('drop policy if exists %I on public.config_ai_keys', pol.policyname);
  end loop;
end $$;

revoke all on table public.config_ai_keys from anon, public;
revoke all on table public.config_ai_keys from authenticated;
grant select, insert, update, delete on table public.config_ai_keys to authenticated;

drop policy if exists config_ai_keys_admin_all on public.config_ai_keys;
create policy config_ai_keys_admin_all
  on public.config_ai_keys for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

commit;
