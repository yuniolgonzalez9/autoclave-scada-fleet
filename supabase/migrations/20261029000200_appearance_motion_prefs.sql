-- =========================================================================
-- MOTION PREFS: whitelist ampliada en validate_appearance_preferences
--
-- Los nuevos controles de movimiento (transparencia, efectos, láseres y
-- transiciones) viajan dentro del mismo JSON de apariencia por usuario.
-- Sin esta migración la función rechaza las claves nuevas con
-- 'Unsupported appearance preference key' y la app revierte a lo viejo.
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
    or p_preferences ->> 'theme' not in ('industrial', 'aurum', 'gold', 'tactical', 'cyber', 'hybrid')
  ) then
    raise exception 'Unsupported theme.';
  end if;

  if p_preferences ? 'background' and (
    jsonb_typeof(p_preferences -> 'background') <> 'string'
    or p_preferences ->> 'background' not in (
      'solid',
      'circuit-pcb', 'planet-nodes', 'cyber-matrix', 'motherboard-gold',
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

  -- Toggles booleanos de movimiento
  foreach v_bool_key in array array['glassOn', 'animOn', 'laserOn', 'transOn'] loop
    if p_preferences ? v_bool_key and jsonb_typeof(p_preferences -> v_bool_key) <> 'boolean' then
      raise exception '% must be a boolean.', v_bool_key;
    end if;
  end loop;

  -- Sliders de velocidad (10..max)
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

-- Default remoto: incluye los defaults de movimiento de la app
create or replace function public.get_my_appearance_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  personal jsonb;
  managed jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select preferences into personal
  from public.user_appearance_preferences
  where user_id = current_user_id;

  select overrides into managed
  from public.admin_appearance_overrides
  where user_id = current_user_id;

  return jsonb_build_object(
      'theme', 'aurum', 'background', 'planet-nodes', 'opacity', 100,
      'glassOn', true, 'animOn', true, 'animSpeed', 100,
      'laserOn', true, 'laserSpeed', 100,
      'transOn', true, 'transSpeed', 100
    )
    || coalesce(personal, '{}'::jsonb)
    || coalesce(managed, '{}'::jsonb);
end;
$$;
