-- Espacio de trabajo del equipo: identidad, planes de mantenimiento y reportes de servicio técnico.
-- Ejecutar una sola vez en Supabase -> SQL Editor.

alter table public.asignaciones_equipos
  add column if not exists tipo text,
  add column if not exists marca text,
  add column if not exists hardware_rev text,
  add column if not exists plan_mantenimiento jsonb not null default '[]'::jsonb,
  add column if not exists ultimo_mantenimiento timestamptz;

update public.asignaciones_equipos
   set tipo = upper(coalesce(config_deseada->>'tipo', 'AUTOCLAVE'))
 where tipo is null;

create index if not exists mantenimientos_equipos_mac_fecha
  on public.mantenimientos_equipos (mac, created_at desc);

create index if not exists reportes_autoclaves_mac_fecha
  on public.reportes_autoclaves (mac, created_at desc);

create table if not exists public.reportes_servicio (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  mac text not null,
  equipo_alias text,
  equipo_modelo text,
  equipo_tipo text,
  cliente text,
  departamento text,
  prioridad text not null default 'MEDIA' check (prioridad in ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'EN_PROCESO', 'CERRADO')),
  tipo_servicio text not null default 'CORRECTIVO',
  reportado_por text,
  falla_reportada text not null,
  tecnico text,
  inicio_atencion timestamptz,
  fin_atencion timestamptz,
  diagnostico text,
  trabajo_realizado text,
  repuestos jsonb not null default '[]'::jsonb,
  recomendaciones text,
  estado_equipo_final text,
  ciclos_al_momento integer,
  recibido_por text,
  hash_certificado text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cerrado_en timestamptz
);

create index if not exists reportes_servicio_mac_fecha on public.reportes_servicio (mac, created_at desc);
create index if not exists reportes_servicio_estado on public.reportes_servicio (estado, created_at desc);

alter table public.reportes_servicio enable row level security;

drop policy if exists reportes_servicio_app_access on public.reportes_servicio;
create policy reportes_servicio_app_access
  on public.reportes_servicio
  for all
  to anon, authenticated
  using (true)
  with check (true);
