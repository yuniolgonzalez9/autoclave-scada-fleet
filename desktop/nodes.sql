-- Tabla de registro de nodos Hub (red WAN distribuida).
-- Cada PC con Biofleet Hub instalado hace heartbeat aquí.
create table if not exists public.hub_nodes (
  node_id      uuid primary key,
  host         text,
  platform     text,
  arch         text,
  hub_version  text,
  web_build    text,
  last_seen    timestamptz not null default now()
);

alter table public.hub_nodes enable row level security;

-- Lectura anónima (la web puede mostrar "X nodos activos")
create policy "hub_nodes_select_anon" on public.hub_nodes
  for select to anon using (true);

-- Los hubs se registran/actualizan con la anon key (upsert por node_id)
create policy "hub_nodes_insert_anon" on public.hub_nodes
  for insert to anon with check (true);

create policy "hub_nodes_update_anon" on public.hub_nodes
  for update to anon using (true) with check (true);

-- Realtime opcional para ver la red crecer en vivo
alter publication supabase_realtime add public.hub_nodes;
