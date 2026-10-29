-- =========================================================================
-- FIX: whitelist de temas/fondos en validate_appearance_preferences
--
-- La versión anterior solo aceptaba ('tactical','cyber','hybrid') y el
-- default hardcodeado era 'tactical' + 'circuit-pcb'. Resultado: elegir
-- 'aurum', 'gold' o 'industrial' lanzaba 'Unsupported theme' al guardar
-- en la nube, y al recargar la app el valor remoto (viejo/default)
-- sobrescribía la preferencia local.
--
-- Ahora acepta los 6 temas de la web y 'solid' como fondo, y el default
-- remoto coincide con el default de la app: aurum + planet-nodes.
-- =========================================================================

create or replace function public.validate_appearance_preferences(p_preferences jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Appearance preferences must be a JSON object.';
  end if;

  if p_preferences - 'theme' - 'background' - 'opacity' <> '{}'::jsonb then
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
end;
$$;

revoke all on function public.validate_appearance_preferences(jsonb) from public, anon, authenticated;

-- Default remoto alineado con el default de la app (Aurum + Planet Nodes)
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

  return jsonb_build_object('theme', 'aurum', 'background', 'planet-nodes', 'opacity', 100)
    || coalesce(personal, '{}'::jsonb)
    || coalesce(managed, '{}'::jsonb);
end;
$$;
