-- Centro de notificaciones compartido de BIOFLEET OS
-- Ejecutar una sola vez en Supabase -> SQL Editor.

create table if not exists public.notificaciones_scada (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  categoria text not null check (categoria in ('EQUIPO', 'USUARIO', 'SISTEMA')),
  severidad text not null check (severidad in ('CRITICA', 'ADVERTENCIA', 'INFO')),
  tipo text not null,
  titulo text not null,
  mensaje text,
  mac text,
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'NUEVA' check (estado in ('NUEVA', 'ATENDIDA', 'RESUELTA')),
  activa boolean not null default true,
  ocurrencias integer not null default 1,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  atendida_por text,
  atendida_en timestamptz,
  resuelta_por text,
  resuelta_en timestamptz,
  nota_resolucion text
);

-- Una sola notificación abierta por situación (evita duplicados entre navegadores).
create unique index if not exists notificaciones_scada_abierta_unica
  on public.notificaciones_scada (clave)
  where estado <> 'RESUELTA';

create index if not exists notificaciones_scada_estado_fecha
  on public.notificaciones_scada (estado, creada_en desc);

alter table public.notificaciones_scada enable row level security;

drop policy if exists notificaciones_scada_app_access on public.notificaciones_scada;
create policy notificaciones_scada_app_access
  on public.notificaciones_scada
  for all
  to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones_scada'
  ) then
    alter publication supabase_realtime add table public.notificaciones_scada;
  end if;
end $$;
