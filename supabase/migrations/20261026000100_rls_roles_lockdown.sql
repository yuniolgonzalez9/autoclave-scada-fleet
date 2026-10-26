-- Cierre de seguridad: ninguna tabla operativa es accesible con la clave
-- publica (anon). Acceso solo con sesion Supabase Auth activa y segun rol.
-- Registros clinicos (ciclos, auditoria, servicio) no se pueden editar ni
-- borrar salvo por roles autorizados, y todo borrado queda auditado.

begin;

-- ---------- Funciones de autorizacion ----------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.user_profiles p
  where p.user_id = (select auth.uid()) and p.status = 'ACTIVO';
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_role() is not null;
$$;

create or replace function public.can_operate()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('OPERADOR','TECNICO','ADMIN','DIRECTOR','SUPERADMIN'), false);
$$;

create or replace function public.can_access_mac(p_mac text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id = (select auth.uid())
      and p.status = 'ACTIVO'
      and (
        p.role in ('ADMIN','DIRECTOR','SUPERADMIN')
        or (p.role <> 'CLIENTE' and coalesce(cardinality(p.authorized_devices), 0) = 0)
        or upper(regexp_replace(coalesce(p_mac, ''), '[:-]', '', 'g')) = any (p.authorized_devices)
      )
  );
$$;

revoke all on function public.my_role() from public;
revoke all on function public.is_active_member() from public;
revoke all on function public.can_operate() from public;
revoke all on function public.can_access_mac(text) from public;
grant execute on function public.my_role(), public.is_active_member(), public.can_operate(), public.can_access_mac(text) to authenticated;

-- ---------- Bitacora de borrados (trazabilidad) ----------
create or replace function public.audit_row_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auditoria_accesos (usuario, rol, evento, dispositivo, detalles)
  values (
    coalesce((select p.username from public.user_profiles p where p.user_id = (select auth.uid())), 'sistema'),
    coalesce(public.my_role(), 'SERVICIO'),
    'BORRADO_' || upper(tg_table_name),
    coalesce(old.mac, ''),
    left(to_jsonb(old)::text, 8000)
  );
  return old;
end;
$$;

-- ---------- Columnas que el cliente ya envia ----------
alter table public.reportes_autoclaves
  add column if not exists programa text,
  add column if not exists inicio_ciclo text,
  add column if not exists duracion_total_seg integer;

-- ---------- Limpieza de politicas abiertas ----------
do $$
declare pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'asignaciones_equipos','reportes_autoclaves','auditoria_accesos','mantenimientos_equipos',
      'reportes_servicio','notificaciones_scada','perfiles_hardware','diagnosticos_i2c','catalogo_equipos')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['asignaciones_equipos','reportes_autoclaves','auditoria_accesos','mantenimientos_equipos',
    'reportes_servicio','notificaciones_scada','perfiles_hardware','diagnosticos_i2c','catalogo_equipos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- Equipos
create policy equipos_select on public.asignaciones_equipos for select to authenticated using (public.can_access_mac(mac));
create policy equipos_insert on public.asignaciones_equipos for insert to authenticated
  with check (public.my_role() in ('TECNICO','ADMIN','DIRECTOR','SUPERADMIN'));
create policy equipos_update on public.asignaciones_equipos for update to authenticated
  using (public.can_operate() and public.can_access_mac(mac)) with check (public.can_operate() and public.can_access_mac(mac));
create policy equipos_delete on public.asignaciones_equipos for delete to authenticated using ((select public.is_platform_admin()));

-- Reportes de ciclos de esterilizacion
create policy ciclos_select on public.reportes_autoclaves for select to authenticated using (public.can_access_mac(mac));
create policy ciclos_insert on public.reportes_autoclaves for insert to authenticated with check (public.can_operate() and public.can_access_mac(mac));
create policy ciclos_update on public.reportes_autoclaves for update to authenticated
  using (public.can_operate() and public.can_access_mac(mac)) with check (public.can_operate() and public.can_access_mac(mac));
create policy ciclos_delete on public.reportes_autoclaves for delete to authenticated using (public.my_role() = 'SUPERADMIN');
drop trigger if exists trg_audit_delete on public.reportes_autoclaves;
create trigger trg_audit_delete before delete on public.reportes_autoclaves for each row execute function public.audit_row_delete();

-- Auditoria: solo agregar; lectura administrativa
create policy auditoria_insert on public.auditoria_accesos for insert to authenticated with check (public.is_active_member());
create policy auditoria_select on public.auditoria_accesos for select to authenticated using ((select public.is_platform_admin()));

-- Mantenimientos: solo agregar
create policy mant_select on public.mantenimientos_equipos for select to authenticated using (public.can_access_mac(mac));
create policy mant_insert on public.mantenimientos_equipos for insert to authenticated with check (public.can_operate() and public.can_access_mac(mac));

-- Reportes de servicio
create policy servicio_select on public.reportes_servicio for select to authenticated using (public.can_access_mac(mac));
create policy servicio_insert on public.reportes_servicio for insert to authenticated with check (public.can_operate() and public.can_access_mac(mac));
create policy servicio_update on public.reportes_servicio for update to authenticated
  using (public.can_operate() and public.can_access_mac(mac)) with check (public.can_operate() and public.can_access_mac(mac));
create policy servicio_delete on public.reportes_servicio for delete to authenticated using ((select public.is_platform_admin()));
drop trigger if exists trg_audit_delete on public.reportes_servicio;
create trigger trg_audit_delete before delete on public.reportes_servicio for each row execute function public.audit_row_delete();

-- Notificaciones compartidas
create policy notif_all on public.notificaciones_scada for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- Perfiles de hardware y diagnosticos
create policy hw_select on public.perfiles_hardware for select to authenticated using (public.is_active_member());
create policy hw_write on public.perfiles_hardware for insert to authenticated with check (public.can_operate());
create policy hw_update on public.perfiles_hardware for update to authenticated using (public.can_operate()) with check (public.can_operate());
create policy hw_delete on public.perfiles_hardware for delete to authenticated using ((select public.is_platform_admin()));
create policy i2c_select on public.diagnosticos_i2c for select to authenticated using (public.is_active_member());
create policy i2c_insert on public.diagnosticos_i2c for insert to authenticated with check (public.can_operate());

-- Catalogo de modelos
create policy catalogo_select on public.catalogo_equipos for select to authenticated using (true);
create policy catalogo_write on public.catalogo_equipos for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- ---------- Eventos de acceso previos al login (sin sesion) ----------
create or replace function public.log_auth_event(p_evento text, p_usuario text, p_detalles text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_evento not in ('INICIO_SESION_FALLIDO','SOLICITUD_RECUPERACION_PENDIENTE','SOLICITUD_ACCESO') then
    raise exception 'Evento no permitido.' using errcode = '22023';
  end if;
  insert into public.auditoria_accesos (usuario, rol, evento, dispositivo, detalles)
  values (left(lower(btrim(coalesce(p_usuario, ''))), 120), 'ANONIMO', p_evento, '', left(coalesce(p_detalles, ''), 500));
end;
$$;
revoke all on function public.log_auth_event(text, text, text) from public;
grant execute on function public.log_auth_event(text, text, text) to anon, authenticated;

-- ---------- Tema industrial ----------
create or replace function public.validate_appearance_preferences(p_preferences jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Appearance preferences must be a JSON object.';
  end if;
  if p_preferences - 'theme' - 'background' - 'opacity' <> '{}'::jsonb then
    raise exception 'Unsupported appearance preference key.';
  end if;
  if p_preferences ? 'theme' and (
    jsonb_typeof(p_preferences -> 'theme') <> 'string'
    or p_preferences ->> 'theme' not in ('industrial', 'tactical', 'cyber', 'hybrid')
  ) then
    raise exception 'Unsupported theme.';
  end if;
  if p_preferences ? 'background' and (
    jsonb_typeof(p_preferences -> 'background') <> 'string'
    or p_preferences ->> 'background' not in (
      'solid', 'circuit-pcb', 'planet-nodes', 'cyber-matrix', 'motherboard-gold',
      'quantum-connections', 'server-datacenter', 'oled'
    )
  ) then
    raise exception 'Unsupported background.';
  end if;
  if p_preferences ? 'opacity' and (
    jsonb_typeof(p_preferences -> 'opacity') <> 'number'
    or (p_preferences ->> 'opacity')::numeric < 0
    or (p_preferences ->> 'opacity')::numeric > 100
  ) then
    raise exception 'Opacity must be a number between 0 and 100.';
  end if;
end;
$$;

-- ---------- Tabla heredada con contrasenas en texto plano ----------
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'usuarios_scada') then
    alter publication supabase_realtime drop table public.usuarios_scada;
  end if;
end $$;
drop table if exists public.usuarios_scada cascade;

commit;
