-- =========================================================================
-- ESTADO DE FLOTA COMPARTIDO — UNA SOLA FUENTE DE VERDAD
--
-- device_state: el líder de ingesta (primer cliente conectado por presencia)
-- publica la telemetría consolidada; TODOS los demás clientes leen la misma
-- fila por realtime → misma vista en PC, cel, tablet a la vez.
-- =========================================================================

create table if not exists public.device_state (
  mac text primary key,
  datos jsonb not null default '{}'::jsonb,
  f0_score double precision not null default 0,
  last_telemetry_at bigint not null default 0,
  last_seen bigint not null default 0,
  source text not null default 'leader',
  updated_at timestamptz not null default now()
);

alter table public.device_state enable row level security;

drop policy if exists device_state_read on public.device_state;
create policy device_state_read on public.device_state
  for select to authenticated using (true);

drop policy if exists device_state_write on public.device_state;
create policy device_state_write on public.device_state
  for all to authenticated using (true) with check (true);

-- Limpieza opcional: TTL manejado por los clientes (stale > N seg)

-- Realtime: todos reciben el mismo estado en vivo
do $$
begin
  alter publication supabase_realtime add table public.device_state;
exception when duplicate_object then null;
end $$;
