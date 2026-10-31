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
      'circuit-city', 'aerial-highways', 'city-lights-grid', 'neon-skyline', 'night-aerial'
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
