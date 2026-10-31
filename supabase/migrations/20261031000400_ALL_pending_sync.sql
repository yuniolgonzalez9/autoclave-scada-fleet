-- =========================================================================
-- NUEVOS TEMAS/FONDOS + SYNC EN VIVO
--
-- 1) Amplía el whitelist de validate_appearance_preferences con los temas
--    platinum/onyx/obsidian y TODOS los fondos nuevos (sólidos, auroras,
--    hospitalarios, placa base, ciudad-circuito).
-- 2) Activa Realtime en user_appearance_preferences para que un cambio en
--    un dispositivo llegue en vivo a los demás con la misma cuenta.
-- =========================================================================

create or replace function public.validate_appearance_preferences(p_preferences jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_bool_key text;
  v_speed_key text;
  v_speed_max int;
begin
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Appearance preferences must be a JSON object.';
  end if;

  if p_preferences - 'theme' - 'background' - 'opacity'
       - 'glassOn' - 'animOn' - 'animSpeed'
       - 'laserOn' - 'laserSpeed'
       - 'transOn' - 'transSpeed' <> '{}'::jsonb then
    raise exception 'Unsupported appearance preference key.';
  end if;

  if p_preferences ? 'theme' and (
    jsonb_typeof(p_preferences -> 'theme') <> 'string'
    or p_preferences ->> 'theme' not in (
      'industrial', 'aurum', 'gold', 'tactical', 'cyber', 'hybrid',
      'platinum', 'onyx', 'obsidian'
    )
  ) then
    raise exception 'Unsupported theme.';
  end if;

  if p_preferences ? 'background' and (
    jsonb_typeof(p_preferences -> 'background') <> 'string'
    or p_preferences ->> 'background' not in (
      'solid', 'navy-solid', 'carbon-solid', 'forest-solid', 'wine-solid',
      'aurum-gradient', 'ice-gradient', 'violet-gradient', 'mint-gradient', 'champagne-gradient',
      'oled',
      'server-datacenter', 'hospital-corridor', 'medical-lab',
      'circuit-pcb', 'motherboard-gold', 'chip-macro', 'server-racks',
      'planet-nodes', 'cyber-matrix', 'quantum-connections',
      'circuit-city', 'aerial-highways', 'city-lights-grid', 'neon-skyline', 'night-aerial',
      'sterilization-zone', 'lab-sterile', 'surgical-tools', 'night-drive', 'garage-engine', 'highway-car'
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

  foreach v_bool_key in array array['glassOn', 'animOn', 'laserOn', 'transOn'] loop
    if p_preferences ? v_bool_key and jsonb_typeof(p_preferences -> v_bool_key) <> 'boolean' then
      raise exception '% must be a boolean.', v_bool_key;
    end if;
  end loop;

  foreach v_speed_key in array array['animSpeed', 'laserSpeed', 'transSpeed'] loop
    v_speed_max := case v_speed_key when 'laserSpeed' then 600 else 300 end;
    if p_preferences ? v_speed_key and (
      jsonb_typeof(p_preferences -> v_speed_key) <> 'number'
      or (p_preferences ->> v_speed_key)::numeric < 10
      or (p_preferences ->> v_speed_key)::numeric > v_speed_max
    ) then
      raise exception '% must be a number between 10 and %.', v_speed_key, v_speed_max;
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_appearance_preferences(jsonb) from public, anon, authenticated;

-- Realtime para sync de apariencia entre dispositivos (idempotente)
do $$
begin
  alter publication supabase_realtime add table public.user_appearance_preferences;
exception when duplicate_object then null;
end $$;
-- =========================================================================
-- EFECTOS NAVIDEÑOS GLOBALES
--
-- Un solo switch global (controlado por SUPERADMIN) enciende nieve + luces
-- para TODA la web en tiempo real. Los usuarios normales conservan un
-- opt-out local (su toggle guarda solo en su dispositivo).
-- =========================================================================

create table if not exists public.global_fx_settings (
  id integer primary key check (id = 1),
  xmas jsonb not null default '{"on":false,"flakes":120,"speed":100,"lights":true}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.global_fx_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.global_fx_settings enable row level security;

-- Todos los autenticados pueden LEER el switch global
drop policy if exists global_fx_read on public.global_fx_settings;
create policy global_fx_read on public.global_fx_settings
  for select to authenticated using (true);

-- Solo SUPERADMIN puede ESCRIBIRLO (vía RPC security definer)
create or replace function public.save_global_xmas(p_xmas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select upper(coalesce(rol, '')) into v_role
  from public.profiles
  where id = auth.uid();

  if v_role not in ('SUPERADMIN', 'ADMIN') then
    raise exception 'Solo el superadministrador puede cambiar los efectos globales.' using errcode = '42501';
  end if;

  if p_xmas is null or jsonb_typeof(p_xmas) <> 'object' then
    raise exception 'Xmas settings must be a JSON object.';
  end if;

  update public.global_fx_settings
  set xmas = jsonb_build_object(
        'on', coalesce((p_xmas ->> 'on')::boolean, false),
        'flakes', least(400, greatest(10, coalesce((p_xmas ->> 'flakes')::int, 120))),
        'speed', least(300, greatest(10, coalesce((p_xmas ->> 'speed')::int, 100))),
        'lights', coalesce((p_xmas ->> 'lights')::boolean, true)
      ),
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.save_global_xmas(jsonb) from public, anon;
grant execute on function public.save_global_xmas(jsonb) to authenticated;

-- Realtime: el switch global llega en vivo a todos los dispositivos
do $$
begin
  alter publication supabase_realtime add table public.global_fx_settings;
exception when duplicate_object then null;
end $$;
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
