-- auditoria_accesos: permitir INSERT a usuarios autenticados (bitácora de accesos)
-- y SELECT solo a administradores de plataforma.
alter table public.auditoria_accesos enable row level security;

drop policy if exists auditoria_insert_auth on public.auditoria_accesos;
create policy auditoria_insert_auth on public.auditoria_accesos
  for insert to authenticated
  with check (true);

drop policy if exists auditoria_select_admin on public.auditoria_accesos;
create policy auditoria_select_admin on public.auditoria_accesos
  for select to authenticated
  using (public.is_platform_admin());
